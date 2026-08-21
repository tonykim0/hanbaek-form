/**
 * 협력사 스캔 PDF → 입력폼 값 역추출 (서버 사이드 전용).
 *
 * lib/claude.ts(접수 분류)와 같은 Anthropic PDF vision을 쓰지만 두 가지가 다릅니다.
 *   · 모델 — 손글씨·체크박스 판독은 오차 비용이 커서 Opus를 씁니다.
 *   · 출력 — structured outputs(JSON schema)로 응답 형태를 강제합니다.
 *     프롬프트로 "JSON만 출력"을 부탁하는 것보다 파싱 실패가 없습니다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument, degrees } from 'pdf-lib';
import { YEAR_OPTIONS } from './contract-form';
import { buildFormImportPrompt } from './prompts-import';
import type {
  FormImportResult,
  ImportedFieldKey,
  ImportedFormFields,
} from './form-import';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-opus-5';
/** 회전 감지는 방향만 보면 되므로 빠르고 싼 모델을 씁니다 */
const ORIENTATION_MODEL = 'claude-haiku-4-5-20251001';

/** Claude PDF 입력 한도(요청 32MB·600페이지)와 판독 시간을 함께 고려한 상한 */
const MAX_PAGES = 60;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const CALL_TIMEOUT_MS = 240_000;
const MAX_ATTEMPTS = 2;
/** 라우트 maxDuration=300s 예산 보호 — 남은 시간이 부족하면 재시도하지 않는다 */
const RETRY_ELAPSED_BUDGET_MS = 180_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FormImportError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'FormImportError';
  }
}

// ─────────────────────────────────────────────
// 출력 스키마 (structured outputs)
// ─────────────────────────────────────────────

/**
 * structured outputs 제약 두 가지를 피해서 만든 스키마입니다.
 *   · union(anyOf·nullable) 파라미터는 16개까지만 허용 — 필드가 45개라 nullable을
 *     쓸 수 없습니다. 그래서 「판독 불가」를 빈 문자열("")로 표현하고, 체크박스는
 *     false(=미체크)로 받습니다. 판독이 애매한 칸은 issues·confidence로 드러납니다.
 *   · 열린 map을 허용하지 않음 (객체마다 additionalProperties:false + required 전체
 *     나열) — 그래서 confidence를 {field, score} 배열로 받습니다.
 * 빈 문자열 → null 변환은 normalizeField에서 합니다.
 */
const nStr = () => ({ type: 'string' });
const nBool = () => ({ type: 'boolean' });
/** 판독 불가를 표현할 수 있도록 빈 문자열을 허용 값에 넣습니다 */
const nEnum = (values: readonly string[]) => ({
  type: 'string',
  enum: [...values, ''],
});

const FIELD_PROPERTIES: Record<ImportedFieldKey, unknown> = {
  businessType: nEnum(['subsidy', 'invest']),

  custName: nStr(),
  custBizId: nStr(),
  custAddr: nStr(),
  custTel: nStr(),
  custEmail: nStr(),
  custRepresentative: nStr(),
  siteManager: nStr(),

  installAddr: nStr(),
  installQty: nStr(),
  installQty11to30: nStr(),
  powerSharingKw: nStr(),
  powerSharingQty: nStr(),
  powerSharingCableQty: nStr(),
  contractTerm: nEnum(['7', '10']),
  contractYear: nStr(),
  contractMonth: nStr(),
  contractDay: nStr(),
  installDetailLocation: nStr(),

  salesCompany: nStr(),
  salesName: nStr(),
  salesTel: nStr(),
  surveyorCompany: nStr(),
  surveyorName: nStr(),
  surveyorTel: nStr(),

  parkingLotCount: nStr(),
  siteCategory: nEnum(['apartment', 'business', 'small_business', 'etc']),
  buildingType: nEnum([
    'danok',
    'apartment',
    'yeonlip',
    'sangga',
    'etc_officetel',
    'etc_knowledge',
    'etc_government',
    'etc_custom',
  ]),
  buildingTypeEtc: nStr(),
  installLocIndoor: nBool(),
  installLocOutdoor: nBool(),
  ownership: nEnum(['own', 'rent']),
  ownerRelation: nEnum(['self', 'family', 'friend', 'employee', 'none']),
  powerMoja: nBool(),
  powerHanjeon: nBool(),
  highVoltageConfirmed: nBool(),
  lowVoltageConfirmed: nBool(),
  installTypeWall: nBool(),
  installTypeStand: nBool(),

  dupFast: nBool(),
  dupFastQty: nStr(),
  dupSlow: nBool(),
  dupSlowQty: nStr(),
  dupDist: nBool(),
  dupDistQty: nStr(),
  dupOutlet: nBool(),
  dupOutletQty: nStr(),
  dupKiosk: nBool(),
  dupKioskQty: nStr(),
  dupNone: nBool(),

  evCount: nStr(),
  siteTotalSlow: nStr(),
  siteTotalFast: nStr(),
};

const FIELD_KEYS = Object.keys(FIELD_PROPERTIES) as ImportedFieldKey[];

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    detectedCpo: nStr(),
    detectedDocs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          pages: { type: 'array', items: { type: 'integer' } },
        },
        required: ['name', 'pages'],
      },
    },
    fields: {
      type: 'object',
      additionalProperties: false,
      properties: FIELD_PROPERTIES,
      required: FIELD_KEYS,
    },
    confidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          field: { type: 'string' },
          score: { type: 'number' },
        },
        required: ['field', 'score'],
      },
    },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['detectedCpo', 'detectedDocs', 'fields', 'confidence', 'issues'],
} as const;

// ─────────────────────────────────────────────
// 추출
// ─────────────────────────────────────────────

export interface ExtractOptions {
  pdf: Buffer;
  fileName: string;
  /** 사용자가 올린 화면의 CPO — 판독 힌트로만 넘깁니다 */
  cpoHint?: string;
}

export async function extractFormFromPdf(
  options: ExtractOptions
): Promise<FormImportResult> {
  const { fileName, cpoHint } = options;

  if (options.pdf.length > MAX_PDF_BYTES) {
    throw new FormImportError(
      `PDF가 너무 큽니다 (${formatMb(options.pdf.length)}MB). ` +
        `${MAX_PDF_BYTES / 1024 / 1024}MB 이하로 줄이거나 계약서·별지5호·별지7호 페이지만 잘라서 올려주세요.`,
      'PDF_TOO_LARGE'
    );
  }

  const limited = await limitPages(options.pdf);
  const { analyzedPages, totalPages } = limited;
  // 뒤집힌 스캔은 Opus 도 판독을 그르치므로(실측: 180° 페이지를 앞 서류의 연속으로
  // 판정) 판독 전에 페이지 방향을 물리적으로 바로잡습니다.
  const pdf = await normalizeRotation(limited.pdf);

  const prompt = buildFormImportPrompt({
    fileName,
    pageCount: analyzedPages,
    cpoHint,
  });

  const content = [
    {
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data: pdf.toString('base64'),
      },
    },
    { type: 'text' as const, text: prompt },
  ];

  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await callClaude(content);
      return {
        ...toResult(raw),
        analyzedPages,
        totalPages,
      };
    } catch (err) {
      lastError = err;
      console.warn(`[claude-import] 추출 시도 ${attempt}/${MAX_ATTEMPTS} 실패:`, err);
      if (
        attempt >= MAX_ATTEMPTS ||
        Date.now() - startedAt > RETRY_ELAPSED_BUDGET_MS
      ) {
        break;
      }
      await sleep(1000 * attempt);
    }
  }

  throw new FormImportError(
    lastError instanceof Error
      ? `서류 판독에 실패했습니다: ${lastError.message}`
      : '서류 판독에 실패했습니다.',
    'EXTRACTION_FAILED'
  );
}

/**
 * structured outputs로 한 번 호출하고, 이 파라미터를 모르는 SDK/엔드포인트에서
 * 400이 나면 프롬프트 지시만으로 한 번 더 호출합니다 (프롬프트에 JSON 형식이
 * 그대로 들어 있어 폴백이 성립합니다).
 */
async function callClaude(
  content: Anthropic.MessageParam['content']
): Promise<unknown> {
  const base = {
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: 'user' as const, content }],
  };

  try {
    // output_config는 이 프로젝트의 SDK 버전(0.52)에 타입이 없어 캐스팅합니다.
    // SDK는 body를 그대로 직렬화하므로 파라미터는 정상 전달됩니다.
    const message = await anthropic.messages.create(
      {
        ...base,
        output_config: {
          effort: 'high',
          format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        },
      } as unknown as Anthropic.MessageCreateParamsNonStreaming,
      { timeout: CALL_TIMEOUT_MS }
    );
    return parseJson(message);
  } catch (err) {
    if (!isUnsupportedParamError(err)) throw err;
    console.warn('[claude-import] structured outputs 미지원 → 프롬프트 파싱으로 폴백');
    const message = await anthropic.messages.create(base, {
      timeout: CALL_TIMEOUT_MS,
    });
    return parseJson(message);
  }
}

/**
 * output_config 자체를 모르는 엔드포인트인지 판별합니다.
 * 스키마 내용이 잘못된 경우(예: union 파라미터 초과)는 폴백하지 않고 그대로 던집니다 —
 * 조용히 스키마 없이 재시도하면 품질이 떨어진 걸 알아채지 못합니다.
 */
function isUnsupportedParamError(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  if (err.status !== 400) return false;
  return /(unexpected|unrecognized|unknown|unsupported|not supported)[^.]*output_config/i.test(
    err.message
  );
}

/** 응답에서 JSON을 뽑습니다. structured outputs면 text 블록이 곧 JSON입니다. */
function parseJson(message: Anthropic.Message): unknown {
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error(`응답에서 JSON을 찾을 수 없습니다: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error(`JSON 파싱 실패: ${cleaned.slice(start, start + 200)}`);
  }
}

// ─────────────────────────────────────────────
// 회전 정규화
// ─────────────────────────────────────────────

const ORIENTATION_TIMEOUT_MS = 60_000;
/**
 * 재발행처럼 페이지가 적은 문서는 페이지를 따로 보여줘야 방향 판정이 안정적입니다.
 * 서로 다른 방향의 페이지를 한 PDF 로 묶어 보내면 Haiku 가 90° 페이지를 180°로
 * 오판한 실제 사례가 있었습니다. 긴 계약서는 호출 수가 과도해지므로 묶어서 판정합니다.
 */
const PER_PAGE_ORIENTATION_LIMIT = 4;

type PageRotation = { page: number; rotation: number };
type RotationFix = { page: number; targetRotation: number };

const ROTATION_CANDIDATES = [
  { id: 'A', rotation: 0 },
  { id: 'B', rotation: 90 },
  { id: 'C', rotation: 180 },
  { id: 'D', rotation: 270 },
] as const;

/**
 * 스캔이 돌아간 페이지를 감지해 PDF 의 /Rotate 로 바로 세웁니다.
 *
 * 프롬프트로 「뒤집혀 있어도 읽어라」를 지시하는 것은 비결정적이라 믿을 수 없었습니다
 * (같은 파일이 통과했다 실패했다 함). 방향 판정은 내용 판독보다 훨씬 쉬운 일이라
 * 빠른 모델에 맡기고, 실패하면 원본 그대로 진행합니다 — 이 단계가 판독을 막으면 안 됩니다.
 */
async function normalizeRotation(pdf: Buffer): Promise<Buffer> {
  try {
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
    const fixes = await detectRotationFixes(pdf, doc);

    const pages = doc.getPages();
    const changed: RotationFix[] = [];
    for (const fix of fixes) {
      const { page, targetRotation } = fix;
      const target = pages[page - 1];
      if (!target) continue;
      if (normalizedDegrees(target.getRotation().angle) === targetRotation) continue;
      target.setRotation(degrees(targetRotation));
      changed.push(fix);
    }
    if (changed.length === 0) return pdf;

    const bytes = await doc.save();
    console.info(
      '[claude-import] 회전 정규화:',
      changed.map((fix) => `${fix.page}p→${fix.targetRotation}°`).join(' ')
    );
    return Buffer.from(bytes);
  } catch (err) {
    console.warn('[claude-import] 회전 감지 실패 — 원본으로 진행:', err);
    return pdf;
  }
}

async function detectRotationFixes(
  pdf: Buffer,
  doc: PDFDocument
): Promise<RotationFix[]> {
  if (doc.getPageCount() > PER_PAGE_ORIENTATION_LIMIT) {
    const detected = await detectRotationsTogether(pdf);
    const pages = doc.getPages();
    return detected
      .filter((item) => pages[item.page - 1])
      .map((item) => ({
        page: item.page,
        targetRotation: normalizedDegrees(
          pages[item.page - 1].getRotation().angle + (360 - item.rotation)
        ),
      }));
  }

  const candidateSets: RotationCandidate[][] = [];
  for (const pageIndex of doc.getPageIndices()) {
    candidateSets.push(await buildRotationCandidates(doc, pageIndex));
  }

  const results = await Promise.all(
    candidateSets.map(async (candidates, pageIndex) => {
      try {
        const targetRotation = await selectUprightRotation(candidates);
        return { page: pageIndex + 1, targetRotation };
      } catch (err) {
        console.warn(
          `[claude-import] ${pageIndex + 1}p 회전 감지 실패 — 원본 방향 유지:`,
          err
        );
        return null;
      }
    })
  );

  return results.filter((fix): fix is RotationFix => fix !== null);
}

type RotationCandidate = {
  id: (typeof ROTATION_CANDIDATES)[number]['id'];
  rotation: number;
  pdf: Buffer;
};

async function buildRotationCandidates(
  source: PDFDocument,
  pageIndex: number
): Promise<RotationCandidate[]> {
  const candidates: RotationCandidate[] = [];
  for (const candidate of ROTATION_CANDIDATES) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(source, [pageIndex]);
    page.setRotation(degrees(candidate.rotation));
    doc.addPage(page);
    candidates.push({
      ...candidate,
      pdf: Buffer.from(await doc.save()),
    });
  }
  return candidates;
}

async function selectUprightRotation(
  candidates: RotationCandidate[]
): Promise<number> {
  const content: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: '아래 A, B, C, D는 같은 문서 페이지를 서로 다른 방향으로 표시한 후보입니다.',
    },
  ];
  for (const candidate of candidates) {
    content.push(
      { type: 'text', text: `후보 ${candidate.id}` },
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: candidate.pdf.toString('base64'),
        },
      }
    );
  }
  content.push({
    type: 'text',
    text:
      '한글과 표 제목이 위에서 아래로 똑바르게 읽히는 후보 하나를 고르세요. ' +
      '내용은 추출하지 말고 JSON 하나만 출력하세요: {"candidate":"A"}',
  });

  const message = await callOrientationModel(content, 200);
  const parsed = parseJson(message) as { candidate?: unknown };
  const selectedId = String(parsed.candidate ?? '').trim().toUpperCase();
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  if (!selected) {
    throw new Error(`올바른 회전 후보를 찾을 수 없습니다: ${String(parsed.candidate)}`);
  }
  return selected.rotation;
}

async function detectRotationsTogether(pdf: Buffer): Promise<PageRotation[]> {
  const message = await callOrientationModel(
    [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdf.toString('base64'),
        },
      },
      {
        type: 'text',
        text:
          '각 페이지의 글자 방향만 판정하세요. 내용은 읽지 마세요.\n' +
          'rotation은 페이지가 똑바로 선 상태에서 시계방향으로 몇 도 돌아가 보이는지입니다 ' +
          '(0 = 똑바름, 90 = 시계방향 90°, 180 = 거꾸로, 270 = 반시계방향 90°).\n' +
          '모든 페이지를 빠짐없이 넣고, JSON 하나만 출력하세요:\n' +
          '{"rotations": [{"page": 1, "rotation": 0}, {"page": 2, "rotation": 180}]}',
      },
    ],
    1000
  );
  const parsed = parseJson(message) as {
    rotations?: Array<{ page?: unknown; rotation?: unknown }>;
  };

  return (parsed.rotations ?? [])
    .map((rotation) => asPageRotation(rotation.page, rotation.rotation))
    .filter((rotation): rotation is PageRotation => rotation !== null);
}

async function callOrientationModel(
  content: Anthropic.ContentBlockParam[],
  maxTokens: number
): Promise<Anthropic.Message> {
  return anthropic.messages.create(
    {
      model: ORIENTATION_MODEL,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    },
    { timeout: ORIENTATION_TIMEOUT_MS }
  );
}

function asPageRotation(page: unknown, rotation: unknown): PageRotation | null {
  if (
    typeof page !== 'number' ||
    !Number.isInteger(page) ||
    page < 1 ||
    typeof rotation !== 'number' ||
    ![90, 180, 270].includes(rotation)
  ) {
    return null;
  }
  return { page, rotation };
}

function normalizedDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

// ─────────────────────────────────────────────
// 페이지 제한
// ─────────────────────────────────────────────

async function limitPages(
  pdf: Buffer
): Promise<{ pdf: Buffer; analyzedPages: number; totalPages: number }> {
  let totalPages: number;
  try {
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
    totalPages = doc.getPageCount();
  } catch (err) {
    throw new FormImportError(
      'PDF를 열 수 없습니다. 손상되었거나 암호가 걸린 파일인지 확인해주세요.',
      'PDF_UNREADABLE'
    );
  }

  if (totalPages <= MAX_PAGES) {
    return { pdf, analyzedPages: totalPages, totalPages };
  }

  // 계약서류는 앞쪽에 계약서·별지5호·별지7호가 모두 들어 있으므로 앞 60페이지만 봅니다.
  const src = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(
    src,
    Array.from({ length: MAX_PAGES }, (_, i) => i)
  );
  for (const page of pages) out.addPage(page);
  const bytes = await out.save();

  return {
    pdf: Buffer.from(bytes),
    analyzedPages: MAX_PAGES,
    totalPages,
  };
}

// ─────────────────────────────────────────────
// 정규화
// ─────────────────────────────────────────────

const DIGIT_FIELDS: readonly ImportedFieldKey[] = [
  'installQty',
  'installQty11to30',
  'powerSharingKw',
  'powerSharingQty',
  'powerSharingCableQty',
  'contractYear',
  'contractMonth',
  'contractDay',
  'parkingLotCount',
  'dupFastQty',
  'dupSlowQty',
  'dupDistQty',
  'dupOutletQty',
  'dupKioskQty',
  'evCount',
  'siteTotalSlow',
  'siteTotalFast',
];

const ENUM_VALUES: Partial<Record<ImportedFieldKey, readonly string[]>> = {
  businessType: ['subsidy', 'invest'],
  contractTerm: ['7', '10'],
  siteCategory: ['apartment', 'business', 'small_business', 'etc'],
  buildingType: [
    'danok',
    'apartment',
    'yeonlip',
    'sangga',
    'etc_officetel',
    'etc_knowledge',
    'etc_government',
    'etc_custom',
  ],
  ownership: ['own', 'rent'],
  ownerRelation: ['self', 'family', 'friend', 'employee', 'none'],
};

function toResult(raw: unknown): Omit<FormImportResult, 'analyzedPages' | 'totalPages'> {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const rawFields = (obj.fields ?? {}) as Record<string, unknown>;

  const normalized: Partial<Record<ImportedFieldKey, unknown>> = {};
  for (const key of FIELD_KEYS) {
    normalized[key] = normalizeField(key, rawFields[key]);
  }

  // 별지7호에 「해당사항 없음」이 체크돼 있으면 개별 수량이 남아 있어도 정리합니다.
  const dupPairs: Array<[ImportedFieldKey, ImportedFieldKey]> = [
    ['dupFast', 'dupFastQty'],
    ['dupSlow', 'dupSlowQty'],
    ['dupDist', 'dupDistQty'],
    ['dupOutlet', 'dupOutletQty'],
    ['dupKiosk', 'dupKioskQty'],
  ];
  for (const [flag, qty] of dupPairs) {
    if (normalized[flag] === false) {
      normalized[qty] = null;
    }
  }

  const fields = normalized as unknown as ImportedFormFields;

  const confidence: FormImportResult['confidence'] = {};
  if (Array.isArray(obj.confidence)) {
    for (const entry of obj.confidence) {
      const e = entry as { field?: unknown; score?: unknown };
      if (
        typeof e.field === 'string' &&
        typeof e.score === 'number' &&
        FIELD_KEYS.includes(e.field as ImportedFieldKey)
      ) {
        confidence[e.field as ImportedFieldKey] = clamp01(e.score);
      }
    }
  }

  const issues = Array.isArray(obj.issues)
    ? obj.issues.filter((i): i is string => typeof i === 'string' && i.trim() !== '')
    : [];

  const detectedDocs = Array.isArray(obj.detectedDocs)
    ? obj.detectedDocs
        .map((d) => d as { name?: unknown; pages?: unknown })
        .filter((d) => typeof d.name === 'string')
        .map((d) => ({
          name: d.name as string,
          pages: Array.isArray(d.pages)
            ? d.pages.filter((p): p is number => typeof p === 'number')
            : [],
        }))
    : [];

  return {
    fields,
    confidence,
    issues,
    detectedCpo:
      typeof obj.detectedCpo === 'string' && obj.detectedCpo.trim()
        ? obj.detectedCpo.trim()
        : null,
    detectedDocs,
  };
}

function normalizeField(key: ImportedFieldKey, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;

  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!text) return null;

  // 미기입 자리표시자를 값으로 읽어온 경우 걸러냅니다.
  if (/^(OO|oo|-|해당없음|해당 없음|미기입|없음|N\/A|n\/a)$/.test(text)) return null;

  if (key === 'custBizId') {
    const digits = text.replace(/\D/g, '');
    return digits.length === 10 ? digits : null;
  }

  if (DIGIT_FIELDS.includes(key)) {
    const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    if (!digits) return null;
    // 폼이 고정 선택지/범위를 쓰는 날짜 항목은 범위를 벗어나면 버려서 기본값을 남깁니다
    // (연도 select에 없는 값을 넣으면 빈칸으로 보이고, 사용자는 원인을 알 수 없습니다).
    if (key === 'contractYear' && !YEAR_OPTIONS.includes(digits as never)) return null;
    if (key === 'contractMonth' && !inRange(digits, 1, 12)) return null;
    if (key === 'contractDay' && !inRange(digits, 1, 31)) return null;
    return digits;
  }

  const allowed = ENUM_VALUES[key];
  if (allowed) {
    return allowed.includes(text) ? text : null;
  }

  return text;
}

function inRange(digits: string, min: number, max: number): boolean {
  const n = Number(digits);
  return Number.isInteger(n) && n >= min && n <= max;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

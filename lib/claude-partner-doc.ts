/**
 * 사업자등록증·통장사본 → 협력사 정보 1차 채움 (서버 사이드 전용).
 *
 * 협력사가 서류를 올리면 그 자리에서 읽어 입력칸을 채운다. 채우기까지가 전부이고
 * ★저장은 사람이 한다★ — 판독은 타이핑을 덜어 주는 것이지 확인을 대신하는 것이 아니다.
 * 계좌번호 한 자리가 틀리면 돈이 남에게 간다.
 *
 * lib/claude-import.ts(계약서 스캔 역추출)와 같은 Anthropic vision 을 쓰지만 다르다.
 *   · 입력 — 계약서는 PDF 뿐이지만 이 서류는 사진(JPG·PNG·WEBP)으로 오는 일이 더 많다.
 *   · 분량 — 한 장짜리다. 페이지 자르기·회전 보정이 필요 없다.
 *   · 검산 — 읽어낸 값을 그 자리에서 검사한다(국세청 검증 숫자·계좌 자릿수·은행 이름).
 *     못 믿을 값은 버리지 않고 issues 에 담아 올려 보낸다 — 사람이 보고 고치는 편이
 *     조용히 빈칸으로 두는 것보다 낫다(화면 규칙 10: 빈칸은 「안 넣음」이라는 다른 말이다).
 */
import Anthropic from '@anthropic-ai/sdk';
import { BANKS, isValidAccountNo, normalizeAccountNo } from './bank-account';
import { formatKoreanBizId, isValidKoreanBizId } from './bizid';
import type { PartnerFileKind } from './auth/partner-details';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** 숫자 한 자리가 곧 돈이라 판독은 가장 좋은 모델로 한다 — 부르는 횟수는 서류당 한 번이다 */
const MODEL = 'claude-opus-5';
const CALL_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 2;

/** 한 장짜리 서류다 — 이보다 크면 사진이 지나치게 큰 것이라 줄여 달라고 한다 */
const MAX_BYTES = 10 * 1024 * 1024;

export class PartnerDocReadError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'PartnerDocReadError';
  }
}

/** 판독으로 채울 수 있는 칸 — savePartnerFields 의 글자 칸과 같은 이름을 쓴다 */
export interface PartnerDocFields {
  bizRegNo: string | null;
  ceo: string | null;
  addr: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankHolder: string | null;
}

export interface PartnerDocReadResult {
  fields: PartnerDocFields;
  /** 읽었지만 검산에 걸린 것 — 화면이 그대로 띄운다 */
  issues: string[];
}

const EMPTY_FIELDS: PartnerDocFields = {
  bizRegNo: null, ceo: null, addr: null,
  bankName: null, bankAccountNo: null, bankHolder: null,
};

/** 서류마다 읽을 칸이 다르다 — 통장사본에서 대표자를 찾게 하지 않는다 */
const FIELDS_BY_KIND: Record<PartnerFileKind, (keyof PartnerDocFields)[]> = {
  bizCert: ['bizRegNo', 'ceo', 'addr'],
  bankbook: ['bankName', 'bankAccountNo', 'bankHolder'],
};

// ─────────────────────────────────────────────
// 출력 스키마 (structured outputs)
// ─────────────────────────────────────────────

/**
 * 「판독 불가」는 빈 문자열로 받는다 — lib/claude-import.ts 와 같은 방식이다.
 * 칸마다 required 를 채우고 additionalProperties 를 닫아야 스키마가 통과한다.
 */
function schemaFor(kind: PartnerFileKind) {
  const keys = FIELDS_BY_KIND[kind];
  return {
    type: 'object',
    properties: Object.fromEntries(keys.map((k) => [k, { type: 'string' }])),
    required: [...keys],
    additionalProperties: false,
  };
}

const PROMPT_BY_KIND: Record<PartnerFileKind, string> = {
  bizCert: `첨부한 이미지는 대한민국 사업자등록증입니다. 아래 세 칸을 그대로 옮겨 적어주세요.

- bizRegNo — 「등록번호」. 숫자 10자리만 적습니다(하이픈 없이). 예: 1658601315
- ceo — 「성명」 또는 「대표자」. 법인이면 대표자 이름입니다. 상호(법인명)가 아닙니다.
- addr — 「사업장 소재지」. 「본점 소재지」가 따로 있으면 사업장 소재지를 씁니다.

읽을 수 없거나 서류에 없는 칸은 빈 문자열("")로 둡니다. 지어내지 않습니다.
흐릿해서 자신이 없는 글자가 있으면 그 칸 전체를 빈 문자열로 둡니다 —
틀린 값을 적는 것이 빈칸보다 나쁩니다.`,

  bankbook: `첨부한 이미지는 대한민국 은행 통장사본(또는 계좌 확인서)입니다. 아래 세 칸을 그대로 옮겨 적어주세요.

- bankName — 은행 이름. 다음 중 하나와 정확히 같게 적습니다: ${BANKS.join(' · ')}
  목록에 없는 은행이면 통장에 적힌 대로 씁니다.
- bankAccountNo — 계좌번호. 숫자만 적습니다(하이픈 없이).
- bankHolder — 예금주. 사람 이름 또는 상호입니다.

읽을 수 없거나 서류에 없는 칸은 빈 문자열("")로 둡니다. 지어내지 않습니다.
흐릿해서 자신이 없는 글자가 있으면 그 칸 전체를 빈 문자열로 둡니다 —
계좌번호는 한 자리만 틀려도 돈이 남에게 갑니다. 빈칸이 낫습니다.`,
};

// ─────────────────────────────────────────────
// 판독
// ─────────────────────────────────────────────

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function readPartnerDoc({
  file, mediaType, kind,
}: {
  file: Buffer;
  mediaType: string;
  kind: PartnerFileKind;
}): Promise<PartnerDocReadResult> {
  if (file.length > MAX_BYTES) {
    throw new PartnerDocReadError(
      `파일이 커서 판독할 수 없습니다 (${(file.length / 1024 / 1024).toFixed(1)}MB).`,
      'FILE_TOO_LARGE'
    );
  }
  if (mediaType !== 'application/pdf' && !IMAGE_TYPES.has(mediaType)) {
    throw new PartnerDocReadError('PDF·JPG·PNG·WEBP 만 판독할 수 있습니다.', 'UNSUPPORTED_TYPE');
  }

  const data = file.toString('base64');
  const source =
    mediaType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data } };

  const content: Block[] = [source, { type: 'text', text: PROMPT_BY_KIND[kind] }];

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await callClaude(content, kind);
      return normalize(raw, kind);
    } catch (err) {
      lastError = err;
      console.warn(`[partner-doc] 판독 시도 ${attempt}/${MAX_ATTEMPTS} 실패:`, err);
    }
  }

  throw new PartnerDocReadError(
    lastError instanceof Error
      ? `서류를 읽지 못했습니다: ${lastError.message}`
      : '서류를 읽지 못했습니다.',
    'READ_FAILED'
  );
}

/**
 * structured outputs 로 한 번 부른다. 이 파라미터를 모르는 SDK·엔드포인트에서 400 이
 * 나면 프롬프트 지시만으로 한 번 더 부른다 — lib/claude-import.ts 와 같은 폴백이다.
 */
type Block = Anthropic.ContentBlockParam;

async function callClaude(content: Block[], kind: PartnerFileKind): Promise<unknown> {
  const base = {
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: 'user' as const, content }],
  };

  try {
    // output_config 는 이 프로젝트의 SDK 버전(0.52)에 타입이 없어 캐스팅한다.
    // SDK 는 body 를 그대로 직렬화하므로 파라미터는 정상 전달된다.
    const message = await anthropic.messages.create(
      {
        ...base,
        output_config: {
          effort: 'high',
          format: { type: 'json_schema', schema: schemaFor(kind) },
        },
      } as unknown as Anthropic.MessageCreateParamsNonStreaming,
      { timeout: CALL_TIMEOUT_MS }
    );
    return parseJson(message);
  } catch (err) {
    if (!isUnsupportedParamError(err)) throw err;
    console.warn('[partner-doc] structured outputs 미지원 → 프롬프트 파싱으로 폴백');
    // 스키마가 없으면 설명을 덧붙여 내보내는 일이 있다 — 형식을 말로 한 번 더 못박는다
    const fallback: Block[] = [
      ...content,
      { type: 'text', text: '설명 없이 JSON 객체 하나만 출력합니다.' },
    ];
    const message = await anthropic.messages.create(
      { ...base, messages: [{ role: 'user', content: fallback }] },
      { timeout: CALL_TIMEOUT_MS }
    );
    return parseJson(message);
  }
}

function isUnsupportedParamError(err: unknown): boolean {
  if (!(err instanceof Anthropic.BadRequestError)) return false;
  return /output_config|unexpected|unknown|unrecognized/i.test(err.message);
}

function parseJson(message: Anthropic.Message): unknown {
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new PartnerDocReadError('판독 결과가 비어 있습니다.', 'EMPTY_RESPONSE');
  try {
    return JSON.parse(text);
  } catch {
    // 폴백 경로에서는 설명이 앞뒤에 붙을 수 있다 — 가장 바깥 중괄호만 떼어 본다
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new PartnerDocReadError('판독 결과를 읽을 수 없습니다.', 'BAD_JSON');
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

// ─────────────────────────────────────────────
// 검산 — 읽어낸 값을 그 자리에서 본다
// ─────────────────────────────────────────────

function normalize(raw: unknown, kind: PartnerFileKind): PartnerDocReadResult {
  const src = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string): string | null => {
    const value = src[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };

  const fields: PartnerDocFields = { ...EMPTY_FIELDS };
  const issues: string[] = [];

  if (kind === 'bizCert') {
    const digits = (read('bizRegNo') ?? '').replace(/\D/g, '');
    if (digits) {
      fields.bizRegNo = digits;
      // 저장할 때와 같은 검사다 — 여기서 걸리면 사람이 서류를 보고 고쳐야 한다
      if (!isValidKoreanBizId(digits)) {
        issues.push(`사업자등록번호 ${formatKoreanBizId(digits)} 는 검증 숫자가 맞지 않습니다 — 확인해주세요.`);
      }
    }
    fields.ceo = read('ceo');
    fields.addr = read('addr');
  } else {
    const bank = read('bankName');
    if (bank) {
      fields.bankName = matchBankName(bank);
      if (!fields.bankName) {
        fields.bankName = bank;
        issues.push(`「${bank}」 는 은행 목록에 없습니다 — 골라주세요.`);
      }
    }
    const account = normalizeAccountNo(read('bankAccountNo') ?? '');
    if (account) {
      fields.bankAccountNo = account;
      if (!isValidAccountNo(account)) {
        issues.push(`계좌번호 ${account} 는 자릿수가 맞지 않습니다 — 확인해주세요.`);
      }
    }
    fields.bankHolder = read('bankHolder');
  }

  if (FIELDS_BY_KIND[kind].every((k) => fields[k] === null)) {
    issues.push('서류에서 읽어낸 값이 없습니다 — 직접 적어주세요.');
  }

  return { fields, issues };
}

/**
 * 「국민」·「국민은행」·「KB국민」 이 다 같은 곳을 가리킨다 — 목록의 이름으로 되돌린다.
 *
 * 「은행」·「주식회사」처럼 어느 은행에나 붙는 말은 떼고 견준다. 떼고 남은 것이 두 글자가
 * 안 되면 포기한다 — 「은행」 한 마디가 목록의 첫 줄에 붙어 엉뚱한 곳으로 돈이 가느니
 * 못 읽은 것으로 두는 편이 낫다.
 */
export function matchBankName(value: string): string | null {
  const squeeze = (s: string) => s.replace(/[\s()·.,]/g, '').toLowerCase();
  const core = (s: string) => squeeze(s).replace(/^주식회사/, '').replace(/은행$/, '');

  const exact = BANKS.find((b) => squeeze(b) === squeeze(value));
  if (exact) return exact;

  const target = core(value);
  if (target.length < 2) return null;
  return (
    BANKS.find((b) => {
      const bank = core(b);
      return bank.includes(target) || target.includes(bank);
    }) ?? null
  );
}

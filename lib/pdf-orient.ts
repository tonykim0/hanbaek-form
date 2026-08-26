/**
 * 돌아간 스캔을 판독 전에 바로 세운다 (서버 전용).
 *
 * ★왜 필요한가★ 협력사가 종이를 거꾸로 물려 스캔한 묶음이 실제로 온다. 그 PDF 는
 * 글자가 없는 이미지라 뒤집힌 채로 모델에 들어가고, 모델은 **읽지 못한다고 말하지 않는다** —
 * 그럴듯한 딴 값을 만들어 낸다. 실측(2026-08-26, 형석아파트 15쪽 스캔):
 *
 *   똑바로 → 현장명 「형석아파트」 · 청주시 흥덕구 사운로 283 · 현대엔지니어링
 *   180°  → 현장명 「충주시청자미디어센터」 · 충주시 단월동 283 · 에버온  ← 전부 가짜
 *
 * 접수 화면은 이 값을 그대로 칸에 채우므로, 사람이 못 알아채면 엉뚱한 현장이 만들어진다.
 * 「뒤집혀 있어도 읽어라」를 프롬프트로 부탁하는 길은 비결정적이라 버렸다(같은 파일이
 * 통과했다 실패했다 했다). 대신 **방향만 판정해 PDF 의 /Rotate 로 물리적으로 세운다** —
 * 방향 판정은 내용 판독보다 훨씬 쉬운 일이라 빠른 모델로 충분하고, 세운 뒤의 판독은
 * 똑바로 들어온 서류와 완전히 같은 길을 간다. 세운 파일이 그대로 저장되므로 사람이
 * 현장 상세에서 여는 서류도 바로 서 있다.
 *
 * ★판정은 「몇 도 돌아갔나」를 묻지 않고 네 방향을 나란히 보여주고 고르게 한다.★
 * 물어보는 방식은 옆으로 누운 페이지에서 90°와 270°를 못 가렸다 — 60쪽 실측:
 *
 *   방식                      0°      180°    90°/270°
 *   페이지 하나만 보여주고 질문   맞음     맞음     ★방향 반대로 답함 (13/15)★
 *   여러 쪽을 한 번에 질문      맞음   ★8/15 놓침★  —
 *   네 방향을 견주게 함(이것)    맞음     맞음     맞음  ← 60쪽 전부 정확
 *
 * 여러 쪽을 한 PDF 로 묶어 한 번에 묻는 길은 뒷페이지를 조용히 흘렸다(15쪽 중 8쪽을
 * 「똑바름」으로 답했고 3회 모두 그랬다). 틀린 방향은 없는 것보다 나쁘다 — 바로 선
 * 페이지를 눕혀 놓기 때문이다. 그래서 페이지마다 견주고, 실패하면 그 페이지만 원본대로 둔다.
 *
 * 이 단계는 판독을 막지 않는다 — 감지가 실패하면 원본 그대로 넘긴다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument, degrees } from 'pdf-lib';
import type { NormalizedFile } from './files';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** 방향만 보면 되므로 빠르고 싼 모델을 쓴다 */
const ORIENTATION_MODEL = 'claude-haiku-4-5-20251001';
const ORIENTATION_TIMEOUT_MS = 60_000;

/** 한 파일 안에서 동시에 판정할 페이지 수 — API 를 한꺼번에 두드리지 않는다 */
const PAGE_CONCURRENCY = 6;
/** 한 ZIP 안에서 동시에 다룰 파일 수 (페이지 동시 수와 곱해져 실제 동시 호출이 된다) */
const FILE_CONCURRENCY = 2;
/**
 * 여기까지만 판정한다. 페이지마다 한 번씩 부르므로 아주 긴 스캔은 접수 시간을 잡아먹는다.
 * 넘는 페이지는 원본 방향으로 남는다 — 잘못 돌리는 것보다 그대로 두는 편이 안전하다.
 */
const MAX_DETECT_PAGES = 60;

const ROTATION_CANDIDATES = [
  { id: 'A', rotation: 0 },
  { id: 'B', rotation: 90 },
  { id: 'C', rotation: 180 },
  { id: 'D', rotation: 270 },
] as const;

type RotationFix = { page: number; targetRotation: number };

/**
 * PDF 한 개를 바로 세운다. 고칠 페이지가 없으면 원본 버퍼를 그대로 돌려준다
 * (부르는 쪽이 「그대로인가」를 참조 비교로 알 수 있다).
 *
 * @param tag 로그 앞에 붙는 부르는 곳 이름 (intake · claude-import …)
 */
export async function uprightPdf(pdf: Buffer, tag: string): Promise<Buffer> {
  try {
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
    const fixes = await detectRotationFixes(doc, tag);

    const pages = doc.getPages();
    const changed: RotationFix[] = [];
    for (const fix of fixes) {
      const target = pages[fix.page - 1];
      if (!target) continue;
      if (normalizedDegrees(target.getRotation().angle) === fix.targetRotation) continue;
      target.setRotation(degrees(fix.targetRotation));
      changed.push(fix);
    }
    if (changed.length === 0) return pdf;

    const bytes = await doc.save();
    console.info(
      `[${tag}] 회전 정규화:`,
      changed.map((fix) => `${fix.page}p→${fix.targetRotation}°`).join(' ')
    );
    return Buffer.from(bytes);
  } catch (err) {
    console.warn(`[${tag}] 회전 감지 실패 — 원본으로 진행:`, err);
    return pdf;
  }
}

/**
 * 파일 목록에서 PDF 만 바로 세운다. 순서와 PDF 아닌 파일은 그대로 둔다 —
 * 뒤에서 이름으로 판독 결과를 맞추므로(buildUploadItems) 순서가 바뀌면 안 된다.
 *
 * 한 파일이 실패해도 그 파일만 원본으로 남는다.
 */
export async function uprightPdfFiles(
  files: NormalizedFile[],
  tag: string
): Promise<NormalizedFile[]> {
  const out = [...files];
  const targets = files
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => file.mimeType === 'application/pdf');

  for (let i = 0; i < targets.length; i += FILE_CONCURRENCY) {
    await Promise.all(
      targets.slice(i, i + FILE_CONCURRENCY).map(async ({ file, index }) => {
        const upright = await uprightPdf(file.buffer, tag);
        if (upright !== file.buffer) out[index] = { ...file, buffer: upright };
      })
    );
  }
  return out;
}

/** 페이지마다 「어느 방향이 똑바른가」를 물어 /Rotate 목표값으로 바꾼다 */
async function detectRotationFixes(doc: PDFDocument, tag: string): Promise<RotationFix[]> {
  const pageCount = doc.getPageCount();
  const limit = Math.min(pageCount, MAX_DETECT_PAGES);
  if (pageCount > limit) {
    console.warn(`[${tag}] ${pageCount}쪽 중 ${limit}쪽만 방향을 봅니다 — 나머지는 원본 방향`);
  }

  const pages = doc.getPages();
  const fixes: RotationFix[] = [];

  for (let from = 0; from < limit; from += PAGE_CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(PAGE_CONCURRENCY, limit - from) },
      (_, k) => from + k
    );
    const found = await Promise.all(
      batch.map(async (pageIndex) => {
        try {
          const candidates = await buildRotationCandidates(doc, pageIndex);
          const upright = await selectUprightRotation(candidates);
          /*
           * 후보는 원래 회전을 덮어쓴 절대값이다 — 똑바르게 보인 후보의 값이 곧 목표값이다.
           * (원래 값에 더하면 두 번 돌아간다)
           */
          return { page: pageIndex + 1, targetRotation: upright };
        } catch (err) {
          console.warn(`[${tag}] ${pageIndex + 1}p 회전 감지 실패 — 원본 방향 유지:`, err);
          return null;
        }
      })
    );
    for (const fix of found) {
      if (fix && pages[fix.page - 1]) fixes.push(fix);
    }
  }
  return fixes;
}

type RotationCandidate = {
  id: (typeof ROTATION_CANDIDATES)[number]['id'];
  /** 이 후보를 보여줄 때 쓴 /Rotate 값 (원래 회전을 덮어쓴 절대값) */
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
    candidates.push({ ...candidate, pdf: Buffer.from(await doc.save()) });
  }
  return candidates;
}

/**
 * 같은 페이지를 네 방향으로 보여주고 똑바른 것을 고르게 한다.
 * 「몇 도 돌아갔나」를 절대값으로 묻는 것보다 안정적이다 — 위 실측표를 보라.
 */
async function selectUprightRotation(candidates: RotationCandidate[]): Promise<number> {
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
      '한글과 표 제목이 위에서 아래로 똑바르게 읽히는 후보 하나를 고르세요. '
      + '내용은 추출하지 말고 JSON 하나만 출력하세요: {"candidate":"A"}',
  });

  const message = await anthropic.messages.create(
    {
      model: ORIENTATION_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content }],
    },
    { timeout: ORIENTATION_TIMEOUT_MS }
  );

  const parsed = parseJson(message) as { candidate?: unknown };
  const selectedId = String(parsed.candidate ?? '').trim().toUpperCase();
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  if (!selected) {
    throw new Error(`올바른 회전 후보를 찾을 수 없습니다: ${String(parsed.candidate)}`);
  }
  return selected.rotation;
}

function normalizedDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** 방향 판정 응답에서 JSON 을 뽑는다 */
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

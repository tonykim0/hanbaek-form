/**
 * 접수 서류 검수 — 서류마다 이상이 없는지 본다.
 *
 * 주소 대조를 따로 보여주지 않는다. 어긋난 주소는 그 주소가 적힌 서류의 문제이므로
 * 그 서류 칸에 붙는다 — 위에 따로 한 장을 두면 「어느 서류를 고쳐야 하나」를 사람이
 * 다시 짝지어야 한다.
 *
 * ★막지 않는다.★ 판독은 참고값이고 스캔 품질에 따라 틀린다. 접수를 막으면 정상 서류인데
 * 못 내는 일이 생기고 협력사는 할 수 있는 것이 없다. 짚어주고 사람이 판단한다 —
 * 서류 검수를 「반려만 한다」로 만든 것과 같은 이유다.
 *
 * 서버 전용.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { DocFinding, DocReview } from '@/types/intake-auto';
import type { NormalizedFile } from './files';
import { logLlmCall } from './llm-usage';

export type { DocFinding, DocReview };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-opus-5';
const CALL_TIMEOUT_MS = 120_000;
/** 한 번의 호출에 담을 PDF 총량 — 요청 한도(32MB)에 base64 팽창(1.33배)을 감안한 값 */
const BYTES_BUDGET = 18 * 1024 * 1024;

export interface ReviewTarget {
  kind: string;
  /** 분류가 판정한 종류 (사람이 읽는 이름) */
  category: string;
  file: NormalizedFile;
}

interface RawReview {
  findings?: Array<{ kind?: string; ok?: boolean; issues?: unknown }>;
  siteAddress?: string | null;
}

/**
 * 서류를 한 번에 넘겨 각각을 검수한다.
 *
 * PDF 만 본다 — 엑셀·이미지는 vision 이 읽지 못한다. 한 장뿐이면 서류 사이 대조가
 * 불가능하지만 그 서류 자체의 흠(서명 누락 등)은 볼 수 있어 그대로 부른다.
 */
export async function reviewDocs(targets: ReviewTarget[]): Promise<DocReview | null> {
  const pdfs = targets.filter((t) => t.file.mimeType === 'application/pdf');
  if (pdfs.length === 0) return null;

  // 큰 것부터 잘라내면 어느 서류가 빠졌는지 알 수 없으니, 순서대로 담고 넘치면 멈춘다
  const picked: ReviewTarget[] = [];
  let bytes = 0;
  const skipped: string[] = [];
  for (const t of pdfs) {
    if (bytes + t.file.buffer.length > BYTES_BUDGET) {
      skipped.push(t.category);
      continue;
    }
    picked.push(t);
    bytes += t.file.buffer.length;
  }
  if (picked.length === 0) return null;

  const content = [
    ...picked.map((t) => ({
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data: t.file.buffer.toString('base64'),
      },
    })),
    { type: 'text' as const, text: buildPrompt(picked) },
  ];

  const at = Date.now();
  try {
    const message = await anthropic.messages.create(
      { model: MODEL, max_tokens: 4096, messages: [{ role: 'user', content }] },
      { timeout: CALL_TIMEOUT_MS }
    );
    logLlmCall({
      route: 'intake-review', model: MODEL, ms: Date.now() - at,
      pages: picked.length, usage: message.usage,
    });
    return shape(parseJson(message), picked, skipped);
  } catch (err) {
    // 검수가 실패해도 접수는 되어야 한다 — 판정을 못 했다고만 알린다
    console.warn('[intake-review] 서류 검수 실패:', err);
    return {
      findings: picked.map((t) => ({
        kind: t.kind,
        ok: true,
        issues: [],
        checked: false,
      })),
      siteAddress: null,
      notChecked: [...picked.map((t) => t.category), ...skipped],
    };
  }
}

function buildPrompt(targets: ReviewTarget[]): string {
  const list = targets
    .map((t, i) => `${i + 1}번째 문서 = ${t.category} (kind: ${t.kind})`)
    .join('\n');

  return `위 PDF 들은 전기차 충전기 설치 현장 한 곳의 접수 서류다. 순서대로:

${list}

각 문서를 검수하라. 아래 넷만 본다.

1) 종류가 맞는가 — 「${targets[0].category}」라고 분류된 문서가 실제로 그 서류인가.
   엉뚱한 서류가 들어왔으면 무엇으로 보이는지 적는다.
2) 빠진 것이 있는가 — 서명·직인·날짜·기재란이 비어 있는가. 페이지가 잘렸는가.
3) 현장 정보가 서로 어긋나는가 — 여러 문서에 같이 적히는 값(현장 주소·현장명·설치 대수·
   계약 기간)이 문서마다 다른가. 다르면 **그 값이 적힌 문서 양쪽 모두**에 문제로 적는다.
   도로명·지번 표기 차이나 「전북특별자치도」·「전북」 같은 축약은 다른 값이 아니다.
4) 읽을 수 없는가 — 스캔이 흐려 판독이 안 되는 항목이 있는가.

규칙:
- 문제가 없으면 ok=true, issues 는 빈 배열이다. 없는 문제를 만들지 마라.
- issues 는 한국어 한 줄씩. 무엇이 어떻게 문제인지 구체적으로. 「확인 필요」처럼 막연한 말은 쓰지 마라.
- 추측하지 마라. 안 보이면 「읽을 수 없음」이라고 적는다.
- siteAddress 는 문서들이 가리키는 현장 주소 하나(도로명 우선). 판단이 안 되면 null.

아래 JSON 만 출력하라. 다른 말은 쓰지 마라.
{
  "findings": [{ "kind": "문서 kind", "ok": true, "issues": [] }],
  "siteAddress": "주소 또는 null"
}`;
}

/**
 * 응답에서 JSON 을 꺼낸다.
 *
 * 이 저장소의 다른 Claude 호출(lib/claude.ts)과 같은 방식이다. 구조화 출력(messages.parse)이
 * 더 안전하지만 지금 설치된 SDK(0.52)에는 그 API 가 없다 — 올리면 운영 중인 포털의
 * 판독·분류 호출까지 같이 흔들리므로 여기서는 같은 방식을 따른다.
 */
function parseJson(message: Anthropic.Message): RawReview {
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('JSON 을 찾을 수 없습니다.');
  return JSON.parse(text.slice(start, end + 1)) as RawReview;
}

/** 모델 응답을 화면이 믿을 수 있는 형태로 좁힌다 — 넘기지 않은 서류를 만들어내지 않는다 */
function shape(raw: RawReview, targets: ReviewTarget[], skipped: string[]): DocReview {
  const findings: DocFinding[] = targets.map((t) => {
    const found = raw.findings?.find((f) => f.kind === t.kind);
    const issues = Array.isArray(found?.issues)
      ? found!.issues.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : [];
    return {
      kind: t.kind,
      // 문제를 적었으면 ok 를 믿지 않는다 — 둘이 어긋나면 문제 쪽이 사실이다
      ok: issues.length === 0 && found?.ok !== false,
      issues,
      checked: true,
    };
  });
  return {
    findings,
    siteAddress: raw.siteAddress?.trim() || null,
    notChecked: skipped,
  };
}

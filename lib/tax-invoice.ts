/**
 * 세금계산서 금액 판독 — 올린 PDF·이미지에서 공급가액·세액·합계를 읽는다.
 *
 * ★판독은 비결정적이라 검산이 문이다.★ 세금계산서에는 세 값이 함께 적혀 있고
 * 공급가액 + 세액 = 합계가 항상 성립한다. 판독값이 이 검산을 통과했을 때만 채우고,
 * 아니면 전부 null 로 돌려준다 — 틀린 금액이 들어가면 명세서 대조 자체가 거짓말이
 * 된다(불일치인데 일치로, 일치인데 불일치로). null 이면 화면이 「금액 미확인」으로
 * 두고 사람이 적는다. 채워진 값도 사람이 언제든 고칠 수 있다(화면 규칙 7번).
 *
 * 서버 사이드 전용.
 */
import Anthropic from '@anthropic-ai/sdk';

/*
 * 클라이언트는 부를 때 만든다 — 모듈 로드 시점에 만들면 환경 파일을 나중에 읽는
 * 스크립트(tsx + loadEnvFile)에서 키가 빈 채로 굳는다. Next 런타임에서는 차이가 없다.
 */
let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

/*
 * 접수 판독(lib/claude.ts)과 같은 모델을 쓴다 — 세금계산서는 정형 문서라 이보다
 * 작은 모델도 읽지만, 금액이 틀리면 대조가 뒤집히므로 아끼는 자리가 아니다.
 */
const MODEL = 'claude-sonnet-4-6';
const CALL_TIMEOUT_MS = 40_000;

const PROMPT = `이 파일은 한국 전자세금계산서입니다. 다음 세 값을 읽어 JSON 으로만 답하세요.

{"supplyAmount": 공급가액 합계, "taxAmount": 세액 합계, "totalAmount": 합계금액}

- 값은 원 단위 정수입니다. 쉼표·원·₩ 를 빼고 숫자만 적으세요.
- 수정세금계산서의 음수 금액은 음수 그대로 적으세요.
- 확실히 읽을 수 없는 값은 null 로 적으세요. 추측하지 마세요.
- JSON 외의 말은 하지 마세요.`;

export interface TaxInvoiceAmounts {
  supplyAmount: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  /** 검산 결과 — false 면 세 값 모두 null 로 나갔다 */
  verified: boolean;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/**
 * 파일 하나에서 금액 셋을 읽는다. 판독 실패·검산 실패는 throw 가 아니라
 * verified: false 다 — 파일 보관 자체는 금액 없이도 값이 있다.
 */
export async function extractTaxInvoiceAmounts(
  buffer: Buffer,
  mimeType: string
): Promise<TaxInvoiceAmounts> {
  const none: TaxInvoiceAmounts = {
    supplyAmount: null, taxAmount: null, totalAmount: null, verified: false,
  };

  const source =
    mimeType === 'application/pdf'
      ? {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: buffer.toString('base64') },
        }
      : IMAGE_TYPES.includes(mimeType as ImageType)
        ? {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: mimeType as ImageType, data: buffer.toString('base64') },
          }
        : null;
  if (!source) return none;

  let raw: unknown;
  try {
    const message = await anthropic().messages.create(
      {
        model: MODEL,
        max_tokens: 256,
        messages: [{ role: 'user', content: [source, { type: 'text', text: PROMPT }] }],
      },
      { timeout: CALL_TIMEOUT_MS }
    );
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .replace(/```(?:json)?/gi, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return none;
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    console.warn('[tax-invoice] 판독 실패:', err);
    return none;
  }

  const int = (v: unknown): number | null =>
    typeof v === 'number' && Number.isSafeInteger(v) ? v : null;
  const r = raw as Record<string, unknown>;
  const supply = int(r.supplyAmount);
  const tax = int(r.taxAmount);
  const total = int(r.totalAmount);

  /*
   * 결정적 검산 — 공급가액 + 세액 = 합계. 세 값이 다 읽혔고 등식이 맞아야 채운다.
   * 세액 = 공급가액의 10% 는 검산에 안 쓴다 — 영세율(세액 0)·원 단위 절사가 있어
   * 등식이 아니다. 문서 안의 세 값이 서로 맞는지만 본다.
   */
  if (supply === null || tax === null || total === null || supply + tax !== total) {
    return none;
  }
  return { supplyAmount: supply, taxAmount: tax, totalAmount: total, verified: true };
}

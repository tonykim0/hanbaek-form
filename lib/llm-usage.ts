/**
 * 판독에 쓴 토큰을 한 줄로 남긴다 — 계기판.
 *
 * ★왜 필요한가★ 지금까지 `usage` 를 읽는 곳이 하나도 없었다. 그래서 어느 경로가 돈을
 * 쓰는지, 캐싱을 넣었을 때 실제로 먹는지 알 방법이 없었다. 절감을 넣고도 먹었는지 모르면
 * 같은 일을 두 번 하게 된다(doc/REFACTOR_PLAN_2.md 재리뷰 3 의 T6 — 다른 절감보다 먼저다).
 *
 * ★로그로 두는 이유★ 표를 만들면 그 표를 관리해야 하고, 판독은 하루 수십 건이라 표까지
 * 갈 일이 아니다. 프로덕션은 어차피 런타임 로그로 들여다본다(CLAUDE.md):
 *
 *   npx vercel logs --environment production -x --since 1h | grep '\[llm\]'
 *
 * ★cache_read 가 계속 0이면 캐싱이 안 먹고 있다는 뜻이다★ — 캐시는 접두사 일치라, 앞쪽에
 * 한 글자만 달라도 통째로 깨진다. 그 사실을 이 줄이 아니면 알 수 없다.
 */

/** 토큰 값이 없을 수도 있다 — SDK 버전·엔드포인트에 따라 필드가 빠진다 */
interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * 눈대중용 단가 (2026-08-27 기준, claude-opus-5 · 100만 토큰당 달러).
 *
 * ★청구서가 아니다★ — 어느 경로가 비싼지 견주는 데만 쓴다. 캐시 읽기는 입력의 0.1배,
 * 캐시 쓰기는 1.25배다. 단가가 바뀌면 이 숫자도 바뀌므로 날짜를 같이 적어 둔다.
 */
const PRICE = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } as const;

export interface LlmCallLog {
  /** 어느 경로인가 — 로그에서 이 이름으로 묶어 본다 (claude-import · partner-doc · intake-review) */
  route: string;
  model: string;
  /** 걸린 시간(ms) — 타임아웃을 늘릴지 판단하는 값이다 */
  ms: number;
  /** 문서 몇 쪽을 보냈나 — 토큰의 대부분이 여기서 나온다 */
  pages?: number;
  usage: UsageLike | undefined;
}

/**
 * 한 줄 남긴다. 실패해도 판독을 막지 않는다 — 계기판이 본체를 세우면 안 된다.
 */
export function logLlmCall({ route, model, ms, pages, usage }: LlmCallLog): void {
  try {
    const input = usage?.input_tokens ?? 0;
    const output = usage?.output_tokens ?? 0;
    const cacheRead = usage?.cache_read_input_tokens ?? 0;
    const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
    const usd =
      (input * PRICE.input
        + output * PRICE.output
        + cacheRead * PRICE.cacheRead
        + cacheWrite * PRICE.cacheWrite) / 1_000_000;

    console.log(
      `[llm] ${route} model=${model} ms=${ms}`
      + (pages === undefined ? '' : ` pages=${pages}`)
      + ` in=${input} out=${output} cacheRead=${cacheRead} cacheWrite=${cacheWrite}`
      + ` ~$${usd.toFixed(3)}`
    );
  } catch {
    /* 계기판이 본체를 세우지 않는다 */
  }
}

/**
 * DB 읽기 동시성 제한 — 한 프로세스가 동시에 던지는 쿼리 수를 묶는다.
 *
 * ★왜 필요한가★
 * 저장소는 목록 하나를 조립할 때 관련 표를 병렬로 긁는다(recordsOf 6개 + 단가·정산
 * 규칙 = 8개). 커넥션 풀은 그보다 작고(lib/db/client 의 max), 상세를 여러 개 겹쳐
 * 읽는 화면(/payouts)은 그 묶음을 또 여러 벌 던진다. 그러면 큐가 풀리지 않고 요청이
 * 통째로 죽는다 — 실사고: /payouts 300초 런타임 타임아웃(2026-08-21).
 * 실측: 같은 쿼리 8개를 한꺼번에 던지면 10초 초과, 5개+3개로 끊으면 124ms.
 *
 * 풀을 키우는 것만으로는 부족하다 — 현장이 늘면 던지는 쿼리도 늘어 다시 넘는다.
 * 그래서 「얼마나 많이 던질 수 있나」를 여기 한 곳에서 정한다.
 *
 * ★잎(leaf) 쿼리만 감싼다.★ 슬롯을 쥔 채 또 슬롯을 기다리면 서로를 막는다.
 * 감싸는 것은 실제 쿼리 한 방이고, 그것들을 묶는 Promise.all 은 감싸지 않는다.
 */

/** 풀(max)보다 작아야 한다 — 세션 확인·쓰기 같은 다른 쿼리가 쓸 자리를 남긴다 */
const LIMIT = 4;

let active = 0;
const waiting: Array<() => void> = [];

/**
 * 느린 쿼리·대기를 로그에 남기는 기준.
 *
 * 다음 고착을 사용자 제보 전에 알기 위한 것이다 — 2026-08-21 에는 화면이 300초 만에
 * 죽을 때까지 로그에 아무 신호가 없었다. 여기 걸리는 줄이 보이면 그때가 신호다.
 */
const SLOW_QUERY_MS = 700;
const SLOW_WAIT_MS = 300;

/** 쿼리 한 방을 슬롯 안에서 돈다 */
export async function dbSlot<T>(run: () => Promise<T>): Promise<T> {
  const queuedAt = Date.now();
  if (active >= LIMIT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  const waited = Date.now() - queuedAt;
  /*
   * 슬롯을 오래 기다렸다는 것은 한 요청이 던지는 쿼리가 풀보다 많다는 뜻이다 —
   * 고착의 앞 신호다. 대기 줄 길이를 같이 남긴다.
   */
  if (waited >= SLOW_WAIT_MS) {
    console.warn(`[db] 슬롯 대기 ${waited}ms (대기 ${waiting.length}건) — 한 요청의 동시 쿼리가 많습니다`);
  }
  active++;
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    const took = Date.now() - startedAt;
    if (took >= SLOW_QUERY_MS) {
      console.warn(`[db] 느린 쿼리 ${took}ms`);
    }
    active--;
    waiting.shift()?.();
  }
}

/** 쿼리 여러 방을 한꺼번에 부르되, 실제로 도는 것은 LIMIT 개까지다 */
export function allSlots<T extends readonly unknown[]>(
  tasks: readonly [...{ [K in keyof T]: () => Promise<T[K]> }]
): Promise<T> {
  return Promise.all(
    tasks.map((task) => dbSlot(task as () => Promise<unknown>))
  ) as unknown as Promise<T>;
}

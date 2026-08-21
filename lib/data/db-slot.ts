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

/** 쿼리 한 방을 슬롯 안에서 돈다 */
export async function dbSlot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= LIMIT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await run();
  } finally {
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

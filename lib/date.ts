/**
 * 한국 달력의 날짜와 시각.
 *
 * ★왜 필요한가★
 * `new Date().toISOString().slice(0, 10)` 을 스물여섯 자리에서 각자 적고 있었다. 그런데
 * 그것은 **UTC** 다. 함수는 UTC 로 돌기 때문에(`vercel.json` 에 TZ 를 두지 않는다) 두 가지가
 * 틀어져 있었다:
 *
 *   1. 진행현황 메모 시각이 늘 9시간 전으로 보였다. 한국 시각 16:00 에 남긴 것이
 *      화면에 07:00 으로 찍혀 있었다(2026-08-20 운영 자료에서 확인).
 *   2. `last_progress_at` · `contract_confirmed_at` · `priced_at` 은 날짜를 글자로 담는
 *      칸이라, 한국 시간 자정~오전 9시 사이에 저장하면 **하루 전 날짜가 그대로 남았다.**
 *      업무가 9시에 시작하므로 아침 일찍 한 일이 어제 것이 된다.
 *
 * 그래서 「오늘」을 세는 곳을 여기 하나로 모은다. 자리마다 적으면 한 곳을 고쳐도
 * 나머지 스물다섯 곳이 UTC 로 남는다.
 *
 * ★고정 +9 를 쓰는 이유★
 * 한국은 서머타임이 없다. `Intl` 로 도는 것보다 값이 뻔하고, 이 값이 무엇인지 읽어서 안다.
 *
 * ★담는 것은 시각, 세는 것은 날짜★
 * DB 의 `timestamptz` 칸(메모의 `at` 등)은 순간을 그대로 담는다 — 옳다. 틀린 것은 그 순간을
 * 사람이 읽는 글자로 바꿀 때 어느 시간대로 읽느냐였다. 그 변환만 여기서 한다.
 */

/** 한국 표준시 = UTC+9. 서머타임이 없다. */
const KST_MS = 9 * 60 * 60 * 1000;

/** 그 순간을 한국 벽시계로 옮긴 Date — 글자로 자르는 데만 쓴다(다시 저장하지 않는다) */
const wall = (at: Date): Date => new Date(at.getTime() + KST_MS);

/** 그 순간의 한국 달력 날짜 — `2026-08-20` */
export const dayOf = (at: Date): string => wall(at).toISOString().slice(0, 10);

/** 오늘 (한국 달력) — 날짜를 글자로 담는 칸에 쓴다 */
export const today = (now: Date = new Date()): string => dayOf(now);

/** 그 순간의 한국 시각 — `2026-08-20 16:00` */
export const stampOf = (at: Date): string =>
  wall(at).toISOString().slice(0, 16).replace('T', ' ');

/** 지금 (한국 시각) */
export const stamp = (now: Date = new Date()): string => stampOf(now);

/** 이번 달 (한국 달력) — `2026-08` */
export const thisMonth = (now: Date = new Date()): string => dayOf(now).slice(0, 7);

/**
 * `2026-08` 에서 delta 달 옮긴 값.
 * 달 셈은 시간대와 무관하다 — 글자를 쪼개서 세므로 UTC 든 KST 든 같은 답이 나온다.
 */
export function monthShift(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1 + delta, 1));
  return at.toISOString().slice(0, 7);
}

/**
 * 마지막 진척 후 경과일.
 *
 * 저장된 날짜도 한국 달력이고 오늘도 한국 달력이라 둘을 같은 자로 센다. 예전에는 오늘만
 * UTC 로 세서, 한국 시간 오전 9시 전에는 경과일이 하루 적게 나왔다.
 */
export function daysSince(day: string, now: Date = new Date()): number {
  const then = Date.parse(`${day}T00:00:00Z`);
  const to = Date.parse(`${today(now)}T00:00:00Z`);
  return Math.max(0, Math.round((to - then) / 86400000));
}

/**
 * 사업연도 — 어느 해의 일인가.
 *
 * 접수일(createdAt)의 연도다. 이관 현장의 접수일은 계약서수령일로 맞춰 두었으므로
 * (migrations/0016) 노션에서 온 현장과 콘솔에서 접수한 현장이 같은 기준으로 한 해에 든다.
 *
 * ★현장번호(HB-2026-041)의 연도를 쓰지 않는다.★ 번호는 배정 시점이라 연말에 접수한 건이
 * 다음 해 번호를 받으면 수주 현황과 보드가 서로 다른 해를 말한다.
 *
 * 수주 현황(/dashboard)과 계약·시공 보드가 같은 답을 해야 하므로 규칙을 여기 한 곳에 둔다.
 */

/** 연도를 안 가리는 자리. 실제 연도와 겹치지 않는 말이어야 한다. */
export const ALL_YEARS = '전체';

export function businessYearOf(p: { createdAt: string }): string {
  return p.createdAt.slice(0, 4);
}

/** 이 자료에 실제로 있는 연도 — 최근 것부터. */
export function businessYearsOf(projects: Array<{ createdAt: string }>): string[] {
  return [...new Set(projects.map(businessYearOf))]
    .filter((y) => /^\d{4}$/.test(y))
    .sort()
    .reverse();
}

/** 고른 연도만 남긴다. ALL_YEARS 면 그대로 — 거르는 자리마다 이 판정을 다시 쓰지 않는다. */
export function inBusinessYear<T extends { createdAt: string }>(list: T[], year: string): T[] {
  if (year === ALL_YEARS) return list;
  return list.filter((p) => businessYearOf(p) === year);
}

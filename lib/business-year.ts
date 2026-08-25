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
 *
 * ★projects.biz_year 를 안 보는 이유★
 * 연도가 두 개 있다. 접수 연도(created_at)와 사업연도(biz_year)다. 사업연도는 현장을 만들 때
 * 접수 연도로 넣어 두고 한백이 현장 상세에서 고칠 수 있다(setBizYear, 감사기록 남는다).
 *
 * 그 칸은 지금 판정에 쓰이지 않는다 — 현장 상세에 보이고 고칠 수 있는 기록일 뿐이다.
 * 단가 매칭도 그것을 안 본다(pricing-match matchingRules 의 축은 운영사·계약연수·사업구분·
 * 수전방식·교체유형·건축물유형이다. PricingRule.bizYear 는 케이스 자기 것이라 다른 값이다).
 * 그리고 목록이 그 값을 싣지 않는다 — ProjectSummary 에 bizYear 가 없다(assemble summaryOf).
 *
 * 현장이 전부 2026 사업연도라 두 연도의 답이 같다(한백 확인 2026-08-25). 그래서 이대로 둔다.
 *
 * 갈리는 때는 연말에 접수해 다음 해 사업으로 잡은 현장(또는 그 반대)이다. 신호는 하나뿐이다 —
 * ★현장 상세의 사업연도와 이 연도 탭이 다른 해를 말한다.★ 그때는 ProjectSummary 와 summaryOf
 * 에 bizYear 를 싣고, 아래 businessYearOf 가 그것을 먼저 보고 없을 때만 접수 연도로 떨어지게
 * 한다.
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

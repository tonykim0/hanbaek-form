/**
 * 「EV 보조금 신청이력(2017~2024)」 조회 — 기관충전소 인덱스와 별개의 두 번째 자료.
 *
 * 기관충전소(lib/charger-history.ts)는 실제로 등록 · 운영 중인 충전기를 담고,
 * 이쪽은 연도별 보조금 신청 대기번호 명부를 담습니다. 두 자료는 출처도 시점도
 * 달라서 한쪽에만 있는 현장이 흔합니다 — 그래서 합치지 않고 따로 조회합니다.
 *
 * 주소 파싱 · 샤드 규칙 · 조회 사다리는 기관충전소 쪽과 똑같이 씁니다
 * (같은 주소를 두 자료에서 같은 방식으로 찾기 위해서).
 */

import {
  lookupSiteHistory,
  type LookupResult,
  type Shard,
  type ShardLoader,
} from './charger-history';

export const SUBSIDY_DATA_BASE = '/data/subsidy-history';

/* ------------------------------------------------------------ 인덱스 형태 */

/**
 * 보조금 신청 한 줄 — 크기를 줄이려고 배열로 담습니다.
 * [사업년도, 대기번호, 신청대수, 충전기유형, 공사완료일, 최초지급서류제출일]
 * 날짜는 「YYYY-MM-DD」, 값이 없으면 빈 문자열입니다.
 */
export type SubsidyRow = [
  year: string,
  waitNo: string,
  qty: number,
  type: string,
  doneAt: string,
  paidAt: string,
];

export interface SubsidyRecord {
  /** 대표 도로명주소 (원본 표기) */
  ad: string;
  /** 신청자명 — 같은 주소에 여러 건이면 모두 (원본에 빈 값인 행이 많습니다) */
  nm: string[];
  /** 신청 건수 */
  c: number;
  /** 신청 대수 합계 */
  q: number;
  /** 신청 이력 */
  h: SubsidyRow[];
}

export interface SubsidyMeta {
  /** 원본 파일명 */
  source: string;
  /** 사업연도 범위 — 「2017~2024」 */
  years: string;
  /** 원본 행 수 */
  rows: number;
  /** 신청 대수 합계 */
  units: number;
  /** 주소(도로명+건물번호) 수 */
  addresses: number;
  /** 지역별 기록 수 */
  sites: number;
  shardCount: number;
}

export type SubsidyLookupResult = LookupResult<SubsidyRecord>;

/* ------------------------------------------------------------------ 요약 */

export interface SubsidySummary {
  /** 신청 건수 */
  count: number;
  /** 신청 대수 합계 */
  units: number;
  /** 사업연도 (오래된 순) */
  years: string[];
  /** 공사완료일이 적힌 건수 */
  completed: number;
  /** 충전기유형별 대수 (많은 순) */
  types: Array<{ name: string; qty: number }>;
  /** 신청 이력 (최근 순) */
  rows: SubsidyRow[];
}

export function summarizeSubsidy(rec: SubsidyRecord): SubsidySummary {
  const years = new Set<string>();
  const types = new Map<string, number>();
  let completed = 0;

  for (const [year, , qty, type, doneAt] of rec.h) {
    if (year) years.add(year);
    if (type) types.set(type, (types.get(type) ?? 0) + qty);
    if (doneAt) completed += 1;
  }

  return {
    count: rec.c,
    units: rec.q,
    years: [...years].sort(),
    completed,
    types: [...types.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
    rows: [...rec.h].sort((a, b) => `${b[0]}${b[1]}`.localeCompare(`${a[0]}${a[1]}`)),
  };
}

/* ------------------------------------------------------------------ 조회 */

export function lookupSubsidyHistory(
  input: { road: string; jibun?: string },
  load: ShardLoader<SubsidyRecord>
): Promise<SubsidyLookupResult> {
  return lookupSiteHistory<SubsidyRecord>(input, load);
}

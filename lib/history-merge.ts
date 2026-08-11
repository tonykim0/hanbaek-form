/**
 * 두 자료를 건별로 맞대는 교차검증.
 *
 *   기관충전소  … 실제 등록 · 운영 중인 충전기 (설치 시기 · 운영기관 · 보조금신청번호)
 *   보조금 명부 … 연도별 보조금 신청 대기번호 (신청대수 · 유형 · 공사완료일)
 *
 * 두 자료는 「보조금신청번호(2024-2363)」와 「사업연도 + 대기번호(2024 / 2363)」가
 * 같은 체계라, 이걸 키로 한 건씩 이어 붙일 수 있습니다. 전수 대조에서 등록측
 * 신청번호 30,412행 중 27,084행(89.1%)이 명부와 이어졌고, 남는 쪽은 대부분
 * 명부 범위(2017~2024) 밖인 2025년 신청분이었습니다.
 *
 * 이어 붙인 뒤 남는 행이 곧 확인할 거리입니다.
 *   명부만 → 등록이 안 됐거나 철거됨
 *   등록만 → 자부담이거나 명부 범위 밖(2025~) 신청분
 */

import { isSubsidized, type SiteRecord } from './charger-history';
import type { SubsidyRecord } from './subsidy-history';

export type MergeStatus =
  /** 명부 · 등록이 이어졌고 대수도 같음 */
  | '일치'
  /** 이어졌지만 대수가 다름 */
  | '대수차이'
  /** 명부에만 있음 */
  | '명부만'
  /** 등록에만 있음 */
  | '등록만';

export interface MergedRow {
  status: MergeStatus;
  /** 보조금 신청연도 (명부 사업연도 · 등록측 신청번호 연도) */
  year: string;
  /** 대기번호 · 신청번호의 번호 부분 */
  no: string;
  /** 등록 설치시기 「2024. 11」 — 등록 쪽이 없으면 빈 값 */
  installed: string;
  /** 명부 신청대수 */
  applied: number | null;
  /** 등록 대수 */
  registered: number | null;
  /** 충전기 유형 — 명부 표기 우선, 없으면 등록측 보조금 구분 */
  kind: string;
  /** 급속 여부 (등록 기준) */
  fast: boolean;
  /** 공사완료일 (명부) */
  doneAt: string;
  /** 운영기관 (등록) */
  operators: string;
}

export interface MergedSummary {
  rows: MergedRow[];
  /** A — 명부 신청대수 합계 */
  applied: number;
  /** B — 현재 등록 완속 */
  slow: number;
  /** 현재 등록 급속 */
  fast: number;
  /** 등록측이 보조금으로 표기한 대수 */
  registeredSubsidized: number;
  /** 명부에만 있는 대수 (등록 미확인) */
  appliedOnly: number;
  /** 명부 범위 밖(마지막 연도 이후) 신청번호로 등록된 대수 */
  afterRangeQty: number;
  /** 그 연도들 */
  afterRangeYears: string[];
}

/** 「2025-2727」 → ['2025','2727'] · 알아볼 수 없으면 null */
function splitApplyNo(applyNo: string): [year: string, no: string] | null {
  const m = /^(\d{4})-(\d+)$/.exec(applyNo.trim());
  return m ? [m[1], m[2]] : null;
}

interface ChargerGroup {
  year: string;
  no: string;
  qty: number;
  fast: boolean;
  kind: string;
  operators: Map<string, number>;
  /** 설치년월 중 가장 최근 것 */
  installed: string;
}

/**
 * 등록 이력을 보조금신청번호로 묶습니다.
 * 신청번호가 없는 행(자부담 · 미표기)은 묶지 않고 그대로 둡니다.
 */
function groupCharger(record: SiteRecord | null): {
  keyed: Map<string, ChargerGroup>;
  loose: ChargerGroup[];
} {
  const keyed = new Map<string, ChargerGroup>();
  const loose: ChargerGroup[] = [];
  if (!record) return { keyed, loose };

  for (const [year, month, qty, code, applyNo, operator, fast] of record.h) {
    const parsed = isSubsidized(code) ? splitApplyNo(applyNo) : null;
    const installed = month ? `${year}. ${month}` : year;
    const key = parsed ? `${parsed[0]}|${parsed[1]}` : '';

    const target = key ? keyed.get(key) : undefined;
    if (target) {
      target.qty += qty;
      target.operators.set(operator, (target.operators.get(operator) ?? 0) + qty);
      if (installed > target.installed) target.installed = installed;
      continue;
    }

    const created: ChargerGroup = {
      year: parsed ? parsed[0] : year,
      no: parsed ? parsed[1] : '',
      qty,
      fast: fast === 1,
      kind: fast === 1 ? '급속' : '완속',
      operators: new Map(operator ? [[operator, qty]] : []),
      installed,
    };
    if (key) keyed.set(key, created);
    else loose.push(created);
  }

  return { keyed, loose };
}

function operatorText(operators: Map<string, number>): string {
  return [...operators.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, qty]) => `${name}(${qty})`)
    .join(' · ');
}

/** 정렬 키 — 최근 것이 위로 */
function sortKey(row: MergedRow): string {
  return `${row.installed || row.year}|${row.year}|${row.no.padStart(8, '0')}`;
}

/**
 * 두 자료를 한 표로 합칩니다.
 * @param lastListedYear 명부에 담긴 마지막 사업연도 (이후 신청분을 구분하기 위해)
 */
export function mergeHistories(
  charger: SiteRecord | null,
  subsidy: SubsidyRecord | null,
  lastListedYear: number
): MergedSummary {
  const { keyed, loose } = groupCharger(charger);
  const rows: MergedRow[] = [];
  const used = new Set<string>();

  for (const [year, no, qty, kind, doneAt] of subsidy?.h ?? []) {
    const key = `${year}|${no}`;
    const hit = keyed.get(key);
    if (hit) used.add(key);
    rows.push({
      status: hit ? (hit.qty === qty ? '일치' : '대수차이') : '명부만',
      year,
      no,
      installed: hit?.installed ?? '',
      applied: qty,
      registered: hit?.qty ?? null,
      kind: kind || hit?.kind || '',
      fast: hit?.fast ?? false,
      doneAt,
      operators: hit ? operatorText(hit.operators) : '',
    });
  }

  const leftovers = [...[...keyed.entries()].filter(([k]) => !used.has(k)).map(([, g]) => g), ...loose];
  for (const group of leftovers) {
    rows.push({
      status: '등록만',
      year: group.year,
      no: group.no,
      installed: group.installed,
      applied: null,
      registered: group.qty,
      kind: group.kind,
      fast: group.fast,
      doneAt: '',
      operators: operatorText(group.operators),
    });
  }

  rows.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  const afterRange = rows.filter(
    (r) => r.status === '등록만' && r.no !== '' && Number(r.year) > lastListedYear
  );

  return {
    rows,
    applied: subsidy?.q ?? 0,
    slow: charger?.s ?? 0,
    fast: charger?.f ?? 0,
    registeredSubsidized: charger?.g ?? 0,
    appliedOnly: rows
      .filter((r) => r.status === '명부만')
      .reduce((sum, r) => sum + (r.applied ?? 0), 0),
    afterRangeQty: afterRange.reduce((sum, r) => sum + (r.registered ?? 0), 0),
    afterRangeYears: [...new Set(afterRange.map((r) => r.year))].sort(),
  };
}

/* ------------------------------------------------------------------ 판정 */

export interface Verdict {
  text: string;
  tone: 'warn' | 'ok';
}

/**
 * 두 자료를 맞대 본 결과를 한 문장으로.
 * 「대수가 맞는가」보다 「어긋난 쪽이 무엇인가」를 먼저 말합니다.
 */
export function readVerdict(m: MergedSummary): Verdict {
  const registered = m.slow + m.fast;

  if (m.applied === 0 && registered === 0) {
    return {
      text: '두 자료 모두 기록이 없습니다. 신규 현장으로 보이나, 원본의 주소 표기가 다를 수 있으니 현장명으로도 확인해주세요.',
      tone: 'ok',
    };
  }
  if (m.applied === 0) {
    if (m.afterRangeQty === 0) {
      return {
        text: '보조금 이력 없이 등록된 충전기만 있습니다. 자부담 설치분으로 보입니다.',
        tone: 'ok',
      };
    }
    const rest = Math.max(0, registered - m.afterRangeQty);
    return {
      text:
        `보조금 명부에는 없고 ${m.afterRangeYears.join('·')}년 신청번호로 등록된 ${m.afterRangeQty}기가 있습니다. ` +
        '명부에 아직 실리지 않은 최근 보조사업 설치분입니다.' +
        (rest > 0 ? ` 그 밖에 보조금 표기가 없는 등록분 ${rest}기가 있습니다.` : ''),
      tone: 'warn',
    };
  }
  if (registered === 0) {
    return {
      text: `보조금 신청 ${m.applied}기가 명부에 있으나 현재 등록된 충전기가 없습니다. 철거되었거나 등록이 누락된 것일 수 있으니 현장을 확인하세요.`,
      tone: 'warn',
    };
  }

  const parts: string[] = [];
  if (m.appliedOnly > 0) parts.push(`명부에만 있는 ${m.appliedOnly}기(등록 미확인)`);
  if (m.afterRangeQty > 0) {
    parts.push(`명부 범위 밖 ${m.afterRangeYears.join('·')}년 신청분 ${m.afterRangeQty}기`);
  }
  const ownFunded = Math.max(0, m.slow + m.fast - m.registeredSubsidized);
  if (ownFunded > 0) parts.push(`보조금 표기가 없는 등록분 ${ownFunded}기`);

  if (parts.length === 0) {
    return {
      text: `보조금 신청 ${m.applied}기가 모두 등록과 이어집니다. 철거 · 교체 없이 보조사업 설치분만 있는 것으로 보입니다.`,
      tone: 'warn',
    };
  }
  return {
    text: `보조금 신청 ${m.applied}기 중 대부분이 등록과 이어지지만, ${parts.join(' · ')}가 남습니다. 아래 표의 「대조」 열을 확인하세요.`,
    tone: 'warn',
  };
}

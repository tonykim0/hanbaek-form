/**
 * 현장 목록의 필터 축.
 *
 * ★한 곳에 모으는 이유★
 * 필터를 거는 자리가 둘이다 — 위쪽 필터 막대와 표의 열 머리글. 두 곳이 각자 상태를 쥐면
 * 「표에서 운영사를 걸고 보드로 넘어갔더니 풀려 있다」가 된다. 축과 값 뽑는 규칙을 여기 두고
 * 두 화면이 같은 상태를 쓴다.
 *
 * 값이 없는 현장(운영사 미지정 등)도 걸러야 한다 — 「수전방식이 안 적힌 현장만 보기」가
 * 실제로 필요한 질문이다. 그래서 빈 값에도 이름을 준다(EMPTY).
 */
import type { ProjectSummary } from '@/types/project';
import { subsidized } from '@/types/project';
import { boardColumnOf } from './board';

/** 값이 비어 있는 현장을 고르는 이름. 실제 값과 겹치지 않게 괄호를 쓴다. */
export const EMPTY = '(없음)';

export type AttrKey =
  | 'col' | 'cpo' | 'term' | 'biz' | 'bldg' | 'power' | 'sales' | 'gc' | 'queue' | 'pre';

export interface Attr {
  key: AttrKey;
  label: string;
  /**
   * 이 현장이 갖는 값들. 여러 개일 수 있다 —
   * 계약연수는 라인마다 다를 수 있어서 「7년 3대 + 10년 4대」 현장은 7년·10년 양쪽에 걸린다.
   */
  valuesOf: (p: ProjectSummary) => string[];
}

const one = (v: string | null | undefined): string[] => [v?.trim() ? v : EMPTY];

export const ATTRS: Attr[] = [
  { key: 'col', label: '단계', valuesOf: (p) => [boardColumnOf(p)] },
  { key: 'cpo', label: '운영사', valuesOf: (p) => [p.cpo] },
  {
    key: 'term',
    label: '계약연수',
    valuesOf: (p) =>
      p.lines.length === 0 ? [EMPTY] : [...new Set(p.lines.map((l) => `${l.termYears}년`))],
  },
  { key: 'biz', label: '사업유형', valuesOf: (p) => one(p.bizType) },
  { key: 'bldg', label: '건축물', valuesOf: (p) => one(p.bldgType) },
  { key: 'power', label: '수전방식', valuesOf: (p) => one(p.powerType) },
  { key: 'sales', label: '영업사', valuesOf: (p) => one(p.salesOrg) },
  { key: 'gc', label: '시공사', valuesOf: (p) => one(p.gcOrg) },
  {
    key: 'queue',
    label: '환경부 대기번호',
    /*
     * 번호 자체로 거를 일은 없다 — 「받았나 아직인가」가 실제 질문이다.
     *
     * 자체투자는 「없음」이 아니라 「해당없음」이다. 환경부 보조금을 받지 않으니 받을 번호가
     * 없다 — 둘을 같은 값으로 두면 「번호 아직 안 온 현장」을 걸러 볼 때 자체투자가 섞여
     * 들어오고, 그 목록으로는 독촉할 곳을 알 수 없다.
     */
    valuesOf: (p) =>
      !subsidized(p.bizType) ? ['해당없음'] : [p.envQueueNo?.trim() ? '있음' : '없음'],
  },
  {
    key: 'pre',
    label: '기설치 조사',
    /*
     * 환경부 사업은 현장마다 기설치를 조사해야 한다 — 「조사 필요」만 걸러 보는 것이 그 업무다.
     * 조사 전과 「조사해서 없음」을 같은 값으로 두면 그 목록을 만들 수 없다.
     *
     * 자체투자는 「조사 필요」가 아니라 「해당없음」이다. 보조금을 안 받으니 조사할 이유가
     * 없는데, 둘을 같은 값으로 두면 조사할 곳 목록에 자체투자가 섞여 들어온다.
     */
    valuesOf: (p) =>
      !subsidized(p.bizType)
        ? ['해당없음']
        : [p.preInstall ? `기설치 ${p.preInstall}` : '조사 필요'],
  },
];

export const ATTR_BY_KEY = new Map(ATTRS.map((a) => [a.key, a]));

/**
 * 필터 판에 펴 두는 축 — 둘이다(한백 지시 2026-08-26). 적은 순서대로 나온다.
 *
 * ★ATTRS 를 줄이지 않는다.★ 표의 열 머리글에서도 같은 축을 거는데(ProjectTable),
 * 거기서 걸 수 있는 것은 열이 있는 만큼이다 — 축을 지우면 그쪽에서도 사라진다.
 * 판은 「자주 묻는 것」만 편다: 어떤 사업이고, 누구 운영사인가.
 *
 * 영업사·시공사도 폈다가 뺐다 — 판이 길어지는 만큼 자주 묻지는 않는다.
 * 나머지 축(단계·계약연수·건축물·수전방식·영업사·시공사·대기번호·기설치)은 열 머리글에
 * 남는다. 거기서 걸어 둔 것은 판에도 나온다 — 걸려 있는데 보이지 않는 조건을 두지
 * 않는다(푸는 자리가 없으면 왜 이것만 나오는지 알 수 없다).
 */
export const PANEL_ATTR_KEYS: AttrKey[] = ['biz', 'cpo'];

/** 판에 그릴 축 — 정해 둔 넷 + 지금 걸려 있는 나머지 */
export function panelAttrKeys(filters: AttrFilters): AttrKey[] {
  const extra = ATTRS
    .map((a) => a.key)
    .filter((k) => !PANEL_ATTR_KEYS.includes(k) && (filters[k]?.length ?? 0) > 0);
  return [...PANEL_ATTR_KEYS, ...extra];
}

/** 축별로 고른 값. 빈 배열이면 그 축은 안 걸린 것이다. */
export type AttrFilters = Partial<Record<AttrKey, string[]>>;

/** 이 자료에 실제로 있는 값만 고를 수 있게 한다 — 없는 값을 고르는 자리를 두지 않는다 */
export function optionsOf(projects: ProjectSummary[], key: AttrKey): string[] {
  const attr = ATTR_BY_KEY.get(key);
  if (!attr) return [];
  const seen = new Set<string>();
  for (const p of projects) for (const v of attr.valuesOf(p)) seen.add(v);

  const list = [...seen];
  // 「(없음)」은 늘 끝으로 — 값 목록 사이에 섞이면 눈에 걸린다
  return list.sort((a, b) => {
    if (a === EMPTY) return 1;
    if (b === EMPTY) return -1;
    return a.localeCompare(b, 'ko', { numeric: true });
  });
}

/** 걸린 축을 모두 통과하는가. 축끼리는 AND, 한 축 안의 값끼리는 OR 다. */
export function passesAttrs(p: ProjectSummary, filters: AttrFilters): boolean {
  for (const attr of ATTRS) {
    const picked = filters[attr.key];
    if (!picked?.length) continue;
    const mine = attr.valuesOf(p);
    if (!mine.some((v) => picked.includes(v))) return false;
  }
  return true;
}

export const countActive = (filters: AttrFilters): number =>
  ATTRS.reduce((n, a) => n + (filters[a.key]?.length ?? 0), 0);

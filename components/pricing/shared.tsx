'use client';

/**
 * 단가 화면이 나눠 쓰는 것 — 축 이름표 · 프리필 · 단가 셈 · 「고칠 수 있는가」.
 *
 * 화면 넷(매트릭스 · 그리드 · 케이스 목록 · 폼)이 같은 값을 봐야 해서 여기 둔다.
 */
import {
  createContext,
} from 'react';
import {
  type BuildingType, type Channel, type CpoName, type PricingRule, type ReplType, type PromoExtendOption, type PromoStep, type SettlementRule, type SettlementStepRule,
} from '@/types/project';

import {
  startKey,
} from '@/lib/pricing-match';

export const POWER_TYPES = ['한전불입', '모자분리'] as const;

/**
 * 건축물 축 두 칸이 실제로 무엇을 뜻하는가 — 운영사마다 다르다.
 *
 * ★「공동 / 공동 외」로 줄여 적던 것을 걷어냈다 (한백 지적 2026-08-23).★
 * 줄이면 두 칸이 같은 말을 두 번 하는 것처럼 보이고, 무엇보다 운영사마다 경계가 다른 것을
 * 감춘다 — 플러그링크는 주거용 오피스텔이 공동주택 쪽에 들고(정책 배포본 260629),
 * 나이스는 「공동주택 외(주거형 오피스텔 · 지식산업센터 등)」로 반대쪽에 든다.
 * 같은 「공동 외」 라벨 아래 정반대의 것이 들어 있었다.
 *
 * DB 의 저장값은 그대로 '공동주택' · '상업시설' 이다 — 여기서 바꾸는 것은 이름표뿐이다.
 * 축을 운영사마다 쪼개면 케이스 판정(matchingRules)까지 갈라져야 하고, 경계가 갈리는 것은
 * 「어느 건물이 어느 쪽인가」일 뿐 축의 개수는 둘 그대로다.
 * 무엇이 드는지 자세한 것은 아래 설치조건 행이 말한다.
 */
const BLDG_LABEL: Partial<Record<CpoName, Record<BuildingType, string>>> = {
  플러그링크: { 공동주택: '공동주택 · 주거용 오피스텔', 상업시설: '그 외' },
};
const BLDG_LABEL_DEFAULT: Record<BuildingType, string> = {
  공동주택: '공동주택',
  상업시설: '공동주택 외',
};
export const bldgAxisLabel = (cpo: CpoName, b: BuildingType) =>
  BLDG_LABEL[cpo]?.[b] ?? BLDG_LABEL_DEFAULT[b];

export const TERMS = [5, 7, 10] as const;

/** 폼으로 넘기는 값 — 채워진 것만 프리필된다. 그리드 칸·막힌 라인은 축만, 수정은 전부 싣는다 */
export interface Prefill {
  cpo?: CpoName;
  replType?: ReplType;
  powerType?: (typeof POWER_TYPES)[number];
  terms?: number[];
  bldgs?: BuildingType[];
  channel?: Channel;
  bizYear?: number;
  startDate?: string;
  salesUnit?: number;
  consUnit?: number;
  margin?: number;
  steps?: SettlementStepRule[];
  supplyItems?: string;
  promo?: PromoStep[] | null;
  promoExtend?: PromoExtendOption[] | null;
  chargeRate?: number | null;
  installTerms?: string;
  otherSupport?: string;
  coexistTerms?: string;
  miscTerms?: string;
  note?: string;
  /**
   * 개정일 때 원 케이스의 startKey — 새 시작이 이보다 늦어야 저장된다.
   * 이르거나 같으면 매트릭스가 옛 케이스를 최신으로 집어 개정이 안 보이는 상태가 된다.
   */
}

/** 케이스 → 프리필 — 수정이 이 값을 들고 폼을 연다. 옛 저장값 '시공만' 은 '시공' 으로 읽는다 */
export function prefillOf(r: PricingRule, settle: SettlementRule | null): Prefill {
  return {
    cpo: r.cpo, replType: r.replType, powerType: r.powerType,
    terms: r.termYears, bldgs: r.bldgTypes,
    channel: (r.channel as string) === '시공만' ? '시공' : r.channel,
    bizYear: r.bizYear,
    /*
     * ★적용 시작을 안 실으면 수정 폼이 그 값을 잃는다★ (2026-08-29) — 폼은 프리필에
     * 시작이 없으면 오늘 기준(올해·이번 반기)으로 연다. 참조 없는 케이스를 자리에서
     * 고치려고 열었을 뿐인데 적용 시작이 조용히 오늘 반기로 바뀌어 저장됐다.
     * 개정은 이 값을 그대로 쓰지 않는다 — 다음 반기를 기본으로 연다(폼이 판단한다).
     */
    startDate: r.startDate,
    salesUnit: r.salesUnit, consUnit: r.consUnit, margin: r.margin,
    steps: settle?.steps,
    supplyItems: r.supplyItems ?? undefined,
    promo: r.promo,
    promoExtend: r.promoExtend,
    chargeRate: r.chargeRate,
    installTerms: r.installTerms ?? undefined,
    otherSupport: r.otherSupport ?? undefined,
    coexistTerms: r.coexistTerms ?? undefined,
    miscTerms: r.miscTerms ?? undefined,
    note: r.note ?? undefined,
  };
}

/** 받는 단가 — 운영사가 대당 주는 총액(기성으로 받는다) = 영업비 + 시공비 + 마진 */
export const receiveUnitOf = (r: PricingRule) => r.salesUnit + r.consUnit + r.margin;
/** 지급 단가 — 마진을 뗀 뒤 협력사에 내려주는 총액 = 영업비 + 시공비 */
export const payoutUnitOf = (r: PricingRule) => r.salesUnit + r.consUnit;

/** 폼이 열리는 방식 — editId 가 있으면 그 케이스를 자리에서 고치고, 없으면 새 케이스다 */
export interface FormOpen {
  prefill: Prefill;
  editId?: string;
}

/**
 * 고칠 수 있는가 — 열람 전용이면 false 다.
 *
 * 프롭으로 내리지 않고 컨텍스트로 두는 이유: 이 화면의 「고치는 자리」는 네 겹 안쪽까지
 * 흩어져 있다(머리말의 새 케이스 · 막힌 라인의 만들기 · 그리드 칸 · 케이스 줄의 수정·개정·중지).
 * 여섯 자리에 같은 값을 나르려고 중간 부품 셋의 프롭을 늘리면, 다음에 단추를 하나 더
 * 넣는 사람이 그 사슬을 다시 잇거나 빠뜨린다.
 *
 * 판정의 정본은 서버다 — /api/pricing 은 adminWrite 라 열람 전용이면 403 이다.
 * 여기서 하는 일은 못 하는 것을 눌리지 않게 두는 것뿐이다(화면 규칙 3번).
 */
export const CanEdit = createContext(true);


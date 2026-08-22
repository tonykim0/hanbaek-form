/**
 * 플러그링크·현대엔지니어링 26년 하반기 정책 — 케이스 정의 한 벌. [한백 전용]
 *
 * 원문 둘: 플러그링크 「26년 영업 수수료 및 정책 (하반기) v1.1」(2026-07-28 기준,
 * 7/1 접수분부터) · 현대엔지니어링 「'26년 HEC 영업 정책(변경)」(2026-07-21, rev4).
 * `scripts/print-plhec-h2-sql.ts` 가 이 파일을 읽어 마이그레이션 SQL 을 만든다.
 *
 * ── 플러그링크 — 「영업 수수료」 + 시공비 100만 = 받는 단가 ──────────────────
 * 신정책 표의 금액은 「영업 수수료」 하나뿐이다(시공비 표가 없다 — 시공은 EPC 로 따로
 * 받는 구조). 옛 배포본(2026-06-29)은 영업비 20 + 공사비(모자분리 220/240)로 적었고
 * 그 합(240/260만)이 기존 하반기 케이스의 받는 단가와 정확히 일치한다. 신정책의
 * 영업 수수료(140/160만)도 기존 케이스의 영업비+마진(120+20/140+20)과 일치한다 —
 * 즉 「받는 단가 = 정책 영업 수수료 + 시공비 100만」이고 분해(마진 20 · 시공 100 고정,
 * 나머지 영업)는 나이스와 같은 프레임이 그대로 맞는다.
 *
 *   보조 신규 모자분리   7년 140 → 240 · 10년 160 → 260   (기존 케이스와 동일 — 유지)
 *   보조 신규 한전불입   7년  60 → 160 · 10년  80 → 180   (기존 200/220 과 다름 — 개정)
 *   보조 신규 상업 10년  140 → 240                        (신설)
 *   자투 제자리 교체     7년 160 → 260 · 10년 180 → 280   (신설)
 *   자투 신규·이전 설치  7년 105 → 205 · 10년 125 → 225   (신설 — 「신규 설치」와
 *     「다른 위치 설치 후 기존 철거」가 같은 값이라 신규위치 케이스 하나로 담는다)
 *
 * ★기성 선급이 20만 → 30만으로 바뀌었다★ — 「한국환경공단 승인 후 익월 말일 30만원,
 * 서비스 개시 후 익월 말일 잔금」. 기존 pl-2step(승인 20만 → 잔액)을 쓰던 하반기
 * 케이스의 기본 규칙을 승인 30만 → 잔액으로 갈아 끼운다(이미 지정된 현장은 프로젝트의
 * 규칙이 정본이라 소급되지 않는다). 자체투자의 선급 30만은 「플러그링크 승인 시」인데
 * 트리거 목록에 그 자리가 없어 착공으로 둔다 — 실제 조건은 기타 칸에 적는다.
 *
 * ★넣지 않은 것★ (한백 확인 2026-08-23 — 기타 칸에 문장으로만 남긴다)
 *   · 보조 「교체 설치」(노후 8년 제자리, 100/120/90만) — 시스템이 「교체=자체투자」
 *     전제라 환경부+제자리교체 조합이 없다. 현장이 실제로 오면 축을 늘린다.
 *   · 「아파트 자체 운영 충전기 연동」(55/75만) — 보조도 자투도 아닌 제3의 사업구분.
 *   · 자투 상업시설(신규·이전 10만 — 시공 100만 프레임으로는 영업비가 음수라 분해 불능,
 *     제자리 60만 포함 전부) · 자투 한전불입(신규·이전 35만/제자리 100만 — 분해 미확정).
 *
 * ── 현대엔지니어링 — rev4 는 이미 반영돼 있다 ───────────────────────────────
 * 기존 하반기 케이스 4건(2026-07-21, 공동 250만 = 승인 100 → 준공 150 · 상업 250만)이
 * rev4 의 [보조금] 턴키와 정확히 일치한다 — 금액·기성은 안 건드리고 조건 칸만 채운다.
 * 신설은 [자부담] 턴키 180만(선급 70 계약서류 접수 시 → 준공금 110 시운전 완료 시):
 * 정책이 교체·신규위치를 가르지 않아 두 교체유형에 같은 값으로 넣고, 건축물유형도
 * 가르지 않아 공동·상업 겸용으로 둔다. 분해는 같은 프레임(영업 60 + 시공 100 + 마진 20).
 * 선급 70만의 실제 트리거(계약서류 접수)도 목록에 없어 착공으로 두고 기타에 적는다.
 */
import type { NewPricingRule, PromoStep, SettlementStepRule } from '@/types/project';

const MARGIN = 200_000;
const PAYOUT_CONS = 1_000_000;

/* ── 플러그링크 ─────────────────────────────────────────────────────────── */

export const PL_START = '2026년 7월 1일';

const PL_PROMO: Record<number, PromoStep[]> = {
  7: [{ months: 6, rate: 149 }],
  10: [{ months: 6, rate: 149 }, { months: 6, rate: 249 }],
};

/* 공시 요금 292원/kWh — 옛 문서의 294.3원에서 내려왔다. 프로모션이 끝난 뒤의 정상 요금 */
const PL_CHARGE = 292;

const PL_INSTALL_SUB =
  '주차면 5% 이내(기존 철거·운영 수량 포함) · 상업시설은 2%만(본사 협의 시 5% 이내)'
  + ' · 교체는 제조일 8년 경과 노후기 제자리만';
const PL_INSTALL_INV = '주차면 5% 이내(기존 운영 수량 포함) · 상업시설은 2%만(본사 협의 시 5% 이내)';
const PL_COEXIST =
  '기존 플러그링크 충전기만: 사전 협의 후 일부 혼용 주차면 가능'
  + ' · 타사 혼합: 신규 설치 주차면 최소 2% 전용 구역 도색 필수';
const PL_SUPPORT =
  '한전불입 가공·지중 모두 지원 · 안전관리선임 지원 · 주차면 기본 「EV 전기자동차」 문구 도색 무상';

/* 차감·미등록 사업은 기타 한 칸에 모은다 — 금액 계산에 안 들어가고 영업이 알아야 하는 조건들 */
const PL_MISC_SUB = [
  '· 영업 수량 120기 미만은 1기당 10만원 차감(121기부터 120기분 소급 지급)',
  '· 모자분리 지상 설치 1기당 35만원 차감 · 제자리 교체 지상 10만원 차감',
  '· 10기 이상이면 감리비용을 영업 수수료에서 차감',
  '· 보조금 취소 시 자체투자 전환 불가 — 영업 수수료 전액 차감 + 추가 지불(신규·교체 35만 · 한전불입 7년 180만/10년 200만)',
  '· 프로모션 연장은 영업비 차감 — 7년 최대 12개월(6개월당 1기 10만) · 10년 최대 24개월(6개월 10만·12개월 20만)',
  '· 주차면 도색 요청 13만/면 차감 · 페인트 라인 5만/면 차감 · 안내표시판 개당 8,000원 차감',
  '· 노후기 보조 교체(영업수수료 100/120/90만)·아파트 연동 사업(55/75만)은 케이스 미등록 — 현장 생기면 등록',
].join('\n');
const PL_MISC_INV = [
  '· 프로모션 기본 없음 — 영업비 차감으로 가능(7년 최대 12개월: 6개월 10만/12개월 20만 · 10년 최대 24개월: 12개월 20만/24개월 40만)',
  '· 영업 수량 120기 미만은 1기당 10만원 차감(121기부터 소급) · 모자분리 지상 35만 차감 · 제자리 교체 지상 10만 차감',
  '· 기존 충전기 철거 완료 후 비용 지급 · 선급 30만의 실제 트리거는 플러그링크 승인 시(시스템은 착공으로 둠)',
  '· 상업시설 자투(신규·이전 10만/제자리 60만)·자투 한전불입(신규·이전 35만/제자리 100만)은 분해 미확정 — 케이스 미등록',
].join('\n');

/* 기성 — 보조는 환경공단 승인 30만 → 잔액, 자투는 (승인 자리가 없어) 착공 30만 → 잔액 */
export const PL_STEPS_SUB: SettlementStepRule[] = [
  { trigger: '환경부 승인', basis: { kind: '고정', unit: 300_000 } },
  { trigger: '준공마감', basis: { kind: '잔액' } },
];
export const PL_STEPS_INV: SettlementStepRule[] = [
  { trigger: '착공', basis: { kind: '고정', unit: 300_000 } },
  { trigger: '준공마감', basis: { kind: '잔액' } },
];

interface PlRow {
  replType: NewPricingRule['replType'];
  powerType: NewPricingRule['powerType'];
  term: number;
  bldg: '공동주택' | '상업시설';
  /**
   * 정책 표의 영업 수수료(원) — 받는 단가는 여기에 시공비 100만을 더한 값이고,
   * ★마진 20만은 이 안에서 나온다★ (영업비 = fee − 마진). 기존 케이스 검산:
   * fee 140만 = 영업비 120만 + 마진 20만. fee 를 통째로 영업비에 넣으면 총액이
   * 20만 커진다 — 실제로 그렇게 들어갔다가 잡았다(2026-08-23).
   */
  fee: number;
}

const PL_ROWS: PlRow[] = [
  // 보조 — 한전불입 신규(기존 200/220만 케이스를 대체) · 상업 모자분리 신설
  { replType: '환경부 신규', powerType: '한전불입', term: 7, bldg: '공동주택', fee: 600_000 },
  { replType: '환경부 신규', powerType: '한전불입', term: 10, bldg: '공동주택', fee: 800_000 },
  { replType: '환경부 신규', powerType: '모자분리', term: 10, bldg: '상업시설', fee: 1_400_000 },
  // 자투 — 제자리 교체 · 신규위치(신규 설치와 「다른 위치 설치 후 철거」가 같은 값)
  { replType: '자체투자 (제자리교체)', powerType: '모자분리', term: 7, bldg: '공동주택', fee: 1_600_000 },
  { replType: '자체투자 (제자리교체)', powerType: '모자분리', term: 10, bldg: '공동주택', fee: 1_800_000 },
  { replType: '자체투자 (신규위치)', powerType: '모자분리', term: 7, bldg: '공동주택', fee: 1_050_000 },
  { replType: '자체투자 (신규위치)', powerType: '모자분리', term: 10, bldg: '공동주택', fee: 1_250_000 },
];

function plRule(row: PlRow): NewPricingRule {
  const sub = row.replType === '환경부 신규';
  return {
    caseName: `플러그링크 (${PL_START}) | ${row.bldg} | ${row.term}년 ${row.replType} | ${row.powerType}`,
    cpo: '플러그링크',
    bizType: sub ? '환경부' : '자체투자',
    powerType: row.powerType,
    termYears: [row.term],
    bldgTypes: [row.bldg],
    replType: row.replType,
    channel: '턴키',
    bizYear: 2026,
    startDate: PL_START,
    salesUnit: row.fee - MARGIN,
    consUnit: PAYOUT_CONS,
    margin: MARGIN,
    supervisionBearer: '영업비 차감(10기 이상)',
    safetyFeeBearer: null,
    supplyItems: null,
    promo: sub ? PL_PROMO[row.term] ?? null : [],
    promoExtendDeduct: null,
    chargeRate: PL_CHARGE,
    installTerms: sub ? PL_INSTALL_SUB : PL_INSTALL_INV,
    otherSupport: PL_SUPPORT,
    coexistTerms: PL_COEXIST,
    miscTerms: sub ? PL_MISC_SUB : PL_MISC_INV,
    note: null,
    settlementSteps: sub ? PL_STEPS_SUB : PL_STEPS_INV,
  };
}

export function plNewRules(): NewPricingRule[] {
  return PL_ROWS.map(plRule);
}

/** 기존 하반기 모자분리 2건에 채울 조건 — 금액은 신정책과 같아 안 건드린다 */
export const PL_KEEP_IDS = ['pl-h2-y7-mother-new-apt', 'pl-h2-y10-mother-new-apt'] as const;
export function plKeepPolicy(termYears: number) {
  return {
    promo: PL_PROMO[termYears] ?? null,
    chargeRate: PL_CHARGE,
    installTerms: PL_INSTALL_SUB,
    coexistTerms: PL_COEXIST,
    otherSupport: PL_SUPPORT,
    miscTerms: PL_MISC_SUB,
  };
}

/** 신정책과 금액이 다른 옛 한전불입 하반기 케이스 — 참조가 없으면 지운다(개정 대체) */
export const PL_DROP_IDS = ['pl-h2-y7-kepco-new-apt', 'pl-h2-y10-kepco-new-apt'] as const;

/* ── 현대엔지니어링 ─────────────────────────────────────────────────────── */

export const HEC_START = '2026년 7월 21일';

const HEC_CHARGE = 292;
const HEC_PROMO: PromoStep[] = [{ months: 6, rate: 150 }];
const HEC_SUPPLY =
  '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등';
const HEC_INSTALL =
  '주차면 5% 이하(주용도 무관) · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토)'
  + ' · 착공 지시 후 90일 내 준공(패널티)';
const HEC_COEXIST =
  '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차 · 안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)';
const HEC_SUPPORT =
  '한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비(준공 시 정산) · 전기안전관리자 선임'
  + ' · 완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)';
const HEC_MISC_COMMON = [
  '· 감리배치비 미제공',
  '· 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션(27년 신차 5%·재구매 7.5%) 4분기 예정',
  '· 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)',
].join('\n');
const HEC_MISC_INV = [
  HEC_MISC_COMMON,
  '· 선급 70만의 실제 트리거는 계약서류 접수 시, 준공금 110만은 시운전 완료 시(시스템은 착공·준공마감으로 둠)',
].join('\n');

export const HEC_STEPS_INV: SettlementStepRule[] = [
  { trigger: '착공', basis: { kind: '고정', unit: 700_000 } },
  { trigger: '준공마감', basis: { kind: '잔액' } },
];

/** 기존 하반기 4건(rev4 와 이미 일치)에 채울 조건 */
export const HEC_KEEP_IDS = [
  'hec-h2-y7_10-mother-new-apt', 'hec-h2-y7_10-kepco-new-apt',
  'hec-h2-y7_10-mother-new-com', 'hec-h2-y7_10-kepco-new-com',
] as const;
export const HEC_KEEP_POLICY = {
  promo: HEC_PROMO,
  chargeRate: HEC_CHARGE,
  supplyItems: HEC_SUPPLY,
  installTerms: HEC_INSTALL,
  coexistTerms: HEC_COEXIST,
  otherSupport: HEC_SUPPORT,
  miscTerms: HEC_MISC_COMMON,
};

export function hecNewRules(): NewPricingRule[] {
  return (['자체투자 (제자리교체)', '자체투자 (신규위치)'] as const).map((replType) => ({
    caseName: `현대엔지니어링 (${HEC_START}) | 전체 | 7·10년 ${replType} | 모자분리`,
    cpo: '현대엔지니어링',
    bizType: '자체투자',
    powerType: '모자분리',
    termYears: [7, 10],
    // rev4 가 건축물유형을 가르지 않는다 — 겸용으로 두고, 갈리면 그때 개정한다
    bldgTypes: ['공동주택', '상업시설'],
    replType,
    channel: '턴키',
    bizYear: 2026,
    startDate: HEC_START,
    salesUnit: 600_000,
    consUnit: PAYOUT_CONS,
    margin: MARGIN,
    supervisionBearer: '영업자 부담(감리배치비 미제공)',
    safetyFeeBearer: null,
    supplyItems: HEC_SUPPLY,
    promo: HEC_PROMO,
    promoExtendDeduct: null,
    chargeRate: HEC_CHARGE,
    installTerms: HEC_INSTALL,
    coexistTerms: HEC_COEXIST,
    otherSupport: HEC_SUPPORT,
    miscTerms: HEC_MISC_INV,
    note: null,
    settlementSteps: HEC_STEPS_INV,
  }));
}

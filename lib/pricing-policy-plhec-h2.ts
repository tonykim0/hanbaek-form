/**
 * 플러그링크·현대엔지니어링 26년 하반기 정책 — 케이스 정의 한 벌. [한백 전용]
 *
 * 원문 둘 (한백 확정 2026-08-23 — 이 두 파일만 본다):
 *   · 플러그링크 「2026년 플러그링크 영업정책」 배포본 260629
 *   · 현대엔지니어링 「'26년 HEC 영업 정책(변경)」 rev4 (2026-07-21)
 *
 * ★정정 기록★ 처음에 「260729-26년 영업 수수료 및 정책(하반기) v1.1」(Nice Tech 작성)을
 * 플러그링크 최신으로 보고 반영했다가 되돌렸다 — 그 문서는 한백에 적용되는 정책이 아니다
 * (한백 확인 2026-08-23). v1.1 기준으로 넣었던 것(한전불입 160/180 · 자투 260/280 ·
 * 자투 신규위치 205/225 · 기성 선급 30만)은 마이그레이션 0007 이 걷어내고 되돌린다.
 * `scripts/print-plhec-h2-sql.ts` 가 이 파일을 읽어 그 SQL 을 만든다.
 *
 * ── 플러그링크 (배포본 260629) — 영업비 20 + 공사비 = 받는 단가 ──────────────
 *   보조 신규 모자분리   공동 7년 20+220=240 · 10년 20+240=260   (기존 케이스와 동일 — 유지)
 *   보조 신규 한전불입   공동 7년 20+180=200 · 10년 20+200=220   (기존 케이스와 동일 — 복원)
 *   보조 신규 모자분리   상업 10년 20+220=240                    (유지 — v1.1 때 넣은 값과 우연히 같다)
 *   자체투자 교체        공동 7년 20+200=220 · 10년 20+220=240 · 상업 10년 20+100=120 (신설)
 * 분해는 같은 프레임(마진 20 · 시공 100 고정, 나머지 영업). 자투 상업 120만은 영업비가
 * 0 이 된다 — 문서가 명시한 금액이라 그대로 둔다.
 *
 * ★기성은 pl-2step(환경부 승인 20만 → 준공마감 잔액) 그대로다★ — 문서의 대금 조항
 * (영업비 20만 계약 승인 후 · 공사비 선금 50% 보조금 선금 수령 익월 「비율 미확정」 ·
 * 잔금 50% 준공 승인 후)은 비율이 미확정이라 단계로 못 박지 않고, 노션 실측으로 굳은
 * 기존 규칙을 유지한다. 문서 문구는 기타 칸에 남긴다. 자체투자는 대금 조항이 보조금
 * 흐름뿐이라 ★기성 미정★으로 둔다 — 없는 근거로 단계를 지어내지 않는다.
 *
 * 프로모션(계약기간 기준): 7년 149원 180일 · 10년 149원 180일 + 249원 180일.
 * 자체투자는 문서에 프로모션 언급이 없어 미지정으로 둔다.
 * 충전요금은 292원으로 확정됐다(한백 2026-08-23) — 배포본의 기본요금 294.3원을
 * 기타 칸에 적어 뒀던 것은 걷어냈다. 프로모션 연장 차감도 같이 확정됐다(PL_PROMO_EXTEND).
 *
 * ── 현대엔지니어링 (rev4) — 처음부터 이 문서 기준이라 그대로다 ────────────────
 * 기존 하반기 4건(250만 = 승인 100 → 준공 150)이 rev4 와 일치 — 조건만 채웠고(0005),
 * [자부담] 턴키 180만(선급 70 계약서류 접수 시 → 준공금 110 시운전 완료 시) 2건을
 * 신설했다(교체·신규위치 × 공동·상업 겸용, 영업 60 + 시공 100 + 마진 20).
 * 선급 70만의 실제 트리거(계약서류 접수)는 목록에 없어 착공으로 두고 기타에 적었다.
 */
import type { NewPricingRule, PromoExtendOption, PromoStep, SettlementStepRule } from '@/types/project';

const MARGIN = 200_000;
const PAYOUT_CONS = 1_000_000;

/* ── 플러그링크 (배포본 260629) ────────────────────────────────────────── */

/** 기존 하반기 케이스들과 같은 표기 — 새 케이스도 여기 맞춘다 */
export const PL_START = '2026년 하반기';

const PL_PROMO: Record<number, PromoStep[]> = {
  7: [{ months: 6, rate: 149 }],
  10: [{ months: 6, rate: 149 }, { months: 6, rate: 249 }],
};

const PL_INSTALL =
  '총 주차면의 5%까지 지원 · 충전기 최소 2% 전용 구역 도색 필수 · 1개 단지 최대 130대(7년)/120대(10년)'
  + ' · 상업시설은 주차면 2%만(7년 계약·한전불입 불가 — 대상지: 공영주차장·관공서·주민센터·지식산업센터·4성 이상 호텔/리조트·사옥·골프장·병원)';

/*
 * 기타 — 네 항목을 걷어냈다(한백 요청 2026-08-23).
 *   · 기본요금 294.3원 — 요금이 292원으로 확정돼 충전요금 칸으로 갔다. 기타에 적어 둔 것은
 *     정수 칸에 294.3 을 못 담아서였는데, 그 이유가 사라졌다.
 *   · 대금 조항(영업비·공사비 선금·잔금 / 자투의 「기성 미정」 설명) — 기성 관련 조항이다.
 *   · 등록된 외주모집대행사 직원만 영업 가능 · 현금성 리베이트 금지
 *   · 지원 초과분·보조금 신청 후 취소 건 — 취소 수수료
 * 남긴 것은 케이스를 고를 때 판단이 갈리는 조건들이다.
 */
const PL_MISC_SUB = [
  '· 프로모션 연장은 영업비 차감으로 가능 — 7년 최대 1년 · 10년 최대 2년',
  '· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)',
  '· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)',
].join('\n');
const PL_MISC_INV = '· 프로모션은 문서에 명시 없음';

/**
 * 프로모션 연장 — 늘리는 요금마다 영업비 차감액이 다르다 (한백 확정 2026-08-23).
 *
 * 두 가지를 7년·10년에 똑같이 둔다. 문서가 연장을 계약기간별로 가르는 것은 최대 기간뿐이고
 * (7년 1년 · 10년 2년, 기타 칸에 있다) 차감 단가는 요금으로만 갈린다.
 */
const PL_PROMO_EXTEND: PromoExtendOption[] = [
  { months: 6, rate: 149, deduct: 200_000 },
  { months: 6, rate: 249, deduct: 100_000 },
];

/** 260629 를 반영한 조건 — 유지 케이스(update)와 신설 케이스(insert)가 같이 쓴다 */
export function plPolicy(sub: boolean, termYears: number | null) {
  return {
    promo: sub && termYears !== null ? PL_PROMO[termYears] ?? null : null,
    // 연장은 프로모션이 있는 케이스만 — 자체투자는 문서에 프로모션 언급이 없어 미지정이다
    promoExtend: sub && termYears !== null ? PL_PROMO_EXTEND : null,
    chargeRate: 292, // 최종 확정 (한백 2026-08-23) — 자체투자까지 같다
    supplyItems: null as string | null,
    installTerms: PL_INSTALL,
    coexistTerms: null as string | null,
    otherSupport: null as string | null,
    miscTerms: sub ? PL_MISC_SUB : PL_MISC_INV,
  };
}

/** 기존 유지 — 조건만 갱신하고 기성은 pl-2step 으로 되돌린다 */
export const PL_KEEP: { id: string; term: number }[] = [
  { id: 'pl-h2-y7-mother-new-apt', term: 7 },
  { id: 'pl-h2-y10-mother-new-apt', term: 10 },
  // 상업 10년(240만) — v1.1 때 넣었지만 260629 의 상업 보조 신규 10년과 금액이 같아 남긴다
  { id: 'pl-y10-mother-new-biz-2026', term: 10 },
];

/** v1.1 기준으로 넣었던 것 — 걷어낸다 (참조 가드) */
export const PL_DROP_IDS = [
  'pl-y7-kepco-new-apt-2026', 'pl-y10-kepco-new-apt-2026',
  'pl-y7-mother-inplace-apt-2026', 'pl-y10-mother-inplace-apt-2026',
  'pl-y7-mother-move-apt-2026', 'pl-y10-mother-move-apt-2026',
] as const;

/** v1.1 때 지웠던 한전불입 하반기 — 시드 원본 값으로 복원한다 (총액이 260629 와 일치한다) */
export const PL_RESTORE: (NewPricingRule & { id: string })[] = [
  {
    id: 'pl-h2-y7-kepco-new-apt',
    caseName: '플러그링크 (하반기) | 공동주택 | 7년 신규 | 한전불입',
    cpo: '플러그링크', bizType: '환경부', powerType: '한전불입',
    termYears: [7], bldgTypes: ['공동주택'], replType: '환경부 신규', channel: '턴키',
    bizYear: 2026, startDate: PL_START,
    salesUnit: 900_000, consUnit: 900_000, margin: 200_000,
    supervisionBearer: '영업비 차감', safetyFeeBearer: '한백 부담',
    note: null,
    ...plPolicy(true, 7),
    settlementSteps: [],
  },
  {
    id: 'pl-h2-y10-kepco-new-apt',
    caseName: '플러그링크 (하반기) | 공동주택 | 10년 신규 | 한전불입',
    cpo: '플러그링크', bizType: '환경부', powerType: '한전불입',
    termYears: [10], bldgTypes: ['공동주택'], replType: '환경부 신규', channel: '턴키',
    bizYear: 2026, startDate: PL_START,
    salesUnit: 1_000_000, consUnit: 1_000_000, margin: 200_000,
    supervisionBearer: '영업비 차감', safetyFeeBearer: '한백 부담',
    note: null,
    ...plPolicy(true, 10),
    settlementSteps: [],
  },
];

/** 신설 — 자체투자 교체 (260629 ①·② 표의 「자체투자 교체」 열) */
const PL_INV_ROWS: { term: number; bldg: '공동주택' | '상업시설'; total: number }[] = [
  { term: 7, bldg: '공동주택', total: 2_200_000 },
  { term: 10, bldg: '공동주택', total: 2_400_000 },
  { term: 10, bldg: '상업시설', total: 1_200_000 },
];

export function plNewRules(): NewPricingRule[] {
  return PL_INV_ROWS.map((row) => ({
    caseName: `플러그링크 (${PL_START}) | ${row.bldg} | ${row.term}년 자체투자 (제자리교체) | 모자분리`,
    cpo: '플러그링크',
    bizType: '자체투자',
    powerType: '모자분리',
    termYears: [row.term],
    bldgTypes: [row.bldg],
    // 문서는 그냥 「교체」다 — 위치를 옮기는 조항이 따로 없어 제자리교체로 담는다
    replType: '자체투자 (제자리교체)',
    channel: '턴키',
    bizYear: 2026,
    startDate: PL_START,
    salesUnit: row.total - PAYOUT_CONS - MARGIN,
    consUnit: PAYOUT_CONS,
    margin: MARGIN,
    supervisionBearer: null,
    safetyFeeBearer: null,
    note: null,
    ...plPolicy(false, null),
    settlementSteps: [],
  }));
}

/* ── 현대엔지니어링 (rev4, 2026-07-21) — 0005 에서 반영, 여기는 기록만 ────── */

export const HEC_START = '2026년 7월 21일';

const HEC_CHARGE = 292;
const HEC_PROMO: PromoStep[] = [{ months: 6, rate: 150 }];
const HEC_SUPPLY =
  '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등';
const HEC_INSTALL =
  '주차면 5% 이하 · 주용도 무관 — 상업시설·기타 부지(병원·골프장 등) 포함(한백 확인 2026-08-23)'
  + ' · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토)'
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
    promoExtend: null,
    chargeRate: HEC_CHARGE,
    installTerms: HEC_INSTALL,
    coexistTerms: HEC_COEXIST,
    otherSupport: HEC_SUPPORT,
    miscTerms: HEC_MISC_INV,
    note: null,
    settlementSteps: HEC_STEPS_INV,
  }));
}

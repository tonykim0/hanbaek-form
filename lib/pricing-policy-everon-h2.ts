/**
 * 에버온 26년 영업 정책 2차 — 케이스 정의 한 벌. [한백 전용]
 *
 * 원문: 「26년 에버온 영업 정책 _ 2차 (26년 7월 30일까지)」 — 3차가 아직 없어 이것이
 * 최신이다(한백이 2026-08-23 이미지로 전달). `scripts/print-everon-h2-sql.ts` 가 읽는다.
 *
 * ── 기존 케이스와의 대조 ─────────────────────────────────────────────────
 * (환경부 투자) 수수료 5년 220 · 7년 230 · 10년 240만, 한전인입지역 7년 230 · 10년 240만
 * — 기존 케이스(영업 100~120 + 시공 100 + 마진 20)와 정확히 일치하고, 기성(환경부 승인
 * 40% → 준공 60%)도 정산 조항(승인·기성 수령 후 7일 이내 40% / 준공기성 후 60%)과 같다.
 * 그래서 금액·기성은 안 건드리고 조건 칸만 채운다.
 *
 * ★한전불입 5년은 지우지 않고 되살린다★ (2026-08-24 정정) — 0006 은 「한전인입지역 행의
 * 5년 칸이 비었으니 케이스가 없다」로 읽고 지웠다. 그때는 참조가 없어 지워졌지만, 노션
 * 이관으로 경남 양산 대우마리나(5년·한전불입·환경부, 계약서수령일 2026-06-17)가 들어와
 * 단가 미지정으로 남았다. 다시 읽으면 빈칸은 「케이스 없음」이 아니다:
 *   ① 한전인입지역 행의 7·10년 금액(230/240만)이 일반 환경부 행과 **같다** — 인입지역은
 *      금액 가산이 아니라 조건(할인요금·회선 지원)이 갈리는 축이다. 그래서 5년 칸을 비운
 *      것은 「5년은 일반 환경부 5년(220만)과 같다」로 읽힌다.
 *   ② 그 빈칸은 「한전불입금 지원 : 7년 5회선 / 10년 10회선」과 짝이 맞는다 — 회선 지원과
 *      220원 할인이 7·10년뿐이어서 인입지역 행에 5년이 따로 적힐 이유가 없다.
 *   ③ 노션 정본 매트릭스도 5년을 「에버온 | 공동주택 | 5년 | 신규 | 모자분리/한전불입」
 *      한 칸(턴키 220만 = 영업 100 + 시공 100 + 마진 20)으로 운영했다. 지운 옛 케이스
 *      everon-y5-kepco-new-apt 의 금액이 그것과 정확히 같다.
 * 그래서 옛 id 그대로 되살린다(새 id 로 넣으면 시드와 두 칸이 된다). 할인요금은 5년 행의
 * 149원 6개월 — 220원 6개월은 7·10년 인입지역에만 붙는다.
 *
 * ── 신설 — 에버온투자(자체투자) ──────────────────────────────────────────
 * 제자리 교체(7kW→7kW) 140/150/160만 · 이전 설치(기존 철거 유보 + 신규 설치)
 * 170/180/190만 (5/7/10년). 분해는 같은 프레임(시공 100 · 마진 20 고정, 나머지 영업).
 *
 * ★3kW→7kW 제자리 교체(170/180/190만)는 넣지 않는다★ — 축이 7kW→7kW 와 같아서
 * (자체투자 제자리교체 · 모자분리 · 같은 연수) 두 케이스가 한 칸을 두고 충돌한다.
 * 기기 kW 는 축에 없다. 값이 같은 이전 설치 케이스가 있고, 실제로 갈리는 현장이 오면
 * 그때 축(또는 부기)으로 가른다 — 기타 칸에 금액을 남겨 둔다.
 *
 * ★자투 기성은 미정으로 둔다★ — 정책서의 정산 조항이 환경부 기준(승인·기성 40%/준공
 * 60%)뿐이고 자투 정산은 어디에도 없다. 없는 근거로 단계를 지어내지 않는다 —
 * 기성 미정은 시스템이 허용하는 상태고, 화면에 「기성 미정」으로 뜬다.
 *
 * 프로모션 — 모자분리 5·7년 6개월 149원, 10년 6개월 149 + 6개월 220원(총 12개월).
 * ★한전불입(한전인입지역)은 할인이 다르다★ — 7/10년 220원 6개월(혼용은 모자분리 적용).
 */
import type { NewPricingRule, PromoStep } from '@/types/project';

const MARGIN = 200_000;
const PAYOUT_CONS = 1_000_000;

export const EV_START = '2026년 7월 1일';

const EV_CHARGE = 296; // 정상요금 296원/kWh — 알뜰충전 276원은 기타에

const EV_PROMO_MOTHER: Record<number, PromoStep[]> = {
  5: [{ months: 6, rate: 149 }],
  7: [{ months: 6, rate: 149 }],
  10: [{ months: 6, rate: 149 }, { months: 6, rate: 220 }],
};
const EV_PROMO_KEPCO: PromoStep[] = [{ months: 6, rate: 220 }];

const EV_SUPPLY = '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링';
const EV_INSTALL =
  '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지'
  + ' · 추가 공사비 영업자 부담(전면도색 포함)';
const EV_SUPPORT_SUB =
  '한전불입금 지원 — 7년 5회선 이내 · 10년 10회선 이내 · 한전인입지역 할인 220원 6개월(혼용은 모자분리 적용)';
const EV_MISC_SUB = [
  '· 알뜰충전 요금 276원/kWh',
  '· 모든 계약서류는 환경부 지원 기준 서류로 접수 — 공단지침 의거 변경 가능한 수주건은 공단 지원 신청으로 변경 예정(수수료도 공단 기준 자동 변경)',
  '· 정산: 환경부 승인·기성 수령 후 7일 이내 40% · 준공기성 수령 후 7일 이내 60%',
].join('\n');
const EV_MISC_INV = [
  '· 타CPO 의 교체·이전은 최소 5년 경과 & 계약 종료(건설사 설치분 제외) — 교체는 가능 · 이전 설치의 철거는 공단 지침 전까지 불허(철거 유보 + 신규 설치)',
  '· 3kW→7kW 제자리 교체는 170/180/190만(5/7/10년) — 이 케이스(7kW→7kW)와 축이 같아 미등록, 현장 갈리면 등록',
  '· 전체 500기 이상 달성 시 에버온 투자분 도색 지원(26-07-30 기준)',
  '· 자체투자 정산 방식은 정책서에 없음 — 기성 미정(확인되면 채운다). 보조사업 정산과 별개다',
].join('\n');

/** 기존 보조 케이스에 채울 조건 — 금액·기성(env-40-60)은 신정책과 같아 안 건드린다 */
export const EV_KEEP: { id: string; promo: PromoStep[] }[] = [
  { id: 'everon-y5-mother-new-apt', promo: EV_PROMO_MOTHER[5] },
  { id: 'everon-y5-kepco-new-apt', promo: EV_PROMO_MOTHER[5] }, // 되살린 칸 — 5년은 149원
  { id: 'everon-y7-mother-new-apt', promo: EV_PROMO_MOTHER[7] },
  { id: 'everon-y10-mother-new-apt', promo: EV_PROMO_MOTHER[10] },
  { id: 'everon-y7-kepco-new-apt', promo: EV_PROMO_KEPCO },
  { id: 'everon-y10-kepco-new-apt', promo: EV_PROMO_KEPCO },
];
export const EV_KEEP_POLICY = {
  chargeRate: EV_CHARGE,
  supplyItems: EV_SUPPLY,
  installTerms: EV_INSTALL,
  otherSupport: EV_SUPPORT_SUB,
  miscTerms: EV_MISC_SUB,
};

/**
 * 0006 이 지운 한전불입 5년 — 옛 id 로 되살린다(머리말 ①②③). 금액·기성은 시드의
 * 그 케이스와 같은 값이고, 노션 정본 매트릭스의 220만 한 칸과도 같다.
 */
type EvRevive = Pick<
  NewPricingRule,
  'caseName' | 'cpo' | 'bizType' | 'powerType' | 'termYears' | 'bldgTypes' | 'replType'
  | 'channel' | 'bizYear' | 'startDate' | 'salesUnit' | 'consUnit' | 'margin'
> & { id: string; settlementRuleId: string };

export const EV_REVIVE: EvRevive = {
  id: 'everon-y5-kepco-new-apt',
  caseName: '에버온 | 공동주택 | 5년 | 신규 | 모자분리/한전불입',
  cpo: '에버온',
  bizType: '환경부',
  powerType: '한전불입',
  termYears: [5],
  bldgTypes: ['공동주택'],
  replType: '환경부 신규',
  channel: '턴키',
  bizYear: 2026,
  startDate: '2026년 7월 1일',
  salesUnit: 1_000_000,
  consUnit: PAYOUT_CONS,
  margin: MARGIN,
  settlementRuleId: 'env-40-60',
};

interface EvRow {
  replType: NewPricingRule['replType'];
  term: number;
  /** 받는 단가(정책 표의 수수료 총액, 원) */
  total: number;
}

const EV_ROWS: EvRow[] = [
  // 제자리 교체 (7kW→7kW)
  { replType: '자체투자 (제자리교체)', term: 5, total: 1_400_000 },
  { replType: '자체투자 (제자리교체)', term: 7, total: 1_500_000 },
  { replType: '자체투자 (제자리교체)', term: 10, total: 1_600_000 },
  // 이전 설치 — 기존 철거(유보) + 신규 설치
  { replType: '자체투자 (신규위치)', term: 5, total: 1_700_000 },
  { replType: '자체투자 (신규위치)', term: 7, total: 1_800_000 },
  { replType: '자체투자 (신규위치)', term: 10, total: 1_900_000 },
];

export function evNewRules(): NewPricingRule[] {
  return EV_ROWS.map((row) => ({
    caseName: `에버온 (${EV_START}) | 공동주택 | ${row.term}년 ${row.replType} | 모자분리`,
    cpo: '에버온',
    bizType: '자체투자',
    powerType: '모자분리',
    termYears: [row.term],
    bldgTypes: ['공동주택'],
    replType: row.replType,
    channel: '턴키',
    bizYear: 2026,
    startDate: EV_START,
    salesUnit: row.total - PAYOUT_CONS - MARGIN,
    consUnit: PAYOUT_CONS,
    margin: MARGIN,
    supervisionBearer: null,
    safetyFeeBearer: null,
    supplyItems: EV_SUPPLY,
    // 자투 프로모션은 정책서에 없다 — 모자분리 표의 할인은 요금제(전 사업 공통)로 읽어 같이 적는다
    promo: EV_PROMO_MOTHER[row.term],
    promoExtend: null,
    chargeRate: EV_CHARGE,
    installTerms: EV_INSTALL,
    otherSupport: null,
    coexistTerms: null,
    miscTerms: EV_MISC_INV,
    note: null,
    // 기성 미정 — 자투 정산이 정책서에 없다. 지어내지 않는다
    settlementSteps: [],
  }));
}

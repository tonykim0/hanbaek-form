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
 * ★기성 — 문서의 대금 조항을 그대로 담는다 (한백 지시 2026-09-04)★
 *   문서: 영업비 20만 계약 승인 후 익월 말일 · 공사비 선금 50% 보조금 선금 수령 익월
 *         말일(비율 미확정) · 공사비 잔금 50% 준공 승인 후 익월 말일.
 *   보조금 5케이스 = 3단계(plSubSteps). 콘솔 트리거가 환경부 승인·착공·준공마감 셋뿐이라
 *   없는 시점 둘을 가진 칸에 얹는다: 「계약 승인」→환경부 승인 · 「보조금 선금 수령」→착공
 *   (0005 의 「선급의 실제 트리거는 PL 승인, 시스템은 착공으로 둠」과 같은 방식).
 *   ★자체투자·연동 5케이스 = 2단계 — 20만 먼저, 나머지는 준공 이후★ (한백 지시. 연동도
 *   자투에 포함된다). 자투에는 환경부 승인이 없어 첫 차수를 착공에 물린다 — 그 칸은
 *   시공사가 실착공일을 넣으면 스스로 열리고, 환경부 승인 칸은 자투 현장에서 빈 채로 남는다.
 *   비율 50% 는 문서가 확정하지 않은 값이다 — 정해지면 새 마이그레이션으로 고친다.
 *   ★그전까지는 「미정이라 단계를 지어내지 않는다」였다★ — 그동안 자투 현장은 정산 규칙이
 *   없어 지급조건 확정 자체가 막혀 있었다(율량동 현대아파트, 2026-09-04 에 드러났다).
 *
 * 프로모션(계약기간 기준): 7년 149원 180일 · 10년 149원 180일 + 249원 180일.
 * 자체투자는 문서에 프로모션 언급이 없어 미지정으로 둔다.
 * 충전요금은 292원으로 확정됐다(한백 2026-08-23) — 배포본의 기본요금 294.3원을
 * 기타 칸에 적어 뒀던 것은 걷어냈다. 프로모션 연장 차감도 같이 확정됐다(PL_PROMO_EXTEND).
 *
 * ── 현대엔지니어링 (rev4) — 처음부터 이 문서 기준이라 그대로다 ────────────────
 * 기존 하반기 4건(250만 = 승인 100 → 준공 150)이 rev4 와 일치 — 조건만 채웠고(0005),
 * [자부담] 턴키 180만(선급 70 계약서류 접수 시 → 준공금 110 시운전 완료 시) 2건을
 * 신설했다(공동·상업 겸용, 영업 50 + 시공 110 + 마진 20 — HEC 는 시공 110만이다).
 * 선급 70만의 실제 트리거(계약서류 접수)는 목록에 없어 착공으로 두고 기타에 적었다.
 */
import type { NewPricingRule, PromoExtendOption, PromoStep, SettlementStepRule } from '@/types/project';
import { replLabel } from '@/types/project';

const MARGIN = 200_000;
/*
 * ★기본공사비 — 운영사마다 다르고 반기마다 오른다 (한백 2026-08-29).★
 * 정책이 정하는 값이 아니라 우리가 정하는 값이다: 받는 단가에서 마진과 이것을 빼면
 * 나머지가 영업비다. 한동안 「하반기는 100만」을 프레임처럼 썼는데 그것은 근거 없는
 * 자릿수였다 — 플러그링크는 ★상반기 90만 → 하반기 95만★ 이고, 현대엔지니어링은
 * 110만이다(HEC_PAYOUT_CONS). 상반기 케이스(2026년 1월 20일)는 90만 그대로 둔다.
 */
const PL_PAYOUT_CONS = 950_000;

/**
 * 하반기 대금 조항 → 기성 단계 (한백 지시 2026-09-04). 위 머리 주석이 근거다.
 *
 * 보조금 3단계: 20만(계약 승인) → 공사비 선금 50% → 잔금. 「나머지」의 기준은
 * ★받는 단가 − 20만★ 이고, 마지막을 잔액으로 두면 합이 언제나 턴키와 맞는다
 * (lib/settlement.ts checkSettlementSteps 가 그것을 검사한다).
 * 반올림하지 않는다 — 원 단위가 갈리면 어느 차수에서 깎였는지 화면에 안 보인다.
 */
export function plSubSteps(turnkey: number): SettlementStepRule[] {
  const half = (turnkey - 200_000) / 2;
  if (!Number.isInteger(half)) {
    throw new Error(`턴키 ${turnkey} 는 20만을 뺀 나머지가 반으로 안 갈립니다 — 비율을 다시 정해야 합니다.`);
  }
  return [
    { trigger: '환경부 승인', basis: { kind: '고정', unit: 200_000 } },
    { trigger: '착공', basis: { kind: '고정', unit: half } },
    { trigger: '준공마감', basis: { kind: '잔액' } },
  ];
}

/**
 * 자체투자·연동 2단계 — 20만 먼저, 나머지는 준공 이후 (한백 지시 2026-09-04).
 * 턴키와 무관하게 한 벌이다: 뒤가 잔액이라 금액이 달라도 같은 규칙을 같이 쓴다.
 */
export const PL_INV_STEPS: SettlementStepRule[] = [
  { trigger: '착공', basis: { kind: '고정', unit: 200_000 } },
  { trigger: '준공마감', basis: { kind: '잔액' } },
];

/* ── 플러그링크 (배포본 260629) ────────────────────────────────────────── */

/**
 * 적용 시작 — ★계약일자 7월 1일 이후부터다 (한백 2026-08-29).★
 *
 * 「2026년 하반기」로 두었더니 케이스 이름이 세 꼴로 갈렸다(「(하반기)」·「(2026년 하반기)」·
 * 「(2026년 7월 1일)」). 시기가 말이면 어느 계약에 어느 케이스가 맞는지 사람이 해석해야
 * 한다 — 계약일과 견줄 수 있는 날짜여야 한다. 현대엔지니어링(7월 21일)과 같은 꼴이다.
 */
export const PL_START = '2026년 7월 1일';

const PL_PROMO: Record<number, PromoStep[]> = {
  7: [{ months: 6, rate: 149 }],
  10: [{ months: 6, rate: 149 }, { months: 6, rate: 249 }],
};

/**
 * 설치조건 — ★건축물유형마다 다른 조건이다 (한백 2026-08-29).★
 *
 * 그전에는 한 덩어리였다: 공동주택 조건을 적고 그 끝에 「· 상업시설은 주차면 2%만…」을
 * 곁말로 달아 여덟 케이스 전부에 같이 붙였다. 그래서 ★상업시설 케이스를 열면 「5%까지
 * 지원」과 「1개 단지 최대 130대」가 먼저 보이고★ 정작 자기 조건은 뒤에 딸려 있었다 —
 * 상업시설 조건이 제 자리에 선 적이 없다. 공동주택 케이스에도 상관없는 상업시설 문구가
 * 붙어 있었다. 축마다 자기 조건만 갖는다.
 *
 * 7년·한전불입이 상업시설에 없는 것은 조건이 아니라 ★그 케이스가 아예 없는 이유★다
 * (한백 확인 2026-08-29). 조건 칸에 적어 두면 「이 케이스에 그런 제약이 있다」로 읽힌다 —
 * 여기서는 무엇이 되는지만 적는다.
 */
/*
 * 불릿마다 줄을 바꾼다 (한백 2026-08-29) — 「· 」로 이어 붙이면 한 문단이 되어 조건이
 * 몇 개인지 세어지지 않는다. 화면은 줄바꿈을 그대로 그린다(whitespace-pre-line).
 * 목록 안(대상지)은 쉼표다 — 그것은 조건이 아니라 한 조건의 나열이라 줄을 바꾸면 안 된다.
 */
const PL_INSTALL_APT = [
  '· 총 주차면의 5%까지 지원',
  '· 충전기 최소 2% 전용 구역 도색 필수',
  '· 1개 단지 최대 130대(7년) / 120대(10년)',
].join('\n');

const PL_INSTALL_BIZ = [
  '· 총 주차면의 2%까지 지원',
  '· 10년 모자분리만 (7년 계약·한전불입 불가)',
  '· 대상지: 공영주차장, 관공서, 주민센터, 지식산업센터, 4성 이상 호텔/리조트, 사옥, 골프장, 병원',
].join('\n');

/** 그 케이스의 건축물유형이 정한다 — 겸용(둘 다) 케이스는 플러그링크에 없다 */
function plInstall(bldgTypes: readonly string[]): string {
  return bldgTypes.includes('상업시설') ? PL_INSTALL_BIZ : PL_INSTALL_APT;
}

/*
 * 기타 — 네 항목을 걷어냈다(한백 요청 2026-08-23).
 *   · 기본요금 294.3원 — 요금이 292원으로 확정돼 충전요금 칸으로 갔다. 기타에 적어 둔 것은
 *     정수 칸에 294.3 을 못 담아서였는데, 그 이유가 사라졌다.
 *   · 대금 조항(영업비·공사비 선금·잔금 / 자투의 「기성 미정」 설명) — 기성 관련 조항이다.
 *   · 등록된 외주모집대행사 직원만 영업 가능 · 현금성 리베이트 금지
 *   · 지원 초과분·보조금 신청 후 취소 건 — 취소 수수료
 * 남긴 것은 케이스를 고를 때 판단이 갈리는 조건들이다.
 */
/*
 * 「· 프로모션 연장은 영업비 차감으로 가능 — 7년 최대 1년 · 10년 최대 2년」을 뺐다
 * (한백 2026-08-29). 앞 반쪽은 연장 차감 행의 이름이 되었고(「프로모션 연장 (영업비 차감)」),
 * 뒤 반쪽(연수별 상한)은 그 행이 값으로 적는다 — 기타는 어디에도 안 맞는 조건이 오는 자리다.
 */
const PL_MISC_SUB = [
  '· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)',
  '· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)',
].join('\n');
/* 「프로모션은 문서에 명시 없음」을 걷었다 — 프로모션 행이 이미 「미지정」으로 그 말을 한다 */
const PL_MISC_INV: string | null = null;

/**
 * 프로모션 연장 — 늘리는 요금마다 영업비 차감액이 다르다 (한백 확정 2026-08-23).
 *
 * 두 가지를 7년·10년에 똑같이 둔다. 문서가 연장을 계약기간별로 가르는 것은 최대 기간뿐이고
 * (7년 1년 · 10년 2년) 차감 단가는 요금으로만 갈린다.
 *
 * ★그 상한을 옵션에 실어 나른다 (한백 2026-08-29).★ 기타 칸에 문장으로 적혀 있어서
 * 연장 행을 보는 사람은 그 말을 못 봤다 — 이제 그 행이 자기 상한을 적는다.
 * 케이스의 계약연수가 정하므로 케이스마다 다르다(cap).
 */
const PL_EXTEND_CAP: Record<number, string> = { 7: '최대 1년', 10: '최대 2년' };

function plPromoExtend(termYears: number): PromoExtendOption[] {
  const cap = PL_EXTEND_CAP[termYears];
  return [
    { months: 6, rate: 149, deduct: 200_000, cap },
    { months: 6, rate: 249, deduct: 100_000, cap },
  ];
}

/**
 * 260629 를 반영한 조건 — 유지 케이스(update)와 신설 케이스(insert)가 같이 쓴다.
 * 설치조건은 건축물유형이 가르므로 그 축을 받는다.
 */
export function plPolicy(
  sub: boolean,
  termYears: number | null,
  bldgTypes: readonly string[] = ['공동주택']
) {
  return {
    promo: sub && termYears !== null ? PL_PROMO[termYears] ?? null : null,
    // 연장은 프로모션이 있는 케이스만 — 자체투자는 문서에 프로모션 언급이 없어 미지정이다
    promoExtend: sub && termYears !== null ? plPromoExtend(termYears) : null,
    chargeRate: 292, // 최종 확정 (한백 2026-08-23) — 자체투자까지 같다
    // 문서에 지급자재 조항이 없다 = 대주는 것이 없다(한백 2026-08-29) — 「미지정」이 아니다
    supplyItems: '없음' as string | null,
    installTerms: plInstall(bldgTypes),
    coexistTerms: null as string | null,
    otherSupport: null as string | null,
    miscTerms: sub ? PL_MISC_SUB : PL_MISC_INV,
  };
}

/** 기존 유지 — 조건만 갱신하고 기성은 pl-2step 으로 되돌린다 */
export const PL_KEEP: { id: string; term: number; bldgs: string[]; turnkey: number }[] = [
  { id: 'pl-h2-y7-mother-new-apt', term: 7, bldgs: ['공동주택'], turnkey: 2_400_000 },
  { id: 'pl-h2-y10-mother-new-apt', term: 10, bldgs: ['공동주택'], turnkey: 2_600_000 },
  // 상업 10년(240만) — v1.1 때 넣었지만 260629 의 상업 보조 신규 10년과 금액이 같아 남긴다
  { id: 'pl-y10-mother-new-biz-2026', term: 10, bldgs: ['상업시설'], turnkey: 2_400_000 },
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
    // 총액 200만 = 영업 85 + 시공 95 + 마진 20
    salesUnit: 2_000_000 - PL_PAYOUT_CONS - MARGIN, consUnit: PL_PAYOUT_CONS, margin: MARGIN,
    supervisionBearer: '영업비 차감', safetyFeeBearer: '한백 부담',
    note: null,
    ...plPolicy(true, 7),
    settlementSteps: plSubSteps(2_000_000),
  },
  {
    id: 'pl-h2-y10-kepco-new-apt',
    caseName: '플러그링크 (하반기) | 공동주택 | 10년 신규 | 한전불입',
    cpo: '플러그링크', bizType: '환경부', powerType: '한전불입',
    termYears: [10], bldgTypes: ['공동주택'], replType: '환경부 신규', channel: '턴키',
    bizYear: 2026, startDate: PL_START,
    // 총액 220만 = 영업 105 + 시공 95 + 마진 20
    salesUnit: 2_200_000 - PL_PAYOUT_CONS - MARGIN, consUnit: PL_PAYOUT_CONS, margin: MARGIN,
    supervisionBearer: '영업비 차감', safetyFeeBearer: '한백 부담',
    note: null,
    ...plPolicy(true, 10),
    settlementSteps: plSubSteps(2_200_000),
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
    caseName: `플러그링크 (${PL_START}) | ${row.bldg} | ${row.term}년 자체투자 | 모자분리`,
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
    salesUnit: row.total - PL_PAYOUT_CONS - MARGIN,
    consUnit: PL_PAYOUT_CONS,
    margin: MARGIN,
    supervisionBearer: null,
    safetyFeeBearer: null,
    note: null,
    ...plPolicy(false, null, [row.bldg]),
    settlementSteps: PL_INV_STEPS,
  }));
}

/* ── 현대엔지니어링 (rev4, 2026-07-21) — 0005 에서 반영, 여기는 기록만 ────── */

/** 적용 시작 — ★계약서 날짜 기준★ 7월 21일부터 (한백 2026-08-29). 플러그링크(7월 1일)와 같은 꼴 */
export const HEC_START = '2026년 7월 21일';

const HEC_CHARGE = 292;
const HEC_PROMO: PromoStep[] = [{ months: 6, rate: 150 }];
/* 지급자재 — 대주는 것만 적는다 (한백 2026-08-29). 안 대주는 것 목록은 걷었다 */
const HEC_SUPPLY = '스탠드 + 캐노피';

/*
 * 설치조건 — 불릿마다 줄을 바꾼다 (한백 2026-08-29). 「· 」로 이어 붙이면 한 문단이 되어
 * 조건이 몇 개인지 세어지지 않는다. 「상업시설·기타 부지 포함」은 한백 확인 2026-08-23.
 */
/*
 * 설치조건 — 세 줄 (한백 2026-08-29).
 * 걷어낸 것: 「착공 지시 후 90일 내 준공 (패널티)」 · 「모자분리만 (한전불입 불가)」.
 * 자체투자에 한전불입 케이스가 없는 것은 사실이지만 조건 칸에 적을 말이 아니다 — 그 케이스가
 * 없는 이유이고, 없는 케이스는 매트릭스의 빈 칸이 말한다.
 *
 * ★현대엔지니어링은 연동 사업을 하지 않는다 (한백 2026-08-29).★ 그래서 연동 케이스가 없다 —
 * 쓰지 않는 가지를 두면 다음 사람이 「연동도 되는구나」로 읽고 케이스를 만든다.
 * 플러그링크는 연동을 한다(7년 55만·10년 75만).
 */
const HEC_INSTALL = [
  '· 주차면 5% 이하',
  '· 주용도 무관 — 상업시설·기타 부지(병원·골프장 등) 포함',
  '· 계약기간 7년 이상 (한전불입 지중인입 10년만 가능)',
].join('\n');

/**
 * ★현대엔지니어링의 분해는 시공 110만이다★ (한백 2026-08-29) — 기본공사비 110만 · 마진 20만,
 * 나머지가 영업비. 다른 운영사(시공 100만)와 다르다. 상반기 케이스(230만 = 100+110+20)와
 * 하반기 환경부 공동주택(250만 = 120+110+20)은 처음부터 이 분해였는데, 이 파일이 자체투자를
 * 넣을 때 공통 상수(100만)를 그대로 써서 60+100+20 으로 어긋났다 — 시공사에게 10만 덜
 * 가는 분해다. 하반기 환경부 상업시설 2건도 마진이 40만으로 들어가 있었다(0041 이 바로잡는다).
 */
const HEC_PAYOUT_CONS = 1_100_000;

/* 「안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)」을 걷었다 (한백 2026-08-29) */
const HEC_COEXIST = '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차';

/*
 * 기타지원 — 이 한 줄로 줄였다 (한백 2026-08-29).
 * 걷어낸 것: 한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비
 * (준공 시 정산) · 전기안전관리자 선임.
 */
const HEC_SUPPORT = '완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)';

/*
 * ★기타를 비웠다 (한백 2026-08-29).★ 걷어낸 것:
 *   · 감리배치비 미제공 — 감리 칸(supervisionBearer)이 이미 「영업자 부담(감리배치비 미제공)」이다
 *   · 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션 4분기 예정
 *     — 연장은 「해당사항 없음」으로 못 박았다(HEC_PROMO_EXTEND)
 *   · 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)
 *   · (자투) 선급 70만의 실제 트리거는 계약서류 접수 시, 준공금 110만은 시운전 완료 시
 *     — 시스템이 착공·준공마감으로 두는 이유는 이 파일 머리말에 있다
 */
const HEC_MISC_COMMON: string | null = null;
const HEC_MISC_INV: string | null = null;

/*
 * 프로모션 연장 — ★해당사항 없음★ (한백 2026-08-29). 빈 배열은 「없음」이고 null 은
 * 「아직 안 적음」이다(화면 규칙 10) — 문서에 연장이 없다는 것은 앞엣말이다.
 */
const HEC_PROMO_EXTEND: PromoExtendOption[] = [];

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
  promoExtend: HEC_PROMO_EXTEND,
  chargeRate: HEC_CHARGE,
  supplyItems: HEC_SUPPLY,
  installTerms: HEC_INSTALL,
  coexistTerms: HEC_COEXIST,
  otherSupport: HEC_SUPPORT,
  miscTerms: HEC_MISC_COMMON,
};

/**
 * 걷어낸 케이스 — 현대엔지니어링 자체투자 「신규위치」 (2026-08-26).
 *
 * ★왜★ 아래 hecNewRules 가 **같은 케이스를 replType 만 바꿔 두 벌** 만들고 있었다.
 * 금액·조건이 한 글자도 다르지 않았다. 그런데 케이스가 둘이면 접수 화면의 자체투자
 * 대수 표가 두 행으로 펴져 한 현장이 두 라인으로 갈린다(한백 2026-08-26).
 * 플러그링크·나이스와 같이 제자리교체 한 칸에 담는다.
 */
export const HEC_DROP_IDS = ['hec-y7-10-mother-move-both-2026'] as const;

export function hecNewRules(): NewPricingRule[] {
  // 교체유형으로 갈리지 않는다 — 한 벌만 만든다(위 HEC_DROP_IDS)
  return (['자체투자 (제자리교체)'] as const).map((replType) => ({
    caseName: `현대엔지니어링 (${HEC_START}) | 전체 | 7·10년 ${replLabel('현대엔지니어링', replType)} | 모자분리`,
    cpo: '현대엔지니어링',
    bizType: '자체투자',
    powerType: '모자분리',
    termYears: [7, 10],
    bldgTypes: ['공동주택', '상업시설'],
    replType,
    channel: '턴키',
    bizYear: 2026,
    startDate: HEC_START,
    // 180만 = 영업 50 + 시공 110 + 마진 20 — HEC 분해(HEC_PAYOUT_CONS)
    salesUnit: 1_800_000 - HEC_PAYOUT_CONS - MARGIN,
    consUnit: HEC_PAYOUT_CONS,
    margin: MARGIN,
    supervisionBearer: '영업자 부담(감리배치비 미제공)',
    safetyFeeBearer: null,
    supplyItems: HEC_SUPPLY,
    promo: HEC_PROMO,
    promoExtend: HEC_PROMO_EXTEND,
    chargeRate: HEC_CHARGE,
    installTerms: HEC_INSTALL,
    coexistTerms: HEC_COEXIST,
    otherSupport: HEC_SUPPORT,
    miscTerms: HEC_MISC_INV,
    note: null,
    settlementSteps: HEC_STEPS_INV,
  }));
}

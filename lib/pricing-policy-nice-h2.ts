/**
 * 나이스인프라 26년 하반기 정책 — 케이스 정의 한 벌. [한백 전용]
 *
 * 2026-08-05 배포본(2026-08-01 접수건부터 적용)을 단가 케이스로 옮긴 것이다.
 * 개발·프로덕션 모두 2026-08-22 에 반영됐다(프로덕션은 임시 관리자 라우트로 한 번 넣고
 * 그 라우트를 걷어냈다). `scripts/apply-nice-h2-pricing.ts` 가 이 파일을 본다.
 *
 * ★반영이 끝났는데 왜 남기는가★ 이 파일이 「그 7건이 무슨 근거로 그 숫자인가」의 기록이다.
 * 케이스는 참조되면 불변이라, 나중에 금액을 의심할 때 되짚을 곳이 DB 행밖에 없으면
 * 정책 원본과 대조할 방법이 없다. 정책이 또 바뀌면 이 파일을 고치지 말고 새로 만든다 —
 * 여기 적힌 것은 26년 하반기에 실제로 들어간 값이어야 한다.
 *
 * ── 정책 표를 케이스로 옮긴 근거 ──────────────────────────────────────────
 * 원문은 「수수료(분리)」(보조사업)와 「수수료(턴키)」(투자사업) 두 표다. 단위는 천원이고
 * 열은 영업(모집대행사)·공사로 나뉘어 있다. 우리가 받는 단가는 그 둘의 합이다 —
 * 표의 「10년」 행(100)은 단독 금액이 아니라 10년 계약에 붙는 가산이다.
 *
 *   보조사업(환경부 신규)   영업 200 + 공사 2,400            = 2,600  (7년 모자분리)
 *                          영업 200 + 공사 2,400 + 100      = 2,700  (10년 모자분리)
 *                          영업 200 + 공사 2,200            = 2,400  (10년 한전불입)
 *   투자사업(자체투자)      공사 2,000                        = 2,000  (7년, 영업수수료 없음)
 *                          공사 2,000 + 100                  = 2,100  (10년)
 *
 * 영업 200 은 한전불입 행까지 걸린다(원문에서 그 셀이 네 행을 병합하고 있다).
 * 투자사업 표의 영업 열은 비어 있어 총액이 공사 수수료뿐이다.
 *
 * ★그레이드(영업 1,000 · 공사 100)는 단가에 넣지 않았다.★ 기준 초과 시 소급 지급되는
 * 연간 인센티브라 대당 단가가 아니다 — 단가에 섞으면 못 받을 수도 있는 돈이 확정 단가로
 * 잡힌다. 보조사업 「모자분리 교체」(공사 1,800)도 넣지 않았다 — 교체는 자체투자로만
 * 하기로 했다(2026-08-22 결정).
 *
 * ★분해는 마진·시공비를 못 박고 나머지를 영업비로 둔다.★ 협력사에게 나가는 단가는
 * 정책이 정하는 값이 아니라 우리가 정하는 값이다 — 마진은 어느 케이스나 20만이고
 * 시공비는 100만이다(2026-08-22 결정). 그래서 정책 인상분은 영업비로 간다.
 * 총액이 정책에서 오고 두 값이 고정이므로 영업비는 계산해서 나온다 — 케이스마다 손으로
 * 적으면 총액과 어긋나고, 그 어긋남은 지급 단계에서야 드러난다.
 *
 * ★기성은 고정 + 잔액이다.★ 정책의 선금은 「공사 수수료 기준 50%」인데 저장 구조의
 * 비율은 턴키 × 비율이라(lib/settlement.ts) 그 50% 를 비율로 적으면 금액이 달라진다
 * (7년: 턴키 260만의 50% = 130만 ≠ 공사 240만의 50% = 120만). 그래서 선금은 계산해서
 * 고정으로 박고 잔금을 잔액으로 둔다 — 나이스의 기존 모양(착공 → 준공마감)과 같다.
 * 잔금 트리거 「운영 개시」는 목록에 없어 준공마감으로 뒀다(트리거는 4가지뿐이고,
 * 준공마감은 운영사가 정하는 자리라 운영 개시와 같은 칸이다).
 *
 * ★7월 1일 케이스의 금액은 건드리지 않는다.★ 정책이 「8월 1일 접수건부터」라고 못 박았으므로
 * 7월 접수건은 옛 단가가 맞다. 다만 ★나눔은 맞춘다★ — 기본공사비 95만은 정책이 정하는 값이
 * 아니라 우리가 시공사에 주는 값이라, 운영사 정책의 시행일과 따로 논다. 7월 1일 두 건도
 * 총액을 그대로 둔 채 영업 5만을 시공으로 옮겼다(한백 2026-08-29, migrations/0043). 시기가 다른 케이스가 나란히 활성인 것이 이 매트릭스의
 * 개정 방식이고(케이스 이름에 적용 시작이 들어가 화면에서 구분된다), 8월 이후 접수에
 * 옛 케이스를 못 고르게 막고 싶으면 화면에서 중지한다.
 */
import type { Actor } from '@/lib/auth/types';
import type { ProjectRepository } from '@/lib/data/repository';
import { checkPricingRule, duplicateOf } from '@/lib/pricing-match';
import { settlementStepsKeyOf } from '@/lib/settlement';
import type { NewPricingRule, PowerType, PromoStep, ReplType, SettlementStepRule } from '@/types/project';
import { replLabel } from '@/types/project';

/** 적용 시작 — 정책이 못 박은 날. 케이스 이름에 그대로 들어가 개정을 가른다 */
export const NICE_H2_START = '2026년 8월 1일';
const BIZ_YEAR = 2026;

/*
 * 정책이 정하는 값이 아니라 우리가 정하는 값. 이 둘을 못 박고 영업비를 계산으로 낸다 —
 * 받는 단가는 정책이 주므로, 셋을 다 적으면 합이 총액과 어긋날 자리가 생긴다.
 */
const MARGIN = 200_000; // 한백 마진 — 케이스 불문 동일
/*
 * 시공사 지급 단가(기본시공비) — ★나이스는 100만 (한백 2026-08-29).★ 상반기 90만에서
 * 올린 값이다(하반기 케이스만 — 상반기는 지급이 나가 못 고친다, migrations/0044).
 *
 * ★운영사마다 다르다★: 나이스 100만 · 플러그링크 95만 · 현대엔지니어링 110만.
 * 「하반기는 얼마」라는 공통 프레임은 없다 — 한동안 그런 것이 있는 줄 알고 100만을
 * 하반기 전체에 적어 두었는데, 값이 우연히 맞았을 뿐 근거가 아니었다.
 */
const PAYOUT_CONS = 1_000_000;

/** 정책 표 한 줄 — 금액은 원문 그대로 천원 단위로 적는다(옮기며 계산하지 않는다) */
interface PolicyRow {
  replType: ReplType;
  powerType: Extract<PowerType, '모자분리' | '한전불입'>;
  term: number;
  /** 영업(모집대행사) 수수료, 천원 */
  feeSales: number;
  /** 공사 수수료, 천원 — 10년 가산(100)을 더한 값 */
  feeCons: number;
  /** 기타 칸에 들어갈 행별 조건 — 없으면 null */
  misc: string | null;
  /** 격자 단가 칸에 붙는 부기 — 그 금액을 읽는 순간 같이 봐야 하는 한 줄. 없으면 null */
  note?: string;
}

/*
 * 프로모션 — 계약기간이 정한다. 행마다 손으로 적지 않는 이유는 원문 표기가 두 줄에 걸쳐
 * 있어서다: 7년 「6개월 / 149원」, 10년 「+6개월 / 220원」. 「+」는 7년 조건에 6개월이
 * 더 붙는다는 뜻이라(한백 확인 2026-08-22) 10년은 총 12개월이고 뒤 6개월이 220원이다.
 * 그대로 「+6개월/220원」만 적어 두면 10년이 6개월만 받는 것으로 읽힌다.
 *
 * 투자사업에도 같이 적는다 — 원문이 「보조사업 정책 동일 적용(단, 한전수전 지원 불가)」이다.
 * 「공동주택 외 시설 적용 불가」는 여기 케이스가 다 공동주택이라 걸리지 않는다.
 */
const PROMO: Record<number, PromoStep[]> = {
  7: [{ months: 6, rate: 149 }],
  10: [{ months: 6, rate: 149 }, { months: 6, rate: 220 }],
};

/**
 * 충전요금 — 원문 「충전단가 295원 (포인트 추가적립제도 종료)」.
 *
 * 한 번 294원으로 정정 요청이 왔다가 정책서 기준 295원으로 확정됐다(한백 확인 2026-08-22).
 * 남겨 두는 이유: 원본이 스캔 이미지라 4와 5를 눈으로 가리는 값이고, 다음에 또 물어볼 자리다.
 */
const CHARGE_RATE = 295;

/*
 * 아래 셋은 한백이 정리해 준 값이다(2026-08-22). 정책서 원문에는 더 많은 항목이 적혀 있지만
 * (지급품목에 충전기·열화상카메라, 기타지원에 한전불입금·전기안전점검 수수료 등) 케이스에
 * 담을 것은 이만큼이다 — 나머지는 정책서를 봐야 하는 조건이고, 케이스는 단가를 고르는 자리다.
 */
const SUPPLY = '스탠드폴 + 가림막 제공 (운송비 제외)';
/*
 * ★전기안전점검 수수료는 표에 적지 않는다★ — 우리가 받고 하도급사에는 지급하지 않는
 * (턴키금액 포함) 내부 사정이라, 표에 있으면 화면·캡처로 협력사에게 새 나간다
 * (한백 확인 2026-08-23). 그 사실의 정본은 safetyFeeBearer 값이다 — 화면에 안 나온다.
 */
const SUPPORT = '열화상 3면당 1대 무상 (옥내·지하 한정)';
/*
 * 카메라는 나이스가 무상으로 주지만 다는 일은 우리 몫이다 — ★설치비 1대당 10만원★을
 * 시공사에 지급한다(한백 2026-08-29). 대당 단가(충전기 기준)에 못 넣는다: 3면당 1대라
 * 기수와 대수가 다르다. 지급은 현장의 조정(추가공사비)으로 나가고, 이 줄은 그때 볼 요율이다.
 */
const THERMAL_FEE = '· 열화상카메라 설치비 1대당 10만원 (시공사 지급)';
/*
 * 설치조건은 주차면 비율만 적는다(한백 확인 2026-08-23) — 병행은 제 칸(coexistTerms)이 있다.
 * 감리비는 적지 않는다 — 한전불입이 10기까지라 감리 대상이 아니고, 지원할 일도 없다
 * (한백 확인 2026-08-22). 「미지원」이라고 적으면 우리가 부담한다는 뜻으로 읽힌다.
 * 나이스 케이스는 전부 공동주택이라 「공동주택 외」 비율을 칸으로 가를 자리가 없다 —
 * 그쪽은 사전 협의 대상이라 케이스 자체가 없고, 협의되면 그때 케이스와 함께 갈린다.
 */
const INSTALL =
  '공동주택 주차면 5% · 공동주택 외(주거형 오피스텔 · 지식산업센터 등) 주차면 2%';
const COEXIST = '나이스 단독은 일부 병행 가능(사전 협의) · 타사 혼합은 병행 불가';

/*
 * 교체 관련 조건은 전부 「자체투자 (제자리교체)」 케이스의 기타 칸에 모은다 —
 * 정책서 2쪽(투자사업)의 「계약 전 중요 확인 사항」과 수수료 표 비고에서 온 것들이고,
 * 셋 다 기존 충전기를 걷어내는 현장에서만 생기는 일이다(한백 확인 2026-08-23).
 * 신규위치는 교체가 아니라 새 자리 설치라 해당 없다.
 */
/* 항목마다 제 줄 — 「·」로 이으면 긴 글이 한 덩어리로 읽힌다(한백 확인 2026-08-23) */
const REPLACE_MISC = [
  '· 교체공사는 노후설비에 따른 일부 재시공 필수 — 분전함~충전기 케이블·배관 신설, 차단기·튜브 교체, 도색(레터링). 배관이 후강전선관·덕트면 재사용 가능',
  '· 교체 전 입주민 의향조사(민원 사전 차단)',
  '· 타CPO 교체는 계약종료 확인 — 해지 내용증명·소유권, 보조금 의무운영 5년 경과',
].join('\n');

const ROWS: PolicyRow[] = [
  // 보조사업 — 수수료(분리) 표. 교체는 논외(자체투자로만 한다)
  {
    replType: '환경부 신규', powerType: '모자분리', term: 7,
    feeSales: 200, feeCons: 2400,
    misc: null,
  },
  {
    replType: '환경부 신규', powerType: '모자분리', term: 10,
    feeSales: 200, feeCons: 2400 + 100,
    misc: null,
  },
  {
    replType: '환경부 신규', powerType: '한전불입', term: 10,
    feeSales: 200, feeCons: 2200,
    // 10년 계약만 있고 기수 상한이 붙는다 — 이 상한 때문에 감리 대상도 아니다.
    // 기타 행이 아니라 단가 칸 부기다 — 240만을 읽는 순간 같이 봐야 하는 조건이다(한백 확인 2026-08-23)
    misc: null,
    note: '한전불입금 지원은 10기 이내',
  },
  // 투자사업 — 수수료(턴키) 표. 영업 열이 비어 총액이 공사뿐이다. 한전수전은 불가
  {
    replType: '자체투자 (제자리교체)', powerType: '모자분리', term: 7,
    feeSales: 0, feeCons: 2000,
    misc: REPLACE_MISC,
  },
  {
    replType: '자체투자 (제자리교체)', powerType: '모자분리', term: 10,
    feeSales: 0, feeCons: 2000 + 100,
    misc: REPLACE_MISC,
  },
];

/**
 * 걷어낸 케이스 — 자체투자 「신규위치」 7년·10년 (2026-08-26).
 *
 * ★왜★ 나이스는 제자리교체와 신규위치의 **금액이 같다**(공사 2,000 / 2,100). 축을 가를
 * 이유가 없는데 케이스를 둘로 두었더니, 접수 화면의 자체투자 대수 표가 두 행으로 펴지고
 * 한 현장의 11기가 「10대 + 1대」 두 라인으로 갈렸다(강원 강릉 일송아파트, 한백 2026-08-26).
 * 플러그링크와 같은 방식으로 제자리교체 한 칸에 담는다 — 그쪽도 「문서는 그냥 교체다」로
 * 한 칸이다. 에버온·SK일렉링크는 금액이 실제로 달라 그대로 둔다.
 *
 * 0002 가 넣은 두 행의 값은 위 ROWS 에서 지웠다 — 무엇이 있었는지는 이 id 와 0002 가 기록이다.
 */
export const NICE_DROP_IDS = [
  'nice-y7-mother-move-apt-2026',
  'nice-y10-mother-move-apt-2026',
] as const;

const won = (n: number) => n.toLocaleString('ko-KR');

function ruleOf(row: PolicyRow): NewPricingRule {
  const receive = (row.feeSales + row.feeCons) * 1000;
  const salesUnit = receive - MARGIN - PAYOUT_CONS;
  // 선금은 공사 수수료의 50% — 턴키 비율이 아니라 정책 표의 공사 금액에서 나온다
  const prepay = (row.feeCons * 1000) / 2;
  const settlementSteps: SettlementStepRule[] = [
    { trigger: '착공', basis: { kind: '고정', unit: prepay } },
    { trigger: '준공마감', basis: { kind: '잔액' } },
  ];

  // 화면(PricingMatrix)이 만드는 라벨과 같은 꼴로 — 같은 케이스가 두 얼굴로 뜨지 않게
  const caseName =
    `나이스인프라 (${NICE_H2_START}) | 공동주택 | ${row.term}년 ${replLabel('나이스인프라', row.replType)} | ${row.powerType}`;
  const sub = row.replType === '환경부 신규';

  return {
    caseName,
    cpo: '나이스인프라',
    bizType: sub ? '환경부' : '자체투자',
    powerType: row.powerType,
    termYears: [row.term],
    bldgTypes: ['공동주택'],
    replType: row.replType,
    channel: '턴키',
    bizYear: BIZ_YEAR,
    startDate: NICE_H2_START,
    salesUnit,
    consUnit: PAYOUT_CONS,
    margin: MARGIN,
    /*
     * 이 두 칸은 화면에 안 나온다(폼이 항상 null 을 보낸다). 그래도 뜻이 맞는 값을 둔다 —
     * 같은 내용을 설치조건·기타지원 글로도 적어 두었고, 칸을 살릴 때 옮겨 적지 않게.
     */
    supervisionBearer: '해당없음 — 10기 이내라 감리 대상 아님',
    safetyFeeBearer: '한백 수령 · 하도급 미지급(턴키금액 포함)',
    supplyItems: SUPPLY,
    promo: PROMO[row.term] ?? null,
    // 연장 차감 단가는 정책서에 없다 — 아직 정해진 값이 없어 미지정으로 둔다(한백 확인 2026-08-22)
    promoExtend: null,
    chargeRate: CHARGE_RATE,
    installTerms: INSTALL,
    otherSupport: SUPPORT,
    coexistTerms: COEXIST,
    // 요율은 케이스 불문 같다 — 행별 조건 위에 얹는다
    miscTerms: [THERMAL_FEE, row.misc].filter(Boolean).join('\n'),
    /*
     * note 는 격자 단가 칸의 부기가 됐다(2026-08-23) — 그 금액을 읽는 순간 같이 봐야 하는
     * 한 줄(한전불입 10기 이내). 돈의 유래 같은 긴 설명은 여전히 안 적는다 —
     * 그것은 이 파일 위쪽 주석이 정본이다.
     */
    note: row.note ?? null,
    settlementSteps,
  };
}

/** 정책이 만드는 케이스 전부 — 순서는 표 순서다 */
export function niceH2Rules(): NewPricingRule[] {
  return ROWS.map(ruleOf);
}

export interface ApplyStep {
  rule: NewPricingRule;
  /** 넣은·고친 케이스 id. 미리보기이거나 실패면 null */
  id: string | null;
  action: '추가' | '수정' | '지나감' | '실패' | '넣을 것' | '고칠 것';
  /** 사람이 읽을 사유 — 왜 지나갔나, 왜 실패했나 */
  message: string | null;
}

export interface ApplyReport {
  steps: ApplyStep[];
  added: number;
  fixed: number;
  skipped: number;
  failed: number;
}

/**
 * 프로모션 구간이 같은가 — 값으로 견준다.
 *
 * ★JSON.stringify 로 견주면 안 된다.★ jsonb 는 키 순서를 제 방식으로 정규화해서 저장한다 —
 * `{months,rate}` 로 넣은 것이 `{rate,months}` 로 돌아온다. 글자로 견주면 값이 같은데도
 * 늘 다르다고 나오고, 반영 스크립트가 매번 7건을 「고칠 것」으로 집어 멱등이 깨진다
 * (2026-08-22 실제로 그랬다).
 */
function samePromo(a: PromoStep[] | null, b: PromoStep[] | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.months === b[i].months && x.rate === b[i].rate);
}

/** 저장소에서 이 일에 쓰는 것만 — 스크립트는 pgRepository 를, 라우트는 getRepository() 를 넘긴다 */
type Repo = Pick<
  ProjectRepository,
  'listPricingRules' | 'listSettlementRules' | 'addPricingRule' | 'updatePricingRule'
>;

/**
 * 정책을 저장소에 반영한다.
 *
 * 멱등하다 — 같은 칸(교체유형 × 수전 × 연수 × 유형 × 채널)을 같은 적용 시작으로 덮는
 * 케이스가 이미 있으면 값을 견주고, 같으면 지나가고 다르면 고친다. 두 번 돌려도 같은 결과다.
 * 참조된 케이스의 수정은 소급 변경이라 저장소가 거절한다 — 그때는 실패로 적어 돌려준다
 * (개정이고, 적용 시작을 다르게 잡아야 하는 일이라 여기서 대신 정할 수 없다).
 *
 * write=false 면 아무것도 쓰지 않고 무엇을 할지만 적어 돌려준다.
 */
export async function applyNiceH2(
  repo: Repo,
  actor: Actor,
  { write }: { write: boolean }
): Promise<ApplyReport> {
  const [existing, settles] = await Promise.all([
    repo.listPricingRules(actor),
    repo.listSettlementRules(actor),
  ]);
  /* 기성이 같은가는 규칙 id 로 못 본다 — 옛 규칙은 손으로 붙인 id(nice-2step)라 단계로 견준다 */
  const stepsKeyById = new Map(settles.map((s) => [s.id, settlementStepsKeyOf(s.steps)]));

  const steps: ApplyStep[] = [];
  let added = 0;
  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const rule of niceH2Rules()) {
    const bad = checkPricingRule(rule);
    if (bad.length > 0) {
      steps.push({ rule, id: null, action: '실패', message: bad.join(' / ') });
      failed += 1;
      continue;
    }

    const dup = duplicateOf(rule, existing);
    if (dup) {
      /*
       * ★비교할 것을 빠뜨리면 조용히 지나간다.★ 정책 칸을 안 견주던 동안, 지급자재·설치조건을
       * 고쳐 놓고 돌려도 「이미 같은 값」으로 7건 전부 넘어갔다(2026-08-22). 그러니 저장하는
       * 필드는 여기서도 전부 견준다 — 새 칸을 더할 때 이 목록도 같이 늘려야 한다.
       */
      const sameMoney = dup.salesUnit === rule.salesUnit
        && dup.consUnit === rule.consUnit
        && dup.margin === rule.margin;
      const samePolicy = dup.supplyItems === rule.supplyItems
        && samePromo(dup.promo, rule.promo)
        && JSON.stringify(dup.promoExtend) === JSON.stringify(rule.promoExtend)
        && dup.chargeRate === rule.chargeRate
        && dup.installTerms === rule.installTerms
        && dup.otherSupport === rule.otherSupport
        && dup.coexistTerms === rule.coexistTerms
        && dup.miscTerms === rule.miscTerms;
      const same = sameMoney
        && samePolicy
        && stepsKeyById.get(dup.defaultSettlementRuleId) === settlementStepsKeyOf(rule.settlementSteps)
        && dup.caseName === rule.caseName
        && dup.note === rule.note;
      if (same) {
        steps.push({ rule, id: dup.id, action: '지나감', message: '이미 같은 값입니다.' });
        skipped += 1;
        continue;
      }
      /*
       * 무엇이 다른지 적는다 — 「값이 다릅니다」만 적고 금액을 보여주면, 비고만 바뀐 경우에
       * 같은 금액이 나란히 찍혀 「왜 고친다는 건가」가 된다(실제로 그랬다).
       */
      const changed = [
        !sameMoney
          ? `금액(지금 영업 ${won(dup.salesUnit)} / 시공 ${won(dup.consUnit)} / 마진 ${won(dup.margin)})`
          : null,
        !samePolicy ? '정책 조건' : null,
        stepsKeyById.get(dup.defaultSettlementRuleId) !== settlementStepsKeyOf(rule.settlementSteps)
          ? '기성 단계' : null,
        dup.caseName !== rule.caseName ? '케이스 이름' : null,
        dup.note !== rule.note ? '비고' : null,
      ].filter(Boolean);
      const diff = `다른 것: ${changed.join(' · ')}`;
      if (!write) {
        steps.push({ rule, id: dup.id, action: '고칠 것', message: diff });
        continue;
      }
      try {
        await repo.updatePricingRule(dup.id, rule, actor);
        steps.push({ rule, id: dup.id, action: '수정', message: diff });
        fixed += 1;
      } catch (err) {
        steps.push({ rule, id: dup.id, action: '실패', message: (err as Error).message });
        failed += 1;
      }
      continue;
    }

    if (!write) {
      steps.push({ rule, id: null, action: '넣을 것', message: null });
      continue;
    }
    try {
      const id = await repo.addPricingRule(rule, actor);
      steps.push({ rule, id, action: '추가', message: null });
      added += 1;
      // 뒤 행의 중복 판정이 방금 넣은 것을 보게 한다
      existing.push({ ...rule, id, active: true, defaultSettlementRuleId: '' });
    } catch (err) {
      steps.push({ rule, id: null, action: '실패', message: (err as Error).message });
      failed += 1;
    }
  }

  return { steps, added, fixed, skipped, failed };
}

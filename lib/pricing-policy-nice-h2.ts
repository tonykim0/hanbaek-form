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
 * ★7월 1일 케이스는 건드리지 않는다.★ 정책이 「8월 1일 접수건부터」라고 못 박았으므로
 * 7월 접수건은 옛 단가가 맞다. 시기가 다른 케이스가 나란히 활성인 것이 이 매트릭스의
 * 개정 방식이고(케이스 이름에 적용 시작이 들어가 화면에서 구분된다), 8월 이후 접수에
 * 옛 케이스를 못 고르게 막고 싶으면 화면에서 중지한다.
 */
import type { Actor } from '@/lib/auth/types';
import type { ProjectRepository } from '@/lib/data/repository';
import { checkPricingRule, duplicateOf } from '@/lib/pricing-match';
import { settlementStepsKeyOf } from '@/lib/settlement';
import type { NewPricingRule, PowerType, ReplType, SettlementStepRule } from '@/types/project';

/** 적용 시작 — 정책이 못 박은 날. 케이스 이름에 그대로 들어가 개정을 가른다 */
export const NICE_H2_START = '2026년 8월 1일';
const BIZ_YEAR = 2026;

/*
 * 정책이 정하는 값이 아니라 우리가 정하는 값. 이 둘을 못 박고 영업비를 계산으로 낸다 —
 * 받는 단가는 정책이 주므로, 셋을 다 적으면 합이 총액과 어긋날 자리가 생긴다.
 */
const MARGIN = 200_000; // 한백 마진 — 케이스 불문 동일
const PAYOUT_CONS = 1_000_000; // 시공사 지급 단가

/** 정책 표 한 줄 — 금액은 원문 그대로 천원 단위로 적는다(옮기며 계산하지 않는다) */
interface PolicyRow {
  replType: ReplType;
  powerType: Extract<PowerType, '모자분리' | '한전불입'>;
  term: number;
  /** 영업(모집대행사) 수수료, 천원 */
  feeSales: number;
  /** 공사 수수료, 천원 — 10년 가산(100)을 더한 값 */
  feeCons: number;
  /** 케이스 비고에 덧붙일 정책 조건 */
  extra: string;
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
const PROMO: Record<number, string> = {
  7: '프로모션 6개월/149원',
  10: '프로모션 6개월/149원 + 6개월/220원(총 12개월)',
};

/** 보조·투자사업에 공통인 조건 — 원문 상단 정책 표에서 온다 */
const COMMON = '충전단가 295원, 설치비율 5%(전용면). 프로모션 연장은 영업비 차감 — 차감 단가 미정';

const ROWS: PolicyRow[] = [
  // 보조사업 — 수수료(분리) 표. 교체는 논외(자체투자로만 한다)
  {
    replType: '환경부 신규', powerType: '모자분리', term: 7,
    feeSales: 200, feeCons: 2400,
    extra: '기설치 「철거 조건」 현장은 신규 불가. 내구연한 8년 미만 교체 불가',
  },
  {
    replType: '환경부 신규', powerType: '모자분리', term: 10,
    feeSales: 200, feeCons: 2400 + 100,
    extra: '기설치 「철거 조건」 현장은 신규 불가. 내구연한 8년 미만 교체 불가',
  },
  {
    replType: '환경부 신규', powerType: '한전불입', term: 10,
    feeSales: 200, feeCons: 2200,
    extra: '한전불입금 지원은 10년 계약·10기 이내. 파트너사 신청 후 당사 납부',
  },
  // 투자사업 — 수수료(턴키) 표. 영업 열이 비어 총액이 공사뿐이다. 한전수전은 불가
  {
    replType: '자체투자 (제자리교체)', powerType: '모자분리', term: 7,
    feeSales: 0, feeCons: 2000,
    extra: '한전수전 지원 불가(수전장소는 보조사업으로만). 교체공사는 케이블·배관 신설, 차단기·튜브 교체, 도색 재시공 필수',
  },
  {
    replType: '자체투자 (제자리교체)', powerType: '모자분리', term: 10,
    feeSales: 0, feeCons: 2000 + 100,
    extra: '한전수전 지원 불가(수전장소는 보조사업으로만). 교체공사는 케이블·배관 신설, 차단기·튜브 교체, 도색 재시공 필수',
  },
  {
    replType: '자체투자 (신규위치)', powerType: '모자분리', term: 7,
    feeSales: 0, feeCons: 2000,
    extra: '한전수전 지원 불가(수전장소는 보조사업으로만). 사전 입주민 의향조사 필요',
  },
  {
    replType: '자체투자 (신규위치)', powerType: '모자분리', term: 10,
    feeSales: 0, feeCons: 2000 + 100,
    extra: '한전수전 지원 불가(수전장소는 보조사업으로만). 사전 입주민 의향조사 필요',
  },
];

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
    `나이스인프라 (${NICE_H2_START}) | 공동주택 | ${row.term}년 ${row.replType} | ${row.powerType}`;
  const feeText = row.feeSales > 0
    ? `영업수수료 ${won(row.feeSales)}천원 + 공사수수료 ${won(row.feeCons)}천원`
    : `공사수수료 ${won(row.feeCons)}천원(영업수수료 없음)`;

  return {
    caseName,
    cpo: '나이스인프라',
    bizType: row.replType === '환경부 신규' ? '환경부' : '자체투자',
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
    supervisionBearer: '운영사',
    // 정책: 전기안전점검 수수료 지원 — 파트너사 선납 후 정산 시 지급
    safetyFeeBearer: '한백 대납(회수)',
    note:
      `26년 하반기 정책(2026-08-05 배포, 8/1 접수건~) — ${feeText}. ` +
      `선금은 공사수수료의 50%. 마진 20만·시공비 100만 고정, 나머지가 영업비. ` +
      `${PROMO[row.term] ?? '프로모션 미확인'}. ${COMMON}. ${row.extra}`,
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
      const same = dup.salesUnit === rule.salesUnit
        && dup.consUnit === rule.consUnit
        && dup.margin === rule.margin
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
        dup.salesUnit !== rule.salesUnit || dup.consUnit !== rule.consUnit || dup.margin !== rule.margin
          ? `금액(지금 영업 ${won(dup.salesUnit)} / 시공 ${won(dup.consUnit)} / 마진 ${won(dup.margin)})`
          : null,
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

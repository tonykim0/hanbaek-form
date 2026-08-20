/**
 * 공정 → 정산 트리거.
 *
 * 정산 규칙은 현장 단위로 적용되고, 단가는 계약 라인 단위다.
 * 그래서 금액은 라인별로 계산해 차수끼리 합친다 — 라인마다 턴키와 대수가 다르기 때문이다.
 *
 * ★트리거 3종의 성격이 다르다★
 *   착공        — 우리 공정(실착공일). 시공사가 입력하면 자동으로 열린다.
 *   환경부 승인  — 외부 통보를 날짜 필드에 입력하면 열린다.
 *   준공마감     — 한백이 판단해 지정한다. 공정 일정에서 유도하지 않는다.
 */
import type {
  ContractLineView, PayoutCategory, PayoutEntry, PayoutKind, PricingRule, ProcessInfo,
  SettlementRule, SettlementStep, StepBasis, StepState, Trigger,
} from '@/types/project';
import { PAYOUT_CATEGORIES, PAYOUT_KINDS } from '@/types/project';

/** 턴키 = 영업비 + 시공비 + 한백마진. 매트릭스 28행 전부 검산됨. */
/**
 * 턴키 = 영업비 + 시공비 + 마진.
 *
 * 셋 중 하나라도 가려져 있으면(null) 계산하지 않고 null 을 돌려준다.
 * 없는 값을 0 으로 두면 「턴키 0원」이 화면에 찍혀서, 가려진 것인지 정말 0 인지 구분되지 않는다.
 */
export function turnkeyUnit(rule: MoneyParts): number | null {
  if (rule.salesUnit === null || rule.consUnit === null || rule.margin === null) return null;
  return rule.salesUnit + rule.consUnit + rule.margin;
}

/** 협력사 배포단가 = 영업비 + 시공비 */
export function distributionUnit(rule: MoneyParts): number | null {
  if (rule.salesUnit === null || rule.consUnit === null) return null;
  return rule.salesUnit + rule.consUnit;
}

/** 가려질 수 있는 금액 셋. PricingRule 과 PricingRuleView 둘 다 받는다. */
interface MoneyParts {
  salesUnit: number | null;
  consUnit: number | null;
  margin: number | null;
}

export function triggerMet(
  trigger: Trigger,
  process: ProcessInfo,
  closeDate: string | null
): boolean {
  switch (trigger) {
    case '환경부 승인':
      return Boolean(process.envApprovalDate);
    case '착공':
      return Boolean(process.startActualDate);
    case '준공마감':
      return Boolean(closeDate);
    case '해당없음':
      return false;
  }
}

/** 트리거의 근거가 어디서 오는지 — 화면 설명용 */
export function triggerSource(trigger: Trigger): string {
  switch (trigger) {
    case '환경부 승인': return '환경부 승인일';
    case '착공': return '실착공일';
    case '준공마감': return '준공마감일 (한백 지정)';
    case '해당없음': return '—';
  }
}

export function basisLabel(basis: StepBasis): string {
  if (basis.kind === '고정') return '고정';
  if (basis.kind === '비율') return `턴키 ${Math.round(basis.ratio * 1000) / 10}%`;
  return '잔액';
}

/**
 * 규칙을 턴키에 적용해 단계별 총액을 낸다.
 *   고정 = 대당금액 × 대수
 *   비율 = 턴키 × 비율 × 대수
 *   잔액 = (턴키 − 앞단계 대당합) × 대수
 */
export function stepAmounts(rule: SettlementRule, turnkey: number, qty: number): number[] {
  let used = 0;
  return rule.steps.map((step) => {
    let unit: number;
    if (step.basis.kind === '고정') unit = step.basis.unit;
    else if (step.basis.kind === '비율') unit = Math.round(turnkey * step.basis.ratio);
    else unit = Math.max(0, turnkey - used);
    used += unit;
    return unit * qty;
  });
}

const EMPTY_STEP = (no: 1 | 2 | 3): SettlementStep => ({
  no,
  trigger: '해당없음',
  basisLabel: '해당없음',
  planAmount: null,
  state: 'na',
  collectedAt: null,
});

/**
 * 현장의 기성 3단계.
 * 정산 규칙이 없거나 단가가 지정된 라인이 없으면 금액이 나오지 않는다.
 */
export function settlementForProject(
  lines: ContractLineView[],
  rule: SettlementRule | null,
  process: ProcessInfo,
  closeDate: string | null,
  collected: Partial<Record<1 | 2 | 3, string>> = {}
): SettlementStep[] {
  const steps: SettlementStep[] = [EMPTY_STEP(1), EMPTY_STEP(2), EMPTY_STEP(3)];
  if (!rule) return steps;

  const priced = lines.filter((l) => l.rule !== null);

  rule.steps.slice(0, 3).forEach((stepRule, i) => {
    const no = (i + 1) as 1 | 2 | 3;
    const amount = priced.reduce((sum, l) => {
      const turnkey = turnkeyUnit(l.rule!);
      // 금액이 가려진 라인은 계산에서 뺀다. 실제로는 여기까지 오지 않는다 —
      // 기성 계산은 지우기 전에 돌고, 지운 뒤에는 계획액 자체가 null 이 된다.
      if (turnkey === null) return sum;
      return sum + stepAmounts(rule, turnkey, l.qty)[i];
    }, 0);
    const collectedAt = collected[no] ?? null;
    const state: StepState = collectedAt
      ? 'collected'
      : triggerMet(stepRule.trigger, process, closeDate)
        ? 'open'
        : 'waiting';

    steps[i] = {
      no,
      trigger: stepRule.trigger,
      basisLabel: basisLabel(stepRule.basis),
      planAmount: priced.length > 0 ? amount : null,
      state,
      collectedAt,
    };
  });

  return steps;
}

/** 회수율 = 회수액 ÷ 계획총액 × 100 */
/**
 * 협력사 지급 회차 비율 — 1차 70%, 2차 30%.
 *
 * 매트릭스에서 나오는 값이 아니라 관행이다. 그래서 한 곳에만 두고 화면들이 같이 쓴다 —
 * 상세와 목록이 각자 0.7 을 적어두면 한쪽만 고쳐졌을 때 두 화면이 다른 금액을 말한다.
 */
export const PAY_SPLIT = [0.7, 0.3] as const;

/** 총액을 회차로 쪼갠다. 끝수는 1차에 붙인다 — 합이 총액과 어긋나면 안 된다. */
export function payInstallments(total: number): number[] {
  const later = PAY_SPLIT.slice(1).map((r) => Math.round(total * r));
  return [total - later.reduce((a, b) => a + b, 0), ...later];
}

// ── 하도급사 지급 원장 ───────────────────────────────────────────
const CATEGORY_BY_KEY = new Map(PAYOUT_CATEGORIES.map((c) => [c.key, c]));

export function entryTypeOf(category: PayoutCategory): '지급' | '조정' {
  return CATEGORY_BY_KEY.get(category)!.type;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 원장 입력 검사 — 저장소 세 벌이 같은 것을 봐야 하므로 여기 한 곳에 둔다.
 * 명목이 부호를 정한다: 회수·차감은 음수, 재정산만 양쪽 다 된다.
 */
export function checkPayoutEntry(input: {
  kind: unknown; category: unknown; amount: unknown; at: unknown; note?: unknown;
}): string | null {
  if (!PAYOUT_KINDS.includes(input.kind as PayoutKind)) return '구분(영업비/시공비)이 올바르지 않습니다.';
  const cat = CATEGORY_BY_KEY.get(input.category as PayoutCategory);
  if (!cat) return '명목이 올바르지 않습니다.';
  if (typeof input.amount !== 'number' || !Number.isInteger(input.amount) || input.amount === 0) {
    return '금액은 0 이 아닌 원 단위 정수여야 합니다.';
  }
  if (cat.sign > 0 && input.amount < 0) return `${cat.key}은(는) 나가는 돈이라 양수여야 합니다.`;
  if (cat.sign < 0 && input.amount > 0) return `${cat.key}은(는) 빼는 돈이라 음수여야 합니다.`;
  if (typeof input.at !== 'string' || !DATE_RE.test(input.at)) return '날짜는 YYYY-MM-DD 형식이어야 합니다.';
  if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') {
    return '메모가 올바르지 않습니다.';
  }
  return null;
}

/** 한쪽(영업비/시공비)의 원장 합 — 잔액 = 계획 + adjust − paid */
export function payoutSideOf(entries: PayoutEntry[], kind: PayoutKind): {
  adjust: number;
  paid: number;
  lastPaidAt: string | null;
} {
  const mine = entries.filter((e) => e.kind === kind);
  const paidRows = mine.filter((e) => entryTypeOf(e.category) === '지급');
  return {
    adjust: mine.filter((e) => entryTypeOf(e.category) === '조정').reduce((n, e) => n + e.amount, 0),
    paid: paidRows.reduce((n, e) => n + e.amount, 0),
    lastPaidAt: paidRows.reduce<string | null>((last, e) => (!last || e.at > last ? e.at : last), null),
  };
}

export function recoveryRate(steps: SettlementStep[]): number | null {
  const plan = steps.reduce((s, x) => s + (x.planAmount ?? 0), 0);
  if (plan <= 0) return null;
  const got = steps
    .filter((x) => x.state === 'collected')
    .reduce((s, x) => s + (x.planAmount ?? 0), 0);
  return Math.round((got / plan) * 1000) / 10;
}

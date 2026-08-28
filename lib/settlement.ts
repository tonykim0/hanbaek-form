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
  ContractLineView, PayoutCategory, PayoutEntry, PayoutKind, PayoutMilestones, PricingRule, ProcessInfo,
  SettlementRule, SettlementStep, SettlementStepRule, StepBasis, StepState, Trigger,
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
    /*
     * 화면에서는 「환경부 승인일」 한 칸이다 (한백 2026-08-27) — 운영사 시공승인도 같은
     * 날로 본다. 트리거 이름은 그대로 둔다: 정산 규칙에 글자로 저장돼 있어서 이름을
     * 바꾸면 이미 걸린 규칙이 어느 트리거인지 못 찾는다.
     */
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

/** 기성 단계에 쓸 수 있는 트리거 — '해당없음' 은 빈 차수 표시용이라 정의에는 못 쓴다 */
export const RECEIVE_TRIGGERS: readonly Trigger[] = ['환경부 승인', '착공', '준공마감'];

/**
 * 단계 정의를 턴키(받는 단가)에 적용한 대당 금액.
 *   고정 = 대당금액 그대로 · 비율 = 턴키 × 비율 · 잔액 = 턴키 − 앞단계 합
 */
export function stepUnits(steps: SettlementStepRule[], turnkey: number): number[] {
  let used = 0;
  return steps.map((step) => {
    let unit: number;
    if (step.basis.kind === '고정') unit = step.basis.unit;
    else if (step.basis.kind === '비율') unit = Math.round(turnkey * step.basis.ratio);
    else unit = Math.max(0, turnkey - used);
    used += unit;
    return unit;
  });
}

/**
 * 규칙을 턴키에 적용해 단계별 총액을 낸다 — 대당 금액(stepUnits) × 대수.
 */
export function stepAmounts(rule: SettlementRule, turnkey: number, qty: number): number[] {
  return stepUnits(rule.steps, turnkey).map((unit) => unit * qty);
}

/**
 * 규칙 이름은 단계에서 만든다 — 「환경부 승인 40% → 준공마감 잔액」.
 *
 * 손으로 적게 두면 운영사 이름·줄임말이 박혀서 같은 모양의 규칙이 이름만 다르게 쌓인다.
 * 이름은 표시용이고, 같은 규칙인지는 settlementStepsKeyOf 로 본다.
 */
export function settlementRuleNameOf(steps: SettlementStepRule[]): string {
  return steps
    .map((s) => {
      const b = s.basis;
      const amount =
        b.kind === '고정' ? `${b.unit.toLocaleString('ko-KR')}원`
          : b.kind === '비율' ? `${Math.round(b.ratio * 1000) / 10}%`
            : '잔액';
      return `${s.trigger} ${amount}`;
    })
    .join(' → ');
}

/** 단계가 같은 규칙인가를 견주는 값 — 트리거·방식·금액이 전부 같아야 같은 규칙이다 */
export function settlementStepsKeyOf(steps: SettlementStepRule[]): string {
  return steps
    .map((s) =>
      s.basis.kind === '고정' ? `${s.trigger}|고정|${s.basis.unit}`
        : s.basis.kind === '비율' ? `${s.trigger}|비율|${s.basis.ratio}`
          : `${s.trigger}|잔액`
    )
    .join('→');
}

/** 단계에서 규칙 id 를 만든다 — 같은 단계면 같은 id 라 동시 생성도 한 행으로 모인다 */
export function settlementRuleIdOf(steps: SettlementStepRule[]): string {
  const key = settlementStepsKeyOf(steps);
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `st-${h.toString(36)}`;
}

/**
 * 기성 단계 정의가 앞뒤 맞는가 — 케이스 저장 전에 본다. 화면과 저장소가 같이 쓴다.
 *
 * 빈 배열은 통과다(기성 미정 — 규칙이 아직 안 정해진 운영사가 실제로 있다).
 * 단계가 있으면 합이 받는 단가(턴키)와 정확히 맞아야 한다 — 기성은 턴키를 나눠 받는
 * 것이지 더 받거나 덜 받는 것이 아니다. 마지막 차수를 잔액으로 두면 항상 맞아떨어진다.
 */
export function checkSettlementSteps(steps: SettlementStepRule[], turnkey: number): string[] {
  if (!Array.isArray(steps)) return ['기성 단계가 올바르지 않습니다.'];
  if (steps.length === 0) return [];
  const bad: string[] = [];
  if (steps.length > 3) bad.push('기성은 3차까지입니다.');
  steps.forEach((s, i) => {
    const no = `${i + 1}차`;
    if (!s || !RECEIVE_TRIGGERS.includes(s.trigger)) {
      bad.push(`${no} 트리거는 환경부 승인 · 착공 · 준공마감 중 하나여야 합니다.`);
      return;
    }
    const b = s.basis;
    if (!b || !['고정', '비율', '잔액'].includes(b.kind)) {
      bad.push(`${no} 방식이 올바르지 않습니다.`);
      return;
    }
    if (b.kind === '고정' && (!Number.isInteger(b.unit) || b.unit <= 0)) {
      bad.push(`${no} 고정 금액은 0 보다 큰 원 단위 정수여야 합니다.`);
    }
    if (b.kind === '비율' && !(typeof b.ratio === 'number' && b.ratio > 0 && b.ratio <= 1)) {
      bad.push(`${no} 비율은 0 초과 100% 이하여야 합니다.`);
    }
    if (b.kind === '잔액' && i !== steps.length - 1) {
      bad.push('잔액은 마지막 차수에만 둘 수 있습니다.');
    }
  });
  if (bad.length === 0 && Number.isInteger(turnkey) && turnkey > 0) {
    const total = stepUnits(steps, turnkey).reduce((a, b) => a + b, 0);
    if (total !== turnkey) {
      bad.push(
        `기성 단계 합(${total.toLocaleString('ko-KR')}원)이 받는 단가(${turnkey.toLocaleString('ko-KR')}원)와 다릅니다 — 마지막 차수를 잔액으로 두면 맞아떨어집니다.`
      );
    }
  }
  return bad;
}

/**
 * 기성 차수 상태의 이름과 말투 — 두 화면이 같은 말을 쓰게 여기 한 벌만 둔다.
 *
 * 예전에는 현장 상세(SettlementTab)와 기성관리 표(ReceivableBoard)가 각자 들고 있어서
 * 같은 상태가 「회수 완료」와 「회수」로 갈리고 색도 amber-200·amber-100 으로 달랐다.
 *
 * ★「회수」를 쓰지 않는다★ (한백 확인 2026-08-23)
 * 이 저장소에서 그 말이 두 뜻으로 쓰이고 있었다 — 여기서는 운영사에게서 돈이 들어온 것이고,
 * 지급 원장(PAYOUT_KINDS)의 「회수」는 협력사에게 잘못 준 돈을 돌려받는 음수 지급이다.
 * 방향이 정반대인데 글자가 같으면 어느 쪽 이야기인지 매번 따져야 한다. 들어오는 쪽을
 * 「수금」으로 바꾼다. 지급 원장 쪽은 그대로 둔다 — 그쪽이 원래 뜻에 맞다.
 *
 * na 는 배지가 아니다 — 규칙상 없는 것은 빈 값(`<Empty kind="na">`)으로 보인다.
 * 그래서 말투에는 na 가 없다.
 */
/**
 * 차수의 상태 이름.
 *
 * ★「트리거 대기」를 「조건 대기」로 바꿨다★ (한백 지시 2026-08-28) — 「트리거」는 우리끼리
 * 쓰는 말이다. 실제로 「착공 트리거가 뭐냐」는 물음이 나왔다(2026-08-28). 지급 쪽은 같은 뜻을
 * 이미 「조건 대기」로 쓰고 있다(payout-board 의 WorkState) — 같은 개념에 같은 말을 쓴다.
 * 무엇을 기다리는지는 차수 칸의 부기가 적는다(「660,000 · 준공마감」).
 */
export const STEP_LABEL: Record<StepState, string> = {
  na: '해당없음',
  waiting: '조건 대기',
  open: '청구 가능',
  collected: '수금 완료',
};

export const STEP_TONE = {
  waiting: 'mute',
  open: 'warn',
  collected: 'ok',
} as const satisfies Record<Exclude<StepState, 'na'>, string>;

const EMPTY_STEP = (no: 1 | 2 | 3): SettlementStep => ({
  no,
  trigger: '해당없음',
  basisLabel: '해당없음',
  planAmount: null,
  state: 'na',
  collectedAt: null,
  collectedAmount: null,
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
  /** 차수별 수금 기록 — 날짜와 실수금액은 한 사실이라 같이 온다 */
  collected: Partial<Record<1 | 2 | 3, { at: string; amount: number | null }>> = {}
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
    const got = collected[no] ?? null;
    const collectedAt = got?.at ?? null;
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
      collectedAmount: got?.amount ?? null,
    };
  });

  return steps;
}

/**
 * 협력사 지급 회차 비율 — 1차 70%, 2차 30%.
 *
 * 매트릭스에서 나오는 값이 아니라 관행이다. 그래서 한 곳에만 두고 화면들이 같이 쓴다 —
 * 상세와 목록이 각자 0.7 을 적어두면 한쪽만 고쳐졌을 때 두 화면이 다른 금액을 말한다.
 */
export const PAY_SPLIT = [0.7, 0.3] as const;

/**
 * 하도급사 지급 회차를 여는 업무 사실.
 *
 * 금액 진행(payoutStepsOf)과 업무 조건을 섞지 않는다. 금액상 2차 차례여도 개통이 끝나지
 * 않았으면 지급 대상이 아니다. 화면과 두 저장소가 이 함수를 같이 봐야 API를 직접 불러도
 * 같은 조건으로 막힌다.
 */
export function payoutReleaseOf(
  kind: PayoutKind,
  no: 1 | 2,
  milestones: PayoutMilestones
): { trigger: '계약완료' | '설치완료' | '개통완료'; metAt: string | null; met: boolean } {
  if (no === 2) {
    return { trigger: '개통완료', metAt: milestones.openedAt, met: milestones.openedAt !== null };
  }
  if (kind === '영업비') {
    return {
      trigger: '계약완료',
      metAt: milestones.contractCompletedAt,
      met: milestones.contractCompletedAt !== null,
    };
  }
  return {
    trigger: '설치완료',
    metAt: milestones.installCompletedAt,
    met: milestones.installCompletedAt !== null,
  };
}

/** 지급 회차와 무관하게 먼저 갖춰야 하는 값. */
export function payoutPrerequisiteBlockersOf(input: {
  kind: PayoutKind;
  org: string | null;
  unpriced: number;
  feeMissing: string[];
}): string[] {
  const blockers: string[] = [];
  if (input.unpriced > 0) blockers.push(`단가 미지정 ${input.unpriced}건 — 지급 금액 확정 불가`);
  if (!input.org) blockers.push('송금 대상 미지정');
  if (input.kind === '영업비' && input.feeMissing.length > 0) {
    blockers.push(`지급조건 서류 미달: ${input.feeMissing.join(' · ')}`);
  }
  return blockers;
}

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
 *
 * manualOnly — 사람이 적는 길(조정·회수)인가. 1차·2차 회차 금액은 정해져 있어
 * 수기로 못 적는다: 지급 확정(runPayoutBatch)이 계산해 넣는다.
 */
export function checkPayoutEntry(input: {
  kind: unknown; category: unknown; amount: unknown; at: unknown; note?: unknown;
}, opts: { manualOnly?: boolean } = {}): string | null {
  if (!PAYOUT_KINDS.includes(input.kind as PayoutKind)) return '구분(영업비/시공비)이 올바르지 않습니다.';
  const cat = CATEGORY_BY_KEY.get(input.category as PayoutCategory);
  if (!cat) return '명목이 올바르지 않습니다.';
  if (opts.manualOnly && !cat.manual) {
    return `${cat.key}은(는) 금액이 정해져 있어 손으로 적지 않습니다 — 지급 확정에서 기록됩니다.`;
  }
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

/**
 * 회차 진행 — 금액은 정해져 있고 사람은 「언제 줬는가」만 정한다.
 *
 * 지급할 총액 = 계획(단가×대수) + 조정. 1차 = 그 70%(끝수 포함), 2차 = 잔액.
 * covered(지급 합)가 1차 기준액을 넘으면 1차가 끝난 것이고, 총액을 넘으면 다 나간 것이다 —
 * 원장 전의 기록(선금·차액)이 있어도 문턱으로 세므로 이중 지급이 안 생긴다.
 */
export function payoutStepsOf(plan: number, adjust: number, paid: number): {
  /** 지급할 총액 = 계획 + 조정 */
  due: number;
  /** [1차, 2차] 기준액 — due 의 70/30, 끝수는 1차 */
  parts: [number, number];
  /** 지금 지급할 회차. null 이면 다 나갔거나(잔액 0·음수) 지급할 것이 없다. */
  open: { no: 1 | 2; amount: number } | null;
  step1Done: boolean;
  step2Done: boolean;
} {
  const due = plan + adjust;
  const [a, b] = due > 0 ? payInstallments(due) : [0, 0];
  const step1Done = due > 0 && paid >= a;
  const step2Done = due > 0 && paid >= due;
  let open: { no: 1 | 2; amount: number } | null = null;
  if (due > 0) {
    if (!step1Done) open = { no: 1, amount: a - paid };
    else if (!step2Done) open = { no: 2, amount: due - paid };
  }
  return { due, parts: [a, b], open, step1Done, step2Done };
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

/** 수금률 = 수금액 ÷ 계획총액 × 100 */
export function collectionRate(steps: SettlementStep[]): number | null {
  const plan = steps.reduce((s, x) => s + (x.planAmount ?? 0), 0);
  if (plan <= 0) return null;
  const got = steps
    .filter((x) => x.state === 'collected')
    .reduce((s, x) => s + (x.planAmount ?? 0), 0);
  return Math.round((got / plan) * 1000) / 10;
}

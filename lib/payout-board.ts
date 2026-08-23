/**
 * 협력사 지급관리 보드의 줄 — 현장 상세 하나에서 만든다.
 *
 * 예전에는 길이 둘이었다: 한백은 전 현장 요약(listSettlements)에서, 협력사는 현장마다
 * 상세를 다시 읽어서. 같은 것을 두 모양으로 조립하니 금액이 갈릴 자리가 있었고, 협력사
 * 경로의 N+1 이 화면을 죽였다(300초 타임아웃, 2026-08-21). 이제 저장소가 현장을 한 번
 * 읽고 이 함수를 부른다(listPayoutOverview → payoutPlansOf) — 한백도 협력사도 같은 길이다.
 *
 * 협력사에게 마진·남의 몫이 안 가는 것은 저장소가 지워서 준다(redactForViewer).
 */
import type {
  PayoutEntry, PayoutKind, PayoutMilestones, PayoutPlanRow, ProjectDetail,
} from '@/types/project';
import {
  payoutPrerequisiteBlockersOf, payoutReleaseOf, payoutSideOf, payoutStepsOf,
} from '@/lib/settlement';
import type { Visibility } from '@/lib/roles';

/**
 * 화면이 받는 지급 줄 — 도메인 타입(PayoutPlanRow)과 같다.
 * 저장소가 이 모양으로 만들어 주므로(listPayoutOverview) 여기서 다시 정의하지 않는다.
 */
export type PayoutRowInput = PayoutPlanRow;

/**
 * 협력사의 길 — 자기 현장 상세에서 보이는 쪽(vis)만 줄로 만든다.
 * 상세는 저장소가 이미 지워서 준 것이라, 여기서 다시 가릴 것은 없다 —
 * vis 는 「어느 쪽 줄을 만들 것인가」만 정한다.
 */
export function payoutsOfDetail(d: ProjectDetail, vis: Visibility): PayoutRowInput[] {
  const milestones: PayoutMilestones = {
    contractCompletedAt: d.project.contractConfirmedAt,
    installCompletedAt: d.process.installConfirmedAt,
    openedAt: d.process.openDoneAt,
  };
  const stepEntry = (kind: PayoutKind, cat: '1차' | '2차') =>
    d.payoutEntries.find((e: PayoutEntry) => e.kind === kind && e.category === cat) ?? null;

  const build = (kind: PayoutKind): PayoutRowInput => {
    const side = payoutSideOf(d.payoutEntries, kind);
    const unit = (l: ProjectDetail['lines'][number]) =>
      kind === '영업비' ? l.rule?.salesUnit ?? null : l.rule?.consUnit ?? null;
    return {
      key: `${d.project.id}|${kind}`,
      projectId: d.project.id,
      projectName: d.project.name,
      cpo: d.project.cpo,
      kind,
      org: kind === '영업비' ? d.project.salesOrg : d.project.gcOrg,
      plan: d.lines.reduce((n, l) => n + (unit(l) ?? 0) * l.qty, 0),
      adjust: side.adjust,
      confirmed: side.paid,
      // 자기 쪽 단가가 안 붙은 라인 — 요약의 unpricedLines 와 같은 말을 자기 쪽만 센다
      unpriced: d.lines.filter((l) => unit(l) === null).length,
      milestones,
      feeMissing: kind === '영업비' ? d.contract.feeMissing : [],
      step1At: stepEntry(kind, '1차')?.at ?? null,
      step2At: stepEntry(kind, '2차')?.at ?? null,
      step1EntryId: stepEntry(kind, '1차')?.id ?? null,
      step2EntryId: stepEntry(kind, '2차')?.id ?? null,
    };
  };

  const rows: PayoutRowInput[] = [];
  if (vis.sales) rows.push(build('영업비'));
  if (vis.cons) rows.push(build('시공비'));
  return rows;
}

// ── 지급 줄의 작업 상태 ────────────────────────────────────────────
/*
 * 지급관리 표(PayoutWorkBoard)에 있던 것을 옮겼다 — 거래명세서 화면(StatementsBoard)이
 * 「지급 가능」 풀을 같은 판정으로 모아야 한다. 계산이 두 벌이면 한쪽 화면에는 지급
 * 가능인데 다른 쪽에는 없는 줄이 생긴다.
 */

export type WorkState = '지급 가능' | '조건 대기' | '확정 완료';

export interface PayoutWork extends PayoutRowInput {
  state: WorkState;
  blockers: string[];
  open: { no: 1 | 2; amount: number } | null;
  due: number;
  step1Amount: number;
  step2Amount: number;
  step1Done: boolean;
  step2Done: boolean;
}

export function workOf(p: PayoutRowInput): PayoutWork {
  const steps = payoutStepsOf(p.plan, p.adjust, p.confirmed);
  const prerequisites = payoutPrerequisiteBlockersOf({
    kind: p.kind, org: p.org, unpriced: p.unpriced, feeMissing: p.feeMissing,
  });
  const stepFields = {
    due: steps.due,
    step1Amount: steps.parts[0],
    step2Amount: steps.parts[1],
    step1Done: steps.step1Done,
    step2Done: steps.step2Done,
  };

  if (p.unpriced > 0) {
    return { ...p, ...stepFields, state: '조건 대기', blockers: prerequisites, open: null };
  }
  if (!steps.open) {
    return { ...p, ...stepFields, state: '확정 완료', blockers: [], open: null };
  }

  const release = payoutReleaseOf(p.kind, steps.open.no, p.milestones);
  const blockers = [...prerequisites];
  if (!release.met) blockers.push(`${release.trigger} 대기`);

  return {
    ...p,
    ...stepFields,
    state: blockers.length > 0 ? '조건 대기' : '지급 가능',
    blockers,
    open: steps.open,
  };
}

/** 지급일 후보 — 트리거 충족일의 익월 10일·25일 (지급 규칙, 한백 확인) */
export function payDateChoices(metAt: string): [string, string] {
  const [y, m] = metAt.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const mm = String(m === 12 ? 1 : m + 1).padStart(2, '0');
  return [`${ny}-${mm}-10`, `${ny}-${mm}-25`];
}

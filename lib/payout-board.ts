/**
 * 협력사 지급관리 보드의 줄 — 두 길에서 온다.
 *
 * 한백은 전 현장 요약(listSettlements)에서, 협력사는 자기 현장 상세(getProject —
 * 저장소가 redactForViewer 로 지워서 준 것)에서 만든다. 협력사에게 요약을 열면
 * 마진과 남의 몫이 통째로 브라우저에 실리므로, 요약은 한백 전용으로 두고
 * 조립만 여기서 가른다. 두 길의 결과 모양(PayoutRowInput)은 하나다.
 */
import type {
  PayoutEntry, PayoutKind, PayoutMilestones, ProjectDetail, SettlementSummary,
} from '@/types/project';
import { payoutSideOf } from '@/lib/settlement';
import type { Visibility } from '@/lib/roles';

export interface PayoutRowInput {
  key: string;
  projectId: string;
  projectName: string;
  cpo: string;
  kind: PayoutKind;
  org: string | null;
  plan: number;
  adjust: number;
  confirmed: number;
  unpriced: number;
  milestones: PayoutMilestones;
  feeMissing: string[];
  /** 회차 지급 기록의 지급일 — 원장에서 유도 */
  step1At: string | null;
  step2At: string | null;
}

/** 한백의 길 — 전 현장 요약에서 영업비·시공비 두 줄씩 */
export function payoutsOfSummaries(rows: SettlementSummary[]): PayoutRowInput[] {
  return rows.flatMap((r) => [
    {
      key: `${r.id}|영업비`, projectId: r.id, projectName: r.name, cpo: r.cpo,
      kind: '영업비' as const, org: r.salesOrg, plan: r.salesTotal,
      adjust: r.salesAdjust, confirmed: r.salesPaid,
      unpriced: r.unpricedLines, milestones: r.payoutMilestones,
      feeMissing: r.salesFeeMissing,
      step1At: r.salesStep1At, step2At: r.salesStep2At,
    },
    {
      key: `${r.id}|시공비`, projectId: r.id, projectName: r.name, cpo: r.cpo,
      kind: '시공비' as const, org: r.gcOrg, plan: r.consTotal,
      adjust: r.consAdjust, confirmed: r.consPaid,
      unpriced: r.unpricedLines, milestones: r.payoutMilestones,
      feeMissing: [],
      step1At: r.consStep1At, step2At: r.consStep2At,
    },
  ]);
}

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
  const stepAt = (kind: PayoutKind, cat: '1차' | '2차') =>
    d.payoutEntries.find((e: PayoutEntry) => e.kind === kind && e.category === cat)?.at ?? null;

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
      step1At: stepAt(kind, '1차'),
      step2At: stepAt(kind, '2차'),
    };
  };

  const rows: PayoutRowInput[] = [];
  if (vis.sales) rows.push(build('영업비'));
  if (vis.cons) rows.push(build('시공비'));
  return rows;
}

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
import { payoutSideOf } from '@/lib/settlement';
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

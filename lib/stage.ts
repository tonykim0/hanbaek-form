/**
 * 현장이 어느 단계에 있는지 판정한다.
 * 저장된 값이 아니라 데이터에서 유도한다 — 단계 필드를 따로 두면 실제와 어긋난다.
 */
import type { ContractLine, Settlement, Stage } from '@/types/project';
import { evaluateDocs, type DocContext } from '@/lib/doc-rules';
import type { ProjectDocument } from '@/types/project';

/**
 * 한백이 확인만 하면 되는 상태인가 — 서류가 다 찼고 반려가 없고 단가가 붙었는가.
 *
 * 검수는 「예외를 걸러내는」 방식이다. 올라온 서류를 하나하나 승인하게 만들면 현장 138건 ×
 * 서류 16칸 = 2천 번을 눌러야 한다. 실제 일은 반대로 돈다 — 묶음을 훑어보고 문제 있는 것만
 * 반려한다. 그래서 통과 조건은 「승인됨」이 아니라 「제출됨 + 반려 없음」이다.
 * 미제출은 여전히 막는다. 없는 서류는 반려할 대상조차 없기 때문이다.
 *
 * ★반려는 필수 여부를 가리지 않는다.★ 조건부·선택 서류가 반려됐어도 계약은 못 넘어간다 —
 * 반려는 「이 계약은 아직 아니다」는 판정이고, 그 판정이 남아 있는 계약을 넘기면
 * 보드의 「계약보완」 칸과 실제가 어긋난다.
 */
export function contractReady(input: {
  docCtx: DocContext;
  documents: ProjectDocument[];
  lines: ContractLine[];
}): boolean {
  if (input.documents.some((d) => d.status === 'rejected')) return false;

  const required = evaluateDocs(input.docCtx).filter((d) => d.req === 'm');
  const byKind = new Map(input.documents.map((d) => [d.kind, d]));
  const docsDone = required.every((r) => {
    const st = byKind.get(r.key)?.status;
    return st === 'uploaded' || st === 'approved';
  });
  const allPriced = input.lines.length > 0 && input.lines.every((l) => l.pricingRuleId);
  return docsDone && allPriced;
}

export function deriveStage(input: {
  docCtx: DocContext;
  documents: ProjectDocument[];
  lines: ContractLine[];
  settlement: Settlement;
  /**
   * 한백이 계약을 확인했는가.
   *
   * 서류·단가가 다 차도 이것 없이는 계약을 넘기지 않는다 — 협력사가 낸 것을 사람이
   * 한 번 훑어보는 자리다. 예전에는 조건이 채워지는 순간 저절로 넘어갔는데,
   * 그러면 한백이 보기 전에 시공으로 가 있고 「누가 확인한 계약인가」에 답할 수 없다.
   */
  contractConfirmedAt: string | null;
}): Stage {
  const collected = input.settlement.steps.some((s) => s.state === 'collected');
  if (collected || input.settlement.cpoCloseDate) return 'settlement';

  return contractReady(input) && Boolean(input.contractConfirmedAt) ? 'construction' : 'intake';
}

/** 마지막 진척 후 경과일. 노션엔 없는 지표 — 공정·정산 relation 이 끊겨 계산이 안 된다. */
export function stalledDaysSince(lastProgressAt: string, now = new Date()): number {
  const then = new Date(lastProgressAt + 'T00:00:00Z').getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((today - then) / 86400000));
}

export const STAGE_LABEL: Record<Stage, string> = {
  // 콘솔에서 부르는 이름은 「계약」이다. 협력사가 쓰는 포털의 「접수」와 구분한다 —
  // 포털은 서류를 넣는 행위이고, 콘솔은 그 계약이 어디까지 왔는지를 본다.
  intake: '계약',
  construction: '시공',
  settlement: '정산',
};

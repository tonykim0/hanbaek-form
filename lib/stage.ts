/**
 * 현장이 어느 단계에 있는지 판정한다.
 * 저장된 값이 아니라 데이터에서 유도한다 — 단계 필드를 따로 두면 실제와 어긋난다.
 */
import type { ContractLine, Settlement, Stage } from '@/types/project';
import { evaluateDocs, type DocContext } from '@/lib/doc-rules';
import type { ProjectDocument } from '@/types/project';

export function deriveStage(input: {
  docCtx: DocContext;
  documents: ProjectDocument[];
  lines: ContractLine[];
  settlement: Settlement;
}): Stage {
  const collected = input.settlement.steps.some((s) => s.state === 'collected');
  if (collected || input.settlement.cpoCloseDate) return 'settlement';

  const required = evaluateDocs(input.docCtx).filter((d) => d.req === 'm');
  const byKind = new Map(input.documents.map((d) => [d.kind, d]));
  /*
   * 검수는 「예외를 걸러내는」 방식이다.
   *
   * 올라온 서류를 하나하나 승인하게 만들면 현장 138건 × 서류 16칸 = 2천 번을 눌러야 한다.
   * 실제 일은 반대로 돈다 — 묶음을 훑어보고 문제 있는 것만 반려한다.
   * 그래서 통과 조건은 「승인됨」이 아니라 「제출됨 + 반려 없음」이다.
   *
   * 미제출은 여전히 막는다. 없는 서류는 반려할 대상조차 없기 때문이다.
   */
  const docsDone = required.every((r) => {
    const st = byKind.get(r.key)?.status;
    return st === 'uploaded' || st === 'approved';
  });
  const allPriced = input.lines.length > 0 && input.lines.every((l) => l.pricingRuleId);

  return docsDone && allPriced ? 'construction' : 'intake';
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

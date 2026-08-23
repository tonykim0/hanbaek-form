/**
 * 현장이 어느 단계에 있는지 판정한다.
 * 저장된 값이 아니라 데이터에서 유도한다 — 단계 필드를 따로 두면 실제와 어긋난다.
 */
import type { ContractLine, ContractState, Settlement, Stage } from '@/types/project';
import { evaluateDocs, type DocContext } from '@/lib/doc-rules';
import { daysSince } from '@/lib/date';
import type { ProjectDocument } from '@/types/project';

/**
 * 계약이 어디까지 왔고 무엇에 막혀 있는가 — 한 번 계산해서 화면·보드·저장소가 같이 본다.
 *
 * ★한 곳에 모은 이유★
 * 예전에는 이 판정이 세 벌이었다. lib 에 「확인만 남았는가」가 있고, 현장 상세가
 * required.every(...) 로 다시 세고, 보드 요약이 또 자기 식으로 셌다. 조건을 하나 바꾸면
 * (반려를 필수 여부와 무관하게 보기로 한 것이 그랬다) 세 곳이 갈려서 「버튼은 눌리는데
 * 저장이 거절되는」 상태가 생긴다.
 *
 * 검수는 「예외를 걸러내는」 방식이다. 올라온 서류를 하나하나 승인하게 만들면 현장 138건 ×
 * 서류 16칸 = 2천 번을 눌러야 한다. 실제 일은 반대로 돈다 — 묶음을 훑어보고 문제 있는 것만
 * 반려한다. 그래서 통과 조건은 「승인됨」이 아니라 「제출됨 + 반려 없음」이다.
 * 미제출은 여전히 막는다. 없는 서류는 반려할 대상조차 없기 때문이다.
 */
export function contractStateOf(input: {
  docCtx: DocContext;
  documents: ProjectDocument[];
  lines: Array<Pick<ContractLine, 'pricingRuleId'>>;
}): ContractState {
  const evaluated = evaluateDocs(input.docCtx);
  const byKind = new Map(input.documents.map((d) => [d.kind, d]));
  const passes = (kind: string) => {
    const st = byKind.get(kind)?.status;
    return st === 'uploaded' || st === 'approved';
  };

  const required = evaluated.filter((d) => d.req === 'm');
  const satisfied = required.filter((d) => passes(d.key)).length;
  const docsFilled = required.every((d) => (byKind.get(d.key)?.status ?? 'none') !== 'none');
  const rejected = input.documents.filter((d) => d.status === 'rejected').length;
  const allPriced = input.lines.length > 0 && input.lines.every((l) => l.pricingRuleId);

  return {
    requiredTotal: required.length,
    satisfied,
    docsFilled,
    rejected,
    allPriced,
    ready: rejected === 0 && satisfied === required.length && allPriced,
    feeMissing: evaluated.filter((d) => d.fee && d.req === 'm' && !passes(d.key)).map((d) => d.label),
  };
}

export function deriveStage(input: {
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

  /*
   * ★확인이 곧 계약의 끝이다 — 서류를 다시 묻지 않는다.★
   *
   * 예전에는 ready(서류 다 참 + 반려 없음 + 단가)와 확인을 둘 다 물었다. 서류 조건은
   * 확인해 주는 순간(confirmContract)이 이미 지키고, 반려는 확인을 지운다(pg-store) —
   * 그러니 여기서 또 물으면 같은 문을 두 번 잠그는 것인데, 그 두 번째 자물쇠가
   * 이관 현장을 전부 계약접수로 되돌렸다: 노션에서 온 현장은 확인일은 있지만 서류
   * 파일이 콘솔에 없다(서류는 이관하지 않았다). 확인은 사람이 내린 판정의 기록이고,
   * 기록이 있으면 유도는 그것을 믿는다 (실사고: 전주태평에스케이뷰, 2026-08-25).
   */
  return input.contractConfirmedAt !== null ? 'construction' : 'intake';
}

/**
 * 마지막 진척 후 경과일.
 *
 * 저장된 날짜가 한국 달력이므로 오늘도 한국 달력으로 센다(lib/date). 예전에는 오늘만
 * UTC 로 세서 한국 시간 오전 9시 전에는 경과일이 하루 적게 나왔다.
 */
export const stalledDaysSince = daysSince;

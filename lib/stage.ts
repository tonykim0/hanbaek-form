/**
 * 현장이 어느 단계에 있는지 판정한다.
 * 저장된 값이 아니라 데이터에서 유도한다 — 단계 필드를 따로 두면 실제와 어긋난다.
 */
import type { ContractLine, ContractState, Settlement, Stage } from '@/types/project';
import { evaluateDocs, type DocContext } from '@/lib/doc-rules';
import { daysSince } from '@/lib/date';
import type { ProjectDocument } from '@/types/project';

/**
 * 필수 서류가 콘솔 밖에 있는 현장인가 — 노션 이관분.
 *
 * mgmt_no 가 숫자면 노션 번호다(콘솔 접수분은 HB-*). migrations/0016·0019 와 같은 겨냥이다.
 * 이관은 서류 파일을 옮기지 않았다 — scripts/import-notion-2026.ts 에 insert(documents) 가
 * 없다. 그 현장의 계약서·회의록·사진대지는 노션에 있다.
 */
export function docsOutsideConsole(mgmtNo: string | null | undefined): boolean {
  return /^\d+$/.test(mgmtNo?.trim() ?? '');
}

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
  /**
   * 서류 조건을 묻지 않는다 — 노션 이관분(docsOutsideConsole).
   *
   * ★있을 수 없는 증거를 요구하면 문이 아니라 벽이다.★ 이관 현장의 필수 서류는 콘솔에
   * 0건이라 satisfied 가 영원히 requiredTotal 에 못 닿는다. 그 상태로 확인을 막으면
   * 계약검토가 막다른 골목이 된다(실사고 2026-08-25 — migrations/0019 가 확인일을 비운 뒤
   * 이관 현장 전부가 그 자리에 갇혔다).
   *
   * 면제는 서류 조건 하나뿐이다. 반려와 단가는 그대로 본다 — 반려는 콘솔에서 생기는
   * 일이고, 단가는 이관이 붙여 준 값이라 둘 다 물을 수 있는 조건이다.
   *
   * 셈은 정직하게 남긴다(satisfied·docsFilled 를 부풀리지 않는다) — 화면이 「11건 중 0건」을
   * 그대로 보여야 무엇이 콘솔에 없는지 알 수 있다.
   */
  docsExempt?: boolean;
}): ContractState {
  const evaluated = evaluateDocs(input.docCtx);
  const byKind = new Map(input.documents.map((d) => [d.kind, d]));
  const passes = (kind: string) => {
    const st = byKind.get(kind)?.status;
    return st === 'uploaded' || st === 'approved';
  };

  const required = evaluated.filter((d) => d.req === 'm');
  const satisfied = required.filter((d) => passes(d.key)).length;
  /*
   * 칸이 찼다 = ★파일이 있다★. 상태로 세지 않는다.
   *
   * 예전에는 status !== 'none' 으로 셌다. 그런데 「누락 서류 보완요청」이 생기면서
   * (한백 지시 2026-08-25) 파일이 없는데 status='rejected' 인 칸이 있다 — 제출을
   * 기다리는 칸이다. 상태로 세면 그 칸이 「찼다」로 잡혀서, 아무것도 올리지 않은
   * 협력사가 「계약서 접수하기」를 누를 수 있게 된다.
   */
  const filesMissing = required.filter((d) => !byKind.get(d.key)?.blobUrl).length;
  const docsFilled = filesMissing === 0;
  const allPriced = input.lines.length > 0 && input.lines.every((l) => l.pricingRuleId);

  const docsExempt = input.docsExempt === true;
  /*
   * 반려는 건수가 아니라 ★막힌 칸의 수★다. 기설치 조사 반려를 따로 세던 자리가
   * 있었는데(2026-08-26), 그 문을 걷고 기설치 두 칸의 반려로 합쳤다(2026-09-03) —
   * 이제 전부 documents 에 있어서 한 줄로 센다.
   */
  const rejected = input.documents.filter((d) => d.status === 'rejected').length;
  /*
   * 그중 ★파일이 한 장도 없는 칸★ — 「누락 서류 보완요청」이 세운 자리다(한백 지시 2026-08-25).
   *
   * 협력사가 할 일이 다르다: 낸 것을 돌려받았으면 고쳐서 다시 내고, 안 낸 것이면 그냥 낸다.
   * 한 말로 부르면(「반려 N건 보완」) 아무것도 낸 적 없는 협력사가 「내가 낸 걸 왜 반려했지」로
   * 읽는다. 실측 2026-09-04: 계약보완 68건 중 46건이 이쪽이었다.
   */
  const rejectedEmpty = input.documents.filter(
    (d) => d.status === 'rejected' && !d.blobUrl
  ).length;

  return {
    requiredTotal: required.length,
    satisfied,
    filesMissing,
    docsFilled,
    rejected,
    rejectedEmpty,
    allPriced,
    docsExempt,
    ready: rejected === 0 && (docsExempt || satisfied === required.length) && allPriced,
    /*
     * ★지급조건은 「모든 필수 서류」다★ (한백 정정 2026-08-31 「사전현장컨설팅
     * 결과서·실사보고서 뿐만 아니라 모든 필수서류가 올라오지 않으면 지급조건이 안 돼」).
     *
     * 전에는 doc-rules 의 `fee` 표시가 붙은 두 장만 봤다 — 그래서 계약서가 비어 있어도
     * 「지급 가능」으로 섰다. 돈이 잘못 나갈 수 있는 구멍이었다.
     *
     * ★이관 현장은 면제한다★ (한백 결정 2026-08-31). 계약 확인이 이미 같은 이유로
     * 면제하고 있다(위 docsExempt 주석) — 이관분의 서류는 노션·파일에 있고 콘솔에는
     * 0건이다. 지급만 다르게 판정하면 같은 현장을 계약은 「조건 충족」, 지급은
     * 「서류 미달」로 불러 두 화면이 서로 다른 말을 한다. 프로덕션 실측(2026-08-31):
     * 이 사유로 막힌 110줄이 전부 이관 현장이었고 콘솔 접수 현장은 0건이었다.
     *
     * 콘솔로 접수한 현장은 접수가 이미 필수 서류를 강제하므로 평소엔 안 걸린다.
     * 그래도 두는 이유는 접수 뒤에 생기는 일 때문이다 — 파일을 빼면 미제출로 돌아가고
     * (deleteDocumentFile), 반려된 칸은 passes 를 통과하지 못한다.
     */
    payoutDocsMissing: docsExempt
      ? []
      : evaluated.filter((d) => d.req === 'm' && !passes(d.key)).map((d) => d.label),
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

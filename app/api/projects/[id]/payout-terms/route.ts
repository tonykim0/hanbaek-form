/**
 * POST /api/projects/[id]/payout-terms — 지급조건 확정·해제 [한백 전용]
 *
 * 확정하면 단가 케이스와 정산 규칙을 못 바꾼다. 그 둘이 계획·잔액·기성·마진을 전부
 * 정하기 때문이다 — 중간에 갈아 끼우면 이미 나간 지급과 앞으로 받을 기성이 같이 뒤틀린다.
 *
 * 해제도 같은 자리에서 받는다(화면 규칙 7) — 확정 뒤에 진짜 오류가 드러나는 일이 있다.
 * 확정할 수 있는지(단가·정산 규칙)는 저장소가 본다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { confirmed?: unknown }>(
  '한백 관리자만 지급조건을 확정할 수 있습니다.',
  async ({ body, params, actor }) => {
    const v = body?.confirmed;
    if (typeof v !== 'boolean') throw new BadRequest('확정 여부가 올바르지 않습니다.');
    await getRepository().setPayoutTermsConfirmed(params.id, v, actor);
  }
);

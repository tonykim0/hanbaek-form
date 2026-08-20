/**
 * POST /api/projects/[id]/contract-confirm — 계약 확인 · 확인 취소
 *
 * 협력사가 낸 것을 한백이 훑어보고 누르는 자리다. 이것이 있어야 계약이 넘어간다 —
 * 서류가 다 차고 단가가 붙어도 사람이 확인하기 전에는 계약검토에 남는다(lib/stage.ts).
 *
 * 조건 확인은 여기서 하지 않는다. 저장소가 contractStateFor 로 다시 보고 거절한다 —
 * 조건을 두 곳에 쓰면 「버튼은 눌리는데 저장이 거절되는」 상태가 생긴다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { confirmed?: unknown }>(
  '한백 관리자만 계약을 확인할 수 있습니다.',
  async ({ body, params, actor }) => {
    if (typeof body.confirmed !== 'boolean') throw new BadRequest('confirmed 가 필요합니다.');
    await getRepository().confirmContract(params.id, body.confirmed, actor);
  }
);

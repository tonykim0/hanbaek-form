/**
 * POST /api/projects/[id]/contract-submit — 계약서 접수 · 접수 취소
 *
 * 협력사가 서류를 다 올리고 「계약서 접수하기」를 누르는 자리다. 이것이 계약접수와
 * 계약검토를 가른다(lib/board.ts) — 서류 칸이 차는 것만으로 넘기면 협력사가 아직
 * 고치는 중인 것이 한백의 검토 칸에 선다(한백 지시 2026-08-24).
 *
 * 조건 확인은 여기서 하지 않는다. 저장소가 contractStateFor 로 다시 보고 거절한다 —
 * 조건을 두 곳에 쓰면 「버튼은 눌리는데 저장이 거절되는」 상태가 생긴다.
 */
import { getRepository } from '@/lib/data';
import { sessionWrite, BadRequest } from '@/lib/api/write-route';

export const POST = sessionWrite<{ id: string }, { submitted?: unknown }>(
  async ({ body, params, actor }) => {
    if (typeof body.submitted !== 'boolean') throw new BadRequest('submitted 가 필요합니다.');
    await getRepository().submitContract(params.id, body.submitted, actor);
  }
);

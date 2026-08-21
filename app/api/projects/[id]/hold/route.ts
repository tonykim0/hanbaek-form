/**
 * POST /api/projects/[id]/hold — 현장을 멈추거나(보류·계약중단) 다시 돌린다
 *
 * 계약하다 무산되는 현장이 실제로 있다 — 지우지 않고 보드 끝 칸(계약중단)에 세워
 * 기록으로 남긴다. 세울 때는 사유가 필수다(저장소가 본다). state: null 은 재개다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { HOLD_STATES, type HoldState } from '@/types/project';

export const POST = adminWrite<{ id: string }, { state?: unknown; note?: unknown }>(
  '한백 관리자만 멈출 수 있습니다.',
  async ({ body, params, actor }) => {
    const state = body.state;
    if (state === null) {
      await getRepository().setHold(params.id, null, actor);
      return;
    }
    if (!HOLD_STATES.includes(state as HoldState)) {
      throw new BadRequest('state 는 보류 · 계약중단 · null(재개) 중 하나여야 합니다.');
    }
    if (typeof body.note !== 'string') throw new BadRequest('사유를 입력하세요.');
    await getRepository().setHold(
      params.id,
      { state: state as HoldState, note: body.note },
      actor
    );
  }
);

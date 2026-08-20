/**
 * POST /api/projects/[id]/status — 공정 진행 단계 옮기기
 *
 * 보드에서 카드를 끌어다 놓으면 이 경로로 온다.
 * 넘어갈 수 있는지는 여기서 판단하지 않는다 — 조건은 lib/process.ts 한 곳에 있고
 * 저장소가 확인한다(422). 여기서 하는 일은 값 검사뿐이다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { PROCESS_STATUSES } from '@/types/project';

export const POST = adminWrite<{ id: string }, { status?: string }>(
  '한백 관리자만 옮길 수 있습니다.',
  async ({ body, params, actor }) => {
    const status = PROCESS_STATUSES.find((s) => s === body.status);
    if (!status) {
      throw new BadRequest(`status 는 ${PROCESS_STATUSES.join(' · ')} 중 하나여야 합니다.`);
    }
    await getRepository().setProcessStatus(params.id, status, actor);
  }
);

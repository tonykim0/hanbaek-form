/**
 * POST /api/projects/[id]/court — 담당 넘기기
 *
 * 단계(stage)는 서류·단가·계약 확인에서 유도되므로 저장하지 않는다 —
 * 여기서 움직이는 것은 「지금 누가 손을 대야 하는가」뿐이다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import type { Court } from '@/types/project';

const COURTS: Court[] = ['한백', '영업사', '시공사', '운영사'];

export const POST = adminWrite<{ id: string }, { court?: string }>(
  '한백 관리자만 바꿀 수 있습니다.',
  async ({ body, params, actor }) => {
    const court = COURTS.find((c) => c === body.court);
    if (!court) throw new BadRequest(`court 는 ${COURTS.join(' · ')} 중 하나여야 합니다.`);
    await getRepository().setCourt(params.id, court, actor);
  }
);

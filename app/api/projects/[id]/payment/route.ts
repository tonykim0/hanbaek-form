/**
 * PATCH /api/projects/[id]/payment — 지급 비고 저장
 *
 * 지급일 4칸(영업 1·2차, 시공 1·2차)은 원장으로 옮겼다 — /api/projects/[id]/payouts.
 * 여기 남은 것은 금액만으로 설명되지 않는 사정을 적는 비고뿐이다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const PATCH = adminWrite<{ id: string }, { payNote?: unknown }>(
  '한백 관리자만 저장할 수 있습니다.',
  async ({ body, params, actor }) => {
    if (!body || !('payNote' in body)) throw new BadRequest('바꿀 값이 없습니다.');
    const v = body.payNote;
    if (v !== null && typeof v !== 'string') throw new BadRequest('비고는 문자열이어야 합니다.');
    await getRepository().setPayment(
      params.id,
      { payNote: typeof v === 'string' && v.trim() ? v.trim() : null },
      actor
    );
  }
);

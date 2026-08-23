/**
 * PATCH /api/statements/batch — 배치의 지급일을 옮긴다. [한백 전용]
 *
 * 배치의 지급 줄 전부와 붙어 있는 세금계산서가 한 트랜잭션으로 같이 옮겨진다
 * (pg-store movePayoutBatch). 항목 하나만 빼는 것은 여기가 아니라 원장 삭제다
 * (DELETE /api/projects/[id]/payouts) — 빠진 회차는 지급 가능 풀로 돌아간다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { PAYOUT_KINDS, type PayoutKind } from '@/types/project';

export const PATCH = adminWrite<
  Record<string, never>,
  { org?: unknown; kind?: unknown; from?: unknown; to?: unknown }
>('한백 관리자만 지급일을 바꿀 수 있습니다.', async ({ body, actor }) => {
  if (typeof body?.org !== 'string' || !body.org.trim()) throw new BadRequest('지급처가 없습니다.');
  if (!PAYOUT_KINDS.includes(body.kind as PayoutKind)) {
    throw new BadRequest('구분(영업비/시공비)이 없습니다.');
  }
  if (typeof body.from !== 'string' || typeof body.to !== 'string') {
    throw new BadRequest('지급일이 올바르지 않습니다.');
  }
  return getRepository().movePayoutBatch(body.org.trim(), body.kind as PayoutKind, body.from, body.to, actor);
});

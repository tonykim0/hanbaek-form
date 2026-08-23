/**
 * POST /api/statements/finalize — 배치 최종 확정·해제. [한백 전용]
 *
 * 가확정 배치의 합계로 협력사가 세금계산서를 발행하고, 첨부된 것을 눈으로 확인한 뒤
 * 여기서 확정한다. 확정되면 배치가 잠긴다 — 빼기·지급일 변경·계산서 교체가 전부 막히고,
 * 풀려면 undo 로 해제부터 한다(넣는 자리를 만들면 되돌리는 자리도 만든다).
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { PAYOUT_KINDS, type PayoutKind } from '@/types/project';

export const POST = adminWrite<
  Record<string, never>,
  { org?: unknown; kind?: unknown; payDate?: unknown; undo?: unknown }
>('한백 관리자만 배치를 확정할 수 있습니다.', async ({ body, actor }) => {
  if (typeof body?.org !== 'string' || !body.org.trim()) throw new BadRequest('지급처가 없습니다.');
  if (!PAYOUT_KINDS.includes(body.kind as PayoutKind)) {
    throw new BadRequest('구분(영업비/시공비)이 없습니다.');
  }
  if (typeof body.payDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.payDate)) {
    throw new BadRequest('지급일이 올바르지 않습니다.');
  }
  await getRepository().finalizeBatch(
    body.org.trim(), body.kind as PayoutKind, body.payDate, body.undo === true, actor
  );
});

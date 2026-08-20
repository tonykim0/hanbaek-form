/**
 * PATCH /api/projects/[id]/lines/[lineId] — 계약 라인에 단가 케이스 지정
 *
 * 지급액은 저장하지 않는다. 케이스가 불변이라 참조만 남기면 조회할 때 늘 같은 값이 나온다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';

export const PATCH = adminWrite<
  { id: string; lineId: string },
  { pricingRuleId?: string | null }
>('한백 관리자만 단가를 지정할 수 있습니다.', async ({ body, params, actor }) => {
  await getRepository().setLinePricing(params.lineId, body.pricingRuleId?.trim() || null, actor);
});

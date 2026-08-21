/**
 * POST /api/projects/[id]/settlement-rule — 현장별 정산 규칙 적용 [한백 전용]
 *
 * 단가 케이스의 제안값(defaultSettlementRuleId)은 현장에 규칙이 없을 때 한 번만 들어온다.
 * 제안이 틀렸거나 제안값이 없던 현장을 여기서 고친다.
 *
 * 빈 값·null 은 「미지정으로 되돌린다」 — 잘못 적용한 규칙을 되돌릴 길이 있어야 한다.
 * 규칙이 실제로 있는지·중지되지 않았는지는 저장소가 확인한다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { ruleId?: unknown }>(
  '한백 관리자만 정산 규칙을 적용할 수 있습니다.',
  async ({ body, params, actor }) => {
    const raw = body?.ruleId;
    if (raw !== null && typeof raw !== 'string') {
      throw new BadRequest('정산 규칙이 올바르지 않습니다.');
    }
    const ruleId = raw === null || raw.trim() === '' ? null : raw.trim();
    await getRepository().setSettlementRule(params.id, ruleId, actor);
  }
);

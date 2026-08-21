/**
 * POST /api/payouts — 회차 지급 확정 [한백 전용]
 *
 * 「8월 영업비를 한꺼번에」가 이 호출 하나다: 항목(현장 × 구분) 여러 개, 지급일 하나.
 * ★금액은 받지 않는다★ — 1차 70% / 2차 잔액은 정해져 있어 저장소가 계산해 넣는다.
 * 전부 되거나 전부 안 된다. 실패 문구가 어느 현장의 어느 회차인지 말한다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { PAYOUT_KINDS, type PayoutKind } from '@/types/project';

export const POST = adminWrite<
  Record<string, never>,
  { at?: unknown; items?: unknown }
>('한백 관리자만 지급을 확정할 수 있습니다.', async ({ body, actor }) => {
  if (typeof body?.at !== 'string') throw new BadRequest('지급일이 없습니다.');
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new BadRequest('지급할 항목이 없습니다.');
  }
  const items = body.items.map((raw) => {
    const it = raw as { projectId?: unknown; kind?: unknown };
    if (typeof it?.projectId !== 'string' || !PAYOUT_KINDS.includes(it.kind as PayoutKind)) {
      throw new BadRequest('항목이 올바르지 않습니다.');
    }
    return { projectId: it.projectId, kind: it.kind as PayoutKind };
  });
  return getRepository().runPayoutBatch(items, body.at, actor);
});

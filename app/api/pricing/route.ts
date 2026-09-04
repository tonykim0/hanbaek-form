/**
 * POST  /api/pricing — 단가 케이스 추가 [한백 전용]
 * PUT   /api/pricing — 케이스 통째 수정 [한백 전용] — 참조하는 라인이 없을 때만
 * PATCH /api/pricing — 사용/중지 또는 적용 시작·비고 수정 [한백 전용]
 *
 * 참조된 케이스는 불변이다 — 계약 라인이 금액을 복사하지 않고 참조하므로 금액을 고치면
 * 이미 지정된 현장의 지급액이 소급해서 바뀐다. 그때는 개정(새 케이스 + 옛 것 중지)이고,
 * PUT 은 저장소가 참조 유무를 보고 거절한다. 잘못 넣은 값을 붙이기 전에 바로잡는 길이다.
 *
 * 지우는 길은 없다. 참조하는 라인이 있으면 지급액을 계산할 수 없게 된다.
 *
 * 값 검사는 저장소가 한다(checkPricingRule) — 화면과 여기가 같은 규칙을 봐야 한다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import type { NewPricingRule } from '@/types/project';

type Params = Record<string, never>;

export const POST = adminWrite<Params, NewPricingRule>(
  '한백 관리자만 단가 케이스를 넣을 수 있습니다.',
  async ({ body, actor }) => {
    if (!body) throw new BadRequest('넣을 값이 없습니다.');
    return { id: await getRepository().addPricingRule(body, actor) };
  }
);

export const PUT = adminWrite<Params, NewPricingRule & { id?: string }>(
  '한백 관리자만 단가 케이스를 고칠 수 있습니다.',
  async ({ body, actor }) => {
    if (!body?.id) throw new BadRequest('어느 케이스인지 알 수 없습니다.');
    const { id, ...input } = body;
    await getRepository().updatePricingRule(id, input, actor);
  }
);

export const PATCH = adminWrite<
  Params,
  { id?: string; active?: unknown; startDate?: unknown; note?: unknown }
>('한백 관리자만 단가 케이스를 바꿀 수 있습니다.', async ({ body, actor }) => {
  if (!body?.id) throw new BadRequest('어느 케이스인지 알 수 없습니다.');

  if (typeof body.active === 'boolean') {
    await getRepository().setPricingRuleActive(body.id, body.active, actor);
    return;
  }

  // 적용 시작·비고만 고칠 수 있다 — 금액·축은 불변이라 PATCH 에 자리도 없다
  const patch: { startDate?: string; note?: string | null } = {};
  if (body.startDate !== undefined) {
    if (typeof body.startDate !== 'string') throw new BadRequest('적용 시작이 올바르지 않습니다.');
    patch.startDate = body.startDate;
  }
  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== 'string') throw new BadRequest('비고가 올바르지 않습니다.');
    patch.note = body.note;
  }
  if (Object.keys(patch).length === 0) throw new BadRequest('바꿀 값이 없습니다.');
  await getRepository().setPricingRuleMeta(body.id, patch, actor);
});

/**
 * DELETE /api/pricing — 단가 케이스 삭제 [한백 전용]
 *
 * 참조가 하나라도 있으면 저장소가 거절한다(422) — 그 길은 개정·중지다.
 * 잘못 만든 케이스를 걷는 자리다(한백 지시 2026-09-04).
 */
export const DELETE = adminWrite<Params, { id?: string }>(
  '한백 관리자만 지울 수 있습니다.',
  async ({ body, actor }) => {
    if (!body?.id) throw new BadRequest('id 가 필요합니다.');
    await getRepository().deletePricingRule(body.id, actor);
  }
);

/**
 * POST /api/projects/[id]/name — 현장명 변경
 *
 * 접수 때 협력사가 적는 값이라 오타가 흔한데 고칠 길이 없었다(화면 규칙 7).
 * 협력사가 현장을 보는 판정과는 무관하다(그건 salesOrg·gcOrg) — 이름은 표시용이다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { value?: unknown }>(
  '한백 관리자만 바꿀 수 있습니다.',
  async ({ body, params, actor }) => {
    if (typeof body.value !== 'string' || !body.value.trim()) {
      throw new BadRequest('현장명을 입력하세요.');
    }
    if (body.value.trim().length > 80) throw new BadRequest('현장명이 너무 깁니다.');
    await getRepository().setProjectName(params.id, body.value, actor);
  }
);

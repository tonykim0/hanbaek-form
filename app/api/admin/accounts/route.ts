/**
 * 계정 만들기 · 사용 중지 — 한백 관리자 전용.
 *
 *   POST                          새 계정
 *   PATCH  { active }             사용 중지·재개
 *   PATCH  { password }           비밀번호 재설정 — 해시만 저장해서 되찾는 길은 없다
 *   PATCH  { role|org|name }      구분·소속·이름 고치기
 *
 * 관리자 계정은 여기서 만들 수 없고, 여기로 올릴 수도 없다. 화면에서 만들 수 있게 두면
 * 실수 한 번으로 협력사가 원가·마진을 보는 계정이 생긴다 — 그건 첫 한 명만
 * scripts/bootstrap-admin.ts 로 심는다.
 *
 * 열람 전용(viewer)은 만들 수 있다. 같은 것을 보지만 쓰기가 없어서, 잘못 만들어도
 * 되돌릴 수 없는 일이 생기지 않는다 — 못 만들게 막을 이유가 관리자와 다르다.
 */
import { userStore } from '@/lib/auth/users';
import type { Role } from '@/lib/roles';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

/**
 * 계정설정 화면에서 만들 수 있는 구분.
 *
 * 열람 전용이 여기 들어 있는 것은 그것이 손이 없는 구분이기 때문이다 — 실수로 만들어도
 * 아무것도 바꾸지 못한다. 관리자는 반대라서 끝까지 빠져 있다.
 */
const CREATABLE: Role[] = ['sales', 'cons', 'salesCons', 'viewer'];

/** 보낸 구분이 만들 수 있는 것인가. 관리자는 여기를 통과하지 못한다. */
function creatableRole(value: unknown): Role {
  const role = CREATABLE.find((r) => r === value);
  if (!role) {
    throw new BadRequest('구분은 영업사 · 시공사 · 턴키업체 · 열람 전용 중 하나여야 합니다.');
  }
  return role;
}

export const POST = adminWrite<
  Record<string, never>,
  { id?: string; name?: string; role?: string; org?: string; password?: string }
>('한백 관리자만 계정을 만들 수 있습니다.', async ({ body, actor }) => {
  // id·이름·비밀번호 규칙은 저장소가 본다(화면과 스크립트가 같은 규칙을 쓰게) → 422
  await userStore.create(
    {
      id: body?.id ?? '',
      name: body?.name ?? '',
      role: creatableRole(body?.role),
      org: body?.org ?? null,
      password: body?.password ?? '',
    },
    actor
  );
});

export const PATCH = adminWrite<
  Record<string, never>,
  { id?: string; active?: unknown; role?: unknown; org?: unknown; name?: unknown; password?: unknown }
>('한백 관리자만 바꿀 수 있습니다.', async ({ body, actor }) => {
  if (!body?.id) throw new BadRequest('id 가 필요합니다.');

  if (typeof body.active === 'boolean') {
    await userStore.setActive(body.id, body.active, actor);
    return;
  }

  if (body.password !== undefined) {
    if (typeof body.password !== 'string') throw new BadRequest('비밀번호가 올바르지 않습니다.');
    // 길이 규칙은 저장소가 본다 — 만들기와 같은 규칙을 한 곳에 둔다
    await userStore.resetPassword(body.id, body.password, actor);
    return;
  }

  // 안 보낸 값은 그대로 둔다 — 소속만 고치려는 요청이 구분을 지워버리면 안 된다
  const patch: { role?: Role; org?: string | null; name?: string } = {};
  if (body.role !== undefined) patch.role = creatableRole(body.role);
  if (body.org !== undefined) patch.org = typeof body.org === 'string' ? body.org : null;
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') throw new BadRequest('이름이 올바르지 않습니다.');
    patch.name = body.name;
  }
  if (Object.keys(patch).length === 0) throw new BadRequest('바꿀 값이 없습니다.');

  await userStore.setProfile(body.id, patch, actor);
});

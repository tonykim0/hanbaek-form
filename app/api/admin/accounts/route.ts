/**
 * 계정 만들기 · 사용 중지 — 한백 관리자 전용.
 *
 *   POST                          새 계정
 *   PATCH  { active }             사용 중지·재개
 *   PATCH  { role|org|name }      구분·소속·이름 고치기
 *
 * 관리자 계정은 여기서 만들 수 없고, 여기로 올릴 수도 없다. 화면에서 만들 수 있게 두면
 * 실수 한 번으로 협력사가 원가·마진을 보는 계정이 생긴다 — 그건 첫 한 명만
 * scripts/bootstrap-admin.ts 로 심는다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { actorOf } from '@/lib/auth/session';
import { userStore } from '@/lib/auth/users';
import type { Role } from '@/lib/roles';

/** 설정 화면에서 만들 수 있는 구분 */
const CREATABLE: Role[] = ['sales', 'cons', 'salesCons'];

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: '한백 관리자만 계정을 만들 수 있습니다.' }, { status: 403 });
  }

  let body: { id?: string; name?: string; role?: string; org?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  const role = CREATABLE.find((r) => r === body.role);
  if (!role) {
    return NextResponse.json(
      { error: '구분은 영업사 · 시공사 · 턴키업체 중 하나여야 합니다.' },
      { status: 400 }
    );
  }

  try {
    await userStore.create(
      {
        id: body.id ?? '',
        name: body.name ?? '',
        role,
        org: body.org ?? null,
        password: body.password ?? '',
      },
      actorOf(session)
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: '한백 관리자만 바꿀 수 있습니다.' }, { status: 403 });
  }

  let body: { id?: string; active?: unknown; role?: unknown; org?: unknown; name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  try {
    if (typeof body.active === 'boolean') {
      await userStore.setActive(body.id, body.active, actorOf(session));
      return NextResponse.json({ ok: true });
    }

    // 안 보낸 값은 그대로 둔다 — 소속만 고치려는 요청이 구분을 지워버리면 안 된다
    const patch: { role?: Role; org?: string | null; name?: string } = {};
    if (body.role !== undefined) {
      const role = CREATABLE.find((r) => r === body.role);
      if (!role) {
        return NextResponse.json(
          { error: '구분은 영업사 · 시공사 · 턴키업체 중 하나여야 합니다.' },
          { status: 400 }
        );
      }
      patch.role = role;
    }
    if (body.org !== undefined) patch.org = typeof body.org === 'string' ? body.org : null;
    if (body.name !== undefined) {
      if (typeof body.name !== 'string') {
        return NextResponse.json({ error: '이름이 올바르지 않습니다.' }, { status: 400 });
      }
      patch.name = body.name;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '바꿀 값이 없습니다.' }, { status: 400 });
    }

    await userStore.setProfile(body.id, patch, actorOf(session));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

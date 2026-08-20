/**
 * PATCH /api/projects/[id]/orgs — 영업사·시공사 지정 [한백 전용]
 *
 * 한백이 계정 없는 업체의 건을 대신 접수할 때 업체명을 손으로 적는다. 그 값은 표시용이
 * 아니라 접근 키라서(협력사가 자기 현장을 보는 판정이 문자열 일치다) 오타 하나가 그 업체를
 * 영구히 못 보게 만든다 — 고칠 자리가 반드시 있어야 한다.
 *
 * 비우면 「어느 업체도 아닌 현장」으로 되돌린다. 이름 다듬기는 저장소가 한다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { actorOf } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: '한백 관리자만 지정할 수 있습니다.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { salesOrg?: string | null; gcOrg?: string | null }
    | null;
  if (!body || (!('salesOrg' in body) && !('gcOrg' in body))) {
    return NextResponse.json({ error: '고칠 값이 없습니다.' }, { status: 400 });
  }

  try {
    await getRepository().setOrgs(params.id, body, actorOf(session));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

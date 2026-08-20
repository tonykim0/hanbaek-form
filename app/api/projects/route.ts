import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { checkDraft } from '@/lib/intake-validate';
import type { IntakeDraft } from '@/types/project';

/** POST /api/projects — 접수 */
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let draft: IntakeDraft;
  try {
    draft = (await request.json()) as IntakeDraft;
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  // 화면에서 이미 막지만 서버에서 한 번 더 본다 — 클라이언트 검증은 우회된다
  const check = checkDraft(draft);
  if (check.errors.length > 0) {
    return NextResponse.json({ error: check.errors[0], errors: check.errors }, { status: 422 });
  }

  const id = await getRepository().createProject(draft, {
    id: session.id,
    role: session.role,
    org: session.org,
    name: session.name,
  });

  return NextResponse.json({ id });
}

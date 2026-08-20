/**
 * POST /api/projects/[id]/notes — 진행현황 한 줄 남기기
 *
 * 한백과 그 현장의 협력사 둘 다 부른다. 특이사항은 양쪽에서 나온다 —
 * 관리사무소가 공사를 미뤘다는 말은 협력사가 알고, 운영사 승인이 늦다는 말은 한백이 안다.
 *
 * 자기가 쓴 것은 고칠 수 있다(PATCH). 남의 글은 못 고치고, 지우는 길은 두지 않는다.
 */
import { NextResponse } from 'next/server';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { body?: string } | null;
  if (!body?.body?.trim()) {
    return NextResponse.json({ error: '내용을 입력해주세요.' }, { status: 400 });
  }

  try {
    await getRepository().addNote(
      { projectId: params.id, body: body.body },
      actorOf(session)
    );
  } catch (err) {
    // 「권한 없음」·「빈 내용」은 사용자가 고칠 수 있는 오류다
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * PATCH — 자기가 남긴 기록을 고친다.
 *
 * 남의 글은 못 고친다. 판정은 저장소가 한다(글에 적힌 소속과 대조) — 여기서 먼저
 * 걸러도 되지만, 두 곳에서 판정하면 규칙이 어긋날 자리가 하나 더 생긴다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { noteId?: string; body?: string }
    | null;
  if (!body?.noteId || !body.body?.trim()) {
    return NextResponse.json({ error: '고칠 내용을 입력해주세요.' }, { status: 400 });
  }

  try {
    await getRepository().editNote(
      { projectId: params.id, noteId: body.noteId, body: body.body },
      actorOf(session)
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

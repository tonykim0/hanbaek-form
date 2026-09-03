/**
 * GET /api/notices/unread — 내가 아직 안 읽은 공지 수 (로그인한 누구나)
 *
 * 상단바 배지가 화면을 옮길 때마다 부른다 — 사이드바의 할 일 배지(/api/todos)와 같은 방식.
 */
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import { getSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  return NextResponse.json({ count: await getRepository().countUnreadNotices(session.id) });
}

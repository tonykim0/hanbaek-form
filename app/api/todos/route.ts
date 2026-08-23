/**
 * GET /api/todos — 지금 내 차례인 것. 상단 바의 배지·드롭다운이 부른다.
 *
 * 조립은 lib/todos 한 벌이다 — 할 일 대시보드(/todos)와 같은 정본을 본다.
 */
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { todosOf } from '@/lib/todos';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  return NextResponse.json({ items: await todosOf(session) });
}

/**
 * POST /api/notices/read — 공지를 읽었다고 표시 (로그인한 누구나, ★열람 전용 포함★)
 *
 * sessionWrite 를 쓰지 않는다 — 그 껍데기는 열람 전용을 전부 막는데(사업 데이터의
 * 쓰기 규칙), 이것은 사업 데이터가 아니라 제 읽음 시각 한 칸이다. 열람 전용도 공지를
 * 읽고, 읽었으면 배지가 꺼져야 한다. 남의 것은 못 건드린다 — 세션의 id 로만 찍는다.
 */
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import { getSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  await getRepository().markNoticesRead(session.id);
  return NextResponse.json({ ok: true });
}

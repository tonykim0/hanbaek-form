/**
 * GET /api/projects/[id]/history — 검수가 오간 자취.
 *
 * ★열 때만 읽는다.★ 현장 상세는 이미 여러 번 왕복하는 화면이라(계약·시공·지급·기성)
 * 늘 안 보는 목록을 거기 얹지 않는다. 「검수 이력」을 펼칠 때 한 번 부른다.
 *
 * 읽기만 하므로 쓰기의 문(lib/api/write-route)을 쓰지 않는다. 남의 현장을 못 보게 하는
 * 판정은 저장소가 한 번 더 한다(canAccessProject) — 주소를 직접 두드려도 빈 목록이다.
 */
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const events = await getRepository().listReviewHistory(params.id, viewerOf(session));
  return NextResponse.json({ events });
}

/**
 * POST /api/projects/[id]/env-queue — 환경부 보조금 신청 대기번호
 *
 * 형식을 강제하지 않는다. 「2026-595」로도 오고 번호만 오기도 해서, 규칙을 정하면
 * 형식이 다른 값이 들어올 때 적을 자리가 없어진다. 길이만 막는다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getRepository } from '@/lib/data';
import { actorOf } from '@/lib/auth/session';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: '한백 관리자만 입력할 수 있습니다.' }, { status: 403 });
  }

  let body: { value?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  const raw = body.value;
  if (raw !== null && typeof raw !== 'string') {
    return NextResponse.json({ error: '대기번호는 문자열이어야 합니다.' }, { status: 400 });
  }
  const value = raw === null ? null : raw.trim() === '' ? null : raw.trim();
  if (value !== null && value.length > 40) {
    return NextResponse.json({ error: '대기번호가 너무 깁니다.' }, { status: 400 });
  }

  try {
    await getRepository().setEnvQueueNo(params.id, value, actorOf(session));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

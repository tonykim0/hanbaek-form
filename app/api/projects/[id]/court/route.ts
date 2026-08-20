/**
 * POST /api/projects/[id]/court — 공 차례 넘기기
 *
 * 「접수 완료 처리」가 부르는 것이 이것이다.
 * 단계(stage)는 서류·단가에서 유도되므로 저장하지 않는다 — 여기서 움직이는 것은
 * 「지금 누가 손을 대야 하는가」뿐이다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getRepository } from '@/lib/data';
import { actorOf } from '@/lib/auth/session';
import type { Court } from '@/types/project';

const COURTS: Court[] = ['한백', '영업사', '시공사', '운영사'];

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: '한백 관리자만 바꿀 수 있습니다.' }, { status: 403 });
  }

  let body: { court?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  const court = COURTS.find((c) => c === body.court);
  if (!court) {
    return NextResponse.json(
      { error: `court 는 ${COURTS.join(' · ')} 중 하나여야 합니다.` },
      { status: 400 }
    );
  }

  try {
    await getRepository().setCourt(params.id, court, actorOf(session));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}

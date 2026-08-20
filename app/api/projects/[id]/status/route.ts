/**
 * POST /api/projects/[id]/status — 공정 진행 단계 옮기기
 *
 * 보드에서 카드를 끌어다 놓으면 이 경로로 온다.
 * 넘어갈 수 있는지는 여기서 판단하지 않는다 — 조건은 lib/process.ts 한 곳에 있고
 * 저장소가 확인한다. 여기서 하는 일은 관리자 확인과 값 검사뿐이다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getRepository } from '@/lib/data';
import { actorOf } from '@/lib/auth/session';
import { PROCESS_STATUSES } from '@/types/project';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: '한백 관리자만 옮길 수 있습니다.' }, { status: 403 });
  }

  let body: { status?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  const status = PROCESS_STATUSES.find((s) => s === body.status);
  if (!status) {
    return NextResponse.json(
      { error: `status 는 ${PROCESS_STATUSES.join(' · ')} 중 하나여야 합니다.` },
      { status: 400 }
    );
  }

  try {
    await getRepository().setProcessStatus(params.id, status, actorOf(session));
  } catch (err) {
    // 조건이 안 맞아 못 넘어간 것도 여기로 온다 — 사유가 그대로 화면에 나가야 한다
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/projects/[id]/contract-confirm — 계약 확인 · 확인 취소
 *
 * 협력사가 낸 것을 한백이 훑어보고 누르는 자리다. 이것이 있어야 계약이 넘어간다 —
 * 서류가 다 차고 단가가 붙어도 사람이 확인하기 전에는 계약접수에 남는다(lib/stage.ts).
 *
 * 조건 확인은 여기서 하지 않는다. 저장소가 lib/stage.ts 의 판정을 다시 보고 거절한다 —
 * 조건을 두 곳에 쓰면 「버튼은 눌리는데 저장이 거절되는」 상태가 생긴다.
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
    return NextResponse.json({ error: '한백 관리자만 계약을 확인할 수 있습니다.' }, { status: 403 });
  }

  let body: { confirmed?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }
  if (typeof body.confirmed !== 'boolean') {
    return NextResponse.json({ error: 'confirmed 가 필요합니다.' }, { status: 400 });
  }

  try {
    await getRepository().confirmContract(params.id, body.confirmed, actorOf(session));
  } catch (err) {
    // 조건이 안 맞아 거절된 것도 여기로 온다 — 사유가 그대로 화면에 나가야 한다
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}

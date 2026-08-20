/**
 * PATCH /api/projects/[id]/lines/[lineId] — 계약 라인에 단가 케이스 지정
 *
 * 지급액은 저장하지 않는다. 케이스가 불변이라 참조만 남기면 조회할 때 늘 같은 값이 나온다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getRepository } from '@/lib/data';
import { actorOf } from '@/lib/auth/session';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; lineId: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: '한백 관리자만 단가를 지정할 수 있습니다.' }, { status: 403 });
  }

  let body: { pricingRuleId?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  const ruleId = body.pricingRuleId?.trim() || null;
  try {
    await getRepository().setLinePricing(params.lineId, ruleId, actorOf(session));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

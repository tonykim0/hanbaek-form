/**
 * PATCH /api/projects/[id]/payment — 지급일·비고 저장
 *
 * 넘긴 필드만 바뀐다. 화면이 일부만 보내도 나머지가 지워지지 않게 한다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getRepository } from '@/lib/data';
import type { PaymentPatch } from '@/lib/data/repository';
import { actorOf } from '@/lib/auth/session';

const DATE_FIELDS = ['salesPay1Date', 'salesPay2Date', 'consPay1Date', 'consPay2Date'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: '한백 관리자만 저장할 수 있습니다.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  const patch: PaymentPatch = {};
  for (const f of DATE_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (v === null || v === '') {
      patch[f] = null;
      continue;
    }
    if (typeof v !== 'string' || !DATE_RE.test(v)) {
      return NextResponse.json({ error: `${f} 는 YYYY-MM-DD 형식이어야 합니다.` }, { status: 400 });
    }
    patch[f] = v;
  }
  if ('payNote' in body) {
    const v = body.payNote;
    if (v !== null && typeof v !== 'string') {
      return NextResponse.json({ error: '비고는 문자열이어야 합니다.' }, { status: 400 });
    }
    patch.payNote = typeof v === 'string' && v.trim() ? v.trim() : null;
  }

  try {
    await getRepository().setPayment(params.id, patch, actorOf(session));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

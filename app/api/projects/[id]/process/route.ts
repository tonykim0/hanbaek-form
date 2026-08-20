/**
 * POST /api/projects/[id]/process — 공정 마일스톤 날짜·메모
 *
 * 넘긴 필드만 바뀐다. 상태(status)는 여기서 받지 않는다 — 조건을 확인해야 하므로
 * /status 로만 움직인다. 날짜는 그 조건의 근거일 뿐이다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getRepository } from '@/lib/data';
import { actorOf } from '@/lib/auth/session';
import type { ProcessPatch } from '@/lib/data/repository';

/** 고칠 수 있는 날짜 칸 */
const DATE_FIELDS = [
  'envApprovalDate', 'cpoApprovalDate', 'chargerOrderDate', 'chargerShipDate',
  'chargerRecvDate', 'startPlanDate', 'startActualDate', 'installDoneDate', 'commDoneDate',
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: '한백 관리자만 입력할 수 있습니다.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  const patch: ProcessPatch = {};
  for (const f of DATE_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    // 빈 칸으로 지우는 것은 허용한다 — 잘못 적은 날짜를 되돌릴 길이 있어야 한다
    if (v === null || v === '') {
      patch[f] = null;
      continue;
    }
    if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
      return NextResponse.json({ error: `${f} 는 YYYY-MM-DD 형식이어야 합니다.` }, { status: 400 });
    }
    patch[f] = v;
  }
  if ('memo' in body) {
    const v = body.memo;
    if (v !== null && typeof v !== 'string') {
      return NextResponse.json({ error: 'memo 는 문자열이어야 합니다.' }, { status: 400 });
    }
    patch.memo = v === '' ? null : (v as string | null);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '바꿀 값이 없습니다.' }, { status: 400 });
  }

  try {
    await getRepository().updateProcess(params.id, patch, actorOf(session));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

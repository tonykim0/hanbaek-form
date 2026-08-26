/**
 * GET  /api/charger-models — 충전기 모델 목록 (로그인한 누구나)
 * POST /api/charger-models — 모델 등록 [한백 전용]
 *
 * 현장에서 고를 후보다. 금액이 없어 협력사도 본다 — 시공사가 자기 현장의 모델을 고른다.
 * 이름이 겹치면 저장소가 거절한다(같은 모델이 두 이름으로 갈리는 것을 막는다).
 */
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import { getSessionUser } from '@/lib/auth/session';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  return NextResponse.json({ models: await getRepository().listChargerModels() });
}

export const POST = adminWrite<
  Record<string, never>,
  { name?: unknown; maker?: unknown; note?: unknown }
>('한백 관리자만 충전기 모델을 등록할 수 있습니다.', async ({ body, actor }) => {
  if (typeof body?.name !== 'string' || !body.name.trim()) throw new BadRequest('모델명을 적어주세요.');
  const id = await getRepository().addChargerModel({
    name: body.name,
    maker: typeof body.maker === 'string' ? body.maker : null,
    note: typeof body.note === 'string' ? body.note : null,
  }, actor);
  return { id };
});

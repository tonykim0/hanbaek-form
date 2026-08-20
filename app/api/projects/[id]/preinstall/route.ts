/**
 * PATCH /api/projects/[id]/preinstall — 기설치 조사 [그 현장의 협력사 · 한백]
 *
 * 환경부 사업은 현장마다 기설치 충전기를 조사해야 한다. 조사는 현장에 가는 쪽(협력사)이
 * 하고 한백이 확인하므로 양쪽이 쓴다 — 권한 판정은 저장소가 한다(canAccessProject).
 *
 * 서류(기설치 이력·증빙)는 이 라우트가 아니라 서류 올리기 경로로 간다.
 * 여기서 다루는 것은 「조사해서 알아낸 것」이다.
 */
import { NextResponse } from 'next/server';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import type { PreInstall } from '@/types/project';

const STATES: PreInstall[] = ['없음', '있음'];

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { preInstall?: string; preNote?: string | null; preChecked?: boolean }
    | null;
  if (!body) {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }
  if (body.preInstall !== undefined && !STATES.includes(body.preInstall as PreInstall)) {
    return NextResponse.json(
      { error: `기설치는 ${STATES.join(' · ')} 중 하나여야 합니다.` },
      { status: 400 }
    );
  }

  try {
    await getRepository().setPreInstall(
      params.id,
      {
        preInstall: body.preInstall as PreInstall | undefined,
        ...('preNote' in body ? { preNote: body.preNote ?? null } : {}),
        ...(body.preChecked !== undefined ? { preChecked: body.preChecked } : {}),
      },
      actorOf(session)
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}

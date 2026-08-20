/**
 * PATCH  /api/projects/[id]/documents/[kind] — 서류 검수 (승인 · 반려)
 * DELETE /api/projects/[id]/documents/[kind] — 서류 삭제
 *
 * 한백만 호출한다. 미들웨어가 페이지 진입을 막지만 API 는 직접 호출될 수 있어
 * 여기서 requireAdmin() 으로 다시 확인한다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getRepository } from '@/lib/data';
import { actorOf } from '@/lib/auth/session';
import { dropBlob, pathnameOfBlobUrl } from '@/lib/intake-stage';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; kind: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: '한백 관리자만 검수할 수 있습니다.' }, { status: 403 });
  }

  let body: { status?: string; reason?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  // uploaded = 반려 해제 (통과 상태로 되돌린다)
  const ALLOWED = ['rejected', 'uploaded', 'approved'] as const;
  type Allowed = (typeof ALLOWED)[number];
  if (!ALLOWED.includes(body.status as Allowed)) {
    return NextResponse.json(
      { error: `status 는 ${ALLOWED.join(' · ')} 중 하나여야 합니다.` },
      { status: 400 }
    );
  }

  try {
    await getRepository().setDocumentStatus(
      {
        projectId: params.id,
        kind: params.kind,
        status: body.status as Allowed,
        reason: body.reason ?? null,
      },
      actorOf(session)
    );
  } catch (err) {
    // 「제출되지 않은 서류」·「반려 사유 없음」은 사용자가 고칠 수 있는 오류다
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; kind: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: '한백 관리자만 서류를 지울 수 있습니다.' }, { status: 403 });
  }

  let blobUrl: string | null;
  try {
    ({ blobUrl } = await getRepository().deleteDocument(
      { projectId: params.id, kind: params.kind },
      actorOf(session)
    ));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  /*
   * 기록을 지운 뒤에 파일을 지운다. 순서를 바꾸면 기록이 실패했을 때 파일만 사라져
   * 「제출됨인데 열 수 없는 서류」가 된다.
   *
   * 우리 자리(projects/{현장}/)에 있는 것만 지운다 — 예전 방식으로 다른 곳을 가리키는
   * 주소가 있어도 그것까지 지울 판단은 여기서 하지 않는다.
   */
  if (blobUrl && (pathnameOfBlobUrl(blobUrl) ?? '').startsWith(`projects/${params.id}/`)) {
    await dropBlob(blobUrl);
  }

  return NextResponse.json({ ok: true });
}

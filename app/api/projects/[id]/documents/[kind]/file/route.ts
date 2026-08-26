/**
 * 서류 파일 — 올리기(두 단계)와 한 장 빼기.
 *
 *   POST ?step=token   업로드 토큰 발급 (Blob 으로 바로 올리기 위해)
 *   POST               올린 결과를 현장에 붙인다
 *   DELETE             그 칸의 파일 한 장을 뺀다 (본문에 { url })
 *
 * 서버를 거쳐 올리지 않는 이유: 스캔본이 4.5MB 를 넘으면 서버리스 본문 한도에 걸린다.
 * 그래서 브라우저가 Blob 에 직접 올리고, 끝난 뒤 주소만 서버에 알려준다.
 *
 * 협력사도 부른다 — 반려된 서류를 다시 올리는 것이 이 경로다.
 *
 * ★lib/api/write-route 껍데기를 쓰지 않는 이유★
 * 첫 단계가 { token } 을 돌려주고, 토큰 발급이 실패하면 500 이다(사람이 고칠 수 없는 것 —
 * Blob 설정 문제다). 껍데기는 400·403·422 만 낸다. 여기서 422 로 답하면 화면이
 * 「다시 해보세요」로 읽는데, 다시 해도 안 된다.
 */
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getSessionUser, actorOf, viewerOf } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { canAccessProject, canWrite } from '@/lib/roles';
import { isKnownDocKind } from '@/lib/data/assemble';
import { attachDocument } from '@/lib/attach-doc';
import { dropBlob, pathnameOfBlobUrl } from '@/lib/intake-stage';
import { DOC_FILE_TYPES } from '@/types/project';

/** 받는 형식은 types/project.ts 한 곳에 있다 — 접수와 서류 칸이 같은 목록을 봐야 한다 */
const ALLOWED_TYPES = [...DOC_FILE_TYPES];
const MAX_BYTES = 30 * 1024 * 1024;


export async function POST(
  request: Request,
  { params }: { params: { id: string; kind: string } }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  /*
   * 열람 전용은 올리지 않는다. 쓰기의 문은 lib/api/write-route 한 곳이지만 이 라우트는
   * 그 껍데기를 못 쓴다(위 머리말) — 그래서 같은 판정을 여기서 한 번 더 부른다.
   */
  if (!canWrite(session.role)) {
    return NextResponse.json(
      { error: '열람 전용 계정입니다 — 보기만 할 수 있습니다.' },
      { status: 403 }
    );
  }
  /*
   * 경로 조작을 막는다 — kind 는 우리가 아는 서류 종류 이름뿐이다.
   * 글자 모양(정규식)으로 걸렀더니 'photoDone' 처럼 대문자가 든 이름이 막혀서
   * 설치완료사진을 올릴 수 없었다. 목록으로 대조하는 편이 좁고 정확하다.
   */
  if (!isKnownDocKind(params.kind)) {
    return NextResponse.json({ error: '서류 종류가 올바르지 않습니다.' }, { status: 400 });
  }

  // 남의 현장인지 먼저 본다. 저장소도 다시 보지만, 토큰 발급은 저장소를 타지 않는다.
  const detail = await getRepository().getProject(params.id, viewerOf(session));
  if (!detail || !canAccessProject(session.role, session.org, detail.project)) {
    return NextResponse.json({ error: '이 현장에 올릴 수 없습니다.' }, { status: 404 });
  }

  const url = new URL(request.url);
  const body = (await request.json().catch(() => null)) as
    | { pathname?: string; contentType?: string; blobUrl?: string; filename?: string }
    | null;
  if (!body) {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  // ── 1단계: 토큰 ────────────────────────────────────────────────
  if (url.searchParams.get('step') === 'token') {
    const expected = `projects/${params.id}/${params.kind}-`;
    if (!body.pathname?.startsWith(expected)) {
      // 경로를 서버가 정해준 모양으로 못 박는다 — 아니면 남의 자리에 덮어쓸 수 있다
      return NextResponse.json({ error: '업로드 경로가 올바르지 않습니다.' }, { status: 400 });
    }
    try {
      const token = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN!,
        pathname: body.pathname,
        validUntil: Date.now() + 10 * 60 * 1000,
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: MAX_BYTES,
      });
      return NextResponse.json({ token });
    } catch (err) {
      console.error('[documents/file] 토큰 발급 실패:', err);
      return NextResponse.json({ error: '업로드 준비에 실패했습니다.' }, { status: 500 });
    }
  }

  // ── 2단계: 결과 붙이기 ─────────────────────────────────────────
  const result = await attachDocument({
    projectId: params.id,
    kind: params.kind,
    filename: body.filename ?? '',
    blobUrl: body.blobUrl ?? '',
    has: (detail.documents.find((d) => d.kind === params.kind)?.files.length ?? 0) > 0,
    session,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, already: result.already });
}

/**
 * DELETE — 그 칸의 파일 한 장을 뺀다. 올리는 쪽(그 현장의 협력사·한백)이 부른다.
 *
 * ★올린 사람이 뺄 수 있어야 한다.★ 한 칸에 파일이 쌓이게 되면서(migrations/0021)
 * 「다시 올려서 덮는다」로 잘못 올린 것을 고칠 수 없게 됐다 — 그 길이 여기다.
 * 칸을 통째로 비우는 것은 한백만 하는 다른 일이다(DELETE ../[kind]).
 *
 * 위 POST 와 같은 이유로 write-route 껍데기를 쓰지 않는다.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; kind: string } }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!canWrite(session.role)) {
    return NextResponse.json(
      { error: '열람 전용 계정입니다 — 보기만 할 수 있습니다.' },
      { status: 403 }
    );
  }
  if (!isKnownDocKind(params.kind)) {
    return NextResponse.json({ error: '서류 종류가 올바르지 않습니다.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  if (!body?.url) {
    return NextResponse.json({ error: '지울 파일 주소가 없습니다.' }, { status: 400 });
  }

  /*
   * 남의 현장인지·그 칸에 있는 파일인지는 저장소가 본다(deleteDocumentFile) —
   * 규칙에 걸린 것은 422 다. 여기서 다시 판정하면 두 곳이 갈린다.
   */
  let blobUrl: string | null;
  try {
    ({ blobUrl } = await getRepository().deleteDocumentFile(
      { projectId: params.id, kind: params.kind, url: body.url },
      actorOf(session)
    ));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 422 });
  }

  /*
   * 기록을 지운 뒤에 파일을 지운다 — 순서를 바꾸면 기록이 실패했을 때 파일만 사라져
   * 「목록에는 있는데 열 수 없는 파일」이 된다. 우리 자리에 있는 것만 지운다.
   */
  if (blobUrl && (pathnameOfBlobUrl(blobUrl) ?? '').startsWith(`projects/${params.id}/`)) {
    await dropBlob(blobUrl);
  }
  return NextResponse.json({ ok: true });
}

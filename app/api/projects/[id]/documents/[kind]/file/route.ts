/**
 * 서류 올리기 — 두 단계.
 *
 *   POST ?step=token   업로드 토큰 발급 (Blob 으로 바로 올리기 위해)
 *   POST               올린 결과를 현장에 붙인다
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
import { canAccessProject } from '@/lib/roles';
import { isKnownDocKind } from '@/lib/data/assemble';
import { attachDocument } from '@/lib/attach-doc';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];
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
    prev: detail.documents.find((d) => d.kind === params.kind)?.blobUrl ?? null,
    session,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, already: result.already });
}

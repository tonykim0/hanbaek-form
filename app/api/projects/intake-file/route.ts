/**
 * POST /api/projects/intake-file — 접수 화면에서 고른 파일의 업로드 토큰
 *
 * 접수 화면에서 파일을 고르면 그 자리에서 바로 올린다. 현장이 아직 없으니 임시 자리에
 * 둔다 — ZIP 에서 나온 파일과 같은 자리, 같은 규칙이다(lib/intake-stage).
 *
 * ★접수 버튼을 누른 뒤에 올리지 않는 이유★
 * 그러면 접수가 스캔본 업로드를 기다리는 단계가 된다. 파일을 고른 시점부터 접수까지는
 * 어차피 사람이 화면을 채우는 시간이 있으므로, 그 사이에 올려두면 접수는 주소만 넘기면 된다.
 *
 * 경로는 서버가 짓는다. 클라이언트가 지어 보내면 남의 자리를 가리킬 수 있다.
 */
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { isKnownDocKind } from '@/lib/data/assemble';
import { stagePrefix } from '@/lib/intake-stage';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];
const MAX_BYTES = 30 * 1024 * 1024;
/** 파일이름에서 확장자만 딴다. 나머지 글자는 경로에 쓰지 않는다 — 한글·공백이 섞인다. */
const EXT_RE = /^[a-z0-9]{1,5}$/;

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { kind?: string; ext?: string }
    | null;
  if (!body?.kind || !isKnownDocKind(body.kind)) {
    return NextResponse.json({ error: '서류 종류가 올바르지 않습니다.' }, { status: 400 });
  }
  const ext = (body.ext ?? 'pdf').toLowerCase();
  const pathname = `${stagePrefix(session.id)}/picked-${Date.now()}/${body.kind}.${
    EXT_RE.test(ext) ? ext : 'pdf'
  }`;

  try {
    const token = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      pathname,
      validUntil: Date.now() + 10 * 60 * 1000,
      allowedContentTypes: ALLOWED_TYPES,
      maximumSizeInBytes: MAX_BYTES,
    });
    return NextResponse.json({ token, pathname });
  } catch (err) {
    console.error('[intake-file] 토큰 발급 실패:', err);
    return NextResponse.json({ error: '업로드 준비에 실패했습니다.' }, { status: 500 });
  }
}

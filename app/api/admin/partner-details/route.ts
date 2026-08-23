/**
 * 협력사 정보 — 자기 것이거나 한백이거나 (판정은 저장소의 assertSelfOrAdmin).
 *
 *   PATCH  { userId, bizRegNo?|ceo?|addr?|bankName?|bankAccountNo?|bankHolder? }  글자 값 고치기
 *   POST   multipart (userId, kind, file)                               서류 올리기·교체
 *   DELETE { userId, kind }                                             서류 지우기
 *
 * 파일은 Vercel Blob 에 랜덤 접미사로 올린다 — 주소를 아는 사람만 연다. 교체·삭제 때
 * 이전 Blob 을 같이 지워 민감한 서류(사업자등록증·통장사본)가 떠돌지 않게 한다.
 *
 * POST 만 sessionWrite 껍데기를 안 쓴다 — 껍데기는 본문을 JSON 으로 읽는데 파일은
 * multipart 로 온다. 권한 확인·오류 모양은 껍데기와 똑같이 맞춘다.
 */
import { NextResponse } from 'next/server';
import { del, put } from '@vercel/blob';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { BadRequest, sessionWrite } from '@/lib/api/write-route';
import {
  FILE_KIND_LABEL,
  savePartnerFields,
  setPartnerFile,
  type PartnerFileKind,
} from '@/lib/auth/partner-details';

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 서버리스 본문 한도(4.5MB) 아래
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function asKind(value: unknown): PartnerFileKind {
  if (value === 'bizCert' || value === 'bankbook') return value;
  throw new BadRequest('서류 종류는 사업자등록증(bizCert)·통장사본(bankbook) 중 하나여야 합니다.');
}

export const PATCH = sessionWrite<
  Record<string, never>,
  {
    userId?: string; bizRegNo?: unknown; ceo?: unknown; addr?: unknown;
    bankName?: unknown; bankAccountNo?: unknown; bankHolder?: unknown;
  }
>(async ({ body, actor }) => {
  if (!body?.userId) throw new BadRequest('userId 가 필요합니다.');
  const patch: Record<string, string> = {};
  // 목록의 정본은 savePartnerFields 의 FIELD_LABEL 이다 — 한 쪽만 늘리면 조용히 안 저장된다
  for (const field of ['bizRegNo', 'ceo', 'addr', 'bankName', 'bankAccountNo', 'bankHolder'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') throw new BadRequest('값이 올바르지 않습니다.');
    patch[field] = value;
  }
  await savePartnerFields(body.userId, patch, actor);
});

export const DELETE = sessionWrite<
  Record<string, never>,
  { userId?: string; kind?: unknown }
>(async ({ body, actor }) => {
  if (!body?.userId) throw new BadRequest('userId 가 필요합니다.');
  const kind = asKind(body.kind);
  const previous = await setPartnerFile(body.userId, kind, null, actor);
  if (previous) await del(previous).catch(() => undefined); // DB 가 정본 — Blob 삭제 실패로 막지 않는다
});

/** 계정 화면과 같은 ID 규칙 — Blob 경로에 들어가므로 여기서도 거른다 */
const ID_RE = /^[a-z0-9][a-z0-9-]{2,23}$/;

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const form = await request.formData().catch(() => {
      throw new BadRequest('요청을 읽을 수 없습니다.');
    });
    const rawUserId = form.get('userId');
    const kind = asKind(form.get('kind'));
    const file = form.get('file');
    if (typeof rawUserId !== 'string' || !rawUserId) throw new BadRequest('userId 가 필요합니다.');
    const userId = rawUserId.trim().toLowerCase();
    if (!ID_RE.test(userId)) throw new BadRequest('userId 가 올바르지 않습니다.');
    if (!(file instanceof File) || file.size === 0) {
      throw new BadRequest(`${FILE_KIND_LABEL[kind]} 파일이 없습니다.`);
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new BadRequest('PDF·JPG·PNG·WEBP 파일만 올릴 수 있습니다.');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequest(`파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 4MB 이하로 줄여주세요.`);
    }

    const blob = await put(
      `partner-docs/${userId}-${kind}${EXT_BY_TYPE[file.type]}`,
      file,
      { access: 'public', addRandomSuffix: true }
    );

    let previous: string | null;
    try {
      previous = await setPartnerFile(userId, kind, blob.url, actorOf(session));
    } catch (err) {
      await del(blob.url).catch(() => undefined); // DB 에 못 붙인 파일을 남기지 않는다
      throw err;
    }
    if (previous) await del(previous).catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof BadRequest ? 400 : 422;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

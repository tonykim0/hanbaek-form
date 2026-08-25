/**
 * POST /api/admin/partner-details/read  { userId, kind }
 *
 * 이미 올려 둔 서류(사업자등록증·통장사본)를 읽어 협력사 정보 입력칸에 채울 값을 돌려준다.
 * ★아무것도 저장하지 않는다★ — 채우는 것은 화면이고 저장은 사람이 누른다. 그래서 쓰기
 * 껍데기(sessionWrite)를 쓰지 않고 audit 도 남기지 않는다.
 *
 * 권한은 저장소가 판정한다 — getPartnerDetails 가 assertSelfOrAdmin 을 지나므로 남의
 * 사업자등록증을 읽어 볼 수 없다. 로그인 뒤에만 열리는 자리라 무로그인 판독
 * (/api/import-form)과 달리 부르는 사람이 특정된다.
 */
import { NextResponse } from 'next/server';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getPartnerDetails, type PartnerFileKind } from '@/lib/auth/partner-details';
import { PartnerDocReadError, readPartnerDoc } from '@/lib/claude-partner-doc';

// 한 장짜리 서류라 계약서 판독(300s)만큼 걸리지 않는다
export const maxDuration = 120;

const ALLOWED_BLOB_HOST_RE = /(^|\.)blob\.vercel-storage\.com$/;

/** 올릴 때 붙인 확장자로 되돌린다 — 저장 경로는 EXT_BY_TYPE 한 곳에서 정한다 */
const TYPE_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      userId?: string;
      kind?: unknown;
    } | null;
    if (!body?.userId) return bad('userId 가 필요합니다.');
    if (body.kind !== 'bizCert' && body.kind !== 'bankbook') {
      return bad('서류 종류가 올바르지 않습니다.');
    }
    const kind: PartnerFileKind = body.kind;

    // 남의 것을 읽으려 하면 여기서 막힌다 (assertSelfOrAdmin)
    const details = await getPartnerDetails(body.userId, actorOf(session));
    if (!details) return bad('협력사 정보를 찾을 수 없습니다.');

    const url = kind === 'bizCert' ? details.bizCertUrl : details.bankbookUrl;
    if (!url) return bad('올려 둔 서류가 없습니다.');
    if (!isAllowedBlobUrl(url)) return bad('서류 주소가 올바르지 않습니다.');

    const res = await fetch(url);
    if (!res.ok) return bad(`서류를 불러오지 못했습니다 (${res.status}).`, 422);
    const file = Buffer.from(await res.arrayBuffer());

    const result = await readPartnerDoc({ file, mediaType: mediaTypeOf(url), kind });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PartnerDocReadError) {
      console.error('[partner-doc] 판독 실패:', err);
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    }
    // 저장소가 던지는 권한 오류가 여기로 온다 — 문구를 그대로 보여준다
    console.error('[partner-doc] 처리 실패:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '판독 중 오류가 발생했습니다.' },
      { status: 422 }
    );
  }
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function isAllowedBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_BLOB_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

function mediaTypeOf(url: string): string {
  const ext = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? '';
  return TYPE_BY_EXT[ext] ?? 'application/pdf';
}

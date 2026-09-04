/**
 * POST /api/upload
 *
 * Vercel Blob 클라이언트 업로드용 토큰 발급.
 * generateClientTokenFromReadWriteToken 방식으로
 * onUploadCompleted 웹훅 없이 동작합니다.
 */
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { stagePrefix } from '@/lib/intake-stage';

/*
 * ★접수 ZIP 토큰은 더 내주지 않는다★ (한백 지시 2026-08-26 — 포털 접수를 닫았다).
 *
 * 로그인 없이 100MB 를 우리 저장소에 올릴 수 있는 문이었다. 접수 화면을 안내로 바꿔도
 * 이 문이 열려 있으면 주소만 알면 계속 올릴 수 있다(REFACTOR_PLAN_2 의 B — 무로그인 API
 * 남용 방지). 콘솔 접수는 자기 문으로 올린다(/api/projects/intake-zip, 로그인 필요).
 *
 * 남는 것은 계약서 작성 폼의 스캔 PDF 하나뿐이다 — 포털은 그 입구로 계속 열려 있다.
 */
const PDF_CONTENT_TYPES = ['application/pdf', 'application/octet-stream'];

export async function POST(request: Request) {
  /*
   * ★로그인 없이는 토큰을 내주지 않는다★ (한백 지시 2026-08-27).
   * 판독(/api/import-form)을 로그인 뒤로 옮겼으니 그 앞의 업로드 문도 같이 잠근다 —
   * 열어 두면 판독은 못 해도 우리 저장소에 30MB 씩 계속 올릴 수 있다.
   */
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    /*
     * ★경로를 서버가 만든다★ (감사 2026-09-04 H9).
     *
     * 전에는 클라이언트가 지어 보낸 `form-import-{시각}.pdf` 를 모양만 보고 받았다.
     * 그 자리에는 계정이 없다 — 누가 올린 파일인지 주소만으로는 알 수 없어서, 판독
     * 라우트(/api/import-form)가 「우리 호스트인가」밖에 물을 수 없었다. 그 라우트는
     * 끝나면 그 주소를 지우므로, 로그인한 아무 계정이나 우리 스토어의 임의 주소를
     * 넣어 ★현장 서류 원본을 지울 수 있었다★.
     *
     * 접수 ZIP·PDF 분할이 이미 이 방식이다(intake-zip·pdf-sort) — 계정별 임시 자리에
     * 서버가 경로를 만들어 토큰과 함께 돌려준다. 그러면 판독 라우트가 경로만 보고
     * 「내가 올린 것인가」를 판정할 수 있다(stagedPathnameOf). 임시 자리라 사흘 뒤
     * 청소도 같이 걷어간다(sweepStaleStaging) — 루트에 남아 아무도 못 지우던 것이
     * 저장소를 채운 적이 있다(lib/intake-stage 머리말).
     */
    const pathname = `${stagePrefix(session.id)}/form-import-${Date.now()}.pdf`;

    // 토큰 유효기간: 10분 (기본값 30초 → 큰 파일 업로드 시 만료 방지)
    const validUntil = Date.now() + 10 * 60 * 1000;

    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      pathname,
      validUntil,
      allowedContentTypes: PDF_CONTENT_TYPES,
      // 스캔 PDF — Claude 입력 한도에 맞춘 상한
      maximumSizeInBytes: 30 * 1024 * 1024,
    });

    /* 경로도 같이 돌려준다 — 클라이언트가 지으면 토큰이 묶인 경로와 어긋난다 */
    return NextResponse.json({ token: clientToken, pathname });
  } catch (error) {
    console.error('[upload] 토큰 생성 실패:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

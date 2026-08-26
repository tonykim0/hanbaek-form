/**
 * POST /api/upload
 *
 * Vercel Blob 클라이언트 업로드용 토큰 발급.
 * generateClientTokenFromReadWriteToken 방식으로
 * onUploadCompleted 웹훅 없이 동작합니다.
 */
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

/*
 * ★접수 ZIP 토큰은 더 내주지 않는다★ (한백 지시 2026-08-26 — 포털 접수를 닫았다).
 *
 * 로그인 없이 100MB 를 우리 저장소에 올릴 수 있는 문이었다. 접수 화면을 안내로 바꿔도
 * 이 문이 열려 있으면 주소만 알면 계속 올릴 수 있다(REFACTOR_PLAN_2 의 B — 무로그인 API
 * 남용 방지). 콘솔 접수는 자기 문으로 올린다(/api/projects/intake-zip, 로그인 필요).
 *
 * 남는 것은 계약서 작성 폼의 스캔 PDF 하나뿐이다 — 포털은 그 입구로 계속 열려 있다.
 */
/** 계약서류 스캔 PDF → 입력폼 역추출 (/api/import-form) 용 업로드 */
const FORM_IMPORT_PATH_RE = /^form-import-\d+\.pdf$/;

const PDF_CONTENT_TYPES = ['application/pdf', 'application/octet-stream'];

export async function POST(request: Request) {
  try {
    const { pathname } = (await request.json()) as {
      pathname?: string;
    };

    const isFormImport = !!pathname && FORM_IMPORT_PATH_RE.test(pathname);

    if (!pathname || !isFormImport) {
      return NextResponse.json(
        { error: '업로드 경로가 올바르지 않습니다.' },
        { status: 400 }
      );
    }

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

    return NextResponse.json({ token: clientToken });
  } catch (error) {
    console.error('[upload] 토큰 생성 실패:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

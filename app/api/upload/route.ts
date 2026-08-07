/**
 * POST /api/upload
 *
 * Vercel Blob 클라이언트 업로드용 토큰 발급.
 * generateClientTokenFromReadWriteToken 방식으로
 * onUploadCompleted 웹훅 없이 동작합니다.
 */
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

const INTAKE_UPLOAD_PATH_RE = /^intake-\d+\.zip$/;
/** 계약서류 스캔 PDF → 입력폼 역추출 (/api/import-form) 용 업로드 */
const FORM_IMPORT_PATH_RE = /^form-import-\d+\.pdf$/;

const ZIP_CONTENT_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
];
const PDF_CONTENT_TYPES = ['application/pdf', 'application/octet-stream'];

export async function POST(request: Request) {
  try {
    const { pathname } = (await request.json()) as {
      pathname?: string;
    };

    const isIntake = !!pathname && INTAKE_UPLOAD_PATH_RE.test(pathname);
    const isFormImport = !!pathname && FORM_IMPORT_PATH_RE.test(pathname);

    if (!pathname || (!isIntake && !isFormImport)) {
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
      allowedContentTypes: isFormImport ? PDF_CONTENT_TYPES : ZIP_CONTENT_TYPES,
      maximumSizeInBytes: isFormImport
        ? 30 * 1024 * 1024 // 스캔 PDF — Claude 입력 한도에 맞춘 상한
        : 100 * 1024 * 1024,
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

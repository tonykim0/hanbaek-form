/**
 * POST /api/upload
 *
 * Vercel Blob 클라이언트 업로드용 토큰 발급.
 * generateClientTokenFromReadWriteToken 방식으로
 * onUploadCompleted 웹훅 없이 동작합니다.
 */
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { pathname } = (await request.json()) as { pathname: string };

    // 토큰 유효기간: 10분 (기본값 30초 → 큰 파일 업로드 시 만료 방지)
    const validUntil = Date.now() + 10 * 60 * 1000;

    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      pathname,
      validUntil,
      allowedContentTypes: [
        'application/zip',
        'application/x-zip-compressed',
        'application/octet-stream',
      ],
      maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
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

/**
 * POST /api/upload
 *
 * Vercel Blob 클라이언트 업로드용 토큰 발급 엔드포인트.
 * 브라우저에서 ZIP 파일을 Vercel Blob에 직접 업로드할 수 있도록
 * 임시 토큰을 생성합니다.
 */
import { handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'application/zip',
          'application/x-zip-compressed',
          'application/octet-stream',
        ],
        maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
      }),
      onUploadCompleted: async () => {
        // 업로드 완료 후 별도 처리 없음 (intake API에서 처리)
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

/**
 * POST /api/materials/upload-token
 *
 * 자료실 업로드용 Vercel Blob 클라이언트 토큰 발급.
 * 관리자 비밀번호(MATERIALS_ADMIN_PASSWORD)를 확인한 뒤,
 * `materials/<운영사>/<분류>/<파일명>` 경로에 한해 토큰을 내줍니다.
 *
 * 브라우저가 Blob에 직접 올리므로 서버 요청 크기 제한을 받지 않습니다.
 */
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { isValidMaterialPath } from '@/lib/materials-meta';
import { requireAdmin } from '@/lib/auth/guard';

/** 업로드 허용 최대 크기 — 원본 브로슈어 등 대용량 자료를 위해 500MB */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export async function POST(request: Request) {
  // 페이지 게이트만으로는 부족하다 — API 는 직접 호출될 수 있다
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: '관리자만 사용할 수 있습니다.' }, { status: 403 });
  }

  try {
    const { password, pathname } = (await request.json()) as {
      password?: string;
      pathname?: string;
    };

    const adminPassword = process.env.MATERIALS_ADMIN_PASSWORD;
    if (!adminPassword) {
      return NextResponse.json(
        {
          error:
            '관리자 비밀번호가 설정되지 않았습니다. Vercel 환경변수 MATERIALS_ADMIN_PASSWORD를 등록해주세요.',
        },
        { status: 500 }
      );
    }

    if (!password || password !== adminPassword) {
      return NextResponse.json(
        { error: '비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: '파일 저장소(Vercel Blob)가 연결되지 않았습니다.' },
        { status: 500 }
      );
    }

    if (!pathname || !isValidMaterialPath(pathname)) {
      return NextResponse.json(
        { error: '업로드 경로가 올바르지 않습니다.' },
        { status: 400 }
      );
    }

    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      pathname,
      // 대용량 파일 업로드 중 만료되지 않도록 넉넉히 (60분)
      validUntil: Date.now() + 60 * 60 * 1000,
      // 파일명을 그대로 경로로 쓰고, 같은 이름으로 다시 올리면 교체되도록
      addRandomSuffix: false,
      allowOverwrite: true,
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
    });

    return NextResponse.json({ token: clientToken });
  } catch (error) {
    console.error('[materials/upload-token] 토큰 생성 실패:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

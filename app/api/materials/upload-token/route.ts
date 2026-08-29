/**
 * POST /api/materials/upload-token
 *
 * 자료실 업로드용 Vercel Blob 클라이언트 토큰 발급.
 * 관리자 비밀번호(MATERIALS_ADMIN_PASSWORD)를 확인한 뒤,
 * `materials/<운영사>/<분류>/<파일명>` 경로에 한해 토큰을 내줍니다.
 *
 * 브라우저가 Blob에 직접 올리므로 서버 요청 크기 제한을 받지 않습니다.
 */
import { copy, head } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { archivePathOf, archiveStamp, isValidMaterialPath } from '@/lib/materials-meta';
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

    /*
     * ★덮어쓰기 전에 옛 본을 옮겨 둔다★ (2026-08-29).
     *
     * 자료실은 같은 이름으로 다시 올리면 교체되도록 열려 있다(allowOverwrite) — 사업자
     * 등록증·보험증권처럼 이름이 고정이고 내용만 갱신되는 자료가 있어서 그 편이 맞다.
     * 그런데 Blob 에는 버전도 휴지통도 없어서, 교체되는 순간 옛 본이 영영 사라졌다.
     * 목록 밖 보관 자리로 한 부 복사해 두고 교체한다 — 화면에는 최신 하나만 남고,
     * 잘못 올렸을 때 되돌릴 것이 남는다.
     *
     * 실패해도 업로드를 막지는 않는다: 보관은 보험이지 조건이 아니다. 다만 조용히
     * 넘기지 않고 로그에 남긴다.
     */
    const existing = await head(pathname).catch(() => null);
    if (existing) {
      try {
        await copy(existing.url, archivePathOf(pathname, archiveStamp()), {
          access: 'public',
          addRandomSuffix: false,
          contentType: existing.contentType,
        });
      } catch (err) {
        console.error('[materials/upload-token] 옛 본 보관 실패:', pathname, err);
      }
    }

    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      pathname,
      // 대용량 파일 업로드 중 만료되지 않도록 넉넉히 (60분)
      validUntil: Date.now() + 60 * 60 * 1000,
      // 파일명을 그대로 경로로 쓰고, 같은 이름으로 다시 올리면 교체되도록 (옛 본은 위에서 보관했다)
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

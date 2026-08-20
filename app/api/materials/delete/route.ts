/**
 * POST /api/materials/delete
 *
 * 자료실 파일 삭제. 관리자 비밀번호를 확인한 뒤 Blob에서 지웁니다.
 * 자료실 경로(materials/…) 밖의 파일은 삭제하지 않습니다.
 */
import { del, head } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { isValidMaterialPath, MATERIALS_PREFIX } from '@/lib/materials-meta';
import { requireAdmin } from '@/lib/auth/guard';

export async function POST(request: Request) {
  // 페이지 게이트만으로는 부족하다 — API 는 직접 호출될 수 있다
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: '관리자만 사용할 수 있습니다.' }, { status: 403 });
  }

  try {
    const { password, url } = (await request.json()) as {
      password?: string;
      url?: string;
    };

    const adminPassword = process.env.MATERIALS_ADMIN_PASSWORD;
    if (!adminPassword) {
      return NextResponse.json(
        { error: '관리자 비밀번호가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    if (!password || password !== adminPassword) {
      return NextResponse.json(
        { error: '비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    if (!url) {
      return NextResponse.json(
        { error: '삭제할 파일이 지정되지 않았습니다.' },
        { status: 400 }
      );
    }

    // URL이 실제로 자료실 경로의 파일인지 확인한 뒤 삭제
    const info = await head(url);
    if (
      !info.pathname.startsWith(MATERIALS_PREFIX) ||
      !isValidMaterialPath(info.pathname)
    ) {
      return NextResponse.json(
        { error: '자료실 파일이 아닙니다.' },
        { status: 400 }
      );
    }

    await del(url);

    return NextResponse.json({ ok: true, pathname: info.pathname });
  } catch (error) {
    console.error('[materials/delete] 삭제 실패:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

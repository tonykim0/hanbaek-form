/**
 * POST /api/materials/rename — 자료의 자리를 옮긴다 (이름 · 분류)
 *
 * Blob 안에서 복사한 뒤 원본을 지우는 방식이라 파일을 다시 올릴 필요가 없습니다
 * (대용량 파일도 서버에서 처리).
 *
 * 파일명이 곧 화면에 보이는 자료명이므로, 자동 정리 규칙으로 부족할 때
 * 이 기능으로 제목을 직접 다듬습니다.
 *
 * ★분류 옮기기도 같은 일이다 (2026-08-28).★ 둘 다 「경로를 바꾼다」이고, 분류를
 * 여섯으로 가르면서(materials-meta) 이미 올라간 30건을 다시 나눌 길이 필요해졌다.
 * 따로 라우트를 두면 비밀번호 확인·경로 검사·덮어쓰기 방지가 두 벌이 된다.
 * 이름만 · 분류만 · 둘 다 — 무엇을 넘기든 안 넘긴 쪽은 그대로다.
 */
import { copy, del, head } from '@vercel/blob';
import { NextResponse } from 'next/server';
import {
  MATERIALS_PREFIX,
  UPLOAD_CATEGORY_KEYS,
  isValidMaterialPath,
  sanitizeFileName,
} from '@/lib/materials-meta';
import { requireAdmin } from '@/lib/auth/guard';

export async function POST(request: Request) {
  // 페이지 게이트만으로는 부족하다 — API 는 직접 호출될 수 있다
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: '관리자만 사용할 수 있습니다.' }, { status: 403 });
  }

  try {
    const { password, url, newFileName, newCategory } = (await request.json()) as {
      password?: string;
      url?: string;
      newFileName?: string;
      newCategory?: string;
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

    if (!url || (!newFileName?.trim() && !newCategory)) {
      return NextResponse.json(
        { error: '바꿀 이름도 분류도 없습니다.' },
        { status: 400 }
      );
    }
    // 옛 분류로 되돌리는 길은 두지 않는다 — 옮기는 것은 새 분류로만
    if (newCategory && !UPLOAD_CATEGORY_KEYS.includes(newCategory)) {
      return NextResponse.json({ error: '없는 분류입니다.' }, { status: 400 });
    }

    const info = await head(url);
    if (!isValidMaterialPath(info.pathname)) {
      return NextResponse.json({ error: '자료실 파일이 아닙니다.' }, { status: 400 });
    }

    const [group, category, oldFileName] = info.pathname
      .slice(MATERIALS_PREFIX.length)
      .split('/');

    // 이름을 안 넘겼으면 쓰던 이름 그대로 — 분류만 옮기는 경우다
    let nextName = oldFileName;
    if (newFileName?.trim()) {
      // 확장자는 원본을 그대로 유지합니다 (빠뜨리고 입력해도 붙여줌)
      const dot = oldFileName.lastIndexOf('.');
      const ext = dot > 0 ? oldFileName.slice(dot) : '';
      nextName = sanitizeFileName(newFileName.trim());
      if (ext && nextName.toLowerCase().endsWith(ext.toLowerCase())) {
        nextName = nextName.slice(0, nextName.length - ext.length);
      }
      nextName = `${nextName.trim()}${ext}`;
    }

    const nextPath = `${MATERIALS_PREFIX}${group}/${newCategory ?? category}/${nextName}`;
    if (!isValidMaterialPath(nextPath)) {
      return NextResponse.json(
        { error: '바꿀 이름에 쓸 수 없는 문자가 있습니다.' },
        { status: 400 }
      );
    }

    if (nextPath === info.pathname) {
      return NextResponse.json({ ok: true, pathname: info.pathname });
    }

    // 같은 이름이 이미 있으면 덮어쓰지 않고 멈춥니다
    let exists = false;
    try {
      await head(nextPath);
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) {
      return NextResponse.json(
        { error: '같은 이름의 자료가 이미 있습니다.' },
        { status: 409 }
      );
    }

    await copy(url, nextPath, { access: 'public', addRandomSuffix: false });
    await del(url);

    return NextResponse.json({ ok: true, pathname: nextPath });
  } catch (error) {
    console.error('[materials/rename] 이름 변경 실패:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

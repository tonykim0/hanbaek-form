/**
 * POST /api/materials/rename
 *
 * 자료 이름 바꾸기. Blob 안에서 복사한 뒤 원본을 지우는 방식이라
 * 파일을 다시 올릴 필요가 없습니다(대용량 파일도 서버에서 처리).
 *
 * 파일명이 곧 화면에 보이는 자료명이므로, 자동 정리 규칙으로 부족할 때
 * 이 기능으로 제목을 직접 다듬습니다.
 */
import { copy, del, head } from '@vercel/blob';
import { NextResponse } from 'next/server';
import {
  MATERIALS_PREFIX,
  isValidMaterialPath,
  sanitizeFileName,
} from '@/lib/materials-meta';

export async function POST(request: Request) {
  try {
    const { password, url, newFileName } = (await request.json()) as {
      password?: string;
      url?: string;
      newFileName?: string;
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

    if (!url || !newFileName?.trim()) {
      return NextResponse.json(
        { error: '바꿀 이름이 비어 있습니다.' },
        { status: 400 }
      );
    }

    const info = await head(url);
    if (!isValidMaterialPath(info.pathname)) {
      return NextResponse.json({ error: '자료실 파일이 아닙니다.' }, { status: 400 });
    }

    const [group, category, oldFileName] = info.pathname
      .slice(MATERIALS_PREFIX.length)
      .split('/');

    // 확장자는 원본을 그대로 유지합니다 (빠뜨리고 입력해도 붙여줌)
    const dot = oldFileName.lastIndexOf('.');
    const ext = dot > 0 ? oldFileName.slice(dot) : '';
    let nextName = sanitizeFileName(newFileName.trim());
    if (ext && nextName.toLowerCase().endsWith(ext.toLowerCase())) {
      nextName = nextName.slice(0, nextName.length - ext.length);
    }
    nextName = `${nextName.trim()}${ext}`;

    const nextPath = `${MATERIALS_PREFIX}${group}/${category}/${nextName}`;
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

import { NextResponse } from 'next/server';
import { userStore } from '@/lib/auth/users';
import { createSessionToken } from '@/lib/auth/session';
import { SESSION_COOKIE, SESSION_TTL_SEC } from '@/lib/auth/types';

export async function POST(request: Request) {
  let body: { id?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }

  const id = body.id?.trim() ?? '';
  const password = body.password ?? '';
  if (!id || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요.' }, { status: 400 });
  }

  const user = await userStore.authenticate(id, password);
  if (!user) {
    // 아이디가 없는지 비밀번호가 틀린지 구분해서 알려주지 않는다
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SEC,
  });
  return response;
}

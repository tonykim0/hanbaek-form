import { NextResponse } from 'next/server';
import { userStore } from '@/lib/auth/users';
import { createSessionToken } from '@/lib/auth/session';
import { checkLoginThrottle } from '@/lib/auth/throttle';
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

  /*
   * 시도 횟수 제한 — 비밀번호를 확인하기 전에 본다.
   *
   * 비밀번호 최소 길이가 4자라(PASSWORD_MIN_LEN) 조합이 만 가지뿐이다. 해싱만으로는
   * 이 문을 못 막는다 — lib/auth/throttle.ts 에 왜와 방식을 적었다.
   * 계정이 있든 없든 똑같이 걸린다. 이 응답으로 ID 존재 여부를 알 수 없다.
   */
  const throttle = await checkLoginThrottle(request, id);
  if (throttle.lockedForSec !== null) {
    const min = Math.ceil(throttle.lockedForSec / 60);
    return NextResponse.json(
      {
        error: `로그인 시도가 너무 많습니다. ${min}분 뒤에 다시 시도하세요.`
          + ' 비밀번호를 잊었다면 한백 담당자에게 재설정을 요청하세요.',
      },
      { status: 429, headers: { 'Retry-After': String(throttle.lockedForSec) } }
    );
  }

  const user = await userStore.authenticate(id, password);
  if (!user) {
    await throttle.onFail();
    // 아이디가 없는지 비밀번호가 틀린지 구분해서 알려주지 않는다
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  await throttle.onSuccess();

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

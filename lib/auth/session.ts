/**
 * 세션 쿠키 — 서명된 payload 하나. 서버 세션 저장소가 없다.
 *
 * ★쿠키만 믿지 않는다★
 * 저장소가 없으니 발급된 쿠키는 만료(12시간)까지 스스로 유효하다. 그래서 계정을 중지하거나
 * 지워도 그 사람은 최대 12시간 동안 화면을 계속 열 수 있었다 — 지운 계정으로 /design 이
 * 열리는 것을 확인했다(2026-08-20). 구분을 관리자에서 협력사로 내려도 그동안 원가·마진이
 * 계속 보였다.
 *
 * 그래서 매 요청에 계정을 한 번 다시 본다(accountForSession). 요청 하나에 여러 번
 * 부르므로 React cache 로 묶어 조회는 한 번만 간다 — 화면 하나가 이 함수를 두세 번 부른다.
 *
 * 미들웨어는 그대로 서명만 본다. 엣지에서 돌아 DB 를 볼 수 없다 — 중지된 계정은
 * 미들웨어를 통과하지만 그 다음 화면이 세션을 못 얻어 로그인으로 돌아간다.
 */
import { cache } from 'react';
import { cookies } from 'next/headers';
import { signPayload, verifyPayload } from './crypto';
import { accountForSession } from './users';
import { SESSION_COOKIE, SESSION_TTL_SEC, type Actor, type SessionPayload, type User, type Viewer } from './types';

/** 운영에서 AUTH_SECRET 이 없으면 서명 키가 없는 것이므로 기동을 막는다 */
export function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET 이 없습니다 (16자 이상). 운영에서는 필수입니다.');
  }
  return 'dev-only-insecure-secret-do-not-ship';
}

export async function createSessionToken(user: User): Promise<string> {
  const payload: SessionPayload = {
    id: user.id,
    name: user.name,
    role: user.role,
    org: user.org,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  };
  return signPayload(payload, getSecret());
}

/** 서버 컴포넌트·라우트 핸들러에서 현재 로그인 사용자 */
export const getSessionUser = cache(async (): Promise<SessionPayload | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const signed = await verifyPayload<SessionPayload>(token, getSecret());
  if (!signed) return null;

  const live = await accountForSession(signed.id);
  if (live === 'gone') return null;

  // 못 봤으면 쿠키에 실린 값을 그대로 쓴다 — DB 가 한 번 끊겼다고 전원을 내보내지 않는다
  if (live === 'unknown') return signed;

  // 이름·구분·소속은 지금 값이 정본이다. 쿠키의 값은 발급 시점의 것이라 낡을 수 있다.
  return { ...signed, name: live.name, role: live.role, org: live.org };
});

/** 쓰기를 일으킨 사람 — 감사 로그에 남길 최소 정보 */
export function actorOf(session: SessionPayload): Actor {
  return { id: session.id, name: session.name, role: session.role, org: session.org };
}

export function viewerOf(session: SessionPayload): Viewer {
  return { role: session.role, org: session.org };
}

export { SESSION_COOKIE, SESSION_TTL_SEC };

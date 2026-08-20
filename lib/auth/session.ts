/**
 * 세션 쿠키 — 서명된 payload 하나. 서버 세션 저장소가 없다.
 */
import { cookies } from 'next/headers';
import { signPayload, verifyPayload } from './crypto';
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
export async function getSessionUser(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyPayload<SessionPayload>(token, getSecret());
}

/** 쓰기를 일으킨 사람 — 감사 로그에 남길 최소 정보 */
export function actorOf(session: SessionPayload): Actor {
  return { id: session.id, name: session.name, role: session.role, org: session.org };
}

export function viewerOf(session: SessionPayload): Viewer {
  return { role: session.role, org: session.org };
}

export { SESSION_COOKIE, SESSION_TTL_SEC };

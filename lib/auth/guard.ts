/**
 * 라우트 핸들러용 권한 확인.
 *
 * 미들웨어는 페이지 진입만 막는다 — API 는 직접 호출될 수 있으므로 각 핸들러가 스스로 확인해야 한다.
 * (페이지만 잠그고 API 를 열어두면 게이트가 껍데기가 된다)
 */
import { getSessionUser } from './session';
import type { SessionPayload } from './types';

/** 한백 관리자 세션이면 돌려주고, 아니면 null */
export async function requireAdmin(): Promise<SessionPayload | null> {
  const session = await getSessionUser();
  if (!session || session.role !== 'admin') return null;
  return session;
}

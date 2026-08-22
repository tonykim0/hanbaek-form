/**
 * 라우트 핸들러용 권한 확인.
 *
 * 미들웨어는 페이지 진입만 막는다 — API 는 직접 호출될 수 있으므로 각 핸들러가 스스로 확인해야 한다.
 * (페이지만 잠그고 API 를 열어두면 게이트가 껍데기가 된다)
 */
import { canWrite } from '@/lib/roles';
import { getSessionUser } from './session';
import type { SessionPayload } from './types';

/** 한백 관리자 세션이면 돌려주고, 아니면 null */
export async function requireAdmin(): Promise<SessionPayload | null> {
  const session = await getSessionUser();
  if (!session || session.role !== 'admin') return null;
  return session;
}

/**
 * 쓰기를 할 수 있는 세션이면 돌려주고, 아니면 null — 열람 전용이 여기서 걸린다.
 *
 * 쓰기 라우트 대부분은 lib/api/write-route 껍데기가 막지만, 껍데기를 못 쓰는 라우트가
 * 넷 있다(서류 올리기 두 개 · 접수 파일 두 개 — 각 파일 머리말에 이유가 적혀 있다).
 * 그 넷이 부르는 자리다. 「로그인했는가」만 묻고 지나가면 열람 전용이 서류를 올린다.
 */
export async function requireWriter(): Promise<SessionPayload | null> {
  const session = await getSessionUser();
  if (!session || !canWrite(session.role)) return null;
  return session;
}

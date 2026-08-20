/**
 * 한백 전용 구역 — 계정·자료실 관리 · 재발행 · 기성 · 지급 · 디자인 기준.
 *
 * ★왜 그룹으로 묶는가★
 * 미들웨어에도 관리자 전용 목록이 있지만 그것은 엣지에서 돌아 DB 를 볼 수 없다 —
 * 쿠키에 박힌 구분을 그대로 읽는다. 그래서 관리자였던 계정을 협력사로 내려도 그 쿠키로
 * 이 화면들이 최대 12시간 열렸다. 세 화면(디자인 기준 · 자료실 관리 · 재발행)은 스스로
 * 구분을 확인하지도 않아서 미들웨어가 유일한 문이었다.
 *
 * 화면마다 확인을 적어 두면 다음에 만드는 화면이 빠뜨린다. URL 은 그대로 두고(괄호 그룹은
 * 주소에 안 나온다) 문을 하나만 둔다 — 이 아래 새 화면을 만들면 저절로 잠긴다.
 *
 * 미들웨어 쪽 목록은 그대로 남긴다. 그쪽이 빠른 길이라 대부분은 화면을 그리기 전에 걸린다.
 */
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  // 로그인 자체가 없는 경우는 콘솔 레이아웃이 먼저 로그인으로 보낸다
  if (session && session.role !== 'admin') redirect('/projects');
  return <>{children}</>;
}

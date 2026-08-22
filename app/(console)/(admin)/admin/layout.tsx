/**
 * 관리 구역 — 계정설정 · 자료실 관리 · 협력사 정보 · 서류 재발행.
 *
 * 바깥의 (admin) 레이아웃은 「한백의 눈인가」까지만 본다 — 열람 전용이 통과한다. 여기는
 * 바꾸는 자리라 한 겹 더 막는다. 열람 전용에게 이 화면들을 열면 눌리지 않는 단추만 늘어선
 * 화면이 되고, 계정 목록·사업자등록증·통장사본처럼 볼 이유가 없는 것까지 딸려 나간다.
 *
 * 쓰기 자체는 API 가 이미 막는다(lib/api/write-route). 여기 문은 그 앞에서 화면을 안
 * 보여주는 것 — 못 하는 일은 눌리지 않게 두는 쪽이다(화면 규칙 3번).
 */
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  // 로그인 자체가 없는 경우는 콘솔 레이아웃이 먼저 로그인으로 보낸다
  if (session && session.role !== 'admin') redirect('/projects');
  return <>{children}</>;
}

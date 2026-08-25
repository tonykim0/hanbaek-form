/**
 * 관리 구역에서 ★바꾸는★ 화면 — 계정설정 · 자료실 관리 · 서류 재발행.
 *
 * 바깥의 (admin) 레이아웃은 「한백의 눈인가」까지만 본다 — 열람 전용이 통과한다. 여기는
 * 바꾸는 자리라 한 겹 더 막는다. 열람 전용에게 이 화면들을 열면 눌리지 않는 단추만 늘어선
 * 화면이 되고, 계정 목록·비밀번호처럼 볼 이유가 없는 것까지 딸려 나간다.
 *
 * ★문이 /admin 에서 한 층 내려왔다(한백 지시 2026-08-25).★
 * 예전에는 admin/layout.tsx 가 /admin/* 전부를 관리자로 막았다. 재무팀(열람 전용)이
 * 협력사 정보 — 사업자등록증·통장사본·정산 계좌 — 를 봐야 하는데, 그건 지급 전마다 보는
 * 값이라 계정설정과 같은 문 뒤에 있을 이유가 없다. 괄호 그룹은 주소에 안 나오므로
 * /admin/accounts 같은 주소는 그대로다.
 *
 * ★그래서 새 화면은 여기 안에 만든다.★ admin/ 바로 밑에 만들면 열람 전용도 보게 된다 —
 * 보여도 되는 화면(협력사 정보처럼)만 거기 둔다. 미들웨어는 /admin 전체를 관리자 전용으로
 * 두고 열어 준 주소만 빼 두므로(middleware.ts adminReadable), 깜빡해도 엣지에서 한 번
 * 걸린다. 다만 그쪽은 쿠키를 읽어 최대 12시간 낡을 수 있어 진짜 문은 여기다.
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

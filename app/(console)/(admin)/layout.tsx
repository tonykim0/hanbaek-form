/**
 * 한백 구역 — 기성 · 단가 케이스 · 디자인 기준, 그리고 그 아래 admin/ 의 관리 화면들.
 *
 * ★문이 두 겹이다.★ 여기는 「한백의 눈인가」만 본다 — 관리자와 열람 전용이 통과한다.
 * 바꾸는 화면(계정설정 · 자료실 관리 · 재발행)은 두 층 안쪽 admin/(write)/layout.tsx 가
 * 다시 「관리자인가」로 막는다. 화면마다 확인을 적지 않아도 된다.
 *
 * 협력사 정보(/admin/partners)만 그 문 밖에 있다 — 재무팀(열람 전용)이 지급 전에 보는
 * 사업자등록증·통장사본·정산 계좌다(한백 지시 2026-08-25). 주소는 /admin/* 그대로고
 * (괄호 그룹은 주소에 안 나온다), 고치는 단추는 화면이 걷는다.
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
import { isHanbaek } from '@/lib/roles';

export default async function HanbaekLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  // 로그인 자체가 없는 경우는 콘솔 레이아웃이 먼저 로그인으로 보낸다
  if (session && !isHanbaek(session.role)) redirect('/projects');
  return <>{children}</>;
}

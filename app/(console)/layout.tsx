import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import ConsoleShell from '@/components/ConsoleShell';

/**
 * 콘솔 구역.
 *
 * 포털(hanbaek-form)의 SiteHeader 를 쓰지 않는다 — 다른 사이트다.
 * 로그인 화면도 이 구역에 있어서, 세션이 없으면 껍데기 없이 그대로 통과시킨다.
 *
 * 껍데기 자체는 클라이언트 컴포넌트다(사이드바를 접고 펴야 한다). 세션은 여기서 읽어
 * 소속·역할만 내려보낸다 — 껍데기가 세션을 직접 만지지 않게 한다.
 * 사람 이름은 넘기지 않는다. 회사마다 계정이 하나라 화면에 적을 뜻이 없다.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  /*
   * ★게이트가 여기 있다★
   * 미들웨어도 막지만 그것은 엣지에서 돌아 DB 를 볼 수 없다 — 서명만 확인하므로 중지·삭제된
   * 계정의 쿠키도 통과한다. 계정이 아직 살아 있는지는 getSessionUser 가 본다.
   *
   * 예전에는 세션이 없으면 껍데기 없이 children 을 그냥 그렸다. 그래서 스스로 세션을 확인하지
   * 않는 화면(/design)은 중지된 계정으로도 열렸다 — 사이드바만 없는 채로. 화면마다 확인을
   * 적게 두면 다음에 만드는 화면이 빠뜨린다. 콘솔의 모든 화면이 이 레이아웃 아래 있으므로
   * 여기 한 곳에서 막는다.
   *
   * 로그인 화면은 이 그룹 밖(app/(auth)/login)에 있다 — 안에 두면 여기서 자기 자신으로
   * 되돌리는 고리가 생긴다.
   */
  const session = await getSessionUser();
  if (!session) redirect('/login');

  return (
    <ConsoleShell org={session.org} role={session.role}>
      {children}
    </ConsoleShell>
  );
}

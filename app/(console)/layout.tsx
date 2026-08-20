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
  const session = await getSessionUser();
  if (!session) return <>{children}</>;

  return (
    <ConsoleShell org={session.org} role={session.role}>
      {children}
    </ConsoleShell>
  );
}

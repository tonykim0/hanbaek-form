import { redirect } from 'next/navigation';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { userStore } from '@/lib/auth/users';
import { getRepository } from '@/lib/data';
import AccountAdmin from '@/components/AccountAdmin';

export const metadata = {
  title: '설정 — 한백 전기차사업관리',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * 설정 — 협력사 계정 등록.
 *
 * 소속(org)은 자유 입력이지만, 현장의 영업사·시공사 이름과 글자 하나까지 같아야 한다.
 * 다르면 그 계정은 로그인은 되는데 현장이 하나도 안 보인다(canAccessProject 가 문자열
 * 비교다). 그래서 지금 현장에 쓰이고 있는 소속 목록을 화면에 같이 내려보내 골라 넣게 한다.
 */
export default async function AccountsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/admin/accounts');
  if (session.role !== 'admin') redirect('/projects');

  const [accounts, projects] = await Promise.all([
    userStore.list(),
    getRepository().listProjects(viewerOf(session)),
  ]);

  const knownOrgs = [
    ...new Set(projects.flatMap((p) => [p.salesOrg, p.gcOrg].filter(Boolean) as string[])),
  ].sort((a, b) => a.localeCompare(b, 'ko'));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">설정</h1>
        <p className="mt-1.5 text-base text-slate-500">
          협력사 계정 등록 · 계정 {accounts.length}개
        </p>
      </div>

      {/* 협력사 정보(사업자등록증·계좌)는 /admin/partners 로 뗐다 — 드나드는 결이 다르다 */}
      <AccountAdmin
        accounts={accounts}
        knownOrgs={knownOrgs}
        meId={session.id}
        dbReady
      />
    </>
  );
}

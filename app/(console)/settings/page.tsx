import { redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { userStore } from '@/lib/auth/users';
import { getPartnerDetails } from '@/lib/auth/partner-details';
import { canWrite } from '@/lib/roles';
import PartnerDetailsSection from '@/components/PartnerDetailsSection';

export const metadata = {
  title: '협력사 정보 — 한백 전기차사업관리',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * 협력사 정보 — 협력사가 자기 사업자등록증·정산 계좌를 스스로 적는 자리.
 *
 * 한백은 계정설정(/admin/accounts)에서 전 계정을 한 표로 보므로 그리로 보낸다.
 * 남의 것은 저장소(assertSelfOrAdmin)가 막는다 — 이 화면은 자기 한 줄만 내려받는다.
 */
export default async function SettingsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/settings');
  // 한백은 계정설정에서 전 계정을 한 표로 본다. 열람 전용은 적을 자기 정보가 없다.
  if (session.role === 'admin') redirect('/admin/accounts');
  if (!canWrite(session.role)) redirect('/projects');

  const [accounts, details] = await Promise.all([
    userStore.list(), // 서버에서 자기 것만 골라 내려보낸다 — 목록 전체는 클라이언트로 가지 않는다
    getPartnerDetails(session.id, actorOf(session)),
  ]);
  const me = accounts.find((a) => a.id === session.id);
  if (!me) redirect('/projects');

  return (
    <>
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">협력사 정보</h1>
        <p className="mt-1.5 text-base text-slate-500">
          사업자등록증 · 정산 계좌 — 지급이 이 계좌로 나갑니다
        </p>
      </div>

      <PartnerDetailsSection
        accounts={[me]}
        details={details ? { [me.id]: details } : {}}
        dbReady
        heading={false}
      />
    </>
  );
}

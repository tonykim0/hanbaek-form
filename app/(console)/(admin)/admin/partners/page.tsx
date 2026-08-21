import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { userStore } from '@/lib/auth/users';
import { listPartnerDetails } from '@/lib/auth/partner-details';
import { repositoryKind } from '@/lib/data';
import PartnerDetailsSection from '@/components/PartnerDetailsSection';

export const metadata = {
  title: '협력사 정보 — 한백 전기차사업관리',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * 협력사 정보 — 계정마다 사업자등록증·정산 계좌·통장사본.
 *
 * 설정(/admin/accounts)에 얹혀 있던 것을 뗐다(한백 확인) — 계정 등록은 어쩌다 한 번이고,
 * 협력사 정보는 지급 처리 전마다 확인하는 값이라 드나드는 결이 다르다.
 * 협력사 자신은 /settings 에서 자기 것 하나를 고친다 — 같은 부품, 다른 인구.
 */
export default async function PartnersPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/admin/partners');
  if (session.role !== 'admin') redirect('/projects');

  const [accounts, details] = await Promise.all([userStore.list(), listPartnerDetails()]);
  const partners = accounts.filter((a) => a.role !== 'admin');

  return (
    <>
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">협력사 정보</h1>
        <p className="mt-1.5 text-base text-slate-500">
          사업자등록증 · 정산 계좌 — 협력사 {partners.length}곳
        </p>
      </div>

      <PartnerDetailsSection
        accounts={partners}
        details={details}
        dbReady={repositoryKind() === 'postgres'}
        heading={false}
      />
    </>
  );
}

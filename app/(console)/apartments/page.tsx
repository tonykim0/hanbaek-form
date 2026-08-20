import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import KaptApartmentExplorer from '@/components/KaptApartmentExplorer';

export const metadata = { title: '아파트 정보 조회 — 한백 전기차사업관리' };

/**
 * 아파트 정보 조회 (K-apt) — 콘솔 안에서 본다.
 * 포털의 /kapt 와 같은 컴포넌트다(주소를 다르게 둔 이유는 /library 주석 참고).
 *
 * 이 컴포넌트는 자기 <main> 과 좌우 여백을 갖고 있다. 콘솔의 본문 여백과 겹치므로
 * 음수 여백으로 되돌린다 — 포털에서 운영 중인 컴포넌트라 안쪽을 고치지 않는다.
 */
export default async function ApartmentsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/apartments');

  return (
    <div className="-mx-5 -mt-8 sm:-mx-7 sm:-mt-9">
      <KaptApartmentExplorer />
    </div>
  );
}

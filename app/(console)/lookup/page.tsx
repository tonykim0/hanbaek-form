import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import ChargerHistoryLookup from '@/components/ChargerHistoryLookup';
import type { IndexMeta } from '@/lib/charger-history';
import type { SubsidyMeta } from '@/lib/subsidy-history';
import meta from '@/public/data/charger-history/meta.json';
import subsidyMeta from '@/public/data/subsidy-history/meta.json';

export const metadata = { title: '이력 조회 — 한백 전기차사업관리시스템' };

/**
 * 충전기 · 보조금 이력 조회 — 콘솔 안에서 본다.
 * 포털의 /charger-history 와 같은 컴포넌트다(주소를 다르게 둔 이유는 /library 주석 참고).
 */
export default async function LookupPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/lookup');

  return (
    <div className="max-w-[880px]">
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">
          충전기 · 보조금 이력 조회
        </h1>
        <p className="mt-1.5 text-base leading-6 text-slate-500">
          두 개의 DB 를 조회합니다. 별개의 자료이니 일치하지 않는 부분은 실제 현장 확인
          바랍니다. 보조금 이력이 있으면 신규 신청 대수 · 기설치 이력 작성에 그대로 반영해야
          합니다.
        </p>
      </div>

      <ChargerHistoryLookup meta={meta as IndexMeta} subsidyMeta={subsidyMeta as SubsidyMeta} />
    </div>
  );
}

import { redirect } from 'next/navigation';
import { getRepository, repositoryKind } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import PayoutWorkBoard from '@/components/settlement/PayoutWorkBoard';

export const metadata = { title: '하도급사 지급관리 — 한백 전기차충전사업' };

/**
 * 하도급사 지급관리 — 송금 대상·금액·지급일을 확정하는 업무함.
 *
 * ★한백 전용★ 협력사는 자기 지급액도 이 화면으로 보지 않는다 —
 * 여기에는 다른 협력사의 지급 항목이 함께 있다. 자기 것은 지급 내역에서 본다.
 */
export default async function PayoutsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/payouts');
  if (session.role !== 'admin') redirect('/projects');

  const rows = await getRepository().listSettlements(viewerOf(session));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">하도급사 지급관리</h1>
        <p className="mt-1.5 text-base text-slate-500">
          한백 → 하도급사 · 현장 {rows.length}건
        </p>
      </div>

      <PayoutWorkBoard rows={rows} />

      {/*
        * 지급액은 계약 라인에 붙인 단가에서 나오고, 사람이 고치지 않는다. 회차는 1차 70% ·
        * 2차 잔액. 사람은 지급 가능한 줄을 골라 송금 대상·금액·일자를 확정한다.
        */}
      <p className="mt-4 text-small text-slate-400">
        {repositoryKind() === 'file' && '지금은 예시 데이터입니다 (로컬 파일 저장소).'}
      </p>
    </>
  );
}

import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser, viewerOf } from '@/lib/auth/session';
import StatementsBoard from '@/components/settlement/StatementsBoard';

export const metadata = { title: '거래명세서 — 한백 전기차사업관리' };

/**
 * 거래명세서 — 지급 배치를 만들고 · 고치고 · 세금계산서와 대조하는 작업대. [한백]
 *
 * 협력사 지급관리(/payouts)가 「현장마다 언제 무엇이 나가나」라면, 여기는 그 다음
 * 걸음이다: 조건이 찬 회차를 모아 체크해 지급일 하나로 확정하면 배치(지급처 × 지급일)가
 * 서고, 그 배치가 거래명세서 한 장이 된다. 배치 합계(공급가액)는 협력사가 발행하는
 * 세금계산서와 일치해야 한다 — 그 대조와 보관이 이 화면의 일이다.
 *
 * (admin) 그룹 아래라 한백의 눈만 든다. 확정·수정은 관리자만(canConfirm) —
 * 열람 전용은 풀과 배치를 읽기만 한다.
 */
export default async function StatementsPage() {
  const session = await getSessionUser();
  // 눈은 (admin) 레이아웃이 봤다 — 세션 없음은 콘솔 레이아웃이 먼저 로그인으로 보낸다
  if (!session) return null;

  const [{ plans, history }, invoices] = await Promise.all([
    getRepository().listPayoutOverview(viewerOf(session)),
    getRepository().listTaxInvoices(actorOf(session)),
  ]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">거래명세서</h1>
        <p className="mt-1.5 text-base text-slate-500">
          지급 가능한 회차를 모아 확정하면 배치(지급처 × 지급일)가 명세서 한 장이 됩니다
        </p>
      </div>

      <StatementsBoard
        plans={plans}
        history={history}
        invoices={invoices}
        canConfirm={session.role === 'admin'}
      />
    </>
  );
}

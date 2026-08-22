import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser, viewerOf } from '@/lib/auth/session';
import { isHanbaek } from '@/lib/roles';
import { redirect } from 'next/navigation';
import StatementsBoard from '@/components/settlement/StatementsBoard';

export const metadata = { title: '협력사 거래명세서 — 한백 전기차사업관리' };
export const dynamic = 'force-dynamic';

/**
 * 협력사 거래명세서 — 지급 배치를 만들고 보관하는 자리.
 *
 * 한백은 조건이 찬 회차를 모아 체크해 지급일 하나로 확정한다(최종확인). 확정하면
 * 배치(지급처 × 지급일)가 서고 그 배치가 거래명세서 한 장이 된다. 협력사가 발행한
 * 세금계산서는 배치 옆에 첨부로 보관한다.
 *
 * ★협력사도 본다★ (한백 확인 2026-08-23) — 자기 배치만 내려오므로(저장소가 가른다)
 * 「이번 달 최종 확인된 정산분」을 여기서 확인한다. 지급 가능 풀과 세금계산서는
 * 한백의 눈에만 보인다 — 풀은 한백의 할 일이고, 첨부는 한백의 보관함이다.
 */
export default async function StatementsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/statements');

  const seesAll = isHanbaek(session.role);
  const [{ plans, history }, invoices] = await Promise.all([
    getRepository().listPayoutOverview(viewerOf(session)),
    seesAll ? getRepository().listTaxInvoices(actorOf(session)) : Promise.resolve([]),
  ]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">협력사 거래명세서</h1>
        <p className="mt-1.5 text-base text-slate-500">
          {seesAll
            ? '지급 가능한 회차를 모아 확정하면 배치(지급처 × 지급일)가 명세서 한 장이 됩니다'
            : '최종 확인된 지급 배치 — 배치 하나가 거래명세서 한 장입니다'}
        </p>
      </div>

      <StatementsBoard
        plans={plans}
        history={history}
        invoices={invoices}
        canConfirm={session.role === 'admin'}
        seesAll={seesAll}
      />
    </>
  );
}

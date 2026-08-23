import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser, viewerOf } from '@/lib/auth/session';
import { isHanbaek } from '@/lib/roles';
import { redirect } from 'next/navigation';
import StatementsBoard from '@/components/settlement/StatementsBoard';

export const metadata = { title: '협력사 거래명세서 — 한백 전기차사업관리' };
export const dynamic = 'force-dynamic';

/**
 * 협력사 거래명세서 — 배치 목록과 상태(가확정 → 확정 → 지급완료).
 *
 * 가확정은 협력사 지급관리 표에서 체크로 만든다(한백 확인 2026-08-24 — 전 현장
 * 현황을 보며 추리는 자리가 그쪽이다). 여기는 만들어진 배치를 따라간다: 협력사가
 * 가확정 합계로 세금계산서를 발행하고(1~2일 회전 — 할 일에 뜬다), 계산서가 오면
 * 배치 줄에서 바로 첨부·확정한다. 명세서(상세)는 검토·인쇄·예외 처리(빼기·지급일
 * 변경·해제)의 자리다.
 *
 * ★협력사도 본다★ — 자기 배치만 내려오므로(저장소가 가른다) 「이번 달 가확정분 =
 * 발행할 계산서」와 확정분을 여기서 눈으로 확인한다. 확정 배지는 listBatchFinals 에서
 * 나온다(협력사는 자기 것만). 협력사가 누르는 것은 없다 — 확정도 첨부도 한백의 일이다.
 */
export default async function StatementsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/statements');

  const seesAll = isHanbaek(session.role);
  const [{ history }, finals, invoices] = await Promise.all([
    getRepository().listPayoutOverview(viewerOf(session)),
    // 가확정/확정 배지의 정본 — 협력사는 자기 지급처 것만 받는다
    getRepository().listBatchFinals(actorOf(session)),
    // 첨부는 한백의 보관함 — 협력사 화면에는 열 자체가 없다
    seesAll ? getRepository().listTaxInvoices(actorOf(session)) : Promise.resolve([]),
  ]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">협력사 거래명세서</h1>
        <p className="mt-1.5 text-base text-slate-500">
          {seesAll
            ? '가확정 → 세금계산서 첨부 → 최종 확정 — 배치 하나가 명세서 한 장입니다'
            : '가확정된 배치의 합계로 세금계산서를 발행해 주세요 — 첨부되면 확정으로 바뀝니다'}
        </p>
      </div>

      <StatementsBoard
        history={history}
        finals={finals}
        invoices={invoices}
        seesAll={seesAll}
        canEdit={session.role === 'admin'}
      />
    </>
  );
}

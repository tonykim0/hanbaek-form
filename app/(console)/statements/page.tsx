import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser, viewerOf } from '@/lib/auth/session';
import { isHanbaek } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { thisMonth as seoulMonth } from '@/lib/date';
import { won } from '@/lib/format';
import PayChart, { type MonthBar } from '@/components/settlement/PayChart';
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
 *
 * ★지급 내역(/payments)이 여기로 합쳐졌다 (한백 2026-08-28).★ 두 화면이 같은 원장을
 * 각자 읽고 있었다 — 같은 줄을 한쪽은 「나간 지급 4.68억」으로, 한쪽은 「확정 누락 17건」
 * 으로 불렀다(같은 값을 두 곳에 두지 않는다, 화면 규칙 5). 월별 그래프만 맨 위로 올린다:
 * 「달마다 얼마 나갔나(위) → 그 배치를 확정했나(아래)」가 한 화면의 한 흐름이 된다.
 * 줄 단위 명세(어느 현장 몫인가)는 명세서 장이 그대로 갖고 있다.
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

  /*
   * 지급이 있는 달만 접어 넘긴다 — 빈 달을 여기서 채우지 않는다.
   * 그래프가 고른 해의 1~12월을 스스로 세우므로(PayChart), 없는 달은 거기서 0원이 된다.
   * 예전에는 여기서 첫 지급 달부터 이번 달까지 이어 붙이고 24개월로 잘랐다 — 해를 고르게
   * 되면서 그 자름이 오히려 지난 해를 못 보게 막았다.
   */
  const thisMonth = seoulMonth();
  const barBy = new Map<string, MonthBar>();
  for (const r of history) {
    const key = r.paidAt.slice(0, 7);
    const bar = barBy.get(key) ?? { month: key, sales: 0, cons: 0, has: true };
    if (r.kind === '영업비') bar.sales += r.amount;
    else bar.cons += r.amount;
    barBy.set(key, bar);
  }
  const series = [...barBy.values()].sort((a, b) => a.month.localeCompare(b.month));
  const total = history.reduce((n, r) => n + r.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black text-slate-900">협력사 거래명세서</h1>
          <p className="mt-1.5 text-base text-slate-500">
            {seesAll
              ? '가확정 → 세금계산서 첨부 → 최종 확정 — 배치 하나가 명세서 한 장입니다'
              : '가확정된 배치의 합계로 세금계산서를 발행해 주세요 — 첨부되면 확정으로 바뀝니다'}
          </p>
        </div>
        {history.length > 0 && (
          <p className="text-small text-slate-500">
            지급 {history.length}건{' '}
            <span className="ml-1 font-black tabular-nums text-slate-900">{won(total)}원</span>
          </p>
        )}
      </div>

      <PayChart months={series} thisMonth={thisMonth} />

      <StatementsBoard
        history={history}
        finals={finals}
        invoices={invoices}
        seesAll={seesAll}
        canEdit={session.role === 'admin'}
      />
    </div>
  );
}

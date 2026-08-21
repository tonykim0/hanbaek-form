import { monthShift, thisMonth as seoulMonth } from '@/lib/date';
import { won } from '@/lib/format';
import PayChart, { type MonthBar } from '@/components/settlement/PayChart';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import type { PayoutRow } from '@/types/project';

export const metadata = { title: '지급 및 기성관리 — 한백 전기차사업관리' };

/**
 * 지급 내역 — 어디로 어떤 명목으로 월별 얼마를 송금 대상으로 확정했나.
 *
 * ★송금 대상으로 확정한 지급만 다룬다.★ 아직 확정하지 않은 몫은 협력사 지급관리
 * (/payouts)의 자리다. 두 화면에 두면 미확정 잔액이 두 숫자가 된다.
 *
 * 위가 월별 그래프(영업비·시공비 추세), 아래가 누른 달의 상세다 — 업체별로 묶여
 * 어느 현장으로 어떤 명목이 얼마·언제 나갔는지 줄로 선다. 줄은 원장의 지급 한 건이다.
 *
 * ★협력사도 본다.★ 그래서 마진·기성이 없고, 자기가 받는 쪽 줄만 나간다(listPayouts).
 *
 * 거래명세서는 업체 × 지급일 단위다 — 지급이 매월 1~2회 배치로 나가므로, 배치 하나가
 * 명세서 한 장이 된다. 각 묶음 머리글의 지급일 단추가 그 장으로 간다.
 */
const NO_ORG = '받는 곳 미지정';

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/payments');
  const isAdmin = session.role === 'admin';
  const rows = await getRepository().listPayouts(viewerOf(session));

  const thisMonth = seoulMonth();
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : thisMonth;

  const paid = rows.filter((r) => r.paidAt.startsWith(month));
  /** 협력사용 거래명세서 길 — 자기 것뿐이라 묶음 머리글이 없어서 여기에 둔다 */
  const myDates = isAdmin
    ? []
    : [...new Set(paid.map((r) => r.paidAt.slice(0, 10)))].sort();

  /*
   * 월별 흐름 — 첫 지급이 있던 달부터 이번 달(또는 마지막 지급 달)까지 빈 달 없이 잇는다.
   * 지급이 없는 달이 빠지면 추세가 실제보다 매끈해 보인다. 열은 24개까지만 —
   * 잘못 찍힌 먼 미래 날짜 하나가 축을 못 쓰게 만들지 않게 한다.
   */
  const paidMonths = rows.map((r) => r.paidAt.slice(0, 7));
  const first = paidMonths.length > 0 ? [...paidMonths].sort()[0] : thisMonth;
  const last = [thisMonth, ...paidMonths, month].sort().slice(-1)[0];
  const series: MonthBar[] = [];
  for (let m = first; m <= last && series.length < 24; m = monthShift(m, 1)) {
    series.push({ month: m, sales: 0, cons: 0 });
  }
  const barBy = new Map(series.map((b) => [b.month, b]));
  for (const r of rows) {
    const bar = barBy.get(r.paidAt.slice(0, 7));
    if (!bar) continue;
    if (r.kind === '영업비') bar.sales += r.amount;
    else bar.cons += r.amount;
  }

  const shift = (delta: number) => monthShift(month, delta);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-h1 font-black text-slate-900">지급 및 기성관리</h1>
        <nav aria-label="달" className="flex items-center gap-1">
          <Link
            href={`/payments?month=${shift(-1)}`}
            className="rounded-ctl border border-slate-200 bg-white px-2.5 py-1.5 text-small font-bold text-slate-500 transition hover:border-brand-300 hover:text-brand-800"
          >
            ←
          </Link>
          <span className="rounded-ctl bg-slate-900 px-3 py-1.5 text-small font-black tabular-nums text-white">
            {month.replace('-', '. ')}
          </span>
          <Link
            href={`/payments?month=${shift(1)}`}
            className="rounded-ctl border border-slate-200 bg-white px-2.5 py-1.5 text-small font-bold text-slate-500 transition hover:border-brand-300 hover:text-brand-800"
          >
            →
          </Link>
          {month !== thisMonth && (
            <Link
              href="/payments"
              className="ml-1 rounded-ctl px-2 py-1.5 text-tiny font-bold text-slate-400 transition hover:text-slate-700"
            >
              이번 달
            </Link>
          )}
        </nav>
      </header>

      <PayChart months={series} current={month} />

      {myDates.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-small text-slate-500">
          거래명세서
          {myDates.map((d) => (
            <Link
              key={d}
              href={`/payments/statement?date=${d}`}
              className="rounded-ctl border border-slate-200 bg-white px-2 py-1 font-bold tabular-nums text-slate-600 transition hover:border-brand-300 hover:text-brand-800"
            >
              {d}
            </Link>
          ))}
        </p>
      )}

      <Block
        title={`${month.replace('-', '년 ')}월 지급`}
        rows={paid}
        isAdmin={isAdmin}
      />
    </div>
  );
}

/**
 * 협력사별 묶음.
 *
 * 한백은 여러 협력사를 한 화면에서 보고, 협력사는 자기 묶음 하나만 본다 —
 * 그래서 묶는 규칙은 같고 개수만 달라진다. 화면을 두 벌로 만들지 않는다.
 */
function Block({
  title, rows, isAdmin,
}: {
  title: string;
  rows: PayoutRow[];
  isAdmin: boolean;
}) {
  const total = rows.reduce((n, r) => n + r.amount, 0);
  const kindSum = (kind: PayoutRow['kind']) =>
    rows.filter((r) => r.kind === kind).reduce((n, r) => n + r.amount, 0);

  const groups = new Map<string, PayoutRow[]>();
  for (const r of rows) {
    const key = r.org ?? NO_ORG;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    const sum = (list: PayoutRow[]) => list.reduce((n, r) => n + r.amount, 0);
    return sum(b[1]) - sum(a[1]);
  });

  return (
    <section className="rounded-panel border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-h3 font-black text-slate-900">{title}</h2>
        <span className="flex flex-wrap items-baseline gap-3">
          {rows.length > 0 && (
            <span className="text-tiny font-bold text-slate-500 tabular-nums">
              영업비 {won(kindSum('영업비'))} · 시공비 {won(kindSum('시공비'))}
            </span>
          )}
          <span className="text-lead font-black tabular-nums text-slate-900">
            {won(total)}
            <span className="ml-1 text-tiny font-bold text-slate-400">원</span>
          </span>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-box border border-dashed border-slate-200 py-8 text-center text-base text-slate-400">
          이 달에 나간 지급이 없습니다
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {ordered.map(([org, list]) => (
            <div key={org}>
              {/* 협력사 이름은 한백에게만 머리글로 필요하다 — 협력사는 자기 것만 본다 */}
              {isAdmin && (
                <div className="mb-1.5 flex flex-wrap items-baseline gap-2 border-b border-slate-200 pb-1.5">
                  <h3 className={`text-base font-black ${org === NO_ORG ? 'text-amber-700' : 'text-slate-800'}`}>
                    {org}
                  </h3>
                  <span className="text-tiny text-slate-400">{list.length}건</span>
                  {/* 거래명세서는 업체 × 지급일(배치) 한 장 — 이 묶음에 있는 배치마다 길을 둔다 */}
                  {org !== NO_ORG
                    && [...new Set(list.map((r) => r.paidAt.slice(0, 10)))].sort().map((d) => (
                      <Link
                        key={d}
                        href={`/payments/statement?org=${encodeURIComponent(org)}&date=${d}`}
                        className="rounded-ctl border border-slate-200 bg-white px-1.5 py-0.5 text-micro font-bold tabular-nums text-slate-500 transition hover:border-brand-300 hover:text-brand-800"
                        title={`${d} 거래명세서`}
                      >
                        명세서 {d.slice(5)}
                      </Link>
                    ))}
                  <span className="ml-auto text-base font-black tabular-nums text-slate-900">
                    {won(list.reduce((n, r) => n + r.amount, 0))}원
                  </span>
                </div>
              )}
              <ul className="flex flex-col">
                {list
                  .sort((a, b) => b.paidAt.localeCompare(a.paidAt) || a.projectName.localeCompare(b.projectName, 'ko'))
                  .map((r, i) => (
                    <li
                      key={`${r.projectId}-${r.kind}-${r.label}-${r.paidAt}-${i}`}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-100 py-2 last:border-b-0"
                    >
                      {/* 이 줄은 원장의 지급 한 건이다 — 원장이 있는 협력사 지급 탭으로 바로 간다 */}
                      <Link
                        href={`/projects/${r.projectId}?tab=settlement`}
                        className="min-w-[180px] flex-1 truncate text-base font-bold text-slate-900 hover:text-brand-800 hover:underline"
                      >
                        {r.projectName}
                      </Link>
                      <span className="w-14 shrink-0 text-tiny text-slate-400">{r.cpo}</span>
                      <span
                        className={`w-14 shrink-0 rounded-tag px-1.5 py-0.5 text-center text-micro font-bold ${
                          r.kind === '영업비' ? 'bg-sky-100 text-sky-900' : 'bg-brand-100 text-brand-900'
                        }`}
                      >
                        {r.kind}
                      </span>
                      <span className="w-16 shrink-0 text-tiny font-bold text-slate-500">{r.label}</span>
                      {r.note && (
                        <span className="max-w-[240px] truncate text-tiny text-slate-400" title={r.note}>
                          {r.note}
                        </span>
                      )}
                      <span className={`w-28 shrink-0 text-right text-base font-black tabular-nums ${r.amount < 0 ? 'text-amber-800' : 'text-slate-900'}`}>
                        {won(r.amount)}
                      </span>
                      <span className="w-24 shrink-0 text-right text-tiny tabular-nums text-slate-400">
                        {r.paidAt}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

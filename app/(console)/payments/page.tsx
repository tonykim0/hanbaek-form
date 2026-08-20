import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import type { PayoutRow } from '@/types/project';

export const metadata = { title: '지급 명세 — 한백 전기차사업관리' };

/**
 * 지급 명세 — 이번 달에 어느 현장으로 얼마가 나가나.
 *
 * 노션 「26 정산관리」의 영업비 1·2차 / 시공비 1·2차 뷰와 같은 단위다. 다만 축이 다르다 —
 * 그쪽은 현장 한 줄에 네 금액이 붙어 있고, 여기는 「지급 한 건」이 한 줄이다.
 * 「이번 달 얼마 나가나」를 답하려면 지급이 줄이어야 한다.
 *
 * ★협력사도 본다.★ 그래서 마진·기성이 없고, 자기가 받는 쪽 줄만 나간다(listPayouts).
 * 한백은 협력사별로 묶어 본다.
 *
 * 달은 지급일 기준이다. 지급일이 없는 줄은 아직 안 나간 것이라 달에 묶이지 않고
 * 「예정」으로 따로 모인다 — 그것이 실제로 챙길 목록이다.
 */
const won = (n: number) => n.toLocaleString('ko-KR');
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

  const thisMonth = new Date().toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : thisMonth;

  const paid = rows.filter((r) => r.paidAt?.startsWith(month));
  const planned = rows.filter((r) => !r.paidAt && r.amount > 0);

  /** 지급일이 있는 달 목록 — 자료에 있는 달만 고를 수 있게 한다 */
  const months = [...new Set(rows.map((r) => r.paidAt?.slice(0, 7)).filter(Boolean) as string[])]
    .sort()
    .reverse();
  if (!months.includes(month)) months.unshift(month);

  const shift = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-h1 font-black text-slate-900">지급 명세</h1>
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

      <Block
        title={`${month.replace('-', '년 ')}월 지급`}
        rows={paid}
        isAdmin={isAdmin}
        empty="이 달에 나간 지급이 없습니다"
        showDate
      />

      <Block
        title="아직 안 나간 지급"
        rows={planned}
        isAdmin={isAdmin}
        empty="안 나간 지급이 없습니다"
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
  title, rows, isAdmin, empty, showDate = false,
}: {
  title: string;
  rows: PayoutRow[];
  isAdmin: boolean;
  empty: string;
  showDate?: boolean;
}) {
  const total = rows.reduce((n, r) => n + r.amount, 0);

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
        <span className="text-lead font-black tabular-nums text-slate-900">
          {won(total)}
          <span className="ml-1 text-tiny font-bold text-slate-400">원</span>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-box border border-dashed border-slate-200 py-8 text-center text-base text-slate-400">
          {empty}
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
                  <span className="ml-auto text-base font-black tabular-nums text-slate-900">
                    {won(list.reduce((n, r) => n + r.amount, 0))}원
                  </span>
                </div>
              )}
              <ul className="flex flex-col">
                {list
                  .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '') || a.projectName.localeCompare(b.projectName, 'ko'))
                  .map((r) => (
                    <li
                      key={`${r.projectId}-${r.kind}-${r.no}`}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-100 py-2 last:border-b-0"
                    >
                      <Link
                        href={`/projects/${r.projectId}`}
                        className="min-w-[180px] flex-1 truncate text-base font-bold text-slate-900 hover:text-brand-800 hover:underline"
                      >
                        {r.projectName}
                      </Link>
                      <span className="w-14 shrink-0 text-tiny text-slate-400">{r.cpo}</span>
                      <span
                        className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-micro font-bold ${
                          r.kind === '영업비' ? 'bg-sky-100 text-sky-900' : 'bg-brand-100 text-brand-900'
                        }`}
                      >
                        {r.kind}
                      </span>
                      <span className="w-16 shrink-0 text-tiny font-bold text-slate-500">{r.label}</span>
                      <span className="w-28 shrink-0 text-right text-base font-black tabular-nums text-slate-900">
                        {won(r.amount)}
                      </span>
                      <span className="w-24 shrink-0 text-right text-tiny tabular-nums text-slate-400">
                        {showDate ? r.paidAt : `${r.qty}대`}
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

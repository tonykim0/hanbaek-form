import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { won } from '@/lib/format';
import PrintButton from '@/components/settlement/PrintButton';

export const metadata = { title: '거래명세서 — 한백 전기차사업관리' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 거래명세서 — 업체 × 지급일(배치) 한 장.
 *
 * 지급은 매월 1~2회 배치로 나간다. 배치 하나에 나간 원장 줄들이 이 한 장이 된다 —
 * 줄을 손으로 다시 적지 않는다. 원장이 틀렸으면 원장을 고치고 이 장은 다시 뽑는다.
 *
 * ★협력사도 자기 것을 본다.★ org 는 한백만 고를 수 있고, 협력사는 파라미터와 무관하게
 * 자기 소속으로 고정된다 — listPayouts 가 애초에 자기 줄만 주지만, 주소를 바꿔 남의
 * 이름을 제목에 띄우는 것도 막는다.
 */
export default async function StatementPage({
  searchParams,
}: {
  searchParams: { org?: string; date?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/payments');

  const date = searchParams.date ?? '';
  if (!DATE_RE.test(date)) redirect('/payments');

  const isAdmin = session.role === 'admin';
  const org = isAdmin ? searchParams.org ?? '' : session.org ?? '';
  if (!org) redirect('/payments');

  const rows = (await getRepository().listPayouts(viewerOf(session)))
    .filter((r) => r.paidAt === date && r.org === org)
    .sort((a, b) => a.projectName.localeCompare(b.projectName, 'ko') || a.kind.localeCompare(b.kind));

  const total = rows.reduce((n, r) => n + r.amount, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-2 print:hidden">
        <Link
          href={`/payments?month=${date.slice(0, 7)}`}
          className="text-small font-bold text-slate-500 transition hover:text-brand-800"
        >
          ← 지급 내역
        </Link>
        <span className="ml-auto" />
        <PrintButton />
      </div>

      <section className="rounded-panel border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-slate-900 pb-4">
          <h1 className="text-h1 font-black tracking-tight text-slate-900">거래명세서</h1>
          <div className="text-right text-small leading-relaxed text-slate-600">
            <p>
              <span className="font-bold text-slate-400">지급일</span>{' '}
              <span className="font-bold tabular-nums text-slate-900">{date}</span>
            </p>
            <p>
              <span className="font-bold text-slate-400">공급자</span>{' '}
              <span className="font-bold text-slate-900">한백</span>
              <span className="mx-1 text-slate-300">→</span>
              <span className="font-bold text-slate-400">받는 곳</span>{' '}
              <span className="font-bold text-slate-900">{org}</span>
            </p>
          </div>
        </header>

        {rows.length === 0 ? (
          <p className="py-10 text-center text-base text-slate-400">
            이 지급일에 {org}(으)로 나간 지급이 0건입니다
          </p>
        ) : (
          <table className="mt-4 w-full text-base">
            <thead className="border-b border-slate-200 text-tiny font-bold tracking-[0.08em] text-slate-500">
              <tr>
                <th className="py-2 pr-3 text-left">현장</th>
                <th className="px-3 py-2 text-left">구분</th>
                <th className="px-3 py-2 text-left">명목</th>
                <th className="px-3 py-2 text-left">메모</th>
                <th className="py-2 pl-3 text-right">금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={`${r.projectId}-${r.kind}-${r.label}-${i}`}>
                  <td className="py-2.5 pr-3 font-semibold text-slate-800">
                    {r.projectName}
                    <span className="ml-1.5 text-tiny font-normal text-slate-400">{r.cpo}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.kind}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.label}</td>
                  <td className="px-3 py-2.5 text-small text-slate-500">
                    {r.note ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className={`whitespace-nowrap py-2.5 pl-3 text-right font-bold tabular-nums ${r.amount < 0 ? 'text-amber-800' : 'text-slate-900'}`}>
                    {won(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900">
                <td colSpan={4} className="py-3 pr-3 text-right text-base font-black text-slate-900">
                  합계 ({rows.length}건)
                </td>
                <td className="whitespace-nowrap py-3 pl-3 text-right text-lead font-black tabular-nums text-slate-900">
                  {won(total)}
                  <span className="ml-1 text-tiny font-bold text-slate-400">원</span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  );
}

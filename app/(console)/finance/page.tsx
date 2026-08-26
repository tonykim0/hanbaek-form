import { redirect } from 'next/navigation';
import { thisMonth as seoulMonth } from '@/lib/date';
import { getRepository } from '@/lib/data';
import { allSlots } from '@/lib/data/db-slot';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { isHanbaek } from '@/lib/roles';
import { won, wonCompact } from '@/lib/format';
import YearTabs from '@/components/YearTabs';
import { Blank, PANEL } from '@/components/ui';
import type { ReactNode } from 'react';

export const metadata = { title: '정산 현황 — 한백 전기차사업관리' };

/**
 * 정산 현황 — 돈이 달마다 얼마 들어오고 얼마 나갔나.
 *
 * 수주 현황(/dashboard)이 대수를 세는 자리라면 이곳은 금액을 세는 자리다. 둘 다 「보는」
 * 화면이라 사이드바의 「현황」 묶음에 함께 있다 (한백 지시 2026-08-27).
 *
 * ★기준 날짜는 돈이 움직인 날이다.★ 계약일이나 접수월이 아니다 — 수금은 수금일,
 * 지급은 지급일로 센다. 그래서 8월에 접수한 현장의 기성이 11월에 들어오면 11월에 잡힌다.
 * 「이 달에 얼마 들어왔나」를 묻는 화면이라 그것이 맞다.
 *
 * 협력사는 자기가 받는 쪽만 본다 — 기성·마진은 저장소가 애초에 주지 않는다
 * (listSettlements 는 한백이 아니면 빈 목록이다). 화면에서 가리는 것이 아니다.
 *
 * 두 조회를 쓴다:
 *   listPayoutOverview — 지급 원장(월별)과 남은 계획(예정)을 한 번에
 *   listSettlements    — 기성 차수의 수금일·계획액 (한백만)
 */

/** 아직 확정하지 않은 지급 = 계획 + 조정 − 확정. 음수는 0 으로 본다(이미 다 나갔다). */
const restOf = (row: { plan: number; adjust: number; confirmed: number }) =>
  Math.max(0, row.plan + row.adjust - row.confirmed);

export default async function FinancePage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/finance');

  const viewer = viewerOf(session);
  const repo = getRepository();
  const [overview, settlements] = await allSlots([
    () => repo.listPayoutOverview(viewer),
    () => repo.listSettlements(viewer),
  ] as const);

  const isAdmin = isHanbaek(session.role);
  const thisMonth = seoulMonth();
  const thisYear = thisMonth.slice(0, 4);

  // 수금·지급이 일어난 해만 고를 수 있다. 올해는 자료가 없어도 늘 넣는다(탭이 사라지지 않게).
  const collected = settlements.flatMap((s) =>
    s.steps
      .filter((step) => step.collectedAt && step.planAmount !== null)
      .map((step) => ({ at: step.collectedAt!, amount: step.planAmount! }))
  );
  const paid = overview.history.map((row) => ({ at: row.paidAt, amount: row.amount }));
  const dataYears = [...new Set([...collected, ...paid].map((row) => row.at.slice(0, 4)))];
  const years = [...new Set([thisYear, ...dataYears])].sort().reverse();
  /*
   * 기본값은 자료가 있는 마지막 해다 — 올해로 잡으면 해가 바뀐 1월에 빈 화면이 열린다
   * (수주 현황과 같은 규칙).
   */
  const fallbackYear = [...dataYears].sort().reverse()[0] ?? thisYear;
  const year = searchParams.year && years.includes(searchParams.year)
    ? searchParams.year
    : fallbackYear;

  const sumIn = (rows: Array<{ at: string; amount: number }>, prefix: string) =>
    rows.filter((row) => row.at.startsWith(prefix)).reduce((sum, row) => sum + row.amount, 0);

  let accIn = 0;
  let accOut = 0;
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const income = sumIn(collected, month);
    const outgo = sumIn(paid, month);
    accIn += income;
    accOut += outgo;
    return {
      label: `${index + 1}월`,
      income,
      outgo,
      accIn,
      accOut,
      future: month > thisMonth,
      now: month === thisMonth,
    };
  });

  // ── 한 해 합계 ─────────────────────────────────────────────
  const yearIn = sumIn(collected, year);
  const yearOut = sumIn(paid, year);

  /*
   * 계획·잔여는 해로 자르지 않는다 — 계획에는 날짜가 없다(조건이 채워지면 열린다).
   * 해로 자른 숫자와 섞어 한 줄에 두면 어느 것이 그 해의 것인지 알 수 없으므로 따로 적는다.
   */
  const planIn = settlements.reduce((sum, s) => sum + s.planTotal, 0);
  const collectedAll = settlements.reduce((sum, s) => sum + s.collectedTotal, 0);
  const openIn = settlements.reduce(
    (sum, s) => sum + s.steps
      .filter((step) => step.state === 'open' && step.planAmount !== null)
      .reduce((stepSum, step) => stepSum + step.planAmount!, 0),
    0
  );
  const planOut = overview.plans.reduce((sum, row) => sum + row.plan + row.adjust, 0);
  const paidAll = overview.plans.reduce((sum, row) => sum + row.confirmed, 0);
  const restOut = overview.plans.reduce((sum, row) => sum + restOf(row), 0);
  const margin = settlements.reduce((sum, s) => sum + s.marginTotal, 0);

  if (collected.length === 0 && paid.length === 0 && overview.plans.length === 0) {
    return (
      <div>
        <PageHeader year={year} years={years} isAdmin={isAdmin} />
        <div className="mt-6">
          <Blank>정산 0건</Blank>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <PageHeader year={year} years={years} isAdmin={isAdmin} />

      <div className={`grid gap-5 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {isAdmin && (
          <Panel eyebrow="받는 돈" title="운영사 기성" side="계획에는 날짜가 없다">
            <Facts
              rows={[
                { label: '계획', value: planIn },
                { label: '수금 완료', value: collectedAll, tone: 'in' },
                { label: '조건 충족 · 수금 대기', value: openIn, tone: 'wait' },
              ]}
            />
          </Panel>
        )}

        <Panel
          eyebrow={isAdmin ? '주는 돈' : '받는 돈'}
          title={isAdmin ? '협력사 지급' : '내 지급'}
          side="계획에는 날짜가 없다"
        >
          <Facts
            rows={[
              { label: '계획', value: planOut },
              { label: isAdmin ? '지급 완료' : '받은 돈', value: paidAll, tone: 'out' },
              { label: isAdmin ? '남은 지급' : '남은 예정', value: restOut, tone: 'wait' },
            ]}
          />
        </Panel>

        {isAdmin && (
          <Panel eyebrow="한백 몫" title="받을 기성 − 내려줄 지급" side="단가가 붙은 라인만">
            <Facts rows={[{ label: '마진 합계', value: margin, tone: 'in' }]} />
            {settlements.some((s) => s.unpricedLines > 0) && (
              <p className="mt-3 text-tiny font-semibold text-amber-700">
                단가 미지정 라인이 있는 현장 {settlements.filter((s) => s.unpricedLines > 0).length}건 —
                그만큼 금액이 실제보다 적습니다.
              </p>
            )}
          </Panel>
        )}
      </div>

      <Panel
        eyebrow="월별"
        title={`${year}년 ${isAdmin ? '수금 · 지급' : '받은 돈'}`}
        side={<span>돈이 움직인 날 기준 · 원</span>}
      >
        <MonthTable
          rows={months}
          isAdmin={isAdmin}
          totals={{ income: yearIn, outgo: yearOut }}
        />
      </Panel>
    </div>
  );
}

function PageHeader({
  year,
  years,
  isAdmin,
}: {
  year: string;
  years: string[];
  isAdmin: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-1 text-small font-bold text-brand-700">
          {isAdmin ? '수금 · 지급' : '내가 받는 돈'}
        </p>
        <h1 className="text-h1 font-black text-slate-900">정산 현황</h1>
      </div>
      <YearTabs years={years} value={year} hrefBase="/finance" />
    </header>
  );
}

function Panel({
  eyebrow,
  title,
  side,
  children,
}: {
  eyebrow: string;
  title: string;
  side?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`${PANEL} p-5 sm:p-6`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-micro font-black tracking-[0.14em] text-brand-700">{eyebrow}</p>
          <h2 className="text-h3 font-black text-slate-900">{title}</h2>
        </div>
        {side && <div className="pt-1 text-tiny font-semibold text-slate-400">{side}</div>}
      </div>
      {children}
    </section>
  );
}

/** 금액 몇 줄 — 표가 아니라 사실 목록이다(자릿수를 맞춰 훑을 일이 없다) */
function Facts({
  rows,
}: {
  rows: Array<{ label: string; value: number; tone?: 'in' | 'out' | 'wait' }>;
}) {
  const color = (tone?: 'in' | 'out' | 'wait') =>
    tone === 'in' ? 'text-brand-800' : tone === 'out' ? 'text-sky-800' : tone === 'wait' ? 'text-amber-700' : 'text-slate-900';
  return (
    <dl className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-2.5 first:border-0 first:pt-0">
          <dt className="text-base font-bold text-slate-500">{row.label}</dt>
          <dd className={`text-h3 font-black tabular-nums ${color(row.tone)}`}>{won(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 달마다 한 줄. 막대 대신 표로 둔다 — 금액은 자릿수를 맞춰 훑는 값이라
 * 막대 위 압축 표기(1.2억)로는 대조가 안 된다. 막대는 칸 안의 띠로 곁들인다.
 */
function MonthTable({
  rows,
  isAdmin,
  totals,
}: {
  rows: Array<{
    label: string;
    income: number;
    outgo: number;
    accIn: number;
    accOut: number;
    future: boolean;
    now: boolean;
  }>;
  isAdmin: boolean;
  totals: { income: number; outgo: number };
}) {
  const max = Math.max(...rows.map((row) => Math.max(row.income, row.outgo)), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-base tabular-nums">
        <thead>
          <tr className="border-b border-slate-200 text-left text-tiny font-black text-slate-400">
            <th className="w-14 py-2">달</th>
            {isAdmin && <th className="py-2 text-right">수금</th>}
            <th className="py-2 text-right">{isAdmin ? '지급' : '받은 돈'}</th>
            {isAdmin && <th className="py-2 text-right">차액</th>}
            <th className="w-40 py-2 pl-4">크기</th>
            <th className="py-2 text-right">{isAdmin ? '누적 수금' : '누적'}</th>
            {isAdmin && <th className="py-2 text-right">누적 지급</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const diff = row.income - row.outgo;
            return (
              <tr
                key={row.label}
                className={`border-b border-slate-100 ${row.now ? 'bg-brand-50/40' : ''} ${row.future ? 'text-slate-300' : ''}`}
              >
                <td className={`py-2 font-bold ${row.now ? 'text-brand-800' : ''}`}>{row.label}</td>
                {isAdmin && (
                  <td className="py-2 text-right font-semibold">
                    {row.income ? won(row.income) : <span className="text-slate-300">—</span>}
                  </td>
                )}
                <td className="py-2 text-right font-semibold">
                  {row.outgo ? won(row.outgo) : <span className="text-slate-300">—</span>}
                </td>
                {isAdmin && (
                  <td className={`py-2 text-right font-bold ${diff < 0 ? 'text-red-700' : diff > 0 ? 'text-brand-800' : ''}`}>
                    {row.income || row.outgo ? won(diff) : <span className="text-slate-300">—</span>}
                  </td>
                )}
                <td className="py-2 pl-4">
                  <Bars income={row.income} outgo={row.outgo} max={max} isAdmin={isAdmin} />
                </td>
                <td className="py-2 text-right font-semibold text-slate-500">
                  {won(isAdmin ? row.accIn : row.accOut)}
                </td>
                {isAdmin && (
                  <td className="py-2 text-right font-semibold text-slate-500">{won(row.accOut)}</td>
                )}
              </tr>
            );
          })}
          <tr className="text-base font-black">
            <td className="py-2.5">합계</td>
            {isAdmin && <td className="py-2.5 text-right">{won(totals.income)}</td>}
            <td className="py-2.5 text-right">{won(totals.outgo)}</td>
            {isAdmin && (
              <td className="py-2.5 text-right">{won(totals.income - totals.outgo)}</td>
            )}
            <td />
            <td />
            {isAdmin && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** 칸 안의 띠 — 수금은 초록, 지급은 파랑. 옆 숫자를 읽지 않고도 큰 달이 눈에 든다. */
function Bars({
  income,
  outgo,
  max,
  isAdmin,
}: {
  income: number;
  outgo: number;
  max: number;
  isAdmin: boolean;
}) {
  const pct = (value: number) => `${Math.round((Math.abs(value) / max) * 100)}%`;
  return (
    <div className="flex flex-col gap-1" aria-hidden>
      {isAdmin && (
        <div className="h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-brand-500" style={{ width: pct(income) }} title={wonCompact(income)} />
        </div>
      )}
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-sky-400" style={{ width: pct(outgo) }} title={wonCompact(outgo)} />
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { thisMonth as seoulMonth } from '@/lib/date';
import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { isHanbaek } from '@/lib/roles';
import { ATTRS, EMPTY, optionsOf, type AttrKey } from '@/lib/project-filter';
import { Blank, PANEL } from '@/components/ui';
import type { ProjectSummary } from '@/types/project';
import type { ReactNode } from 'react';

export const metadata = { title: '대시보드 — 한백 전기차사업관리' };

/**
 * 대시보드의 숫자는 모두 계약 대수 기준이다.
 * 현장 수만 세면 3대짜리 현장과 21대짜리 현장이 같은 무게로 보여 사업 규모를 왜곡한다.
 */
const qtyOf = (p: ProjectSummary) => p.lines.reduce((sum, line) => sum + line.qty, 0);

const BAR_COLORS = [
  '#3a7f4d', '#56a76c', '#83c597', '#0369a1', '#38bdf8', '#a78bfa',
];
const EMPTY_COLOR = '#cbd5e1';
const REST_COLOR = '#94a3b8';
const BREAKDOWN_MAX = 5;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/dashboard');

  const all = await getRepository().listProjects(viewerOf(session));
  // 업체별 쪼개기는 「전 현장을 보는 눈」의 것이다 — 열람 전용도 본다
  const isAdmin = isHanbaek(session.role);
  const thisMonth = seoulMonth();
  const thisYear = thisMonth.slice(0, 4);
  const years = [...new Set(all.map((p) => p.createdAt.slice(0, 4)))].sort().reverse();
  const fallbackYear = years[0] ?? thisYear;
  const year = searchParams.year && years.includes(searchParams.year) ? searchParams.year : fallbackYear;
  const projects = all.filter((p) => p.createdAt.startsWith(year));

  if (all.length === 0) {
    return (
      <div>
        <PageHeader year={year} years={years} period={`${Number(thisMonth.slice(5, 7))}월 기준`} />
        <div className="mt-6">
          <Blank>현장 0건</Blank>
        </div>
      </div>
    );
  }

  // 1~12월은 자리를 고정한다. 아직 오지 않은 달은 0이 아니라 future로 따로 표시한다.
  let accProjects = 0;
  let accQty = 0;
  const byMonth = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const list = projects.filter((p) => p.createdAt.startsWith(month));
    const qty = list.reduce((sum, p) => sum + qtyOf(p), 0);
    accProjects += list.length;
    accQty += qty;
    return {
      month,
      label: `${index + 1}월`,
      projects: list.length,
      qty,
      accProjects,
      accQty,
      future: month > thisMonth,
      now: month === thisMonth,
    };
  });

  const dist = (key: AttrKey) => {
    const attr = ATTRS.find((candidate) => candidate.key === key)!;
    return optionsOf(projects, key)
      .map((value) => {
        const list = projects.filter((p) => attr.valuesOf(p).includes(value));
        const qty =
          key === 'term'
            ? list.reduce(
                (sum, p) =>
                  sum +
                  p.lines
                    .filter((line) => `${line.termYears}년` === value)
                    .reduce((lineSum, line) => lineSum + line.qty, 0),
                0
              )
            : list.reduce((sum, p) => sum + qtyOf(p), 0);
        return { value, projects: list.length, qty };
      })
      .filter((row) => row.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  };

  const period = year === thisYear ? `${Number(thisMonth.slice(5, 7))}월 기준` : '연간';

  return (
    <div className="flex flex-col gap-7">
      <PageHeader year={year} years={years} period={period} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          eyebrow="수주"
          title={`${year}년 월별 수주`}
          side={<span>그 달에 접수된 대수</span>}
        >
          <MonthBars rows={byMonth} kind="month" />
        </Panel>

        <Panel
          eyebrow="수주"
          title={`${year}년 누적 수주`}
          side={<span>1월부터 더한 대수</span>}
        >
          <MonthBars rows={byMonth} kind="acc" />
        </Panel>
      </div>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-h2 font-black text-slate-900">수주 구성</h2>
          <span className="text-tiny font-semibold text-slate-400">대수 기준</span>
        </div>
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {isAdmin && <Breakdown title="영업사" rows={dist('sales')} attr="sales" />}
          {isAdmin && <Breakdown title="시공사" rows={dist('gc')} attr="gc" />}
          <Breakdown title="운영사" rows={dist('cpo')} attr="cpo" />
          <Breakdown title="수전방식" rows={dist('power')} attr="power" />
          <Breakdown title="사업유형" rows={dist('biz')} attr="biz" />
          <Breakdown title="계약연수" rows={dist('term')} attr="term" />
        </div>
      </section>
    </div>
  );
}

function PageHeader({ year, years, period }: { year: string; years: string[]; period: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-1 text-small font-bold text-brand-700">{year}년 · {period}</p>
        <h1 className="text-h1 font-black text-slate-900">대시보드</h1>
      </div>

      {years.length > 1 ? (
        <nav aria-label="사업연도" className="flex rounded-ctl border border-slate-200 bg-white p-0.5">
          {years.map((candidate) => (
            <Link
              key={candidate}
              href={`/dashboard?year=${candidate}`}
              aria-current={candidate === year ? 'page' : undefined}
              className={`rounded-[6px] px-3.5 py-1.5 text-small font-bold transition ${
                candidate === year
                  ? 'bg-brand-700 text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {candidate}년
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

function Panel({
  eyebrow,
  title,
  side,
  className = '',
  children,
}: {
  eyebrow: string;
  title: string;
  side?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${PANEL} p-5 sm:p-6 ${className}`}>
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

function MonthBars({
  rows,
  kind,
}: {
  rows: Array<{
    month: string;
    label: string;
    projects: number;
    qty: number;
    accProjects: number;
    accQty: number;
    future: boolean;
    now: boolean;
  }>;
  kind: 'month' | 'acc';
}) {
  const height = 196;
  const valueOf = (row: (typeof rows)[number]) => (kind === 'month' ? row.qty : row.accQty);
  const projectCountOf = (row: (typeof rows)[number]) =>
    kind === 'month' ? row.projects : row.accProjects;
  const max = Math.max(...rows.map(valueOf), 1);
  const title = kind === 'month' ? '월별 수주' : '누적 수주';
  const fill = kind === 'month' ? 'bg-sky-400' : 'bg-brand-400';
  const fillNow = kind === 'month' ? 'bg-sky-700' : 'bg-brand-700';

  return (
    <div className="overflow-x-auto pb-1">
      <div
        role="img"
        aria-label={`${title} 대수: ${rows.map((row) => `${row.label} ${row.future ? '예정' : `${valueOf(row)}대`}`).join(', ')}`}
        className="min-w-[520px]"
      >
        <div className="relative" style={{ height }}>
          <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
            {[max, Math.round(max * 0.66), Math.round(max * 0.33), 0].map((tick, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="w-7 text-right text-micro font-semibold tabular-nums text-slate-300">{tick}</span>
                <div className="flex-1 border-t border-slate-100" />
              </div>
            ))}
          </div>

          <div className="absolute inset-y-0 left-10 right-0 flex items-end gap-1">
            {rows.map((row) => {
              const value = valueOf(row);
              const projectCount = projectCountOf(row);
              return (
                <div key={row.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                  {value > 0 && !row.future && (
                    <span className={`mb-1.5 text-center text-tiny font-black tabular-nums ${row.now ? 'text-brand-800' : 'text-slate-600'}`}>
                      {value}
                    </span>
                  )}
                  <div
                    className={`rounded-t-[6px] transition ${
                      row.future
                        ? 'bg-slate-100'
                        : row.now
                          ? fillNow
                          : value > 0
                            ? fill
                            : 'bg-slate-200'
                    }`}
                    style={{ height: `${Math.max(row.future ? 0 : 3, (value / max) * (height - 30))}px` }}
                    title={`${row.month} · ${projectCount}건 ${value}대`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="ml-10 mt-2 flex gap-2 border-t border-slate-200 pt-2">
          {rows.map((row) => {
            const projectCount = projectCountOf(row);
            return (
              <div key={row.month} className="min-w-0 flex-1 text-center">
                <p className={`text-tiny font-bold ${row.now ? 'text-brand-800' : row.future ? 'text-slate-300' : 'text-slate-500'}`}>
                  {row.label}
                </p>
                <p className={`mt-0.5 text-micro tabular-nums ${projectCount > 0 && !row.future ? 'text-slate-400' : 'text-slate-300'}`}>
                  {row.future ? '예정' : `${projectCount}건`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  attr,
}: {
  title: string;
  rows: Array<{ value: string; projects: number; qty: number }>;
  attr: AttrKey;
}) {
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, row) => sum + row.qty, 0);
  const head = rows.slice(0, BREAKDOWN_MAX);
  const tail = rows.slice(BREAKDOWN_MAX);
  const shown: Array<{ value: string; projects: number; qty: number; rest?: boolean }> = tail.length
    ? [
        ...head,
        {
          value: `그 밖 ${tail.length}곳`,
          projects: tail.reduce((sum, row) => sum + row.projects, 0),
          qty: tail.reduce((sum, row) => sum + row.qty, 0),
          rest: true,
        },
      ]
    : head;

  return (
    <section className={`${PANEL} p-5`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-h3 font-black text-slate-900">{title}</h3>
        <span className="text-tiny font-semibold tabular-nums text-slate-400">{total}대</span>
      </div>

      <ul className="flex flex-col gap-3.5 border-t border-slate-100 pt-4">
        {shown.map((row, index) => {
          const percent = Math.round((row.qty / total) * 100);
          const content = (
            <>
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-small font-bold text-slate-700">{row.value}</span>
                <span className="text-small font-black tabular-nums text-slate-900">{percent}%</span>
                <span className="w-[64px] text-right text-tiny tabular-nums text-slate-400">
                  {row.qty}대 · {row.projects}건
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(percent, 2)}%`,
                    background: row.rest
                      ? REST_COLOR
                      : row.value === EMPTY
                        ? EMPTY_COLOR
                        : BAR_COLORS[index % BAR_COLORS.length],
                  }}
                />
              </div>
            </>
          );

          return (
            <li key={row.value}>
              {row.rest ? (
                <div>{content}</div>
              ) : (
                <Link
                  href={`/projects?view=table&${attr}=${encodeURIComponent(row.value)}`}
                  className="block transition hover:opacity-75"
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

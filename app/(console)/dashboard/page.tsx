import { redirect } from 'next/navigation';
import Link from 'next/link';
import { thisMonth as seoulMonth } from '@/lib/date';
import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { phaseOfProject } from '@/lib/board';
import { ATTRS, EMPTY, optionsOf, type AttrKey } from '@/lib/project-filter';
import { PANEL, Tag } from '@/components/ui';
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
  const isAdmin = session.role === 'admin';
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
        <p className="mt-6 rounded-panel border border-dashed border-slate-200 py-16 text-center text-base text-slate-400">
          현장 0건
        </p>
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

  const elapsed = byMonth.filter((row) => !row.future);
  const latest = elapsed.at(-1) ?? byMonth[0];
  const totalQty = projects.reduce((sum, p) => sum + qtyOf(p), 0);
  const active = projects.filter((p) => !p.holdState && p.status !== '준공');
  const activeQty = active.reduce((sum, p) => sum + qtyOf(p), 0);

  /*
   * 관리 필요는 화면에서 새 규칙을 만들지 않는다. 목록이 이미 가진 상태만 모은다.
   * 단가 미지정은 한백 내부 판단이라 협력사에게는 표시하지 않는다.
   */
  const attention = projects
    .filter(
      (p) =>
        Boolean(p.holdState) ||
        p.rejectedDocs > 0 ||
        p.stalledDays >= 14 ||
        (isAdmin && !p.priced)
    )
    .sort((a, b) => attentionScore(b, isAdmin) - attentionScore(a, isAdmin));

  const flow = flowRows(projects);
  const peak = elapsed.reduce((best, row) => (row.qty > best.qty ? row : best), elapsed[0] ?? byMonth[0]);
  const monthsWithOrders = elapsed.filter((row) => row.qty > 0).length;
  const monthlyAverage = Math.round(totalQty / Math.max(elapsed.length, 1));

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

      <section aria-label="핵심 지표" className={`${PANEL} overflow-hidden`}>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="누적 수주"
            value={totalQty}
            unit="대"
            detail={`${projects.length}개 현장`}
            valueClass="text-brand-800"
          />
          <Metric
            label={`${Number(latest.month.slice(5, 7))}월 수주`}
            value={latest.qty}
            unit="대"
            detail={`${latest.projects}개 현장`}
            valueClass="text-sky-800"
          />
          <Metric
            label="진행 중"
            value={active.length}
            unit="건"
            detail={`${activeQty}대 진행`}
            valueClass="text-slate-900"
          />
          <Metric
            label="관리 필요"
            value={attention.length}
            unit="건"
            detail={attention.length > 0 ? '우선순위순' : '확인 완료'}
            valueClass={attention.length > 0 ? 'text-amber-700' : 'text-brand-800'}
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel
          eyebrow="운영"
          title="관리 필요 현장"
          className="lg:col-span-7"
          side={
            <Link href="/projects?view=table" className="text-small font-bold text-brand-700 hover:text-brand-900">
              전체 현장 →
            </Link>
          }
        >
          <AttentionList projects={attention.slice(0, 6)} isAdmin={isAdmin} />
        </Panel>

        <Panel eyebrow="진행" title="업무 흐름" className="lg:col-span-5" side={<span>{projects.length}건</span>}>
          <Flow rows={flow} total={projects.length} />
        </Panel>
      </div>

      <Panel
        eyebrow="수주"
        title={`${year}년 월별 수주`}
        side={<span>대수 기준</span>}
      >
        <MonthBars rows={byMonth} />
        <div className="mt-5 grid gap-px overflow-hidden rounded-box bg-slate-100 sm:grid-cols-3">
          <SmallMetric label="월 평균" value={`${monthlyAverage}대`} />
          <SmallMetric label="최고 월" value={`${Number(peak.month.slice(5, 7))}월 · ${peak.qty}대`} />
          <SmallMetric label="수주 발생" value={`${monthsWithOrders}개월`} />
        </div>
      </Panel>

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

function Metric({
  label,
  value,
  unit,
  detail,
  valueClass,
}: {
  label: string;
  value: number;
  unit: string;
  detail: string;
  valueClass: string;
}) {
  return (
    <div className="bg-white px-5 py-5 sm:px-6 sm:py-6">
      <p className="text-small font-bold text-slate-500">{label}</p>
      <p className={`mt-2 flex items-end gap-1 tabular-nums ${valueClass}`}>
        <strong className="text-h1 font-black leading-none">{value.toLocaleString('ko-KR')}</strong>
        <span className="pb-0.5 text-small font-bold">{unit}</span>
      </p>
      <p className="mt-2 text-tiny font-semibold text-slate-400">{detail}</p>
    </div>
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

function AttentionList({ projects, isAdmin }: { projects: ProjectSummary[]; isAdmin: boolean }) {
  if (projects.length === 0) {
    return (
      <div className="flex min-h-[212px] items-center justify-center border-t border-slate-100">
        <p className="text-center">
          <strong className="block text-h2 font-black text-brand-700">0건</strong>
          <span className="mt-1 block text-small font-semibold text-slate-400">관리 필요 현장</span>
        </p>
      </div>
    );
  }

  return (
    <ul className="border-t border-slate-100">
      {projects.map((project) => (
        <li key={project.id} className="border-b border-slate-100 last:border-b-0">
          <Link
            href={`/projects/${project.id}`}
            className="grid gap-2 py-3.5 transition hover:bg-brand-50/40 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-2"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-base font-black text-slate-900">{project.name}</span>
                <span className="shrink-0 text-tiny font-semibold text-slate-400">{project.cpo}</span>
              </div>
              <p className="mt-0.5 truncate text-small text-slate-500">
                {project.holdState ?? project.status} · 공 차례 {project.court}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              {project.holdState && <Tag tone="hold">{project.holdState}</Tag>}
              {project.rejectedDocs > 0 && <Tag tone="stop">반려 {project.rejectedDocs}</Tag>}
              {isAdmin && !project.priced && <Tag tone="warn">단가 미지정</Tag>}
              {project.stalledDays >= 14 && <Tag tone="warn">정체 {project.stalledDays}일</Tag>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function attentionScore(project: ProjectSummary, isAdmin: boolean): number {
  return (
    (project.holdState ? 400 : 0) +
    project.rejectedDocs * 100 +
    (isAdmin && !project.priced ? 60 : 0) +
    Math.min(project.stalledDays, 99)
  );
}

function flowRows(projects: ProjectSummary[]) {
  const stopped = projects.filter((p) => Boolean(p.holdState));
  const completed = projects.filter((p) => !p.holdState && p.status === '준공');
  const contract = projects.filter(
    (p) => !p.holdState && p.status !== '준공' && phaseOfProject(p) === '계약'
  );
  const construction = projects.filter(
    (p) => !p.holdState && p.status !== '준공' && phaseOfProject(p) === '시공'
  );

  return [
    { label: '계약', count: contract.length, qty: contract.reduce((sum, p) => sum + qtyOf(p), 0), color: 'bg-sky-500', href: '/projects' },
    { label: '시공', count: construction.length, qty: construction.reduce((sum, p) => sum + qtyOf(p), 0), color: 'bg-brand-500', href: '/construction' },
    { label: '준공', count: completed.length, qty: completed.reduce((sum, p) => sum + qtyOf(p), 0), color: 'bg-brand-800', href: '/construction?view=table&col=준공' },
    { label: '멈춤', count: stopped.length, qty: stopped.reduce((sum, p) => sum + qtyOf(p), 0), color: 'bg-slate-500', href: '/projects?view=table&col=보류,계약중단' },
  ];
}

function Flow({
  rows,
  total,
}: {
  rows: Array<{ label: string; count: number; qty: number; color: string; href: string }>;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
      {rows.map((row) => (
        <Link key={row.label} href={row.href} className="group block">
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-small font-black text-slate-800 group-hover:text-brand-800">{row.label}</span>
            <span className="text-tiny tabular-nums text-slate-400">{row.qty}대</span>
            <span className="ml-auto text-small font-black tabular-nums text-slate-800">{row.count}건</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${row.color}`}
              style={{ width: `${total > 0 ? Math.max((row.count / total) * 100, row.count > 0 ? 3 : 0) : 0}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

function MonthBars({
  rows,
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
}) {
  const height = 196;
  const max = Math.max(...rows.map((row) => row.qty), 1);

  return (
    <div className="overflow-x-auto pb-1">
      <div
        role="img"
        aria-label={`월별 수주 대수: ${rows.map((row) => `${row.label} ${row.future ? '예정' : `${row.qty}대`}`).join(', ')}`}
        className="min-w-[680px]"
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

          <div className="absolute inset-y-0 left-10 right-0 flex items-end gap-2">
            {rows.map((row) => (
              <div key={row.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                {row.qty > 0 && !row.future && (
                  <span className={`mb-1.5 text-center text-tiny font-black tabular-nums ${row.now ? 'text-brand-800' : 'text-slate-600'}`}>
                    {row.qty}
                  </span>
                )}
                <div
                  className={`rounded-t-[6px] transition ${
                    row.future
                      ? 'bg-slate-100'
                      : row.now
                        ? 'bg-brand-700'
                        : row.qty > 0
                          ? 'bg-brand-400'
                          : 'bg-slate-200'
                  }`}
                  style={{ height: `${Math.max(row.future ? 0 : 3, (row.qty / max) * (height - 30))}px` }}
                  title={`${row.month} · ${row.projects}건 ${row.qty}대 · 누적 ${row.accQty}대`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="ml-10 mt-2 flex gap-2 border-t border-slate-200 pt-2">
          {rows.map((row) => (
            <div key={row.month} className="min-w-0 flex-1 text-center">
              <p className={`text-tiny font-bold ${row.now ? 'text-brand-800' : row.future ? 'text-slate-300' : 'text-slate-500'}`}>
                {row.label}
              </p>
              <p className={`mt-0.5 text-micro tabular-nums ${row.projects > 0 && !row.future ? 'text-slate-400' : 'text-slate-300'}`}>
                {row.future ? '예정' : `${row.projects}건`}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 px-4 py-3">
      <span className="text-tiny font-semibold text-slate-400">{label}</span>
      <strong className="ml-2 text-small font-black tabular-nums text-slate-800">{value}</strong>
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

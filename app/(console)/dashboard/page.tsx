import { thisMonth as seoulMonth } from '@/lib/date';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import type { ProjectSummary } from '@/types/project';
import { ATTRS, EMPTY, optionsOf, type AttrKey } from '@/lib/project-filter';

export const metadata = { title: '대시보드 — 한백 전기차사업관리' };

/**
 * 대시보드 — 노션 「전기차 사업관리 지표」와 같은 축으로 본다.
 *
 *   1. 월별 수주현황 · 누적 수주현황 (1~12월 세로 막대, 나란히)
 *   2. 영업사별·시공사별 누적 수주, 운영사·수전방식·사업유형·계약연수 (원형 비율)
 *
 * ★단위는 대수다.★ 노션의 수주 집계는 「총 계약수량」 기준이다 — 현장 3건이 3대일 수도
 * 21대일 수도 있어서 건수만 세면 사업 규모가 안 보인다. 비율도 대수로 낸다.
 *
 * ★기준일은 접수일이다.★ 협력사가 계약서를 올린 날이고, 노션의 「계약서 수령일」과 같은 자리다.
 *
 * ★사업연도별로 본다.★ 노션 지표도 연도마다 문서가 따로 있다. 12개월 축을 늘 다 그려서
 * 「아직 안 온 달」과 「0건인 달」이 같은 모양으로 보이게 한다 — 그래야 목표 대비 진행이 읽힌다.
 *
 * 자료는 listProjects 하나뿐이다. 집계용 질의를 따로 두면 표와 대시보드가 다른 숫자를 말한다.
 */
const qtyOf = (p: ProjectSummary) => p.lines.reduce((s, l) => s + l.qty, 0);

/**
 * 조각 색 — 여덟 가지를 돌려 쓴다.
 * conic-gradient 는 실제 색값이 있어야 그려진다(Tailwind 클래스로는 안 된다).
 */
const SLICE = ['#3a7f4d', '#56a76c', '#8ed7a5', '#38bdf8', '#0369a1', '#a78bfa', '#f59e0b', '#fb7185'];
const SLICE_EMPTY = '#cbd5e1';
const SLICE_REST = '#94a3b8';
/** 조각을 여덟 개까지만 그린다 — 그보다 많으면 색을 구분할 수 없다 */
const SLICE_MAX = 8;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/dashboard');
  const all = await getRepository().listProjects(viewerOf(session));
  const isAdmin = session.role === 'admin';

  const years = [...new Set(all.map((p) => p.createdAt.slice(0, 4)))].sort().reverse();
  const year = searchParams.year && years.includes(searchParams.year) ? searchParams.year : years[0];
  const projects = year ? all.filter((p) => p.createdAt.startsWith(year)) : [];

  // ── 1~12월 ──────────────────────────────────────────────────
  const thisMonth = seoulMonth();
  let acc = 0;
  let accQty = 0;
  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const list = projects.filter((p) => p.createdAt.startsWith(month));
    const qty = list.reduce((s, p) => s + qtyOf(p), 0);
    acc += list.length;
    accQty += qty;
    return {
      month,
      label: `${i + 1}월`,
      n: list.length,
      qty,
      acc,
      accQty,
      // 아직 안 온 달은 누적선을 긋지 않는다 — 0 으로 떨어뜨리면 실적이 꺾인 것처럼 보인다
      future: month > thisMonth,
      now: month === thisMonth,
    };
  });

  /*
   * 축별 비율.
   *
   * ★대수를 두 번 세지 않는다.★ 계약연수는 한 현장이 여러 값을 가질 수 있다
   * (7년 3대 + 10년 4대). 그 현장의 대수 7대를 양쪽에 통째로 더하면 합이 전체보다 커지고,
   * 원형 차트의 비율이 부풀어 거짓말이 된다. 그 축은 라인의 대수를 나눠 센다.
   *
   * 건수는 나눌 수 없다 — 그 현장은 7년에도 10년에도 한 건이다. 그래서 비율은 늘 대수로 낸다.
   */
  const dist = (key: AttrKey) => {
    const attr = ATTRS.find((a) => a.key === key)!;
    return optionsOf(projects, key)
      .map((v) => {
        const list = projects.filter((p) => attr.valuesOf(p).includes(v));
        const qty =
          key === 'term'
            ? list.reduce(
                (s, p) => s + p.lines.filter((l) => `${l.termYears}년` === v).reduce((t, l) => t + l.qty, 0),
                0
              )
            : list.reduce((s, p) => s + qtyOf(p), 0);
        return { value: v, n: list.length, qty };
      })
      .filter((r) => r.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  };

  if (all.length === 0) {
    return (
      <div>
        <h1 className="text-h1 font-black text-slate-900">대시보드</h1>
        <p className="mt-6 rounded-panel border border-dashed border-slate-200 py-16 text-center text-base text-slate-400">
          아직 현장이 없습니다
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-h1 font-black text-slate-900">대시보드</h1>
        {/* 연도 — 노션 지표도 사업연도마다 문서가 따로 있다 */}
        {years.length > 1 && (
          <nav aria-label="사업연도" className="flex rounded-ctl border border-slate-200 bg-white p-0.5">
            {years.map((y) => (
              <Link
                key={y}
                href={`/dashboard?year=${y}`}
                aria-current={y === year}
                className={`rounded-[6px] px-3 py-1.5 text-small font-bold transition ${
                  y === year ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {y}년
              </Link>
            ))}
          </nav>
        )}
      </header>

      {/*
        * 월별과 누적을 따로 그린다.
        *
        * 한 그림에 얹었더니 두 값의 자릿수가 달라 축을 둘 써야 했고, 그러면 같은 높이가
        * 다른 뜻이 된다 — 읽는 사람이 어느 축인지 매번 확인해야 한다. 나란히 두면 그 문제가 없다.
        */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={`${year}년 월별 수주현황`} note="그 달에 접수된 대수">
          <MonthBars rows={byMonth} pick="month" />
        </Panel>
        <Panel title={`${year}년 누적 수주현황`} note="1월부터 그 달까지 더한 대수">
          <MonthBars rows={byMonth} pick="acc" />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/*
          * 영업사·시공사 분포는 한백만 본다.
          *
          * 협력사에게는 자기 현장만 나가므로 그 원은 거의 「자기 100%」다 — 알려주는 것이 없다.
          * 게다가 한백이 대신 접수한 현장은 영업사와 시공사가 다른 회사일 수 있어서,
          * 그 자리가 남의 회사 이름을 보여주는 창이 된다.
          */}
        {isAdmin && <Donut title="영업사별 누적 수주" rows={dist('sales')} attr="sales" />}
        {isAdmin && <Donut title="시공사별 누적 수주" rows={dist('gc')} attr="gc" />}
        <Donut title="운영사" rows={dist('cpo')} attr="cpo" />
        <Donut title="수전방식" rows={dist('power')} attr="power" />
        <Donut title="사업유형" rows={dist('biz')} attr="biz" />
        <Donut title="계약연수" rows={dist('term')} attr="term" note="라인이 갈린 현장은 대수를 나눠 셉니다" />
      </div>
    </div>
  );
}

/**
 * 1~12월 세로 막대.
 *
 * 월별과 누적이 같은 부품을 쓴다(pick 으로 고른다) — 두 벌로 두면 한쪽만 고쳐지는 일이 생긴다.
 *
 * 열두 달을 늘 다 그린다. 아직 안 온 달은 자리만 비워 둔다 —
 * 「0건인 달」과 「아직 안 온 달」이 같은 모양이면 목표 대비 진행을 읽을 수 없다.
 *
 * 차트 라이브러리를 쓰지 않는다. 막대는 div 하나다.
 */
function MonthBars({
  rows, pick,
}: {
  rows: Array<{
    month: string; label: string; n: number; qty: number; acc: number; accQty: number;
    future: boolean; now: boolean;
  }>;
  /** 월별인가 누적인가 */
  pick: 'month' | 'acc';
}) {
  const H = 152;
  const qtyOfRow = (r: (typeof rows)[number]) => (pick === 'month' ? r.qty : r.accQty);
  const nOfRow = (r: (typeof rows)[number]) => (pick === 'month' ? r.n : r.acc);
  const max = Math.max(...rows.map(qtyOfRow), 1);
  const fill = pick === 'month' ? 'bg-sky-400' : 'bg-brand-400';
  const fillNow = pick === 'month' ? 'bg-sky-600' : 'bg-brand-600';

  return (
    <div>
      <p className="mb-1.5 text-micro font-bold text-slate-400">
        최대 <b className="text-slate-600">{max}대</b>
      </p>

      <div className="relative" style={{ height: H }}>
        {/* 눈금선 넷 — 값을 어림잡는 데는 이 정도면 된다 */}
        <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-t border-slate-100" />
          ))}
        </div>

        <div className="absolute inset-0 flex items-end gap-1">
          {rows.map((r) => {
            const v = qtyOfRow(r);
            return (
              <div key={r.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                {v > 0 && !r.future && (
                  <span className="mb-1 text-center text-micro font-black tabular-nums text-slate-600">
                    {v}
                  </span>
                )}
                <div
                  className={`rounded-t transition ${
                    r.future ? 'bg-slate-100' : r.now ? fillNow : fill
                  }`}
                  style={{ height: `${Math.max(r.future ? 0 : 2, (v / max) * (H - 24))}px` }}
                  title={`${r.month} · ${nOfRow(r)}건 ${v}대`}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex gap-1 border-t border-slate-200 pt-1.5">
        {rows.map((r) => (
          <div key={r.month} className="min-w-0 flex-1 text-center">
            <p className={`text-micro font-bold ${r.now ? 'text-brand-700' : r.future ? 'text-slate-300' : 'text-slate-500'}`}>
              {r.label}
            </p>
            <p className={`text-micro tabular-nums ${nOfRow(r) > 0 && !r.future ? 'text-slate-400' : 'text-slate-300'}`}>
              {r.future ? '' : `${nOfRow(r) || '–'}${nOfRow(r) ? '건' : ''}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 원형 비율.
 *
 * 비율은 대수로 낸다(건수가 아니라) — 노션 집계 기준과 같아야 두 화면이 같은 말을 한다.
 * 가운데에 총 대수를 적는다. 조각이 여덟 개를 넘으면 나머지를 「그 밖」으로 묶는다 —
 * 색이 스무 개면 어느 조각이 누구인지 알 수 없다.
 */
function Donut({
  title, rows, attr, note,
}: {
  title: string;
  rows: Array<{ value: string; n: number; qty: number }>;
  attr: AttrKey;
  note?: string;
}) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.qty, 0);

  const head = rows.slice(0, SLICE_MAX);
  const tail = rows.slice(SLICE_MAX);
  const shown: Array<{ value: string; n: number; qty: number; rest?: boolean }> = tail.length
    ? [...head, {
        value: `그 밖 ${tail.length}곳`,
        n: tail.reduce((s, r) => s + r.n, 0),
        qty: tail.reduce((s, r) => s + r.qty, 0),
        rest: true,
      }]
    : head;

  let at = 0;
  const slices = shown.map((r, i) => {
    const from = (at / total) * 100;
    at += r.qty;
    return {
      ...r,
      color: r.rest ? SLICE_REST : r.value === EMPTY ? SLICE_EMPTY : SLICE[i % SLICE.length],
      pct: Math.round((r.qty / total) * 100),
      from,
      to: (at / total) * 100,
    };
  });

  return (
    <Panel title={title} note={note ? `${total}대 · ${note}` : `${total}대`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <div
          className="relative h-[112px] w-[112px] shrink-0 rounded-full"
          style={{ background: `conic-gradient(${slices.map((s) => `${s.color} ${s.from}% ${s.to}%`).join(', ')})` }}
        >
          <div className="absolute inset-[24px] flex flex-col items-center justify-center rounded-full bg-white">
            <span className="text-h3 font-black tabular-nums leading-none text-slate-900">{total}</span>
            <span className="text-micro font-bold text-slate-400">대</span>
          </div>
        </div>

        <ul className="min-w-[186px] flex-1">
          {slices.map((s) => {
            const row = (
              <>
                <span
                  aria-hidden
                  className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-tag"
                  style={{ background: s.color }}
                />
                <span className="min-w-0 flex-1 truncate text-small font-bold text-slate-700">{s.value}</span>
                <span className="shrink-0 text-small font-black tabular-nums text-slate-900">{s.pct}%</span>
                <span className="w-[68px] shrink-0 text-right text-tiny tabular-nums text-slate-400">
                  {s.qty}대 · {s.n}건
                </span>
              </>
            );
            return (
              <li key={s.value} className="border-b border-slate-100 last:border-b-0">
                {s.rest ? (
                  <div className="flex items-baseline gap-2 py-1.5">{row}</div>
                ) : (
                  <Link
                    href={`/projects?view=table&${attr}=${encodeURIComponent(s.value)}`}
                    className="flex items-baseline gap-2 py-1.5 transition hover:bg-brand-50/40"
                  >
                    {row}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-h3 font-black text-slate-900">{title}</h2>
        {note && <span className="text-tiny text-slate-400">{note}</span>}
      </div>
      {children}
    </section>
  );
}

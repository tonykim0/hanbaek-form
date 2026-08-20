'use client';

/**
 * 현장 표 — 전부 한 줄씩.
 *
 * 보드는 「어느 단계에 몇 건」을 답하고, 이 표는 「이 조건에 맞는 현장이 무엇인가」를 답한다.
 * 그래서 보드 카드에 안 넣은 것들(사업유형·건축물·수전방식·접수일)이 여기 열로 있다.
 *
 * ★열 머리글에서 바로 거른다.★ 위쪽 필터 막대로도 되지만, 표를 보다가 「이 운영사만」이
 * 궁금해지는 자리는 그 열이다 — 눈이 있는 곳에서 걸 수 있어야 한다.
 * 상태는 껍데기(ProjectsView)가 쥔다. 표가 따로 쥐면 보드로 넘어갈 때 풀린다.
 *
 * 단계 칸은 고르는 자리다. 보드는 끌어야 옮겨지지만 표에서는 골라서 옮긴다 —
 * 끌기만 있으면 마우스 없이는 아무것도 못 옮긴다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAction } from '@/lib/use-action';
import Link from 'next/link';
import type { ProcessStatus, ProjectSummary } from '@/types/project';
import { PROCESS_STATUSES } from '@/types/project';
import {
  bandOfColumn, BOARD_COLUMNS, boardColumnOf, type BoardBand, type BoardColumn,
} from '@/lib/board';
import type { AttrFilters, AttrKey } from '@/lib/project-filter';

type SortKey = 'name' | 'stage' | 'qty' | 'term' | 'created';

const COLUMN_ORDER = new Map(BOARD_COLUMNS.map((c, i) => [c.key, i]));
const qtyOf = (p: ProjectSummary) => p.lines.reduce((s, l) => s + l.qty, 0);

/**
 * 계약연수 — 라인마다 다를 수 있다.
 * 7년 3대 + 10년 4대인 현장이 있어서 하나로 뭉개면 계약이 달라진다.
 */
function termsOf(p: ProjectSummary): string {
  const years = [...new Set(p.lines.map((l) => l.termYears))].sort((a, b) => a - b);
  return years.length === 0 ? '—' : years.map((y) => `${y}년`).join(' · ');
}
const maxTermOf = (p: ProjectSummary) => Math.max(0, ...p.lines.map((l) => l.termYears));

/** 단계 배지 색 — 보드의 띠 색과 맞춘다 */
const BAND_TONE: Record<BoardBand, string> = {
  계약: 'bg-sky-100 text-sky-900',
  시공: 'bg-brand-100 text-brand-900',
  멈춤: 'bg-slate-800 text-white',
};

export default function ProjectTable({
  projects, canMove, onMove, busyId, filters, options, onFilter,
}: {
  projects: ProjectSummary[];
  canMove: boolean;
  onMove: (p: ProjectSummary, status: ProcessStatus) => void;
  busyId: string | null;
  /** 지금 걸린 필터 — 껍데기가 쥐고 있다 */
  filters: AttrFilters;
  options: Record<AttrKey, string[]>;
  onFilter: (key: AttrKey, values: string[]) => void;
}) {
  const [sort, setSort] = useState<SortKey>('stage');
  const [desc, setDesc] = useState(false);

  const rows = useMemo(() => {
    const dir = desc ? -1 : 1;
    const val = (p: ProjectSummary): number | string => {
      switch (sort) {
        case 'name': return p.name;
        case 'stage': return COLUMN_ORDER.get(boardColumnOf(p)) ?? 0;
        case 'qty': return qtyOf(p);
        case 'term': return maxTermOf(p);
        case 'created': return p.createdAt;
      }
    };
    return [...projects].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y, 'ko') * dir;
      return ((x as number) - (y as number)) * dir;
    });
  }, [projects, sort, desc]);

  /** 정렬 단추. 필터가 함께 붙는 열은 attr 를 준다. */
  function head(
    label: string,
    opts: { sort?: SortKey; attr?: AttrKey; align?: 'left' | 'right' } = {}
  ) {
    const { sort: key, attr, align = 'left' } = opts;
    const on = key !== undefined && sort === key;
    return (
      <th
        className={`whitespace-nowrap px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}
      >
        <div className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          {key ? (
            <button
              type="button"
              onClick={() => {
                if (on) setDesc((v) => !v);
                else {
                  setSort(key);
                  setDesc(key === 'qty' || key === 'term' || key === 'created');
                }
              }}
              className={`inline-flex items-center gap-1 font-bold transition hover:text-slate-800 ${
                on ? 'text-brand-800' : 'text-slate-500'
              }`}
            >
              {label}
              <span aria-hidden className={on ? 'text-brand-600' : 'text-transparent'}>
                {desc ? '▾' : '▴'}
              </span>
            </button>
          ) : (
            <span className="font-bold text-slate-500">{label}</span>
          )}
          {attr && (
            <ColumnFilter
              label={label}
              options={options[attr] ?? []}
              picked={filters[attr] ?? []}
              onChange={(v) => onFilter(attr, v)}
            />
          )}
        </div>
      </th>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
        조건에 맞는 현장이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          {/* 머리글은 붙여 둔다 — 138건을 훑으면서 어느 열인지 계속 알아야 한다 */}
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-tiny tracking-[0.06em]">
            <tr>
              {head('현장', { sort: 'name' })}
              {head('단계', { sort: 'stage', attr: 'col' })}
              {head('대수', { sort: 'qty', align: 'right' })}
              {head('계약연수', { sort: 'term', attr: 'term' })}
              {head('운영사', { attr: 'cpo' })}
              {head('환경부 대기번호', { attr: 'queue' })}
              {head('기설치 조사', { attr: 'pre' })}
              {head('사업유형', { attr: 'biz' })}
              {head('건축물', { attr: 'bldg' })}
              {head('수전방식', { attr: 'power' })}
              {head('영업사', { attr: 'sales' })}
              {head('시공사', { attr: 'gc' })}
              {head('접수일', { sort: 'created' })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => {
              const col = boardColumnOf(p);
              const busy = busyId === p.id;
              return (
                <tr key={p.id} className={`transition hover:bg-brand-50/40 ${busy ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-bold text-slate-900 hover:text-brand-800 hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="ml-2 text-tiny tabular-nums text-slate-400">
                      {p.mgmtNo ?? p.id}
                    </span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {p.addr && <span className="text-tiny text-slate-400">{p.addr}</span>}
                      {p.rejectedDocs > 0 && (
                        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-micro font-bold text-red-800">
                          반려 {p.rejectedDocs}
                        </span>
                      )}
                      {!p.priced && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-micro font-bold text-slate-500">
                          단가 미지정
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StageCell p={p} col={col} canMove={canMove} onMove={onMove} busy={busy} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-700">
                    {qtyOf(p)}
                    <span
                      className="ml-1 text-tiny font-normal text-slate-400"
                      title={p.lines.map((l) => `${l.termYears}년×${l.qty}대`).join(' + ')}
                    >
                      대
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{termsOf(p)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{p.cpo}</td>
                  <td className="px-3 py-2.5">
                    <QueueCell p={p} canEdit={canMove} />
                  </td>
                  {/* 조사 전은 눈에 걸려야 한다 — 환경부 사업은 현장마다 해야 하는 일이다 */}
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {p.preInstall ? (
                      <span className="text-slate-600">{p.preInstall}</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-micro font-bold text-amber-900">
                        조사 필요
                      </span>
                    )}
                  </td>
                  <Cell value={p.bizType} />
                  <Cell value={p.bldgType} />
                  <Cell value={p.powerType} />
                  <Cell value={p.salesOrg} />
                  <Cell value={p.gcOrg} />
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-500">
                    {p.createdAt}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 환경부 대기번호 칸.
 *
 * 칸을 떠날 때 저장한다. 글자마다 저장하면 「2026-5」 같은 반쪽 값이 계속 올라간다.
 */
function QueueCell({ p, canEdit }: { p: ProjectSummary; canEdit: boolean }) {
  const { busy, error, run } = useAction();

  // 자체투자는 환경부 보조금을 받지 않는다 — 받을 대기번호가 없다
  if (p.bizType === '자체투자') {
    return <span className="text-slate-300">해당없음</span>;
  }
  if (!canEdit) {
    return (
      <span className={`tabular-nums ${p.envQueueNo ? 'text-slate-700' : 'text-slate-300'}`}>
        {p.envQueueNo ?? '—'}
      </span>
    );
  }

  async function save(value: string) {
    const next = value.trim() === '' ? null : value.trim();
    if (next === p.envQueueNo) return;
    await run({
      url: `/api/projects/${p.id}/env-queue`,
      body: { value: next },
      fail: '저장하지 못했습니다.',
    });
  }

  return (
    <input
      aria-label={`${p.name} 환경부 대기번호`}
      defaultValue={p.envQueueNo ?? ''}
      placeholder="2026-595"
      disabled={busy}
      /* 표 칸에는 문구를 놓을 자리가 없다 — 빨간 테두리로 알리고 이유는 마우스를 올리면 나온다 */
      title={error ?? undefined}
      onBlur={(e) => void save(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={`w-[104px] rounded-lg border px-2 py-1 text-small tabular-nums transition placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-100 ${
        error
          ? 'border-red-400 text-red-800'
          : p.envQueueNo
            ? 'border-slate-200 text-slate-800'
            : 'border-dashed border-slate-300 text-slate-500'
      } ${busy ? 'opacity-50' : 'hover:border-brand-300'}`}
    />
  );
}

/**
 * 단계 칸.
 *
 * 계약 단계는 서류·단가에서 유도되므로 고를 수 없다 — 글자로만 보여준다.
 * 공정 단계는 조건이 찬 것만 목록에 올린다. 못 고르는 값을 올려놓고 거절하지 않는다.
 */
function StageCell({
  p, col, canMove, onMove, busy,
}: {
  p: ProjectSummary;
  col: BoardColumn;
  canMove: boolean;
  onMove: (p: ProjectSummary, status: ProcessStatus) => void;
  busy: boolean;
}) {
  const fixed = !canMove || p.stage === 'intake' || p.holdState !== null;
  if (fixed) {
    // 색으로 계약·시공·멈춤을 가른다 — 138줄을 훑을 때 글자보다 색이 먼저 읽힌다
    return (
      <span
        className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-tiny font-bold ${
          BAND_TONE[bandOfColumn(col)]
        }`}
      >
        {col}
      </span>
    );
  }
  const options = PROCESS_STATUSES.filter((s) => s === p.status || p.entryOk.includes(s));
  return (
    <>
      <label className="sr-only" htmlFor={`stage-${p.id}`}>
        {p.name} 단계
      </label>
      <select
        id={`stage-${p.id}`}
        value={p.status}
        disabled={busy}
        onChange={(e) => onMove(p, e.target.value as ProcessStatus)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-tiny font-bold text-slate-700 transition hover:border-brand-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </>
  );
}

/** 값이 없는 칸은 흐리게 — 빈 칸이 눈에 걸리면 「안 적힌 현장」이 보인다 */
function Cell({ value }: { value: string | null }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2.5 ${value ? 'text-slate-600' : 'text-slate-300'}`}>
      {value ?? '—'}
    </td>
  );
}

/**
 * 열 머리글의 필터.
 *
 * 값을 여러 개 고를 수 있다 — 「플러그링크와 SK만」이 실제로 묻는 방식이다.
 * 고를 수 있는 값은 지금 화면에 있는 것뿐이라, 걸어도 0건이 되는 값은 목록에 없다.
 */
function ColumnFilter({
  label, options, picked, onChange,
}: {
  label: string;
  options: string[];
  picked: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // 바깥을 누르면 닫는다. 열린 채로 표를 훑으면 아래 줄이 가린다.
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', off);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (options.length === 0) return null;
  const on = picked.length > 0;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={`${label} 필터`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`rounded px-1 py-0.5 text-micro font-black leading-none transition ${
          on
            ? 'bg-brand-600 text-white'
            : 'text-slate-300 hover:bg-slate-200 hover:text-slate-600'
        }`}
      >
        {on ? picked.length : '▾'}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-[190px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <div className="max-h-[280px] overflow-y-auto">
            {options.map((v) => {
              const checked = picked.includes(v);
              return (
                <label
                  key={v}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-small font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onChange(checked ? picked.filter((x) => x !== v) : [...picked, v])
                    }
                    className="h-3.5 w-3.5 accent-brand-600"
                  />
                  <span className="truncate">{v}</span>
                </label>
              );
            })}
          </div>
          {on && (
            <button
              type="button"
              onClick={() => { onChange([]); setOpen(false); }}
              className="mt-1 w-full rounded-lg border-t border-slate-100 px-2 py-1.5 text-tiny font-bold text-slate-400 transition hover:text-slate-700"
            >
              이 열 필터 지우기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

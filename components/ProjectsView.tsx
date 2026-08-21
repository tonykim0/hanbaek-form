'use client';

/**
 * 현장 화면의 껍데기 — 필터와 보기 방식을 한 곳에서 쥔다.
 *
 * 노션의 데이터베이스와 같은 구조다. 자료는 한 벌이고 보는 방법이 둘이다:
 *   보드 — 어느 단계에 몇 건 있나
 *   표   — 전부 한 줄씩 늘어놓고 조건으로 걸러본다
 * 필터는 보기 방식에 딸린 게 아니라 자료에 걸린다. 보드에서 「플러그링크만」 걸어놓고
 * 표로 넘어가면 그대로 걸려 있어야 한다 — 보기를 바꿀 때마다 다시 거는 화면은 쓸 수 없다.
 *
 * 필터는 주소에 남는다. 새로고침해도, 링크를 붙여 보내도 같은 화면이 열린다.
 * 자료는 이미 브라우저에 다 있으므로 거르는 일은 서버에 다시 묻지 않는다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAction } from '@/lib/use-action';
import { FIELD, Note, PANEL } from '@/components/ui';
import type { ProcessStatus, ProjectSummary } from '@/types/project';
import { type BoardColumn } from '@/lib/board';
import {
  ATTRS, countActive, optionsOf, passesAttrs, type AttrFilters, type AttrKey,
} from '@/lib/project-filter';
import ProjectBoard from './ProjectBoard';
import ProjectTable from './ProjectTable';

type ViewKey = 'board' | 'table';
type FlagKey = 'rejected' | 'unpriced' | 'stalled';

const FLAGS: Array<{ key: FlagKey; label: string }> = [
  { key: 'rejected', label: '반려 있음' },
  { key: 'unpriced', label: '단가 미지정' },
  { key: 'stalled', label: '14일 이상 멈춤' },
];

const split = (v: string | null): string[] => (v ? v.split(',').filter(Boolean) : []);

export default function ProjectsView({
  projects,
  band,
  canMove,
}: {
  /** 이 페이지 국면의 현장들 — 페이지(서버)가 이미 국면으로 걸러서 넘긴다 */
  projects: ProjectSummary[];
  /** 보드가 그리는 국면 (계약 · 시공) — 사이드바 메뉴가 페이지를 가른다 */
  band: '계약' | '시공';
  /** 단계를 옮길 수 있는가 (한백만) */
  canMove: boolean;
}) {
  const sp = useSearchParams();

  const [view, setView] = useState<ViewKey>(() => (sp.get('view') === 'table' ? 'table' : 'board'));
  const [q, setQ] = useState(() => sp.get('q') ?? '');
  /*
   * 축별 필터를 한 덩어리로 쥔다. 표의 열 머리글에서 걸어도 여기로 들어오므로
   * 보기를 바꿔도 그대로 남는다.
   */
  const [attrs, setAttrs] = useState<AttrFilters>(() => {
    const init: AttrFilters = {};
    for (const a of ATTRS) {
      const v = split(sp.get(a.key));
      if (v.length) init[a.key] = v;
    }
    return init;
  });
  const [flags, setFlags] = useState<string[]>(() => split(sp.get('flag')));
  // 필터가 걸린 주소로 들어왔으면 무엇이 걸렸는지 펴서 보여준다
  const [open, setOpen] = useState(() => ATTRS.some((a) => split(sp.get(a.key)).length > 0));

  /** 옮기는 중인 카드의 임시 위치 — 서버가 다시 그려주기 전까지 손을 따라간다 */
  const [moved, setMoved] = useState<Record<string, ProcessStatus>>({});
  // 카드마다 각자 도니 어느 카드인지 알아야 한다 — busyKey 가 그 카드 id 다
  const { busyKey, error, run } = useAction();

  // 주소에 남긴다. replaceState 라서 서버를 다시 부르지 않고 뒤로가기 이력도 안 쌓인다.
  useEffect(() => {
    const p = new URLSearchParams();
    if (view === 'table') p.set('view', 'table');
    if (q.trim()) p.set('q', q.trim());
    for (const a of ATTRS) {
      const picked = attrs[a.key];
      if (picked?.length) p.set(a.key, picked.join(','));
    }
    if (flags.length) p.set('flag', flags.join(','));
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [view, q, attrs, flags]);

  /*
   * 서버가 따라잡으면 임시 위치를 버린다.
   * 안 버리면 이 탭의 옛 판단이 계속 이기고, 다른 사람이 옮긴 카드가 제자리로 안 간다.
   */
  useEffect(() => {
    setMoved((m) => {
      const kept = Object.entries(m).filter(
        ([id, st]) => projects.find((p) => p.id === id)?.status !== st
      );
      return kept.length === Object.keys(m).length ? m : Object.fromEntries(kept);
    });
  }, [projects]);

  const withMoves = useMemo(
    () => projects.map((p) => (moved[p.id] ? { ...p, status: moved[p.id] } : p)),
    [projects, moved]
  );

  const move = useCallback(
    async (card: ProjectSummary, status: ProcessStatus) => {
      setMoved((m) => ({ ...m, [card.id]: status }));
      const ok = await run({
        url: `/api/projects/${card.id}/status`,
        body: { status },
        fail: '옮기지 못했습니다.',
        key: card.id,
        label: card.name,
      });
      // 임시 위치를 지운다 — 옛 값을 써 넣으면 서버가 그 값으로 오지 않는 한 계속 남는다
      if (!ok) {
        setMoved((m) => {
          const { [card.id]: _drop, ...rest } = m;
          return rest;
        });
      }
    },
    [run]
  );

  /** 축별로 고를 수 있는 값 — 이 사람 화면에 있는 값만 나온다 */
  const options = useMemo(
    () => Object.fromEntries(ATTRS.map((a) => [a.key, optionsOf(projects, a.key)])) as Record<AttrKey, string[]>,
    [projects]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return withMoves.filter((p) => {
      if (needle) {
        const hay = `${p.name} ${p.mgmtNo ?? ''} ${p.id} ${p.addr ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (!passesAttrs(p, attrs)) return false;
      // 문제 조건은 겹쳐서 좁힌다 — 「반려 있고 단가도 없는 것」을 물을 수 있어야 한다
      if (flags.includes('rejected') && p.rejectedDocs === 0) return false;
      if (flags.includes('unpriced') && p.priced) return false;
      if (flags.includes('stalled') && p.stalledDays < 14) return false;
      return true;
    });
  }, [withMoves, q, attrs, flags]);

  const activeCount = countActive(attrs) + flags.length + (q.trim() ? 1 : 0);
  const clear = () => {
    setQ('');
    setAttrs({});
    setFlags([]);
  };

  /*
   * 보드로 넘어가면 조건을 푼다.
   * 걸린 채로 보드를 보면 칸의 숫자가 전체인지 걸린 것인지 알 수 없다 —
   * 보드는 「전부 어디에 있나」를 보는 자리다.
   */
  const changeView = useCallback((next: ViewKey) => {
    setView(next);
    if (next === 'board') {
      setAttrs({});
      setFlags([]);
      setOpen(false);
    }
  }, []);

  /** 한 축의 값을 켜고 끈다. 표의 열 머리글도 이걸 부른다. */
  const setAttr = useCallback((key: AttrKey, values: string[]) => {
    setAttrs((m) => {
      const next = { ...m };
      if (values.length) next[key] = values;
      else delete next[key];
      return next;
    });
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs view={view} onChange={changeView} />

        <label className="relative flex-1 min-w-[180px]">
          <span className="sr-only">현장 검색</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="현장명 · 번호 · 주소"
            className={`${FIELD} bg-white`}
          />
        </label>

        {/*
          * 필터는 표에서만 쓴다.
          *
          * 보드는 「어느 단계에 몇 건」을 보는 자리다 — 거기서 조건을 걸면 칸의 숫자가
          * 무슨 뜻인지 알 수 없게 된다(전체 중 몇 건인지 걸린 것 중 몇 건인지).
          * 조건으로 좁혀 찾는 일은 표가 한다.
          */}
        {view === 'table' && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`shrink-0 rounded-ctl border px-3.5 py-2 text-lead font-bold transition ${
              open || activeCount > 0
                ? 'border-brand-300 bg-brand-50 text-brand-800'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            필터{activeCount > 0 && <span className="ml-1 tabular-nums">{activeCount}</span>}
          </button>
        )}

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-ctl px-2.5 py-2 text-lead font-semibold text-slate-500 transition hover:text-slate-800"
          >
            지우기
          </button>
        )}
      </div>

      {open && view === 'table' && (
        <div className={`mb-4 flex flex-col gap-3 ${PANEL} p-4`}>
          {/*
            * 모든 축을 다 편다. 표에서는 열 머리글에서도 같은 축을 걸 수 있고, 여기 걸든
            * 저기 걸든 같은 상태다 — 보드에서도 쓰려면 이 자리가 있어야 한다.
            */}
          {ATTRS.map((a) =>
            options[a.key].length > 0 ? (
              <Group
                key={a.key}
                label={a.label}
                options={options[a.key].map((v) => ({ value: v, label: v }))}
                picked={attrs[a.key] ?? []}
                onToggle={(v) => setAttr(a.key, toggle(attrs[a.key] ?? [], v))}
              />
            ) : null
          )}
          <Group
            label="문제"
            options={FLAGS.map((f) => ({ value: f.key, label: f.label }))}
            picked={flags}
            onToggle={(v) => setFlags(toggle(flags, v))}
          />
        </div>
      )}

      <p className="mb-3 text-small font-semibold text-slate-500">
        {activeCount > 0 ? (
          <>
            {filtered.length}건 <span className="font-normal text-slate-400">/ 전체 {projects.length}건</span>
          </>
        ) : (
          <>전체 {projects.length}건</>
        )}
      </p>

      {error && <Note tone="stop" className="mb-4">{error}</Note>}

      {view === 'board' ? (
        <ProjectBoard projects={filtered} band={band} busyId={busyKey} />
      ) : (
        <ProjectTable
          projects={filtered}
          canMove={canMove}
          onMove={move}
          busyId={busyKey}
          filters={attrs}
          options={options}
          onFilter={setAttr}
        />
      )}
    </div>
  );
}

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Tabs({ view, onChange }: { view: ViewKey; onChange: (v: ViewKey) => void }) {
  const items: Array<{ key: ViewKey; label: string }> = [
    { key: 'board', label: '보드' },
    { key: 'table', label: '표' },
  ];
  return (
    <div className="flex shrink-0 rounded-ctl border border-slate-200 bg-white p-0.5">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          aria-current={view === it.key}
          className={`rounded-ctl px-3.5 py-1.5 text-lead font-bold transition ${
            view === it.key ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Group({
  label, options, picked, onToggle,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  picked: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      <span className="w-[76px] shrink-0 text-tiny font-bold tracking-[0.04em] text-slate-400">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {options.map((o) => {
          const on = picked.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={`rounded-full border px-2.5 py-1 text-tiny font-bold transition ${
                on
                  ? 'border-brand-500 bg-brand-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { BoardColumn };

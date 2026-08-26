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
  ATTR_BY_KEY, ATTRS, countActive, optionsOf, panelAttrKeys, passesAttrs,
  type AttrFilters, type AttrKey,
} from '@/lib/project-filter';
import { ALL_YEARS, businessYearsOf, inBusinessYear } from '@/lib/business-year';
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

/**
 * 몇 기인가 — 건수만으로는 규모를 모른다(한백 지시 2026-08-25). 137건이 500기일 수도
 * 1,500기일 수도 있고, 운영사로 좁혀 볼 때 알고 싶은 것은 보통 대수 쪽이다.
 * 카드가 세는 것과 같은 방식이다(ProjectBoard: 라인 수량의 합).
 */
const unitsOf = (list: ProjectSummary[]): number =>
  list.reduce((n, p) => n + p.lines.reduce((m, l) => m + l.qty, 0), 0);

/** 천 단위 쉼표 — lib/format 의 won 은 돈 이름이라 대수에 쓰지 않는다 */
const num = (n: number): string => n.toLocaleString('ko-KR');

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
  /*
   * 사업연도는 필터가 아니라 범위다 — 걸면 「전체 N건」의 N 자체가 그 해의 건수가 된다.
   * 그래서 접는 필터 막대가 아니라 늘 보이는 자리에 둔다.
   *
   * 기본은 전체다. 보드는 도는 일을 보는 자리라, 해가 바뀌었다고 작년에 접수해 아직
   * 시공 중인 현장이 사라지면 안 된다 — 그것을 놓치면 일이 멈춘 것을 모른다.
   */
  const [year, setYear] = useState(() => sp.get('year') ?? ALL_YEARS);
  const [flags, setFlags] = useState<string[]>(() => split(sp.get('flag')));
  // 필터가 걸린 주소로 들어왔으면 무엇이 걸렸는지 펴서 보여준다
  const [open, setOpen] = useState(() => ATTRS.some((a) => split(sp.get(a.key)).length > 0));
  /*
   * 판에 펼 축 — 정해 둔 넷(사업유형·운영사·영업사·시공사)에, 표의 열 머리글에서 걸어 둔
   * 나머지 축이 있으면 그것도 같이 편다. 걸려 있는데 판에 없으면 푸는 자리가 없다.
   */
  const panelKeys = useMemo(() => panelAttrKeys(attrs, band), [attrs, band]);

  /** 옮기는 중인 카드의 임시 위치 — 서버가 다시 그려주기 전까지 손을 따라간다 */
  const [moved, setMoved] = useState<Record<string, ProcessStatus>>({});
  // 카드마다 각자 도니 어느 카드인지 알아야 한다 — busyKey 가 그 카드 id 다
  const { busyKey, error, run } = useAction();

  // 주소에 남긴다. replaceState 라서 서버를 다시 부르지 않고 뒤로가기 이력도 안 쌓인다.
  useEffect(() => {
    /*
     * 우리가 쥔 값만 다시 쓴다. 처음부터 새로 만들면 이 화면이 모르는 값이 조용히
     * 지워진다 — 사업연도를 붙여 보낸 링크가 열자마자 풀리는 것이 그것이었다.
     */
    const p = new URLSearchParams(window.location.search);
    for (const key of ['view', 'q', 'flag', 'year']) p.delete(key);
    for (const a of ATTRS) p.delete(a.key);

    if (year !== ALL_YEARS) p.set('year', year);
    if (view === 'table') p.set('view', 'table');
    if (q.trim()) p.set('q', q.trim());
    for (const a of ATTRS) {
      const picked = attrs[a.key];
      if (picked?.length) p.set(a.key, picked.join(','));
    }
    if (flags.length) p.set('flag', flags.join(','));
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [view, q, attrs, flags, year]);

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

  const years = useMemo(() => businessYearsOf(projects), [projects]);

  /** 연도로 좁힌 것이 이 화면의 「전체」다 — 필터는 이 안에서 다시 거른다 */
  const scoped = useMemo(() => inBusinessYear(withMoves, year), [withMoves, year]);

  /** 축별로 고를 수 있는 값 — 이 사람 화면에, 고른 해에 있는 값만 나온다 */
  const options = useMemo(
    () => Object.fromEntries(ATTRS.map((a) => [a.key, optionsOf(scoped, a.key)])) as Record<AttrKey, string[]>,
    [scoped]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scoped.filter((p) => {
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
  }, [scoped, q, attrs, flags]);

  const scopedUnits = useMemo(() => unitsOf(scoped), [scoped]);
  const filteredUnits = useMemo(() => unitsOf(filtered), [filtered]);

  const activeCount = countActive(attrs) + flags.length + (q.trim() ? 1 : 0);
  const clear = () => {
    setQ('');
    setAttrs({});
    setFlags([]);
  };

  /*
   * 보기를 바꿔도 조건은 그대로 남는다.
   *
   * 예전에는 보드로 넘어갈 때 조건을 풀었다 — 「보드는 전부 어디에 있나를 보는 자리라
   * 걸린 채로 보면 칸의 숫자가 무슨 뜻인지 알 수 없다」는 이유였다. 그런데 운영사·시공사로
   * 좁혀 보는 일이 표에서만 되니, 「현대엔지니어링 현장이 지금 어느 단계에 몰려 있나」를
   * 볼 자리가 없었다(한백 지시 2026-08-25) — 그건 보드가 답할 질문이다.
   *
   * 숫자가 무슨 뜻인지는 건수 줄이 말한다 — 걸려 있으면 「40건 / 전체 137건」으로 적힌다.
   * 이 파일 머리말이 처음부터 말하던 것이기도 하다: 필터는 보기가 아니라 자료에 걸린다.
   */
  const changeView = useCallback((next: ViewKey) => setView(next), []);

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

        {/*
          * 사업연도는 범위라서 접는 필터 막대에 넣지 않는다 — 늘 보여야 한다.
          *
          * 탭이었는데 드롭다운으로 바꿨다(한백 지시 2026-08-25). 해가 쌓이면 탭이 가로로
          * 늘어 검색칸을 밀어냈고, 고른 해가 「눌린 탭」이라 한눈에 안 읽혔다. 드롭다운은
          * 접혀 있어도 고른 값을 글자로 말한다.
          * 수주 현황은 그대로 탭이다 — 거기는 주소를 갈아 서버가 다시 그리는 자리다.
          */}
        <label className="shrink-0">
          <span className="sr-only">사업연도</span>
          <select
            className={`${FIELD} bg-white`}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value={ALL_YEARS}>{ALL_YEARS}</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </label>

        <label className="relative flex-1 min-w-[180px]">
          <span className="sr-only">현장 검색</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="현장명 · 번호 · 주소"
            className={`${FIELD} bg-white`}
          />
        </label>
      </div>

      {/*
        * 필터는 보기 전환 아랫줄이다(한백 지시 2026-08-26).
        *
        * 검색칸(flex-1) 뒤에 있던 때는 창이 넓을수록 오른쪽 끝으로 밀려나 있었고, 보기
        * 전환 옆에 붙이니 첫 줄이 빽빽했다. 줄을 나누면 위는 「무엇을 보나」(보기·연도·검색),
        * 아래는 「무엇으로 좁히나」로 갈린다 — 펼친 판이 바로 이 줄 밑에 붙는다.
        */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
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

        {/* 거는 자리 곁에 푸는 자리를 둔다(화면 규칙 7) — 조건·검색을 통째로 지운다 */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-ctl px-2.5 py-2 text-lead font-semibold text-slate-500 transition hover:text-slate-800"
          >
            지우기
          </button>
        )}

        {/*
          * 건수는 이 줄 오른쪽 끝이다 (한백 지시 2026-08-26 — 필터와 표 사이가 너무 넓었다).
          *
          * 혼자 한 줄을 쓰고 있었다. 읽고 지나가는 값 하나가 줄을 차지하니 필터와 표 사이가
          * 두 줄만큼 벌어졌다. 자리는 그대로 오른쪽 끝이고(거르는 자리와 다투지 않는다)
          * 줄만 합친다.
          *
          * 「전체」는 고른 해의 건수다 — 연도는 필터가 아니라 범위다. 연도를 걸어 둔 채
          * 전체를 전 기간으로 적으면 두 숫자가 무엇의 비율인지 알 수 없다.
          */}
        <p className="ml-auto shrink-0 text-small font-semibold text-slate-500">
          {activeCount > 0 ? (
            <>
              {filtered.length}건 · {num(filteredUnits)}기{' '}
              <span className="font-normal text-slate-400">
                / 전체 {scoped.length}건 · {num(scopedUnits)}기
              </span>
            </>
          ) : (
            <>전체 {scoped.length}건 · {num(scopedUnits)}기</>
          )}
          {year !== ALL_YEARS && <span className="font-normal text-slate-400"> · {year}년</span>}
        </p>
      </div>

      {open && (
        <div className={`mb-4 flex flex-col gap-3 ${PANEL} p-4`}>
          {/*
            * 모든 축을 다 편다. 표에서는 열 머리글에서도 같은 축을 걸 수 있고, 여기 걸든
            * 저기 걸든 같은 상태다 — 보드에서도 쓰려면 이 자리가 있어야 한다.
            */}
          {panelKeys.map((key) => {
            const attr = ATTR_BY_KEY.get(key);
            if (!attr || options[key].length === 0) return null;
            return (
              <Group
                key={key}
                label={attr.label}
                options={options[key].map((v) => ({ value: v, label: v }))}
                picked={attrs[key] ?? []}
                onToggle={(v) => setAttr(key, toggle(attrs[key] ?? [], v))}
              />
            );
          })}
          {/*
            * 「문제」(반려·단가 미지정·14일 멈춤)는 판에서 뺐다 — 판은 넷만 편다
            * (한백 지시 2026-08-26). 걸려 있을 때만 나온다: 주소로 들어온 조건을
            * 푸는 자리가 없으면 왜 이것만 나오는지 알 수 없다.
            */}
          {flags.length > 0 && (
            <Group
              label="문제"
              options={FLAGS.map((f) => ({ value: f.key, label: f.label }))}
              picked={flags}
              onToggle={(v) => setFlags(toggle(flags, v))}
            />
          )}
        </div>
      )}

      {error && <Note tone="stop" className="mb-4">{error}</Note>}

      {view === 'board' ? (
        <ProjectBoard projects={filtered} band={band} canMove={canMove} onMove={move} busyId={busyKey} />
      ) : (
        <ProjectTable
          projects={filtered}
          canMove={canMove}
          onMove={move}
          busyId={busyKey}
          filters={attrs}
          options={options}
          onFilter={setAttr}
          tab={band === '계약' ? 'intake' : 'construction'}
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

/**
 * 한 축의 값들 — 체크박스로 고른다(한백 지시 2026-08-26).
 *
 * 칩(Choice)이었다. 칩은 켜진 것만 색으로 말해서, 안 켜진 값이 「고를 수 있는 것」인지
 * 「지금 걸려서 빠진 것」인지 모양이 같았다 — 축 열 개가 한 판에 깔리면 더 그렇다.
 * 체크박스는 고르는 물건이라고 생김새가 먼저 말한다.
 *
 * 모양은 표의 열 고르기와 같은 것을 쓴다(ProjectTable) — 같은 일을 하는 자리가 화면마다
 * 다르게 생기지 않게 한다.
 */
function Group({
  label, options, picked, onToggle,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  picked: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="w-[76px] shrink-0 text-tiny font-bold tracking-[0.04em] text-slate-400">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap gap-x-3 gap-y-1">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-1.5 rounded-ctl px-1.5 py-1 text-small font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={picked.includes(o.value)}
              onChange={() => onToggle(o.value)}
              className="h-3.5 w-3.5 accent-brand-600"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export type { BoardColumn };

'use client';

/**
 * 할 일 칸반 — 국면(정산·계약·시공)이 칸으로 서고, 위에서 걸러 본다.
 *
 * ★칸반의 약점 넷을 메운 자리다 (2026-08-24 재검토).★
 *  1. 높이를 내용에 맞춘다(items-start) — 화면 높이로 못 박으면 3건일 때도 빈 칸이 끝까지 섰다.
 *  2. 맨 위에 「급한 것」 — 칸반은 「어느 칸에 몇 개」는 보여주지만 「칸을 넘어 무엇부터」에는
 *     답하지 못한다. 정산이 비고 계약 칸 아래에 30일 정체가 묻히는 일이 실제로 생긴다.
 *  3. 카드마다 칸이름 꼬리표 — 계약 칸에 접수·검토·보완이 섞인다(보드는 그것을 칸으로 갈랐다).
 *  4. 급함의 근거가 국면마다 다르다 — lib/todos 가 한 숫자(urgency)로 만들고 화면은 읽는다.
 *
 * ★필터 (한백 요청 2026-08-24)★ 국면·일 종류·급한 것만. 매트릭스·배치 목록과 같은 모양이다
 * (고르는 것은 왼쪽에 몰고 한 줄로) — 세 화면의 필터가 다르게 생기면 같은 일을 세 번 배운다.
 *
 * ★거른 뒤에도 칸은 안 사라진다.★ 국면을 고르면 그 칸만 남지만, 종류·급한 것으로 거르면
 * 빈 칸도 자리를 지킨다 — 칸의 유무가 흔들리면 세 칸의 자리를 외울 수 없고, 「정산에는
 * 걸린 것이 없다」도 답이다. 대신 칸 머리의 숫자가 「거른 수 / 전체」로 바뀐다.
 *
 * 카드는 끌지 않는다 — 이 칸은 단계가 아니라 국면이라 옮길 성질이 아니다. 카드가 곧 링크다.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TODO_GROUPS, type TodoItem } from '@/lib/todos';
import { Blank, FIELD, Tag } from '@/components/ui';

const ALL = '전체';
/** 급한 것의 문턱 — 7일 정체(카드가 빨개지는 자리)와 같은 잣대다 */
const URGENT_AT = 7;

export default function TodoBoard({ items }: { items: TodoItem[] }) {
  const [group, setGroup] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [urgentOnly, setUrgentOnly] = useState(false);

  /* 종류 후보는 실제로 있는 할 일에서 뽑는다 — 없는 것을 고를 수 있으면 0건이 나온다 */
  const kinds = useMemo(
    () => [...new Set(items.map((t) => t.kind))].sort((a, b) => a.localeCompare(b, 'ko')),
    [items]
  );

  const shown = useMemo(
    () => items.filter((t) =>
      (group === ALL || t.group === group)
      && (kind === ALL || t.kind === kind)
      && (!urgentOnly || t.urgency >= URGENT_AT)),
    [items, group, kind, urgentOnly]
  );
  const filtered = shown.length !== items.length;

  /* 고른 국면만 칸으로 — 국면 필터는 「그 칸만 보기」다 */
  const cols = TODO_GROUPS.filter((g) => group === ALL || g === group);

  /*
   * 급한 것 — 거른 목록에서 뽑는다(걸러 놓고 딴 것을 위에 띄우면 두 화면이 된다).
   * 이미 급한 순으로 정렬돼 있다(lib/todos). urgency 0 은 안 올린다 —
   * 「급한 것」 자리에 한가한 일이 서면 그 줄을 안 믿게 된다.
   */
  const urgent = shown.filter((t) => t.urgency > 0).slice(0, 3);

  return (
    <div className="flex flex-col">
      {/* 매트릭스·배치 목록과 같은 모양 — 고르는 것은 왼쪽에 몰고 한 줄로 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-36">
          <select aria-label="국면" className={FIELD} value={group} onChange={(e) => setGroup(e.target.value)}>
            {[ALL, ...TODO_GROUPS].map((v) => (
              <option key={v} value={v}>
                {v === ALL ? '국면 전체' : `${v} (${items.filter((t) => t.group === v).length})`}
              </option>
            ))}
          </select>
        </div>
        <div className="w-44">
          <select aria-label="일 종류" className={FIELD} value={kind} onChange={(e) => setKind(e.target.value)}>
            {[ALL, ...kinds].map((v) => (
              <option key={v} value={v}>
                {v === ALL ? '종류 전체' : `${v} (${items.filter((t) => t.kind === v).length})`}
              </option>
            ))}
          </select>
        </div>
        {/* 급한 것만 — 체크는 두 갈래뿐이라 드롭다운을 만들지 않는다 */}
        <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-small font-bold text-slate-500">
          <input
            type="checkbox"
            checked={urgentOnly}
            onChange={(e) => setUrgentOnly(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          급한 것만
          <span className="text-micro font-semibold text-slate-400">
            {URGENT_AT}일 이상 · 지급일 지남
          </span>
        </label>
        <span className="text-tiny font-bold tabular-nums text-slate-400">
          {shown.length}건
          {/* 걸러서 몇 건이 빠졌는지 적는다 — 안 적으면 걸러진 목록이 전부처럼 보인다 */}
          {filtered && <span className="ml-1 font-semibold text-slate-300">/ 전체 {items.length}건</span>}
        </span>
      </div>

      {urgent.length > 0 && (
        <section className="mb-4 rounded-panel border border-amber-200 bg-amber-50/60 p-3">
          <p className="mb-2 px-0.5 text-micro font-bold tracking-[0.12em] text-amber-800">급한 것</p>
          <ul className="flex flex-col gap-1.5">
            {urgent.map((t) => (
              <li key={`urgent-${t.id}`}>
                <Link
                  href={t.href}
                  className="flex flex-wrap items-baseline gap-x-2.5 rounded-box bg-white px-3 py-2 transition hover:bg-brand-50/50"
                >
                  <Tag tone={t.group === '정산' ? 'ok' : 'stage'}>{t.group}</Tag>
                  <span className="min-w-0 flex-1 truncate text-small font-bold text-slate-900">{t.name}</span>
                  <span className="text-tiny text-slate-500">{t.kind}</span>
                  {t.urgencyLabel && (
                    <span className="text-small font-bold tabular-nums text-amber-800">{t.urgencyLabel}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown.length === 0 ? (
        <Blank>{filtered ? '조건에 맞는 할 일 0건' : '지금 움직일 차례인 일 0건'}</Blank>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
          {/* items-start — 없으면 칸들이 가장 긴 칸에 맞춰 늘어난다 */}
          <div
            className="grid items-start gap-3"
            style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(240px, ${cols.length > 1 ? '1fr' : '420px'}))` }}
          >
            {cols.map((g) => {
              const list = shown.filter((t) => t.group === g);
              const total = items.filter((t) => t.group === g).length;
              return (
                <section
                  key={g}
                  aria-label={g}
                  className="flex min-w-0 flex-col rounded-panel border border-slate-200 bg-slate-50/60 p-2.5"
                >
                  <header className="flex items-baseline justify-between gap-2 px-1.5 pb-2">
                    <h2 className="text-base font-black tracking-[-0.01em] text-slate-800">{g}</h2>
                    <span className="flex items-baseline gap-1">
                      <span
                        className={`text-lead font-black tabular-nums ${
                          list.length > 0 ? 'text-slate-700' : 'text-slate-300'
                        }`}
                      >
                        {list.length}
                      </span>
                      {/* 이 칸에서 걸러 빠진 것이 있으면 전체도 적는다 */}
                      {list.length !== total && (
                        <span className="text-tiny font-semibold tabular-nums text-slate-300">/ {total}</span>
                      )}
                    </span>
                  </header>

                  {/* 칸이 길어지면 칸 안에서만 스크롤 — 화면 높이의 3/4 까지 자란다 */}
                  <div className="flex max-h-[75vh] flex-col gap-2 overflow-y-auto">
                    {list.map((t) => (
                      <TodoCard key={t.id} t={t} />
                    ))}
                    {list.length === 0 && (
                      <p className="rounded-box border border-dashed border-slate-200 py-6 text-center text-tiny text-slate-300">
                        없음
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 카드 한 장 — 통째로 링크다. 보드 카드와 같은 겉모양.
 *
 * 칸이름 꼬리표가 위에 선다 — 국면이 칸이라 그 안에서 무슨 일인지는 카드가 말해야 한다
 * (계약 칸의 접수·검토·보완). 급함은 국면과 무관한 한 자로 재어 온 것을 적는다.
 */
function TodoCard({ t }: { t: TodoItem }) {
  return (
    <Link
      href={t.href}
      className="block rounded-box border border-slate-200 bg-white p-2.5 transition hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      <p className="mb-1 flex items-center gap-1.5">
        <Tag tone="mute">{t.kind}</Tag>
        {/* 7일 이상 정체 · 지급일 지남이 여기 걸린다 — 카드 안에서 가장 먼저 읽혀야 한다 */}
        {t.urgencyLabel && (
          <span
            className={`ml-auto text-tiny font-bold tabular-nums ${
              t.urgency >= URGENT_AT ? 'text-red-600' : 'text-slate-400'
            }`}
          >
            {t.urgencyLabel}
          </span>
        )}
      </p>
      <p className="truncate text-small font-bold text-slate-900">{t.name}</p>
      <p className="mt-0.5 truncate text-tiny text-slate-500">{t.what}</p>
    </Link>
  );
}


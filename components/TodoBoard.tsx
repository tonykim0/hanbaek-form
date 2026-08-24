'use client';

/**
 * 할 일 칸반 — 국면(정산·계약·시공)이 칸으로 서고, 위에서 걸러 본다.
 *
 * ★화면에서 부르는 이름은 「업무」다 (한백 확인 2026-08-24).★ 코드·CLAUDE.md 는 이것을
 * 국면이라 부르지만(계약·시공을 가르는 축) 그 말은 안쪽 어휘다 — 필터에 「국면 전체」라고
 * 적혀 있으면 읽는 사람이 무엇을 고르는지 모른다.
 *
 * ★칸반의 약점 셋을 메운 자리다 (2026-08-24 재검토).★
 *  1. 높이를 내용에 맞춘다(items-start) — 화면 높이로 못 박으면 3건일 때도 빈 칸이 끝까지 섰다.
 *  2. 카드마다 칸이름 꼬리표 — 계약 칸에 접수·검토·보완이 섞인다(보드는 그것을 칸으로 갈랐다).
 *  3. 급함의 근거가 업무마다 다르다 — 계약·시공은 정체일, 정산은 지급일까지의 거리.
 *     lib/todos 가 한 숫자(urgency)로 만들고 화면은 그것을 읽는다: 칸 안 순서와 카드의
 *     밀림 문구가 그 자다.
 *
 * ★맨 위의 「급한 것」 구획은 걷어냈다 (한백 확인 2026-08-24).★ 같은 카드가 위에 한 번,
 * 칸에 또 한 번 나와서 한 일이 두 자리에 있었다 — 처리하면 두 곳에서 사라지는 것을
 * 눈으로 좇아야 했다. 급한 것을 고르는 길은 필터(밀린 것만)로 남는다.
 *
 * ★필터★ 업무 · 종류 · 밀린 것만. 매트릭스·배치 목록과 같은 모양이다(고르는 것은 왼쪽에
 * 몰고 한 줄로) — 세 화면의 필터가 다르게 생기면 같은 일을 세 번 배운다.
 *
 * ★거른 뒤에도 칸은 안 사라진다.★ 업무를 고르면 그 칸만 남지만, 종류·밀림으로 거르면
 * 빈 칸도 자리를 지킨다 — 칸의 유무가 흔들리면 세 칸의 자리를 외울 수 없고, 「정산에는
 * 걸린 것이 없다」도 답이다. 대신 칸 머리의 숫자가 「거른 수 / 전체」로 바뀐다.
 *
 * 카드는 끌지 않는다 — 이 칸은 단계가 아니라 업무라 옮길 성질이 아니다. 카드가 곧 링크다.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TODO_GROUPS, type TodoItem } from '@/lib/todo-types';
import { Blank, FIELD, Tag } from '@/components/ui';

const ALL = '전체';
/** 밀림의 문턱 — 7일 정체(카드가 빨개지는 자리)와 같은 잣대다 */
const OVERDUE_AT = 7;

export default function TodoBoard({ items }: { items: TodoItem[] }) {
  const [group, setGroup] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [overdueOnly, setOverdueOnly] = useState(false);

  /* 종류 후보는 실제로 있는 할 일에서 뽑는다 — 없는 것을 고를 수 있으면 0건이 나온다 */
  const kinds = useMemo(
    () => [...new Set(items.map((t) => t.kind))].sort((a, b) => a.localeCompare(b, 'ko')),
    [items]
  );

  const shown = useMemo(
    () => items.filter((t) =>
      (group === ALL || t.group === group)
      && (kind === ALL || t.kind === kind)
      && (!overdueOnly || t.urgency >= OVERDUE_AT)),
    [items, group, kind, overdueOnly]
  );
  const filtered = shown.length !== items.length;

  /* 고른 업무만 칸으로 — 업무 필터는 「그 칸만 보기」다 */
  const cols = TODO_GROUPS.filter((g) => group === ALL || g === group);

  return (
    <div className="flex flex-col">
      {/* 매트릭스·배치 목록과 같은 모양 — 고르는 것은 왼쪽에 몰고 한 줄로 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-36">
          <select aria-label="업무" className={FIELD} value={group} onChange={(e) => setGroup(e.target.value)}>
            {[ALL, ...TODO_GROUPS].map((v) => (
              <option key={v} value={v}>
                {v === ALL ? '업무 전체' : `${v} (${items.filter((t) => t.group === v).length})`}
              </option>
            ))}
          </select>
        </div>
        <div className="w-48">
          <select aria-label="할 일 종류" className={FIELD} value={kind} onChange={(e) => setKind(e.target.value)}>
            {[ALL, ...kinds].map((v) => (
              <option key={v} value={v}>
                {v === ALL ? '할 일 종류 전체' : `${v} (${items.filter((t) => t.kind === v).length})`}
              </option>
            ))}
          </select>
        </div>
        {/* 밀린 것만 — 체크는 두 갈래뿐이라 드롭다운을 만들지 않는다 */}
        <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-small font-bold text-slate-500">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          밀린 것만
          <span className="text-micro font-semibold text-slate-400">
            {OVERDUE_AT}일 이상 정체 · 지급일 지남
          </span>
        </label>
        <span className="text-tiny font-bold tabular-nums text-slate-400">
          {shown.length}건
          {/* 걸러서 몇 건이 빠졌는지 적는다 — 안 적으면 걸러진 목록이 전부처럼 보인다 */}
          {filtered && <span className="ml-1 font-semibold text-slate-300">/ 전체 {items.length}건</span>}
        </span>
      </div>

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
        {/* 밀림 — 7일 이상 정체 · 지급일 지남이 빨갛게 걸린다. 급한 것을 고르는 길은 위 필터다 */}
        {t.urgencyLabel && (
          <span
            className={`ml-auto text-tiny font-bold tabular-nums ${
              t.urgency >= OVERDUE_AT ? 'text-red-600' : 'text-slate-400'
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


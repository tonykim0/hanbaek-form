'use client';

/**
 * 할 일 칸반 — 업무(계약·시공·지급·기성)가 칸으로 서고, 위에서 걸러 본다.
 *
 * ★화면에서 부르는 이름은 「업무」다 (한백 확인 2026-08-24).★ 코드·CLAUDE.md 는 이것을
 * 국면이라 부르지만(계약·시공을 가르는 축) 그 말은 안쪽 어휘다 — 필터에 「국면 전체」라고
 * 적혀 있으면 읽는 사람이 무엇을 고르는지 모른다.
 *
 * ★업무는 띠, 종류는 칸이다 (한백 지시 2026-09-02).★ 그전에는 업무가 칸이고 종류가 그
 * 안에 세로로 쌓여서, 종류를 견주려면 한 칸을 끝까지 내려갔다 다시 올라와야 했다 —
 * 눈이 위아래로만 움직였다. 띠로 눕히면 그 업무의 종류가 한 줄에 다 보인다.
 *
 * ★칸반의 약점 셋을 메운 자리다 (2026-08-24 재검토).★
 *  1. 높이를 내용에 맞춘다(items-start) — 화면 높이로 못 박으면 3건일 때도 빈 칸이 끝까지 섰다.
 *  2. 종류가 제 칸을 갖는다 — 카드 꼬리표로 갈라 읽던 것을 칸 머리가 대신한다.
 *  3. 급함의 근거가 업무마다 다르다 — 계약·시공은 정체일, 지급은 지급일까지의 거리,
 *     기성은 받을 수 있게 된 뒤 지난 날.
 *     lib/todos 가 한 숫자(urgency)로 만들고 화면은 그것을 읽는다: 칸 안 순서와 카드의
 *     밀림 문구가 그 자다.
 *
 * ★맨 위의 「급한 것」 구획은 걷어냈다 (한백 확인 2026-08-24).★ 같은 카드가 위에 한 번,
 * 칸에 또 한 번 나와서 한 일이 두 자리에 있었다 — 처리하면 두 곳에서 사라지는 것을
 * 눈으로 좇아야 했다. 급한 것을 고르는 길은 필터(밀린 것만)로 남는다.
 *
 * ★필터★ 업무 · 밀린 것만. 매트릭스·배치 목록과 같은 모양이다(고르는 것은 왼쪽에
 * 몰고 한 줄로) — 세 화면의 필터가 다르게 생기면 같은 일을 세 번 배운다.
 *
 * ★「할 일 종류」 필터는 걷었다 (한백 지시 2026-09-02).★ 칸 안을 종류로 쪼개면서
 * 소제목이 그 말을 하게 됐다 — 종류마다 소제목과 수가 서 있는데 위에서 또 고르게 하면
 * 같은 것을 두 자리에 둔 것이다(화면 규칙 5). 고르는 것보다 훑는 것이 빠른 자리이기도 하다.
 *
 * ★거른 뒤에도 칸은 안 사라진다.★ 업무를 고르면 그 칸만 남지만, 종류·밀림으로 거르면
 * 빈 칸도 자리를 지킨다 — 칸의 유무가 흔들리면 칸의 자리를 외울 수 없고, 「기성에는
 * 걸린 것이 없다」도 답이다. 대신 칸 머리의 숫자가 「거른 수 / 전체」로 바뀐다.
 *
 * 카드는 끌지 않는다 — 이 칸은 단계가 아니라 업무라 옮길 성질이 아니다. 카드가 곧 링크다.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TODO_GROUPS, type TodoItem } from '@/lib/todo-types';
import { BOARD_COLUMNS } from '@/lib/board';
import { Blank, FIELD } from '@/components/ui';

const ALL = '전체';
/** 밀림의 문턱 — 7일 정체(카드가 빨개지는 자리)와 같은 잣대다 */
const OVERDUE_AT = 7;


export default function TodoBoard({ items }: { items: TodoItem[] }) {
  const [group, setGroup] = useState<string>(ALL);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const shown = useMemo(
    () => items.filter((t) =>
      (group === ALL || t.group === group)
      && (!overdueOnly || t.urgency >= OVERDUE_AT)),
    [items, group, overdueOnly]
  );
  const filtered = shown.length !== items.length;

  /* 고른 업무만 칸으로 — 업무 필터는 「그 칸만 보기」다 */
  const cols = TODO_GROUPS.filter((g) => group === ALL || g === group);

  return (
    <div className="flex flex-col">
      {/* 매트릭스·배치 목록과 같은 모양 — 고르는 것은 왼쪽에 몰고 한 줄로 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-40">
          <select aria-label="업무" className={FIELD} value={group} onChange={(e) => setGroup(e.target.value)}>
            {[ALL, ...TODO_GROUPS].map((v) => (
              <option key={v} value={v}>
                {v === ALL ? '업무 전체' : `${v} (${items.filter((t) => t.group === v).length})`}
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
        /*
          ★업무는 띠, 종류는 칸이다★ (한백 지시 2026-09-02 「왼쪽에서 오른쪽으로 보는 게
          더 편할 듯」). 그전에는 업무가 칸이고 종류가 그 안에 세로로 쌓여서, 종류를 견주려면
          한 칸을 끝까지 내려갔다 다시 올라와야 했다 — 눈이 위아래로만 움직였다.
          띠로 눕히면 그 업무의 종류가 한 줄에 다 보이고, 어디에 몰려 있는지가 한눈에 온다.

          업무 띠는 넷 다 그린다(거른 뒤에도) — 자리가 흔들리면 외울 수 없고,
          「기성에는 걸린 것이 없다」도 답이다.
        */
        <div className="flex flex-col gap-4">
          {cols.map((g) => {
            const list = shown.filter((t) => t.group === g);
            const total = items.filter((t) => t.group === g).length;
            return (
              <section key={g} aria-label={g}>
                <header className="mb-1.5 flex items-baseline gap-2">
                  <h2 className="text-base font-black tracking-[-0.01em] text-slate-800">{g}</h2>
                  <span className="flex items-baseline gap-1">
                    <span className={`text-lead font-black tabular-nums ${
                      list.length > 0 ? 'text-slate-700' : 'text-slate-300'
                    }`}>
                      {list.length}
                    </span>
                    {/* 이 띠에서 걸러 빠진 것이 있으면 전체도 적는다 */}
                    {list.length !== total && (
                      <span className="text-tiny font-semibold tabular-nums text-slate-300">/ {total}</span>
                    )}
                  </span>
                </header>

                {/* 종류가 많으면 띠 안에서만 옆으로 민다 — 페이지가 통째로 밀리지 않는다 */}
                <div className="-mx-5 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
                  <div className="flex items-start gap-2.5">
                    {kindColumns(g, list).map(([kind, cards]) => (
                      /*
                        ★빈 칸도 자리를 지키되 얇다★ (화면 규칙 6). 시공은 흐름 칸이 여덟이라
                        다 펼치면 대부분이 빈 상자다 — 자리는 남기고 폭만 줄여 「여기는 0건」을
                        한눈에 지나가게 한다. 찬 칸만 카드 폭(240px)을 갖는다.
                      */
                      <section
                        key={kind}
                        aria-label={`${g} · ${kind}`}
                        className={`flex flex-none flex-col rounded-panel border p-2.5 ${
                          cards.length > 0
                            ? 'w-[240px] border-slate-200 bg-slate-50/60'
                            : 'w-[104px] border-dashed border-slate-200 bg-white'
                        }`}
                      >
                        <header className="flex items-baseline gap-1.5 px-0.5 pb-2">
                          <h3 className={`min-w-0 flex-1 truncate text-tiny font-black tracking-[0.02em] ${
                            cards.length > 0 ? 'text-slate-600' : 'text-slate-300'
                          }`}>
                            {kind}
                          </h3>
                          <span className={`text-tiny font-bold tabular-nums ${
                            cards.length > 0 ? 'text-slate-700' : 'text-slate-300'
                          }`}>
                            {cards.length}
                          </span>
                        </header>
                        {/* 칸이 길어지면 칸 안에서만 스크롤 — 화면 높이의 절반까지 자란다 */}
                        {cards.length > 0 && (
                          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
                            {cards.map((t) => (
                              <TodoCard key={t.id} t={t} />
                            ))}
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 그 업무의 칸들 — [종류, 카드들] 차례대로.
 *
 * ★흐름 칸은 비어 있어도 세운다.★ 계약·시공의 종류는 곧 보드의 칸이라 순서가 정해져
 * 있고(BOARD_COLUMNS), 그 자리가 흔들리면 「어디쯤 있나」를 외울 수 없다 — 오늘 비었다고
 * 빼면 내일 다시 생겨 칸이 옆으로 밀린다. 빈 칸은 폭을 줄여 지나가게 한다(화면 규칙 6).
 *
 * 지급·기성은 흐름이 없다 — 있는 종류만 급한 순으로 세운다. 목록을 여기 손으로 적지
 * 않는 이유: 저쪽(lib/todos · lib/todo-receivables)에 종류가 하나 늘 때 여기만 옛말이 된다.
 */
function kindColumns(group: string, list: TodoItem[]): Array<[string, TodoItem[]]> {
  const by = new Map<string, TodoItem[]>();
  for (const t of list) {
    const got = by.get(t.kind);
    if (got) got.push(t);
    else by.set(t.kind, [t]);
  }

  /* 이 업무가 흐름을 가진 국면인가 — 보드의 띠 이름과 같은 말이면 그렇다 */
  const flow = BOARD_COLUMNS.filter((c) => c.band === group && c.key !== '계약중단');
  if (flow.length > 0) {
    const cols: Array<[string, TodoItem[]]> = flow.map((c) => [c.key, by.get(c.key) ?? []]);
    /* 흐름에 없는 종류가 섞여 있으면(이름이 바뀌었거나 새로 생겼거나) 뒤에 붙인다 — 잃지 않는다 */
    for (const [k, v] of by) if (!flow.some((c) => c.key === k)) cols.push([k, v]);
    return cols;
  }
  return [...by.entries()].sort(([, a], [, b]) => (b[0]?.urgency ?? 0) - (a[0]?.urgency ?? 0));
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
      {/*
        ★종류 꼬리표는 걷었다★ (2026-09-02) — 카드가 그 소제목 밑에 있으므로 같은 말을
        두 번 하는 자리가 됐다(화면 규칙 5). 남는 것은 밀림뿐이다.
      */}
      <p className="flex items-baseline gap-1.5">
        <span className="min-w-0 flex-1 truncate text-small font-bold text-slate-900">{t.name}</span>
        {/* 밀림 — 7일 이상 정체 · 지급일 지남이 빨갛게 걸린다. 급한 것을 고르는 길은 위 필터다 */}
        {t.urgencyLabel && (
          <span
            className={`shrink-0 text-tiny font-bold tabular-nums ${
              t.urgency >= OVERDUE_AT ? 'text-red-600' : 'text-slate-400'
            }`}
          >
            {t.urgencyLabel}
          </span>
        )}
      </p>
      <p className="mt-0.5 truncate text-tiny text-slate-500">{t.what}</p>
    </Link>
  );
}


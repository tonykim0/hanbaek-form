'use client';

/**
 * 월별 지급 그래프 — 달마다 영업비·시공비가 얼마 나갔는지 한눈에 좇는다.
 *
 * ★한 해를 1월부터 12월까지 통째로 세운다 (한백 2026-08-29).★ 예전에는 첫 지급이
 * 있던 달부터 이번 달까지만 그렸다 — 그러면 해가 바뀔 때 막대 수가 달라져 같은 그래프가
 * 매달 다른 모양이 되고, 「올해 아직 안 나간 달」이 자리조차 없어 보이지 않았다.
 * 열두 칸은 늘 같은 자리에 있고, 지급이 없는 달은 0원으로 선다 — 안 나간 달이 보이는
 * 것도 정보다(빈 값도 자리를 지킨다, 화면 규칙 6).
 *
 * 해는 왼쪽 위에서 고른다. 필터는 보는 것 바로 위에 있어야 무엇을 거르는지 안다 —
 * 화면 맨 위에 두면 아래 배치 표까지 거르는 것으로 읽힌다(그것은 표가 따로 거른다).
 *
 * 막대는 ★읽는 것이지 누르는 것이 아니다★ (2026-08-28) — 예전에는 아래 그 달의 묶음으로
 * 내려가는 목차였는데, 지급 내역 화면이 거래명세서로 합쳐지면서 내려갈 묶음이 없어졌다.
 *
 * 라이브러리를 쓰지 않는다. 막대 두 조각(영업비·시공비)을 div 높이로 그린다 —
 * 이 화면이 필요한 것은 추세와 비교뿐이라 축·눈금·툴팁이 없어도 읽힌다.
 * 회수가 큰 달은 합이 음수가 될 수 있다 — 막대는 0 으로 두고 숫자만 음수로 적는다.
 */
import { useMemo, useState } from 'react';
import { won, wonCompact } from '@/lib/format';
import { FIELD } from '@/components/ui';

export interface MonthBar {
  /** YYYY-MM */
  month: string;
  sales: number;
  cons: number;
  /** 이 달에 나간 지급이 있나 — 0원인 달과 「지급 0건」인 달을 가른다 */
  has: boolean;
}

const BAR_H = 120;
const yearOf = (month: string) => month.slice(0, 4);

export default function PayChart({
  months, thisMonth,
}: {
  /** 지급이 있는 달만 와도 된다 — 없는 달은 여기서 0원으로 세운다 */
  months: MonthBar[];
  /** 지금이 어느 달인가 — 고른 달이 아니라 오늘의 자리다 */
  thisMonth: string;
}) {
  /* 고를 수 있는 해 — 지급이 있던 해와 올해. 없는 해를 고르면 빈 그래프뿐이라 넣지 않는다 */
  const years = useMemo(() => {
    const set = new Set(months.map((m) => yearOf(m.month)));
    set.add(yearOf(thisMonth));
    return [...set].sort().reverse();
  }, [months, thisMonth]);

  /*
   * 처음 보이는 해 — 올해에 지급이 있으면 올해, 없으면 지급이 있던 가장 최근 해.
   * 해가 바뀐 직후 빈 그래프로 열리면 「지급이 없어졌나」로 읽힌다.
   */
  const [year, setYear] = useState(() => {
    const paid = months.filter((m) => m.has).map((m) => yearOf(m.month)).sort();
    const now = yearOf(thisMonth);
    if (paid.includes(now) || paid.length === 0) return now;
    return paid[paid.length - 1];
  });

  const byMonth = useMemo(() => new Map(months.map((m) => [m.month, m])), [months]);
  const slots: MonthBar[] = useMemo(
    () => Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`;
      return byMonth.get(key) ?? { month: key, sales: 0, cons: 0, has: false };
    }),
    [byMonth, year]
  );

  /* 높이는 고른 해 안에서만 견준다 — 해마다 축이 다시 잡혀야 그 해의 굴곡이 보인다 */
  const max = Math.max(1, ...slots.map((m) => Math.max(0, m.sales) + Math.max(0, m.cons)));
  const yearTotal = slots.reduce((n, m) => n + m.sales + m.cons, 0);
  const yearCount = slots.filter((m) => m.has).length;

  return (
    <section aria-label="월별 지급" className="rounded-panel border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {/* 왼쪽 위 — 고르는 것과 그 해의 합계가 같이 선다 */}
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-h3 font-black text-slate-900">월별 지급</h2>
          {/* 폭은 감싸는 상자가 준다 — FIELD 는 w-full 이라 클래스로 덮으면 순서 싸움이 된다 */}
          <span className="w-28">
            <select
              aria-label="연도"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className={`${FIELD} bg-white`}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </span>
          <span className="text-tiny font-bold tabular-nums text-slate-500">
            {yearCount === 0 ? '지급 0건' : <>{won(yearTotal)}원</>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 text-tiny font-bold text-slate-500">
            <i className="h-2.5 w-2.5 rounded-[3px] bg-sky-400" aria-hidden />영업비
          </span>
          <span className="flex items-center gap-1.5 text-tiny font-bold text-slate-500">
            <i className="h-2.5 w-2.5 rounded-[3px] bg-brand-500" aria-hidden />시공비
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-fit items-end gap-1.5">
          {slots.map((m) => {
            const sales = Math.max(0, m.sales);
            const cons = Math.max(0, m.cons);
            const total = m.sales + m.cons;
            const on = m.month === thisMonth;
            const money = `영업비 ${wonCompact(m.sales)} · 시공비 ${wonCompact(m.cons)}`;
            return (
              <span
                key={m.month}
                className="group flex w-14 shrink-0 flex-col items-center gap-1"
                title={m.has ? `${m.month} ${money}` : `${m.month} 지급 0건`}
                aria-current={on ? 'true' : undefined}
              >
                <span
                  className={`text-micro font-bold tabular-nums ${
                    total === 0 ? 'text-slate-300' : total < 0 ? 'text-amber-700' : 'text-slate-600'
                  }`}
                >
                  {total === 0 ? '0' : wonCompact(total)}
                </span>
                <span
                  className="flex w-9 flex-col justify-end overflow-hidden rounded-t-[4px]"
                  style={{ height: BAR_H }}
                  aria-hidden
                >
                  {/* 위가 시공비, 아래가 영업비 — 범례 순서와 같다 */}
                  <span className="w-full bg-brand-500 transition group-hover:bg-brand-600"
                    style={{ height: Math.round((cons / max) * BAR_H) }} />
                  <span className="w-full bg-sky-400 transition group-hover:bg-sky-500"
                    style={{ height: Math.round((sales / max) * BAR_H) }} />
                  {sales + cons === 0 && <span className="h-px w-full bg-slate-200" />}
                </span>
                {/* 열두 칸이 늘 같은 자리라 이름은 「N월」 하나면 된다 — 연도는 위에서 고른다 */}
                <span
                  className={`rounded-tag px-1.5 py-0.5 text-tiny font-bold tabular-nums ${
                    on ? 'bg-slate-900 text-white'
                      : m.has ? 'text-slate-500 group-hover:text-slate-800'
                        : 'text-slate-300'
                  }`}
                >
                  {Number(m.month.slice(5))}월
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

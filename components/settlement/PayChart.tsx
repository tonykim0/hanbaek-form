'use client';

/**
 * 월별 지급 그래프 — 달마다 영업비·시공비가 얼마 나갔는지 한눈에 좇는다.
 *
 * ★막대를 눕힌다 (한백 지적 2026-08-30).★ 수주 현황(/dashboard)의 세로 얼개를 따라
 * 갔었는데, 그쪽은 값이 하나(대수)고 여기는 둘(영업비·시공비)이다. 열두 칸을 가로로 나누고
 * 그 칸을 또 둘로 쪼개니 막대가 실오라기가 되고 금액을 적을 자리가 없었다. 눕히면 길이는
 * 화면 폭을 다 쓰고 금액은 제 자리를 갖는다 — 그리고 ★두 금액을 다 적을 수 있다★.
 *
 * ★쌓지 않고 나란히 세운다★ (한백 지시 2026-08-29 「영업비와 시공비 분리해줘」).
 * 그전에는 한 막대에 두 조각을 쌓았다. 아래 조각(영업비)은 바닥에서 시작해 길이가 보이지만
 * ★위 조각(시공비)은 시작 높이가 달마다 달라서 달끼리 견줄 수 없다★ — 쌓은 막대의 위
 * 조각은 눈이 길이가 아니라 위치로 읽는다. 나란히 세우면 둘 다 바닥에서 시작해 서로도,
 * 달끼리도 견줄 수 있다. 눈금(최대)도 합이 아니라 ★한 조각의 크기★로 잡는다 — 그래야
 * 막대 높이가 그 조각의 금액을 그대로 말한다.
 *
 * 그 달에 나간 돈(합)은 막대 위 숫자가 그대로 적는다 — 쌓기를 걷어도 합을 잃지 않는다.
 *
 * ★한 해를 1월부터 12월까지 통째로 세운다.★ 그전에는 첫 지급이 있던 달부터 이번 달까지만
 * 그렸다 — 달이 갈 때마다 막대 수가 늘어 같은 그래프가 매달 다른 모양이 되고, 「올해 아직
 * 안 나간 달」은 자리조차 없었다. 열두 칸은 늘 같은 자리에 있다(빈 값도 자리를 지킨다,
 * 화면 규칙 6).
 *
 * ★다만 「없는 것」을 그리지는 않는다★ (2026-08-30). 아직 오지 않은 달과 그 달에 안 나간
 * 돈은 막대를 세우지 않는다 — 자리만 지킨다. 회색 막대로 채웠더니 올해 남은 다섯 달과
 * 시공비가 없는 열한 달이 모두 얼룩이 되어, 정작 나간 돈이 묻혔다.
 *
 * 해는 왼쪽 위에서 고른다. 필터는 보는 것 바로 위에 있어야 무엇을 거르는지 안다 —
 * 화면 맨 위에 두면 아래 배치 표까지 거르는 것으로 읽힌다(그것은 표가 따로 거른다).
 *
 * 막대는 ★읽는 것이지 누르는 것이 아니다★ — 예전에는 아래 그 달의 묶음으로 내려가는
 * 목차였는데, 지급 내역 화면이 거래명세서로 합쳐지면서 내려갈 묶음이 없어졌다.
 *
 * 라이브러리를 쓰지 않는다. 막대를 div 너비로 그린다 — 이 화면이 필요한 것은 추세와
 * 비교뿐이라 축·눈금·툴팁이 없어도 읽힌다. 각 줄에 금액이 적혀 있으니 눈금도 필요 없다.
 * 회수가 큰 달은 조각이 음수가 될 수 있다 — 막대는 0 으로 두고 숫자만 그대로 적는다.
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
  /** 그 달의 지급 건수 — 금액 오른쪽에 적는다 */
  count: number;
}

/**
 * 막대 둘 — 순서가 곧 범례 순서이고 왼쪽부터의 자리다.
 *
 * 한 곳에 둔다: 범례·막대·이름표·hover 문구가 각자 순서와 색을 적으면 한쪽만 고쳐졌을 때
 * 범례와 막대의 색이 어긋난다.
 */
const KINDS = [
  { label: '영업비', fill: 'bg-sky-400', of: (m: MonthBar) => m.sales },
  { label: '시공비', fill: 'bg-brand-500', of: (m: MonthBar) => m.cons },
] as const;
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

  /*
   * ★그 눈에 아예 없는 축은 자리를 만들지 않는다.★ 영업만 맡은 협력사에게 시공비는
   * 0 원이 아니라 ★해당없음★이다(저장소가 자기 줄만 내려준다) — 열두 달 내내 빈 칸이
   * 서 있으면 「시공비를 못 받고 있다」로 읽힌다. 한 해가 아니라 받은 데이터 전체로 본다:
   * 해를 바꿀 때마다 축이 생기고 사라지면 같은 그래프가 다른 물건이 된다.
   * 둘 다 없으면(지급 0건) 둘을 그대로 세운다 — 한쪽만 지우면 빈 그래프가 쏠린다.
   */
  const kinds = useMemo(() => {
    const on = KINDS.filter((k) => months.some((m) => k.of(m) !== 0));
    /* 펼쳐서 돌려준다 — 튜플과 배열이 섞이면 두 갈래의 형이 union 이 돼 reduce 가 안 잡힌다 */
    return on.length > 0 ? on : [...KINDS];
  }, [months]);

  const byMonth = useMemo(() => new Map(months.map((m) => [m.month, m])), [months]);
  const slots: MonthBar[] = useMemo(
    () => Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`;
      return byMonth.get(key) ?? { month: key, sales: 0, cons: 0, has: false, count: 0 };
    }),
    [byMonth, year]
  );

  /*
   * 길이는 고른 해 안에서만 견준다 — 해마다 자가 다시 잡혀야 그 해의 굴곡이 보인다.
   * 가로 막대는 ★그 달의 합★이 길이다(조각은 그 안에서 색으로 갈린다).
   */
  const totalOf = (m: MonthBar) => kinds.reduce((n, k) => n + Math.max(0, k.of(m)), 0);
  const max = Math.max(1, ...slots.map(totalOf));
  const yearTotal = slots.reduce((n, m) => n + kinds.reduce((s, k) => s + k.of(m), 0), 0);
  const yearCount = slots.reduce((n, m) => n + m.count, 0);

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
            {yearCount === 0 ? '지급 0건' : `${yearCount}건 · ${won(yearTotal)}원`}
          </span>
        </div>
        {/* 범례 순서가 곧 막대 순서다 — 왼쪽부터 */}
        <div className="flex flex-wrap items-center gap-4">
          {kinds.map((k) => (
            <span key={k.label} className="flex items-center gap-1.5 text-tiny font-bold text-slate-500">
              <i className={`h-2.5 w-2.5 rounded-[3px] ${k.fill}`} aria-hidden />{k.label}
            </span>
          ))}
        </div>
      </div>

      {/*
        * ★막대를 눕혔다★ (한백 지적 2026-08-30 「막대 너비도 별로고, 숫자랑 그래프가 눈에
        * 안 들어와」).
        *
        * 세로로는 이 데이터를 잘 그릴 수 없었다. 열두 칸을 가로로 나누면 한 칸이 30여
        * 픽셀이라 ①막대가 실오라기처럼 가늘고 ②금액을 적을 자리가 없어 11px 로도 두 줄로
        * 접혔으며 ③구분이 둘이라 칸을 또 반으로 쪼개니 대부분의 달에서 막대가 왼쪽으로
        * 쏠렸다. 눕히면 셋이 한꺼번에 풀린다 — 길이는 화면 폭을 다 쓰고, 금액은 오른쪽에
        * 제 자리를 갖고, 달은 왼쪽에 세로로 늘어서 훑기 좋다.
        *
        * ★그리고 두 금액을 다 적을 수 있다★ — 「분리」의 본뜻이 그것이다(2026-08-29 지시).
        * 세로에서는 자리가 없어 막대를 둘로 갈랐는데, 가로에서는 숫자로 가르면 된다.
        * 막대는 그 달의 합이고 색이 조각을 말한다.
        */}
      <ol
        aria-label={`${year}년 월별 지급: ${slots
          .map((m) => (m.has
            ? `${Number(m.month.slice(5))}월 ${kinds.map((k) => `${k.label} ${won(k.of(m))}원`).join(' ')}`
            : `${Number(m.month.slice(5))}월 ${m.month > thisMonth ? '아직 없음' : '0건'}`))
          .join(', ')}`}
        className="flex flex-col"
      >
        {slots.map((m) => {
          const future = m.month > thisMonth;
          const on = m.month === thisMonth;
          const total = totalOf(m);
          return (
            <li
              key={m.month}
              className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-ctl px-1.5 py-1 ${
                on ? 'bg-brand-50/60' : ''
              }`}
            >
              <span className={`text-right text-tiny font-bold tabular-nums ${
                on ? 'text-brand-800' : m.has ? 'text-slate-600' : 'text-slate-300'
              }`}>
                {Number(m.month.slice(5))}월
              </span>

              {/* 막대가 놓이는 바닥 — 자리는 늘 있고, 그 위에 실제로 나간 만큼만 칠한다 */}
              <span className="flex h-5 items-center rounded-ctl bg-slate-50">
                <span
                  className="flex h-full overflow-hidden rounded-ctl"
                  style={{ width: `${total > 0 && !future ? Math.max(1.5, (total / max) * 100) : 0}%` }}
                  title={`${m.month} · ${kinds.map((k) => `${k.label} ${wonCompact(k.of(m))}`).join(' · ')}`}
                >
                  {kinds.map((k) => {
                    const v = Math.max(0, k.of(m));
                    if (v === 0) return null;
                    return (
                      <span
                        key={k.label}
                        aria-hidden
                        className={`h-full ${k.fill}`}
                        style={{ width: `${(v / total) * 100}%` }}
                      />
                    );
                  })}
                </span>
              </span>

              {/*
                ★금액이 그래프와 같은 급이다★ — 세로 막대 위에 11px 로 얹혀 있던 것을 제
                자리로 옮긴다. 구분이 둘 다 있는 달은 둘을 나란히 적는다(그 달이 이 화면에서
                가장 할 말이 많은 달이다).
              */}
              <span className="flex items-baseline justify-end gap-2 whitespace-nowrap">
                {future ? (
                  <span className="text-small text-slate-300">—</span>
                ) : total === 0 ? (
                  <span className="text-small text-slate-300">0</span>
                ) : (
                  <>
                    {kinds.filter((k) => k.of(m) !== 0).map((k) => (
                      <span key={k.label} className="flex items-baseline gap-1">
                        {kinds.length > 1 && (
                          <i className={`h-2 w-2 shrink-0 rounded-[2px] ${k.fill}`} aria-hidden />
                        )}
                        <span className="text-small font-black tabular-nums text-slate-900">
                          {wonCompact(k.of(m))}
                        </span>
                      </span>
                    ))}
                  </>
                )}
                <span className="w-9 text-right text-tiny tabular-nums text-slate-400">
                  {future ? '' : `${m.count}건`}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

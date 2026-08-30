'use client';

/**
 * 월별 지급표 — 달마다 영업비·시공비가 얼마 나갔는지 한눈에 좇는다.
 *
 * ★그래프가 아니라 표다 (한백 지시 2026-08-31 「월별 지급표 UI 개선」).★ 열두 줄을 위아래로
 * 훑어 크기를 견주는 것이 이 화면의 일이다. 그래서 열 이름(영업비·시공비·합계·건수)을 세우고
 * 칸마다 너비를 못 박았다 — 그전에는 숫자에 이름이 없어 줄마다 붙인 색 점을 오른쪽 위 범례와
 * 맞춰 봐야 했고, 칸 너비가 없어 금액이 달마다 다른 자리에 서서 훑기가 안 됐다.
 * 이름이 열 머리에 한 번 서면 범례도 줄마다의 색 점도 필요 없다(화면 규칙 5).
 *
 * ★막대를 눕힌다 (한백 지적 2026-08-30).★ 수주 현황(/dashboard)의 세로 얼개를 따라
 * 갔었는데, 그쪽은 값이 하나(대수)고 여기는 둘(영업비·시공비)이다. 열두 칸을 가로로 나누고
 * 그 칸을 또 둘로 쪼개니 막대가 실오라기가 되고 금액을 적을 자리가 없었다. 눕히면 길이는
 * 화면 폭을 다 쓰고 금액은 제 자리를 갖는다 — 그리고 ★두 금액을 다 적을 수 있다★.
 *
 * ★쌓지 않고 나란히 세운다★ (한백 지시 2026-08-29 「영업비와 시공비 분리해줘」).
 * 그전에는 한 막대에 두 조각을 쌓았다. 앞 조각(영업비)은 시작점이 고정이라 길이가 보이지만
 * ★뒤 조각(시공비)은 시작점이 달마다 달라서 달끼리 견줄 수 없다★ — 쌓은 막대의 뒤
 * 조각은 눈이 길이가 아니라 위치로 읽는다. 나란히 세우면 둘 다 왼쪽에서 시작해 서로도,
 * 달끼리도 견줄 수 있다. 자(최대)도 합이 아니라 ★한 조각의 크기★로 잡는다 — 그래야
 * 막대 길이가 그 조각의 금액을 그대로 말한다.
 *
 * ★눕히면서 이 쌓기가 되살아나 있었다 (2026-08-31 에 고쳤다).★ 합 길이 막대 하나에 두 색을
 * 이어 붙인 것이 곧 쌓은 막대다 — 세로에서 걷어낸 것을 가로에서 다시 하고 있었고, 주석은
 * 「나란히 세운다」라고 적혀 있는데 코드는 쌓고 있었다. 이제 구분마다 제 막대다.
 *
 * 그 달에 나간 돈(합)은 합계 열이 적는다 — 쌓기를 걷어도 합을 잃지 않는다.
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
 * 구분 둘 — 순서가 곧 열 순서이고 줄 안 막대의 위아래 자리다.
 *
 * 한 곳에 둔다: 열 이름·막대·금액 칸·hover 문구가 각자 순서와 색을 적으면 한쪽만 고쳐졌을 때
 * 열 이름과 막대의 색이 어긋난다.
 */
const KINDS = [
  { label: '영업비', fill: 'bg-sky-400', of: (m: MonthBar) => m.sales },
  { label: '시공비', fill: 'bg-brand-500', of: (m: MonthBar) => m.cons },
] as const;
const yearOf = (month: string) => month.slice(0, 4);
/*
 * 열 얼개 — 열 이름 줄과 열두 줄이 같은 것을 쓴다. 두 곳에 적으면 한쪽만 고쳐졌을 때
 * 이름과 숫자가 어긋나고, 표는 그 순간 표가 아니게 된다.
 * 월 · 막대 · 영업비 · 시공비 · 합계 · 건수
 */
const ROW = 'grid grid-cols-[2.5rem_minmax(3rem,1fr)_4.75rem_4.75rem_5.25rem_2.75rem] items-center gap-x-3 px-1.5';

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
   *
   * ★자는 합이 아니라 한 조각이다 (2026-08-31).★ 눕히면서 합 길이 막대 하나에 두 색을
   * 이어 붙였는데, 그것이 곧 쌓은 막대다 — 뒤 조각(시공비)은 시작점이 달마다 달라 눈이
   * 길이가 아니라 위치로 읽고, 그래서 달끼리 견줄 수 없다. 세로에서 쌓기를 걷어냈던
   * 이유(2026-08-29)가 가로에서 그대로 되살아나 있었다. 조각마다 제 막대를 주고 자를
   * 한 조각의 최대로 잡으면 ★막대 길이가 그 금액을 그대로 말한다★ — 영업비끼리, 시공비
   * 끼리, 그리고 둘 사이도 같은 자를 쓰므로 서로 견줄 수 있다.
   */
  const totalOf = (m: MonthBar) => kinds.reduce((n, k) => n + k.of(m), 0);
  const max = Math.max(1, ...slots.flatMap((m) => kinds.map((k) => Math.max(0, k.of(m)))));
  const yearTotal = slots.reduce((n, m) => n + kinds.reduce((s, k) => s + k.of(m), 0), 0);
  const yearCount = slots.reduce((n, m) => n + m.count, 0);

  return (
    <section aria-label="월별 지급" className="rounded-panel border border-slate-200 bg-white p-5">
      {/* 왼쪽 위 — 고르는 것과 그 해의 합계가 같이 선다 (범례는 걷었다: 열 이름이 그 자리다) */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
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
        {/*
          ★이 화면의 지급 합계는 여기 하나다 (한백 2026-08-31).★ 페이지 머리말에도 같은
          값이 있었는데 그쪽을 걷었다 — 여기 것은 ★고른 해★의 합이라 아래 열두 줄과 짝이
          맞는다. 유일한 합계가 되었으니 금액은 제 무게로 적는다(건수는 곁들이다).
        */}
        <span className="flex items-baseline gap-1.5 tabular-nums">
          <span className="text-tiny font-bold text-slate-500">{yearCount}건</span>
          {yearCount > 0 && (
            <span className="text-base font-black text-slate-900">{won(yearTotal)}원</span>
          )}
        </span>
      </div>

      {/*
        * ★표로 읽힌다 (한백 지시 2026-08-31 「월별 지급표 UI 개선」).★ 세 가지를 고쳤다.
        *
        * ① ★조각마다 제 막대.★ 합 길이 막대에 두 색을 이어 붙인 것은 쌓은 막대였다 —
        *    위 주석(자)에 적은 이유로 달끼리 견줄 수 없었다. 이제 영업비·시공비가 각자
        *    왼쪽에서 시작하고 같은 자를 쓴다.
        * ② ★열 이름을 세운다.★ 그전에는 오른쪽 숫자에 이름이 없어, 달마다 붙인 색 점을
        *    보고 오른쪽 위 범례로 눈을 옮겨 맞춰야 했다. 이름이 열 머리에 한 번 서면
        *    범례도 줄마다의 색 점도 필요 없다(같은 값을 두 번 두지 않는다, 화면 규칙 5).
        * ③ ★숫자가 줄을 맞춘다.★ 칸 너비가 없어서 금액이 달마다 다른 자리에 섰다 —
        *    열두 줄을 위아래로 훑어 크기를 견주는 것이 이 화면의 일인데, 그 훑기가 안 됐다.
        *    칸마다 너비를 못 박고 합계 열을 새로 세운다(막대 길이가 말하던 값이다).
        *
        * 좁은 화면에서는 표째로 옆으로 민다 — 칸을 접으면 어느 달이 어느 금액인지 흐려진다.
        */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="min-w-[32rem]">
          {/* 열 이름 — 색 점이 곧 아래 막대의 순서다 */}
          <div className={`${ROW} pb-1.5 text-tiny font-bold text-slate-400`}>
            <span />
            <span />
            {kinds.map((k) => (
              <span key={k.label} className="flex items-center justify-end gap-1">
                <i className={`h-2 w-2 shrink-0 rounded-[2px] ${k.fill}`} aria-hidden />{k.label}
              </span>
            ))}
            {kinds.length === 1 && <span />}
            <span className="text-right">합계</span>
            <span className="text-right">건수</span>
          </div>

          <ol
            aria-label={`${year}년 월별 지급: ${slots
              .map((m) => (m.has
                ? `${Number(m.month.slice(5))}월 ${kinds.map((k) => `${k.label} ${won(k.of(m))}원`).join(' ')} 합계 ${won(totalOf(m))}원`
                : `${Number(m.month.slice(5))}월 ${m.month > thisMonth ? '아직 없음' : '0건'}`))
              .join(', ')}`}
            className="flex flex-col divide-y divide-slate-100"
          >
            {slots.map((m) => {
              const future = m.month > thisMonth;
              const on = m.month === thisMonth;
              const total = totalOf(m);
              return (
                <li
                  key={m.month}
                  className={`${ROW} rounded-ctl py-1.5 ${on ? 'bg-brand-50/60' : ''}`}
                >
                  <span className={`text-right text-tiny font-bold tabular-nums ${
                    on ? 'text-brand-800' : m.has ? 'text-slate-600' : 'text-slate-300'
                  }`}>
                    {Number(m.month.slice(5))}월
                  </span>

                  {/*
                    구분마다 제 막대다 — 둘 다 왼쪽에서 시작하고 자가 같다.
                    바닥(회색 트랙)은 깔지 않는다: 열두 달 × 두 구분이면 빈 자리가 죄다
                    얼룩이 되어 정작 나간 돈이 묻힌다(2026-08-30 에 배운 것).
                  */}
                  <span className="flex flex-col justify-center gap-[3px]" title={
                    future ? `${m.month} · 아직 없음`
                      : `${m.month} · ${kinds.map((k) => `${k.label} ${wonCompact(k.of(m))}`).join(' · ')}`
                  }>
                    {kinds.map((k) => {
                      const v = Math.max(0, k.of(m));
                      return (
                        <span key={k.label} className="h-[7px]">
                          {!future && v > 0 && (
                            <span
                              aria-hidden
                              className={`block h-full rounded-full ${k.fill}`}
                              style={{ width: `${Math.max(1.5, (v / max) * 100)}%` }}
                            />
                          )}
                        </span>
                      );
                    })}
                  </span>

                  {/* 금액 — 칸마다 같은 너비라 위아래로 훑어 견줄 수 있다 */}
                  {kinds.map((k) => (
                    <span key={k.label} className="text-right text-small tabular-nums text-slate-600">
                      {future ? <span className="text-slate-300">—</span>
                        : k.of(m) === 0 ? <span className="text-slate-300">0</span>
                        : wonCompact(k.of(m))}
                    </span>
                  ))}
                  {kinds.length === 1 && <span />}

                  <span className="text-right text-small font-black tabular-nums text-slate-900">
                    {future ? <span className="font-bold text-slate-300">—</span>
                      : total === 0 ? <span className="font-bold text-slate-300">0</span>
                      : wonCompact(total)}
                  </span>
                  <span className="text-right text-tiny tabular-nums text-slate-400">
                    {future ? '' : `${m.count}건`}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

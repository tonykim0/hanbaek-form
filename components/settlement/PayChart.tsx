'use client';

/**
 * 월별 지급 그래프 — 달마다 영업비·시공비가 얼마 나갔는지 한눈에 좇는다.
 *
 * ★수주 현황(/dashboard)의 그래프와 같은 얼개다 (한백 2026-08-29).★ 그전에는 이것만
 * 눈금선도 축도 없이 고정폭 막대를 늘어놓아서, 같은 콘솔의 두 그래프가 다른 물건으로
 * 보였다. 같은 얼개를 쓴다: 왼쪽에 눈금 넷(최대·66%·33%·0)과 가로선, 막대는 폭을 나눠
 * 갖고, 아래에 얇은 선을 긋고 달 이름과 건수를 적는다. 다른 것은 달마다 막대가 둘이라는
 * 것뿐이다 — 영업비와 시공비는 따로 나가는 돈이다.
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
 * 라이브러리를 쓰지 않는다. 막대를 div 높이로 그린다 — 이 화면이 필요한 것은 추세와
 * 비교뿐이라 축·눈금·툴팁이 없어도 읽힌다.
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
  /** 그 달의 지급 건수 — 축 아래에 적는다(수주 현황이 「N건」을 적는 자리와 같다) */
  count: number;
}

/** 수주 현황 그래프와 같은 높이 — 두 그래프가 나란히 놓여도 눈높이가 맞는다 */
const H = 196;

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
   * 높이는 고른 해 안에서만 견준다 — 해마다 축이 다시 잡혀야 그 해의 굴곡이 보인다.
   * 쌓지 않으므로 합이 아니라 ★한 조각의 최대★다(영업비·시공비 중 큰 것).
   */
  const max = Math.max(1, ...slots.flatMap((m) => kinds.map((k) => Math.max(0, k.of(m)))));
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

      <div className="overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={`${year}년 월별 지급: ${slots
            .map((m) => (m.has
              ? `${Number(m.month.slice(5))}월 ${kinds.map((k) => `${k.label} ${won(k.of(m))}원`).join(' ')}`
              : `${Number(m.month.slice(5))}월 ${m.month > thisMonth ? '아직 없음' : '0건'}`))
            .join(', ')}`}
          /*
           * 최소 폭을 넓혔다(520 → 680px) — 막대 위 금액이 「9,590만」처럼 여섯 자면 칸을
           * 넘어 두 줄로 접혔다(2026-08-30 실측: 11px 여섯 자 ≈ 33px, 칸 ≈ 34px).
           * 좁은 화면에서는 옆으로 밀린다 — 접히는 것보다 미는 편이 읽힌다.
           */
          className="min-w-[680px]"
        >
          <div className="relative" style={{ height: H }}>
            {/* 눈금 넷 — 수주 현황과 같은 간격(최대·66%·33%·0). 금액이라 압축 표기다 */}
            <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
              {[max, Math.round(max * 0.66), Math.round(max * 0.33), 0].map((tick, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-12 text-right text-micro font-semibold tabular-nums text-slate-300">
                    {tick === 0 ? '0' : wonCompact(tick)}
                  </span>
                  <div className="flex-1 border-t border-slate-100" />
                </div>
              ))}
            </div>

            <div className="absolute inset-y-0 left-[3.75rem] right-0 flex items-end gap-1">
              {slots.map((m) => {
                const total = kinds.reduce((n, k) => n + k.of(m), 0);
                const on = m.month === thisMonth;
                /*
                 * ★아직 오지 않은 달은 0 이 아니다★ (한백 지적 2026-08-30 「UI 가 별로네」).
                 * 올해가 반밖에 안 지났는데 남은 달마다 회색 막대가 서 있어서, 「앞으로 안
                 * 나간다」로 읽혔다. 수주 현황 그래프는 이미 future 를 따로 다루고 있었는데
                 * 이 그래프만 안 하고 있었다(app/(console)/dashboard). 자리는 지키고
                 * 막대는 안 그린다 — 축의 달 이름이 그 자리를 말한다.
                 */
                const future = m.month > thisMonth;
                /* 막대 몸통이 쓸 높이 — 위 숫자 자리를 뺀다(수주 현황과 같은 30px) */
                const body = H - 30;
                return (
                  <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    {total !== 0 && !future && (
                      <span
                        className={`mb-1.5 whitespace-nowrap text-center text-tiny font-black tabular-nums ${
                          total < 0 ? 'text-amber-700' : on ? 'text-brand-800' : 'text-slate-600'
                        }`}
                      >
                        {wonCompact(total)}
                      </span>
                    )}
                    {/*
                      왼쪽이 영업비, 오른쪽이 시공비 — 둘 다 바닥에서 시작한다.
                      ★0 인 조각은 그리지 않는다★ (2026-08-30). 얇게라도 남겼더니 회색 조각이
                      열 몇 개 늘어섰다 — 시공비가 한 달에만 있는 지금 데이터에서는 그것이
                      정보가 아니라 얼룩이었다. ★자리는 지킨다★: 조각 수만큼 칸을 나눠 두어
                      영업비 막대의 폭이 달마다 흔들리지 않게 한다. 「그 달에 시공비가 0 이었다」는
                      hover 문구와 범례가 말한다.
                    */}
                    <div
                      className="flex items-end justify-center gap-[3px]"
                      style={{ height: `${body}px` }}
                      title={`${m.month} · ${kinds.map((k) => `${k.label} ${wonCompact(k.of(m))}`).join(' · ')}`}
                    >
                      {kinds.map((k) => {
                        const value = Math.max(0, k.of(m));
                        return (
                          <div key={k.label} className="flex h-full flex-1 items-end justify-center">
                            {value > 0 && !future && (
                              <div
                                aria-hidden
                                className={`w-full max-w-[20px] rounded-t-[4px] transition ${k.fill}`}
                                /* 가장 작은 달도 보이게 — 큰 달과 서른 배 넘게 벌어진다 */
                                style={{ height: `${Math.max(4, (value / max) * body)}px` }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 축 — 달 이름과 그 달의 건수. 수주 현황이 「N건」을 적는 자리와 같다 */}
          <div className="ml-[3.75rem] mt-2 flex gap-1 border-t border-slate-200 pt-2">
            {slots.map((m) => {
              const on = m.month === thisMonth;
              const future = m.month > thisMonth;
              return (
                <div key={m.month} className="min-w-0 flex-1 text-center">
                  <p className={`text-tiny font-bold ${on ? 'text-brand-800' : m.has ? 'text-slate-500' : 'text-slate-300'}`}>
                    {Number(m.month.slice(5))}월
                  </p>
                  {/* 아직 안 온 달은 「0건」이 아니다 — 0 건과 아직 없음을 가른다(화면 규칙 10번) */}
                  <p className={`mt-0.5 text-micro tabular-nums ${m.has ? 'text-slate-400' : 'text-slate-300'}`}>
                    {future ? '—' : `${m.count}건`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

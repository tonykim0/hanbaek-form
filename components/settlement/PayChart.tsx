/**
 * 월별 지급 그래프 — 달마다 영업비·시공비가 얼마 나갔는지 한눈에 좇는다.
 *
 * 막대 하나가 한 달이고, 누르면 아래 그 달의 묶음으로 내려간다 — 그래프가 곧 목차다.
 * 예전에는 막대가 `?month=` 로 화면을 다시 불러 그 달만 보여줬는데, 지금은 달마다
 * 묶여 전부 나와 있어서(한백 요청 2026-08-24) 고를 것이 없다. 지급이 없는 달은 내려갈
 * 곳이 없으므로 링크가 아니다 — 눌리는 것과 안 눌리는 것을 모양으로 가른다(화면 규칙 3·11번).
 * 지급이 없는 달도 자리는 지킨다(0원) — 안 나간 달이 보이는 것도 정보다.
 *
 * 라이브러리를 쓰지 않는다. 막대 두 조각(영업비·시공비)을 div 높이로 그린다 —
 * 이 화면이 필요한 것은 추세와 비교뿐이라 축·눈금·툴팁이 없어도 읽힌다.
 * 회수가 큰 달은 합이 음수가 될 수 있다 — 막대는 0 으로 두고 숫자만 음수로 적는다.
 */
import Link from 'next/link';
import { wonCompact } from '@/lib/format';

export interface MonthBar {
  /** YYYY-MM */
  month: string;
  sales: number;
  cons: number;
  /** 이 달에 나간 지급이 있나 — 없으면 내려갈 묶음이 없어서 링크로 만들지 않는다 */
  has: boolean;
}

const BAR_H = 120;

export default function PayChart({
  months, thisMonth,
}: {
  months: MonthBar[];
  /** 지금이 어느 달인가 — 고른 달이 아니라 오늘의 자리다 */
  thisMonth: string;
}) {
  const max = Math.max(1, ...months.map((m) => Math.max(0, m.sales) + Math.max(0, m.cons)));
  const manyYears = new Set(months.map((m) => m.month.slice(0, 4))).size > 1;
  const label = (m: string) => (manyYears ? `${m.slice(2, 4)}.${Number(m.slice(5))}` : `${Number(m.slice(5))}월`);

  return (
    <section aria-label="월별 지급" className="rounded-panel border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-4">
        <h2 className="text-h3 font-black text-slate-900">월별 지급</h2>
        <span className="flex items-center gap-1.5 text-tiny font-bold text-slate-500">
          <i className="h-2.5 w-2.5 rounded-[3px] bg-sky-400" aria-hidden />영업비
        </span>
        <span className="flex items-center gap-1.5 text-tiny font-bold text-slate-500">
          <i className="h-2.5 w-2.5 rounded-[3px] bg-brand-500" aria-hidden />시공비
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-fit items-end gap-1.5">
          {months.map((m) => {
            const sales = Math.max(0, m.sales);
            const cons = Math.max(0, m.cons);
            const total = m.sales + m.cons;
            const on = m.month === thisMonth;
            const money = `영업비 ${wonCompact(m.sales)} · 시공비 ${wonCompact(m.cons)}`;
            const cls = 'group flex w-14 shrink-0 flex-col items-center gap-1';
            const title = m.has ? `${m.month} ${money} — 누르면 그 달로` : `${m.month} 지급 0건`;
            /* 눌리는 것(Link)과 안 눌리는 것(span)을 태그로 가른다 — 한 태그에 href 를 넣고
               빼면 타입이 갈리고, 무엇보다 안 눌리는 막대가 눌리는 것처럼 보인다 */
            const bar = (
              <>
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
                <span
                  className={`rounded-tag px-1.5 py-0.5 text-tiny font-bold tabular-nums ${
                    on ? 'bg-slate-900 text-white'
                      : m.has ? 'text-slate-500 group-hover:text-slate-800'
                        : 'text-slate-300'
                  }`}
                >
                  {label(m.month)}
                </span>
              </>
            );
            return m.has ? (
              <Link key={m.month} href={`#m-${m.month}`} className={cls} title={title} aria-current={on ? 'true' : undefined}>
                {bar}
              </Link>
            ) : (
              <span key={m.month} className={cls} title={title} aria-current={on ? 'true' : undefined}>
                {bar}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

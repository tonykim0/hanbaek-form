/**
 * 월별 지급 그래프 — 달마다 영업비·시공비가 얼마 나갔는지 한눈에 좇는다.
 *
 * 막대 하나가 한 달이고, 누른 막대의 달이 아래 명세로 열린다 — 그래프가 곧 달 선택이다.
 * 지급이 없는 달도 자리를 지킨다(0원) — 안 나간 달이 보이는 것도 정보다.
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
}

const BAR_H = 120;

export default function PayChart({ months, current }: { months: MonthBar[]; current: string }) {
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
            const on = m.month === current;
            return (
              <Link
                key={m.month}
                href={`/payments?month=${m.month}`}
                aria-current={on ? 'true' : undefined}
                className="group flex w-14 shrink-0 flex-col items-center gap-1"
                title={`${m.month} 영업비 ${wonCompact(m.sales)} · 시공비 ${wonCompact(m.cons)}`}
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
                <span
                  className={`rounded-tag px-1.5 py-0.5 text-tiny font-bold tabular-nums ${
                    on ? 'bg-slate-900 text-white' : 'text-slate-500 group-hover:text-slate-800'
                  }`}
                >
                  {label(m.month)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

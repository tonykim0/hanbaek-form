'use client';

/**
 * 사업연도 탭 — 어느 해를 볼 것인가.
 *
 * 세 화면이 쓴다: 수주 현황·계약·시공. 모양을 한 곳에 두지 않으면 같은 뜻의 탭이 화면마다
 * 다르게 생긴다 — 배지 18 모양이 그렇게 생겼다(CLAUDE.md 화면 규칙).
 *
 * 옮기는 방식이 화면마다 다르다.
 *   · 수주 현황 — 주소를 갈아 서버가 다시 그린다(hrefBase). 한 해의 보고서라서 그렇다.
 *   · 계약·시공 — 그 자리에서 거른다(onPick). 「거르는 일은 브라우저가 한다」는 규칙이고,
 *     연도를 만질 때마다 서버를 부르면 화면이 멈춘다.
 * 함수는 서버에서 넘길 수 없으므로 주소 쪽은 문자열(hrefBase)로 받는다.
 */
import Link from 'next/link';
import { ALL_YEARS } from '@/lib/business-year';

const TAB = 'rounded-[6px] px-3.5 py-1.5 text-small font-bold transition';
const ON = 'bg-brand-700 text-white';
const OFF = 'text-slate-500 hover:bg-slate-50 hover:text-slate-800';

export default function YearTabs({
  years, value, hrefBase, onPick, withAll = false,
}: {
  /** 자료에 있는 연도 — 최근 것부터 (lib/business-year) */
  years: string[];
  value: string;
  /** 주소로 옮기는 자리. `${hrefBase}?year=2026` 이 된다. */
  hrefBase?: string;
  /** 그 자리에서 거르는 자리 */
  onPick?: (year: string) => void;
  /** 「전체」를 맨 앞에 둔다 — 연도를 안 가리고 보는 자리가 필요한 화면에서만 */
  withAll?: boolean;
}) {
  const items = withAll ? [ALL_YEARS, ...years] : years;
  if (items.length === 0) return null;

  return (
    <nav aria-label="사업연도" className="flex rounded-ctl border border-slate-200 bg-white p-0.5">
      {items.map((item) => {
        const on = item === value;
        const label = item === ALL_YEARS ? ALL_YEARS : `${item}년`;
        const cls = `${TAB} ${on ? ON : OFF}`;

        return hrefBase ? (
          <Link
            key={item}
            href={item === ALL_YEARS ? hrefBase : `${hrefBase}?year=${item}`}
            aria-current={on ? 'page' : undefined}
            className={cls}
          >
            {label}
          </Link>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPick?.(item)}
            aria-current={on ? 'page' : undefined}
            className={cls}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

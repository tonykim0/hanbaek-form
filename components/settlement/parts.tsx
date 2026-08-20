'use client';

/**
 * 기성·지급 두 화면이 같이 쓰는 조각.
 *
 * 화면은 갈랐지만 표의 겉모습은 같아야 한다 — 한쪽만 손대면 같은 자리의 숫자가
 * 다르게 생겨서, 두 화면을 번갈아 보는 사람이 매번 다시 읽어야 한다.
 */
import Link from 'next/link';
import { won } from '@/lib/format';

export { won };

export function SiteLink({ id, name }: { id: string; name: string }) {
  return (
    <Link
      href={`/projects/${id}`}
      className="font-bold text-slate-900 hover:text-brand-800 hover:underline"
    >
      {name}
    </Link>
  );
}

export function Toggle({
  on, onChange, label, count,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`mb-3 rounded-full border px-3 py-1.5 text-[12px] font-bold transition ${
        on
          ? 'border-brand-500 bg-brand-600 text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      {label} <span className="tabular-nums">{count}</span>
    </button>
  );
}

export function Empty() {
  return (
    <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
      해당하는 것이 없습니다.
    </p>
  );
}

export function Frame({ min, children }: { min: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: min }}>
          {children}
        </table>
      </div>
    </div>
  );
}

const TILE_TONE = {
  in: 'text-brand-900',
  out: 'text-sky-900',
  wait: 'text-amber-800',
  plain: 'text-slate-900',
};

export function Tile({
  label, value, tone = 'plain', note,
}: {
  label: string;
  value: number;
  tone?: keyof typeof TILE_TONE;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-bold tracking-[0.06em] text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-black tabular-nums tracking-[-0.02em] ${TILE_TONE[tone]}`}>
        {won(value)}
        <span className="ml-1 text-xs font-bold text-slate-400">원</span>
      </p>
      {note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}

/** 반대쪽 화면으로 건너가는 줄 — 두 방향의 관계를 잃지 않으려고 둔다 */
export function CrossLink({
  href, label, amount, note,
}: {
  href: string;
  label: string;
  amount: number;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition hover:border-brand-300 hover:bg-brand-50/40"
    >
      <span className="text-slate-500">{note}</span>
      <span className="font-black tabular-nums text-slate-900">{won(amount)}원</span>
      <span className="ml-auto text-[12px] font-bold text-brand-700">{label} →</span>
    </Link>
  );
}

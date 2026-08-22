'use client';

/**
 * 기성·지급 두 화면이 같이 쓰는 조각.
 *
 * 화면은 갈랐지만 표의 겉모습은 같아야 한다 — 한쪽만 손대면 같은 자리의 숫자가
 * 다르게 생겨서, 두 화면을 번갈아 보는 사람이 매번 다시 읽어야 한다.
 */
import Link from 'next/link';
import { PANEL } from '@/components/ui';
import { won } from '@/lib/format';

export { won };

/**
 * 기성·지급 화면에서 현장으로 가는 길은 제 탭으로 바로 간다 — 이 화면들이 「그 탭에서
 * 지정해야 합니다」라고 말해 놓고, 눌러 가면 계약 탭이 열리는 것이 길을 두 번 걷게 했다.
 * settlement = 협력사 지급 탭 · receivable = 기성 탭.
 */
export function SiteLink({
  id, name, tab,
}: {
  id: string;
  name: string;
  tab?: 'settlement' | 'receivable';
}) {
  return (
    <Link
      href={`/projects/${id}${tab ? `?tab=${tab}` : ''}`}
      className="font-bold text-slate-900 hover:text-brand-800 hover:underline"
    >
      {name}
    </Link>
  );
}

/*
 * 고르는 칩(Toggle)과 빈 목록(Empty)은 여기 있었는데 걷어냈다 —
 * 부품에 이미 있다(`ui.Choice` · `ui.Blank`). 두 벌로 두니 같은 자리가 화면마다
 * 동글고 각졌고, 빈 목록 문구도 갈렸다.
 */

export function Frame({ min, children }: { min: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-panel border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        {/* 활자는 콘솔 규격이다 — 여기만 text-sm(14px) 이라 돈 표만 글자가 한 단계 컸다 */}
        <table className="w-full text-base" style={{ minWidth: min }}>
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
    <div className={`${PANEL} p-4`}>
      <p className="text-tiny font-bold tracking-[0.06em] text-slate-400">{label}</p>
      <p className={`mt-1 text-h2 font-black tabular-nums ${TILE_TONE[tone]}`}>
        {won(value)}
        <span className="ml-1 text-small font-bold text-slate-400">원</span>
      </p>
      {note && <p className="mt-0.5 text-tiny text-slate-400">{note}</p>}
    </div>
  );
}

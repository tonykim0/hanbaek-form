'use client';

/**
 * 케이스 폼의 부품 — 구획·칸·칩·돈칸.
 *
 * 폼에서 떼어 둔다. 상태를 모르고 모양만 안다 — 값과 바꾸는 길은 프롭으로 온다.
 */
import type { ReactNode } from 'react';
import { Choice, FIELD } from '@/components/ui';
import { won } from '@/lib/format';

/** 날짜칸의 ISO 값을 저장 표기로 — 「2026-08-22」 → 「2026년 8월 22일」 */
export function koDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

/** 폼의 구획 — 계약 축 → 적용 시작 → 돈 → 기성 → 요금 → 지원·조건 순서가 읽히게 약한 선 한 겹으로 가른다 */
export function FormSection({
  title, hint, first, children,
}: { title: string; hint?: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div className={first ? undefined : 'mt-5 border-t border-slate-100 pt-4'}>
      <p className="mb-3 flex items-baseline gap-2">
        <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">{title}</span>
        {hint && <span className="text-micro text-slate-400">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">{label}</span>
        {hint && <span className="text-micro text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** 여럿 고르는 칸 — 고른 상태의 모양은 Choice 부품이 정한다 */
export function Chips<T extends string | number>({
  options, picked, onToggle,
}: {
  options: Array<[T, string]>;
  picked: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <Choice key={String(v)} on={picked.includes(v)} onClick={() => onToggle(v)}>
          {label}
        </Choice>
      ))}
    </div>
  );
}

export function Money({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = Number(value.replace(/[^0-9]/g, '')) || 0;
  return (
    <span className="flex items-baseline gap-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="0"
        className={`${FIELD} tabular-nums`}
      />
      <span className="shrink-0 text-micro text-slate-400">{n > 0 ? `${won(n)}원` : '원'}</span>
    </span>
  );
}


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

/**
 * 폼의 구획 — 계약 축 → 적용 시작 → 돈 → 기성 → 요금 → 지원·조건 순서가 읽히게 약한 선 한 겹으로 가른다.
 *
 * ★접힌다★ (2026-08-29). 개정에서 거의 안 바뀌는 구획(계약 축·요금·조건)은 접어 두는데,
 * 그전에는 접힌 구획이 「요금·프로모션 고치기 — 지금은 원 케이스 값 그대로」라는 긴 단추
 * 하나로만 남아 무엇이 들어 있는지 안 보였다. 접힌 구획은 제 자리에서 제 이름과 ★지금 값의
 * 요약★을 보이고, 펼치기는 오른쪽 칩이다 — 안에 무엇이 있는지 보이면 펼칠지 판단이 된다.
 */
export function FormSection({
  title, hint, first, collapsed, summary, onToggle, children,
}: {
  title: string;
  hint?: string;
  first?: boolean;
  /** 접혀 있는가 — onToggle 이 있을 때만 뜻이 있다 */
  collapsed?: boolean;
  /** 접힌 채로 보여 줄 지금 값 한 줄 */
  summary?: ReactNode;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={first ? undefined : 'mt-5 border-t border-slate-100 pt-4'}>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">{title}</span>
        {hint && <span className="text-micro text-slate-400">{hint}</span>}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="ml-auto rounded-ctl border border-slate-200 px-2 py-0.5 text-micro font-bold text-slate-500 transition hover:border-brand-300 hover:text-brand-800"
          >
            {collapsed ? '펼치기' : '접기'}
          </button>
        )}
      </div>
      {collapsed ? (
        <div className="text-small text-slate-600">{summary}</div>
      ) : children}
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


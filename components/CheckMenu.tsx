'use client';

/**
 * 눌러서 펴고, 안에서 체크하는 필터 — 노션의 필터와 같은 모양이다(한백 지시 2026-08-28).
 *
 * ★왜 칩이 아니라 드롭다운인가★ 고를 것이 넷을 넘으면 칩은 줄을 통째로 먹는다. 운영사가
 * 다섯이고 상태가 넷이라, 나란히 늘어놓으면 표보다 필터가 커진다. 접어 두고 고른 개수만
 * 단추에 적으면 한 줄에 둘이 들어간다.
 *
 * ★한 부품인 이유★ 이 모양이 현장 표의 열 머리글 필터에 이미 있었다(ProjectTable 의
 * ColumnFilter). 같은 것을 두 벌 두면 한쪽만 고쳐진다 — 열 머리글의 작은 ▾ 와 이름이 붙은
 * 단추는 자리만 다르므로 trigger 로 가른다.
 */
import { useEffect, useRef, useState } from 'react';

export interface CheckOption {
  value: string;
  label: string;
}

export default function CheckMenu({
  label, options, picked, onChange, trigger = 'button', width = 190,
}: {
  /** 무엇을 고르는 자리인가 — 단추와 도움말에 쓴다 */
  label: string;
  options: CheckOption[];
  picked: string[];
  onChange: (values: string[]) => void;
  /** button = 이름이 붙은 단추 · chip = 표 머리글의 작은 ▾ */
  trigger?: 'button' | 'chip';
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // 바깥을 누르면 닫는다. 열린 채로 표를 훑으면 아래 줄이 가린다.
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', off);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (options.length === 0) return null;
  const on = picked.length > 0;
  /* 고른 것이 하나면 그 이름을 적는다 — 「운영사 1」보다 「운영사 · 에버온」이 읽힌다 */
  const only = picked.length === 1
    ? options.find((o) => o.value === picked[0])?.label ?? null
    : null;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={`${label} 필터`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          trigger === 'chip'
            ? `rounded-tag px-1 py-0.5 text-micro font-black leading-none transition ${
              on ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-200 hover:text-slate-600'
            }`
            : `inline-flex shrink-0 items-center gap-1.5 rounded-ctl border px-3 py-2 text-small font-bold transition ${
              on
                ? 'border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`
        }
      >
        {trigger === 'chip' ? (on ? picked.length : '▾') : (
          <>
            <span>{label}</span>
            {only && <span className="font-semibold text-brand-700">· {only}</span>}
            {!only && on && <span className="tabular-nums">{picked.length}</span>}
            <span aria-hidden className="text-slate-400">▾</span>
          </>
        )}
      </button>

      {open && (
        <div
          style={{ width }}
          className="absolute left-0 top-full z-20 mt-1 rounded-box border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <div className="max-h-[280px] overflow-y-auto">
            {options.map((o) => {
              const checked = picked.includes(o.value);
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded-ctl px-2 py-1.5 text-small font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onChange(checked ? picked.filter((x) => x !== o.value) : [...picked, o.value])
                    }
                    className="h-3.5 w-3.5 accent-brand-600"
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              );
            })}
          </div>
          {on && (
            <button
              type="button"
              onClick={() => { onChange([]); setOpen(false); }}
              className="mt-1 w-full rounded-ctl border-t border-slate-100 px-2 py-1.5 text-tiny font-bold text-slate-400 transition hover:text-slate-700"
            >
              {label} 필터 지우기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

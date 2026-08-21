'use client';

/**
 * 날짜 고르기 — 모든 날짜 칸의 공용 부품.
 *
 * 브라우저 기본 달력(input type=date)은 칸을 눌러도 달력이 안 열리고 연·월·일 조각을
 * 따로 타이핑해야 해서 불편하다(한백 확인). 누르면 한국어 달력이 바로 열리고,
 * 가장 잦은 입력이 「오늘」이라 지름길을 맨 위에 둔다. 지우기도 여기서 한다(되돌릴 길).
 *
 * 화면마다 달력이 다르면 매번 다시 배운다 — 날짜 칸은 전부 이 부품을 쓴다.
 */
import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { ko } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import { today } from '@/lib/date';

/** Date → YYYY-MM-DD (로컬 기준 — toISOString 은 UTC 라 자정 근처에 하루가 밀린다) */
function fmt(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function DatePicker({
  value, onChange, disabled = false, ariaLabel, empty = '날짜 선택',
}: {
  value: string | null;
  /** null = 지운다 */
  onChange: (v: string | null) => void;
  disabled?: boolean;
  ariaLabel: string;
  /** 비어 있을 때 단추에 적는 말 */
  empty?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥 클릭·Escape 로 닫는다 — 닫는 길이 하나뿐이면 달력이 화면을 붙잡는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };

  const selected = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-[132px] rounded-ctl border px-2 py-1 text-left font-semibold tabular-nums transition focus:outline-none focus:ring-2 focus:ring-brand-100 ${
          value
            ? 'border-slate-200 bg-white text-slate-800'
            : 'border-dashed border-slate-300 bg-white text-slate-400'
        } ${disabled ? 'opacity-50' : 'hover:border-brand-300'}`}
      >
        {value ?? empty}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 rounded-box border border-slate-200 bg-white p-2 shadow-lg"
          style={{
            // react-day-picker 의 색·크기 변수 — 브랜드 그린에 맞춘다
            ['--rdp-accent-color' as string]: '#479659',
            ['--rdp-accent-background-color' as string]: '#d6ecdd',
            ['--rdp-day-height' as string]: '2.1rem',
            ['--rdp-day-width' as string]: '2.1rem',
          }}
        >
          <div className="mb-1 flex items-center gap-1.5 px-1">
            <button
              type="button"
              onClick={() => pick(today())}
              className="rounded-ctl border border-brand-300 bg-brand-50 px-2 py-0.5 text-tiny font-bold text-brand-800 transition hover:bg-brand-100"
            >
              오늘
            </button>
            {value && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="rounded-ctl px-2 py-0.5 text-tiny font-bold text-slate-400 transition hover:text-slate-700"
              >
                지우기
              </button>
            )}
          </div>
          <DayPicker
            mode="single"
            locale={ko}
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => pick(d ? fmt(d) : null)}
            className="text-small"
          />
        </div>
      )}
    </div>
  );
}

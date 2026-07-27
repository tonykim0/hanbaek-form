'use client';

import type { ReactNode } from 'react';
import type { FieldValues, Path, UseFormRegister } from 'react-hook-form';
import { formatKoreanPhone } from '@/lib/contract-form';

export const contractInputClass =
  'w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

/**
 * 한국 전화번호 입력 — 숫자 입력 시 하이픈(-)을 자동 삽입한다.
 * 형식 검증 없이 자리수에 맞춰 -를 넣으므로 사용자가 형식을 신경 쓸 필요가 없다.
 */
export function PhoneInput<TFieldValues extends FieldValues>({
  register,
  name,
  required,
  placeholder,
  className = contractInputClass,
}: {
  register: UseFormRegister<TFieldValues>;
  name: Path<TFieldValues>;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const reg = register(name, required ? { required: '필수' } : undefined);
  return (
    <input
      {...reg}
      onChange={(e) => {
        e.target.value = formatKoreanPhone(e.target.value);
        reg.onChange(e);
      }}
      inputMode="numeric"
      className={className}
      placeholder={placeholder}
    />
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const match = title ? title.match(/^\s*(\d+)\.\s*(.*)$/) : null;
  const num = match ? match[1] : null;
  const heading = match ? match[2] : title;
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {title && (
        <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/60 rounded-t-xl">
          {num && (
            <span className="flex-none inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold">
              {num}
            </span>
          )}
          <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
        </div>
      )}
      <div className="p-4 sm:p-5 space-y-3">{children}</div>
    </section>
  );
}

export function Field({
  label,
  required,
  error,
  warning,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  error?: string;
  warning?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      {!error && warning && (
        <p className="text-sm text-amber-600 mt-1">{warning}</p>
      )}
    </div>
  );
}

export function RadioField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-500 mb-1">{hint}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1">{children}</div>
    </div>
  );
}

export function Radio<TFieldValues extends FieldValues>({
  name,
  value,
  register,
  label,
}: {
  name: Path<TFieldValues>;
  value: string;
  register: UseFormRegister<TFieldValues>;
  label: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
      <input type="radio" value={value} {...register(name)} className="h-4 w-4 accent-brand-600" />
      {label}
    </label>
  );
}

export function Checkbox<TFieldValues extends FieldValues>({
  register,
  name,
  label,
}: {
  register: UseFormRegister<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" {...register(name)} className="h-4 w-4 accent-brand-600 rounded" />
      {label}
    </label>
  );
}

/** 라디오/체크박스를 선택형 pill(칩) 버튼으로 표시하기 위한 공통 스타일 */
const pillClass =
  'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm cursor-pointer select-none transition ' +
  'border-gray-300 text-gray-700 bg-white hover:border-brand-400 hover:bg-brand-50 ' +
  'peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white peer-checked:font-medium ' +
  'peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-1';

/** 단일 선택 pill (라디오) */
export function PillRadio<TFieldValues extends FieldValues>({
  name,
  value,
  register,
  label,
}: {
  name: Path<TFieldValues>;
  value: string;
  register: UseFormRegister<TFieldValues>;
  label: string;
}) {
  return (
    <label className="cursor-pointer">
      <input type="radio" value={value} {...register(name)} className="peer sr-only" />
      <span className={pillClass}>{label}</span>
    </label>
  );
}

/** 다중 선택 pill (체크박스) — 선택 시 체크 표시 */
export function PillCheckbox<TFieldValues extends FieldValues>({
  register,
  name,
  label,
}: {
  register: UseFormRegister<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
}) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" {...register(name)} className="peer sr-only" />
      <span className={pillClass}>{label}</span>
    </label>
  );
}

/**
 * 라벨 + pill 묶음. 라디오/체크박스 pill 그룹을 감싼다.
 * inline=true 이면 라벨을 왼쪽 고정폭에 두고 pill을 같은 줄에 정렬한다
 * (옵션 수가 적은 그룹에서 표처럼 읽혀 스캔이 빠르다). 모바일에선 자동으로 쌓인다.
 */
export function ChoiceGroup({
  label,
  required,
  hint,
  inline,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  inline?: boolean;
  children: ReactNode;
}) {
  if (inline) {
    return (
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex-none sm:w-28">
          <span className="text-sm font-medium text-gray-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </span>
          {hint && <span className="block text-xs text-brand-600">{hint}</span>}
        </div>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </span>
        {hint && <span className="text-xs text-brand-600">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** 카드 내부의 소그룹 구분 헤더 */
export function SubGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">
          {label}
        </span>
        <span className="flex-1 h-px bg-gray-100" />
      </div>
      {children}
    </div>
  );
}

export function DupRow<TFieldValues extends FieldValues>({
  register,
  checkboxName,
  qtyName,
  label,
  qtyEnabled,
}: {
  register: UseFormRegister<TFieldValues>;
  checkboxName: Path<TFieldValues>;
  qtyName: Path<TFieldValues>;
  label: string;
  qtyEnabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        {...register(checkboxName)}
        className="h-4 w-4 accent-brand-600 rounded"
      />
      <span className="text-sm text-gray-700 w-32">{label}</span>
      <input
        type="number"
        min="0"
        {...register(qtyName)}
        disabled={!qtyEnabled}
        placeholder={qtyEnabled ? '수량' : '—'}
        className={`border border-gray-300 rounded px-2 py-1 w-24 text-sm ${
          !qtyEnabled ? 'bg-gray-100 text-gray-400' : ''
        }`}
      />
      <span className="text-sm text-gray-500">기</span>
    </div>
  );
}

type DuplicateInstallFields = FieldValues & {
  dupFast: boolean;
  dupFastQty: string;
  dupSlow: boolean;
  dupSlowQty: string;
  dupDist: boolean;
  dupDistQty: string;
  dupOutlet: boolean;
  dupOutletQty: string;
  dupKiosk: boolean;
};

export function DuplicateInstallFieldset<TFieldValues extends DuplicateInstallFields>({
  register,
  dupFast,
  dupSlow,
  dupDist,
  dupOutlet,
}: {
  register: UseFormRegister<TFieldValues>;
  dupFast: boolean;
  dupSlow: boolean;
  dupDist: boolean;
  dupOutlet: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        중복설치 여부{' '}
        <span className="text-gray-400 font-normal">
          (미체크 시 &quot;해당사항 없음&quot; 자동 체크)
        </span>
      </label>
      <div className="space-y-2 border border-gray-200 rounded p-3 bg-gray-50">
        <DupRow
          register={register}
          checkboxName={'dupFast' as Path<TFieldValues>}
          qtyName={'dupFastQty' as Path<TFieldValues>}
          label="급속충전기"
          qtyEnabled={dupFast}
        />
        <DupRow
          register={register}
          checkboxName={'dupSlow' as Path<TFieldValues>}
          qtyName={'dupSlowQty' as Path<TFieldValues>}
          label="완속충전기"
          qtyEnabled={dupSlow}
        />
        <DupRow
          register={register}
          checkboxName={'dupDist' as Path<TFieldValues>}
          qtyName={'dupDistQty' as Path<TFieldValues>}
          label="전력분배형 충전기"
          qtyEnabled={dupDist}
        />
        <DupRow
          register={register}
          checkboxName={'dupOutlet' as Path<TFieldValues>}
          qtyName={'dupOutletQty' as Path<TFieldValues>}
          label="과금형 콘센트"
          qtyEnabled={dupOutlet}
        />
        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            {...register('dupKiosk' as Path<TFieldValues>)}
            className="h-4 w-4 accent-brand-600 rounded"
          />
          <span className="text-sm text-gray-700">키오스크</span>
          <span className="text-xs text-gray-400">(수량란 없음)</span>
        </div>
      </div>
    </div>
  );
}

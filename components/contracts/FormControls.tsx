'use client';

import type { ReactNode } from 'react';
import type { FieldValues, Path, UseFormRegister } from 'react-hook-form';

export const contractInputClass =
  'w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      {title && (
        <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2 mb-4">
          {title}
        </h2>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
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
      <input type="radio" value={value} {...register(name)} className="h-4 w-4 text-blue-600" />
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
      <input type="checkbox" {...register(name)} className="h-4 w-4 text-blue-600 rounded" />
      {label}
    </label>
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
        className="h-4 w-4 text-blue-600 rounded"
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
            className="h-4 w-4 text-blue-600 rounded"
          />
          <span className="text-sm text-gray-700">키오스크</span>
          <span className="text-xs text-gray-400">(수량란 없음)</span>
        </div>
      </div>
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';

export interface SubmitStatus {
  kind: 'success' | 'error';
  msg: string;
}

export interface NoticeSection {
  title: string;
  items: ReactNode[];
}

export function ContractPageShell({
  title,
  children,
  footerText = '한백 EV Infra Solutions · Internal Tool',
}: {
  title: string;
  children: ReactNode;
  footerText?: string;
}) {
  return (
    <div className="min-h-screen bg-[#f7f8f4]">
      <SiteHeader active="contracts" />
      <main className="max-w-5xl mx-auto px-5 py-8 sm:px-6 sm:py-10">
        <header className="mb-7">
          <Link
            href="/#contracts"
            className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-brand-700"
          >
            ← 운영사 다시 선택
          </Link>
          <p className="text-xs font-bold tracking-[0.14em] text-brand-700">CONTRACT BUILDER</p>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.035em] text-slate-900 sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            필수 정보를 입력하면 운영사 양식에 맞는 계약서가 자동으로 생성됩니다.
          </p>
        </header>

        {children}

        <footer className="mt-8 text-center text-xs text-slate-400">
          <p>{footerText}</p>
        </footer>
      </main>
    </div>
  );
}

export function FormActions({
  status,
  isSubmitting,
  submitLabel = '계약서 생성 및 다운로드',
  submittingLabel = '생성 중...',
}: {
  status: SubmitStatus | null;
  isSubmitting: boolean;
  submitLabel?: string;
  submittingLabel?: string;
}) {
  return (
    <div className="sticky bottom-4 z-20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-gray-200 bg-white/95 backdrop-blur px-4 sm:px-5 py-3 shadow-lg">
      <div className="text-sm min-w-0">
        {status ? (
          <p
            className={
              status.kind === 'success'
                ? 'text-green-700'
                : 'text-red-600 font-medium'
            }
          >
            {status.kind === 'success' ? '✅ ' : '⚠️ '}
            {status.msg}
          </p>
        ) : (
          <p className="text-gray-400">입력을 마치면 아래 버튼으로 계약서를 생성하세요</p>
        )}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex-none bg-brand-600 hover:bg-brand-700 disabled:bg-gray-400 text-white font-semibold px-6 py-3 rounded-lg shadow-sm transition"
      >
        {isSubmitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}

export function NoticePanel({ sections }: { sections: NoticeSection[] }) {
  return (
    <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
      {sections.map((section, sectionIndex) => (
        <div key={section.title}>
          <p className={`font-semibold mb-1 ${sectionIndex > 0 ? 'mt-3' : ''}`}>
            {section.title}
          </p>
          <ul className="list-disc ml-5 space-y-1">
            {section.items.map((item, itemIndex) => (
              <li key={`${section.title}-${itemIndex}`}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';

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
    <div className="min-h-screen bg-gray-50 py-8 px-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        </header>

        {children}

        <footer className="mt-6 text-center text-xs text-gray-400">
          <p>{footerText}</p>
        </footer>
      </div>
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
        className="flex-none bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold px-6 py-3 rounded-lg shadow-sm transition"
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

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

/**
 * 「사전 현장 컨설팅 결과서만」 생성 버튼.
 *
 * 협력사가 잘못 채운 서류를 다시 받을 때 결과서 한 부만 필요한 경우가 많아서,
 * 전체 서류 생성과 나란히 두었습니다. 두 버튼 모두 type="submit"이라
 * 입력 검증은 똑같이 걸립니다 — 어느 쪽으로 뽑아도 값은 검수된 상태입니다.
 */
export interface DocScopeActionProps {
  /** 전체 서류 버튼 클릭 — 출력 범위를 'all'로 표시 */
  onSelectAll: () => void;
  /** 컨설팅결과서만 버튼 클릭 — 출력 범위를 'consulting'으로 표시 */
  onSelectConsulting: () => void;
  includeAttachments: boolean;
  onIncludeAttachmentsChange: (value: boolean) => void;
  /** 사진대지·체크리스트가 템플릿에 있는 CPO에서만 토글을 보여줍니다 */
  showAttachmentToggle?: boolean;
}

export function FormActions({
  status,
  isSubmitting,
  submitLabel = '계약서 생성 및 다운로드',
  submittingLabel = '생성 중...',
  docScope,
}: {
  status: SubmitStatus | null;
  isSubmitting: boolean;
  submitLabel?: string;
  submittingLabel?: string;
  docScope?: DocScopeActionProps;
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
      <div className="flex flex-none flex-col gap-2 sm:flex-row sm:items-center">
        {docScope && (
          <>
            {docScope.showAttachmentToggle && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={docScope.includeAttachments}
                  onChange={(e) =>
                    docScope.onIncludeAttachmentsChange(e.target.checked)
                  }
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                사진대지 · 체크리스트 포함
              </label>
            )}
            <button
              type="submit"
              onClick={docScope.onSelectConsulting}
              disabled={isSubmitting}
              className="flex-none border border-brand-600 text-brand-700 hover:bg-brand-50 disabled:border-gray-300 disabled:text-gray-400 font-semibold px-4 py-3 rounded-lg transition whitespace-nowrap"
            >
              컨설팅결과서만
            </button>
          </>
        )}
        <button
          type="submit"
          onClick={docScope?.onSelectAll}
          disabled={isSubmitting}
          className="flex-none bg-brand-600 hover:bg-brand-700 disabled:bg-gray-400 text-white font-semibold px-6 py-3 rounded-lg shadow-sm transition whitespace-nowrap"
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </div>
  );
}

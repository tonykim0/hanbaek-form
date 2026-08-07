'use client';

import { useRef, useState } from 'react';
import {
  CRITICAL_KEYS,
  FIELD_LABELS,
  LOW_CONFIDENCE_THRESHOLD,
  type ApplyOutcome,
  type CpoKey,
  type FormImportResult,
} from '@/lib/form-import';
import { importFormFromPdf, type ImportPhase } from '@/lib/import-client';

/**
 * 협력사가 보내온 스캔 PDF를 판독해 폼을 채우는 패널.
 *
 * 판독값을 그대로 신뢰하지 않는 것이 이 화면의 요점입니다 — 무엇이 채워졌고,
 * 무엇을 못 읽었고, 서류끼리 어긋난 곳이 어디인지 눈에 보여야 사람이 검수할 수
 * 있습니다. 그래서 채운 개수보다 「확인 필요」 목록을 크게 보여줍니다.
 */
export default function ImportPanel({
  cpo,
  onApply,
}: {
  cpo: CpoKey;
  /** 추출값을 폼에 반영하고 결과를 돌려줍니다 (페이지가 setValue를 갖고 있음) */
  onApply: (result: FormImportResult) => ApplyOutcome;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<ImportPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FormImportResult | null>(null);
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);

  const busy = phase !== null;

  const pickFile = (selected: FileList | null) => {
    const next = selected?.[0];
    if (!next) return;
    if (!next.name.toLowerCase().endsWith('.pdf') && next.type !== 'application/pdf') {
      setError('PDF 파일만 판독할 수 있습니다.');
      return;
    }
    setError(null);
    setResult(null);
    setOutcome(null);
    setFile(next);
  };

  const run = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setOutcome(null);
    try {
      const extracted = await importFormFromPdf({ file, cpo, onPhase: setPhase });
      setResult(extracted);
      setOutcome(onApply(extracted));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhase(null);
    }
  };

  const missingCritical =
    outcome?.missing.filter((key) => CRITICAL_KEYS.includes(key)) ?? [];

  return (
    <section className="rounded-xl border border-brand-200 bg-brand-50/40 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-b border-brand-100">
        <h2 className="text-base font-semibold text-gray-900">
          협력사 서류로 자동 채우기
        </h2>
        <span className="text-xs font-medium text-brand-700 bg-white border border-brand-200 rounded-full px-2 py-0.5">
          선택
        </span>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        <p className="text-xs text-gray-600">
          협력사가 작성해 보내온 계약서류 스캔 PDF를 올리면 계약서 · 별지5호 설치신청서 ·
          별지7호 사전현장컨설팅 결과서를 읽어 아래 입력폼을 채웁니다. 채운 값은 반드시
          검수한 뒤 생성하세요.
        </p>

        <div
          role="button"
          tabIndex={0}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (busy) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) pickFile(e.dataTransfer.files);
          }}
          className={`rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
            busy
              ? 'cursor-not-allowed border-gray-200 bg-gray-50'
              : dragging
                ? 'cursor-pointer border-brand-500 bg-brand-50'
                : 'cursor-pointer border-gray-300 bg-white hover:border-gray-400'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files);
              e.target.value = '';
            }}
          />
          {file ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-800 break-all">{file.name}</p>
              <p className="text-xs text-gray-500">
                {(file.size / 1024 / 1024).toFixed(1)}MB · 다시 클릭하면 파일을 바꿉니다
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">
                스캔 PDF를 드래그하거나 클릭해서 선택
              </p>
              <p className="text-xs text-gray-500">계약서류 묶음 그대로 올려도 됩니다</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={!file || busy}
            className="flex-none bg-brand-600 hover:bg-brand-700 disabled:bg-gray-400 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition"
          >
            {busy ? '판독 중...' : '판독해서 폼 채우기'}
          </button>
          {phase && (
            <p className="text-sm text-gray-600">
              {phase.kind === 'uploading'
                ? `업로드 중... ${phase.percentage}%`
                : 'AI가 서류를 읽고 있습니다 — 페이지가 많으면 1~3분 걸립니다'}
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 font-medium">⚠️ {error}</p>
        )}

        {result && outcome && (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-sm font-semibold text-green-700">
                ✅ {outcome.applied.length}개 항목을 폼에 채웠습니다
              </p>
              <p className="text-xs text-gray-500">
                {result.analyzedPages}페이지 판독
                {result.totalPages > result.analyzedPages &&
                  ` (전체 ${result.totalPages}페이지 중 앞 ${result.analyzedPages}페이지만)`}
                {result.detectedCpo && ` · 운영사 ${result.detectedCpo}`}
              </p>
            </div>

            {result.totalPages > result.analyzedPages && (
              <Callout tone="amber">
                페이지가 많아 앞 {result.analyzedPages}페이지만 판독했습니다. 뒤쪽 서류의
                값이 빠졌을 수 있습니다.
              </Callout>
            )}

            {result.detectedDocs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.detectedDocs.map((doc) => (
                  <span
                    key={`${doc.name}-${doc.pages.join(',')}`}
                    className="text-xs text-gray-700 bg-gray-100 border border-gray-200 rounded px-2 py-0.5"
                  >
                    {doc.name}
                    {doc.pages.length > 0 && ` p.${formatPages(doc.pages)}`}
                  </span>
                ))}
              </div>
            )}

            {result.issues.length > 0 && (
              <Callout tone="red" title="서류에서 발견된 문제">
                <ul className="list-disc ml-4 space-y-1">
                  {result.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </Callout>
            )}

            {missingCritical.length > 0 && (
              <Callout tone="red" title="비어 있는 필수 항목 — 직접 입력하세요">
                <FieldChips keys={missingCritical} tone="red" />
              </Callout>
            )}

            {outcome.lowConfidence.length > 0 && (
              <Callout
                tone="amber"
                title={`판독이 불확실한 항목 (신뢰도 ${Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}% 미만) — 원본과 대조하세요`}
              >
                <FieldChips keys={outcome.lowConfidence} tone="amber" />
              </Callout>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: 'red' | 'amber';
  title?: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-900'
      : 'border-amber-200 bg-amber-50 text-amber-900';
  return (
    <div className={`rounded border px-3 py-2 text-xs ${cls}`}>
      {title && <p className="font-semibold mb-1">{title}</p>}
      {children}
    </div>
  );
}

function FieldChips({
  keys,
  tone,
}: {
  keys: readonly (keyof typeof FIELD_LABELS)[];
  tone: 'red' | 'amber';
}) {
  const cls =
    tone === 'red'
      ? 'bg-white border-red-200 text-red-800'
      : 'bg-white border-amber-200 text-amber-800';
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((key) => (
        <span key={key} className={`rounded border px-2 py-0.5 ${cls}`}>
          {FIELD_LABELS[key]}
        </span>
      ))}
    </div>
  );
}

/** [1,2,3,8] → "1–3, 8" */
function formatPages(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  let runStart = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current !== prev + 1) {
      parts.push(runStart === prev ? `${runStart}` : `${runStart}–${prev}`);
      runStart = current;
    }
    prev = current;
  }
  return parts.join(', ');
}

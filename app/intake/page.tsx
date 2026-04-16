'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { put } from '@vercel/blob/client';
import SalesRepForm from '@/components/SalesRepForm';
import UploadZone from '@/components/UploadZone';
import FilePreview from '@/components/FilePreview';
import type { IntakeResponse } from '@/types/intake';

interface ProgressState {
  phase: 'idle' | 'uploading' | 'extracting' | 'classifying' | 'splitting' | 'notion' | 'attaching';
  message: string;
  uploadPercent: number;     // 0~100 (uploading 단계)
  current: number;           // 현재 파일 번호 (attaching 단계)
  total: number;             // 총 파일 수
}

const INITIAL_PROGRESS: ProgressState = {
  phase: 'idle',
  message: '',
  uploadPercent: 0,
  current: 0,
  total: 0,
};

export default function IntakePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [password, setPassword] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS);

  const canSubmit = name.trim() && company.trim() && password && files.length > 0;

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setProgress({ ...INITIAL_PROGRESS, phase: 'uploading', message: '파일 업로드 중...' });

    try {
      // ── Step 1: Vercel Blob 업로드 ───────────────────────────
      const file = files[0];
      // Blob 경로는 ASCII로 안전하게 (한글 NFD 파일명 → 400 방지)
      const safeName = `intake-${Date.now()}.zip`;
      const tokenRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathname: safeName }),
      });
      if (!tokenRes.ok) throw new Error('업로드 토큰 발급 실패');
      const { token } = await tokenRes.json();

      const blob = await put(safeName, file, {
        access: 'public',
        token,
        onUploadProgress: ({ percentage }) => {
          setProgress((p) => ({
            ...p,
            uploadPercent: Math.round(percentage),
            message: `파일 업로드 중... ${Math.round(percentage)}%`,
          }));
        },
      });

      // ── Step 2: SSE 스트림으로 서버 처리 진행 상황 수신 ──────
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salesRepName: name.trim(),
          salesRepCompany: company.trim(),
          password,
          blobUrl: blob.url,
        }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // 마지막 미완성 라인 보존

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6));

          switch (event.phase) {
            case 'extracting':
              setProgress((p) => ({
                ...p,
                phase: 'extracting',
                message: event.message,
                total: event.fileCount ?? p.total,
              }));
              break;

            case 'classifying':
              setProgress((p) => ({
                ...p,
                phase: 'classifying',
                message: event.message,
              }));
              break;

            case 'splitting':
              setProgress((p) => ({
                ...p,
                phase: 'splitting',
                message: event.message,
                total: event.totalFiles ?? p.total,
              }));
              break;

            case 'notion':
              setProgress((p) => ({
                ...p,
                phase: 'notion',
                message: event.message,
              }));
              break;

            case 'attaching':
              setProgress((p) => ({
                ...p,
                phase: 'attaching',
                message: event.message,
                current: event.current,
                total: event.total,
              }));
              break;

            case 'done': {
              const data = event.data as IntakeResponse;
              if (data.success) {
                sessionStorage.setItem('intake_result', JSON.stringify(data));
                router.push('/intake/complete');
              }
              return;
            }

            case 'error':
              sessionStorage.setItem(
                'intake_error',
                JSON.stringify({ error: event.error, code: event.code })
              );
              router.push('/intake/error');
              return;
          }
        }
      }
    } catch (err) {
      sessionStorage.setItem(
        'intake_error',
        JSON.stringify({
          error: err instanceof Error ? err.message : '네트워크 오류가 발생했습니다',
          code: 'NETWORK_ERROR',
        })
      );
      router.push('/intake/error');
    } finally {
      setSubmitting(false);
      setProgress(INITIAL_PROGRESS);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">계약서 접수</h1>
          <p className="text-sm text-gray-500 mt-1">
            한백 EV 충전 인프라 사업
          </p>
        </header>

        <div className="space-y-6 bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          {/* 영업자 정보 */}
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-3">
              영업자 정보
            </h2>
            <SalesRepForm
              name={name}
              company={company}
              onNameChange={setName}
              onCompanyChange={setCompany}
            />
          </section>

          {/* 비밀번호 */}
          <section>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              접수 비밀번호 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 입력"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </section>

          {/* 파일 업로드 */}
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-3">
              서류 업로드
            </h2>
            <UploadZone files={files} onFilesChange={setFiles} />
            <div className="mt-3">
              <FilePreview files={files} onRemove={handleRemoveFile} />
            </div>
          </section>

          {/* 접수 버튼 / 진행 상태 */}
          {submitting ? (
            <ProgressDisplay progress={progress} />
          ) : (
            <>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg shadow transition"
              >
                접수하기
              </button>
              <p className="text-xs text-gray-400 text-center">
                1~2일 내 한백 담당자가 회신드립니다
              </p>
            </>
          )}
        </div>

        <footer className="mt-6 text-center text-xs text-gray-400">
          한백 EV Infra Solutions
        </footer>
      </div>
    </div>
  );
}

// ── 진행 상태 UI ──────────────────────────────────────────────────

function ProgressDisplay({ progress }: { progress: ProgressState }) {
  const { phase, message, uploadPercent, current, total } = progress;

  // 전체 진행률 계산 (대략적)
  const overallPercent = (() => {
    switch (phase) {
      case 'uploading':   return Math.round(uploadPercent * 0.3);          // 0~30%
      case 'extracting':  return 32;
      case 'classifying': return 40;
      case 'splitting':   return 55;
      case 'notion':      return 60;
      case 'attaching':   return total > 0
        ? 60 + Math.round((current / total) * 38)                         // 60~98%
        : 65;
      default: return 0;
    }
  })();

  return (
    <div className="space-y-4">
      {/* 전체 진행률 바 */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="font-medium text-gray-700">{message}</span>
          <span className="text-gray-500">{overallPercent}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-blue-600 h-full rounded-full transition-all duration-500"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {/* 단계별 상세 */}
      <div className="space-y-1.5">
        <StepIndicator label="파일 업로드" done={phase !== 'uploading'} active={phase === 'uploading'}
          detail={phase === 'uploading' ? `${uploadPercent}%` : undefined} />
        <StepIndicator label="PDF 추출" done={phaseIndex(phase) > 1} active={phase === 'extracting'}
          detail={total > 0 && phaseIndex(phase) >= 1 ? `${total}개` : undefined} />
        <StepIndicator label="AI 분류" done={phaseIndex(phase) > 2} active={phase === 'classifying'} />
        <StepIndicator label="파일 준비" done={phaseIndex(phase) > 3} active={phase === 'splitting'}
          detail={total > 0 && phaseIndex(phase) >= 3 ? `${total}개 파일` : undefined} />
        <StepIndicator label="노션 저장" done={phaseIndex(phase) > 4} active={phase === 'notion'} />
        <StepIndicator label="파일 첨부" done={false} active={phase === 'attaching'}
          detail={phase === 'attaching' ? `${current}/${total}` : undefined} />
      </div>

      <p className="text-xs text-gray-400 text-center">
        최대 1분 소요될 수 있습니다
      </p>
    </div>
  );
}

function phaseIndex(phase: ProgressState['phase']): number {
  const order = ['uploading', 'extracting', 'classifying', 'splitting', 'notion', 'attaching'];
  return order.indexOf(phase);
}

function StepIndicator({
  label,
  done,
  active,
  detail,
}: {
  label: string;
  done: boolean;
  active: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
        {done ? (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : active ? (
          <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
        ) : (
          <span className="w-3 h-3 rounded-full bg-gray-300" />
        )}
      </span>
      <span className={done ? 'text-gray-400' : active ? 'text-gray-900 font-medium' : 'text-gray-400'}>
        {label}
      </span>
      {detail && (
        <span className="text-gray-500 text-xs ml-auto">{detail}</span>
      )}
    </div>
  );
}

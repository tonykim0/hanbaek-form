'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { put } from '@vercel/blob/client';
import SalesRepForm from '@/components/SalesRepForm';
import UploadZone from '@/components/UploadZone';
import FilePreview from '@/components/FilePreview';
import type { IntakeResponse } from '@/types/intake';

export default function IntakePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [password, setPassword] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);   // 0~100
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'processing'>('idle');

  const canSubmit = name.trim() && company.trim() && password && files.length > 0;

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    try {
      // Step 1: 토큰 발급 → Vercel Blob 직접 업로드 (4.5MB 제한 우회)
      setPhase('uploading');
      setProgress(0);
      const file = files[0];
      const tokenRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathname: file.name }),
      });
      if (!tokenRes.ok) throw new Error('업로드 토큰 발급 실패');
      const { token } = await tokenRes.json();

      const blob = await put(file.name, file, {
        access: 'public',
        token,
        onUploadProgress: ({ percentage }) => {
          setProgress(Math.round(percentage));
        },
      });

      // Step 2: API에 blob URL + 폼 데이터 전송 (작은 JSON body)
      setPhase('processing');
      setProgress(0);
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

      // Vercel 인프라 에러 시 JSON이 아닐 수 있음
      const text = await res.text();
      let data: IntakeResponse;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`서버 오류 (${res.status}): ${text.slice(0, 100)}`);
      }

      if (data.success) {
        sessionStorage.setItem('intake_result', JSON.stringify(data));
        router.push('/intake/complete');
      } else {
        sessionStorage.setItem(
          'intake_error',
          JSON.stringify({ error: data.error, code: data.code })
        );
        router.push('/intake/error');
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
      setPhase('idle');
      setProgress(0);
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

          {/* 접수 버튼 + 진행 상태 */}
          {submitting ? (
            <div className="space-y-3">
              <div className="text-sm font-medium text-gray-700 text-center">
                {phase === 'uploading'
                  ? `파일 업로드 중... ${progress}%`
                  : 'AI 분류 + 노션 저장 중...'}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                {phase === 'uploading' ? (
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                ) : (
                  <div className="bg-blue-600 h-full rounded-full animate-progress-indeterminate" />
                )}
              </div>
              <p className="text-xs text-gray-400 text-center">
                {phase === 'uploading'
                  ? '서버에 파일을 전송하고 있습니다'
                  : '서류를 분석하고 노션에 저장합니다 (최대 1분)'}
              </p>
            </div>
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

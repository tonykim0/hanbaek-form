'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

  const canSubmit = name.trim() && company.trim() && password && files.length > 0;

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('salesRepName', name.trim());
      formData.append('salesRepCompany', company.trim());
      formData.append('password', password);
      files.forEach((f) => formData.append('files', f));

      const res = await fetch('/api/intake', {
        method: 'POST',
        body: formData,
      });

      const data: IntakeResponse = await res.json();

      if (data.success) {
        // 완료 데이터를 sessionStorage에 저장 후 라우팅
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

          {/* 접수 버튼 */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg shadow transition"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner />
                접수 처리 중...
              </span>
            ) : (
              '접수하기'
            )}
          </button>

          <p className="text-xs text-gray-400 text-center">
            1~2일 내 한백 담당자가 회신드립니다
          </p>
        </div>

        <footer className="mt-6 text-center text-xs text-gray-400">
          한백 EV Infra Solutions
        </footer>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

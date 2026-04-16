'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ErrorData {
  error: string;
  code: string;
}

export default function ErrorPage() {
  const router = useRouter();
  const [data, setData] = useState<ErrorData | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('intake_error');
    if (raw) {
      setData(JSON.parse(raw));
    } else {
      router.replace('/intake');
    }
  }, [router]);

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* 에러 아이콘 + 메시지 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">접수에 실패했습니다</h1>
        </div>

        {/* 에러 내용 박스 */}
        <div className="bg-white rounded-lg shadow-sm border border-red-200 p-5 space-y-2">
          <p className="text-sm text-gray-800">{data.error}</p>
          <p className="text-xs text-gray-400">에러 코드: {data.code}</p>
        </div>

        {/* 버튼 */}
        <div className="mt-4 space-y-2">
          <button
            onClick={() => {
              sessionStorage.removeItem('intake_error');
              router.back();
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg shadow transition"
          >
            다시 시도
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem('intake_error');
              router.push('/intake');
            }}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition"
          >
            처음으로 돌아가기
          </button>
        </div>

        {/* Fallback 연락처 */}
        <p className="mt-6 text-center text-xs text-gray-400">
          문제가 계속되면 한백 김정우 담당자에게 연락해주세요
        </p>

        <footer className="mt-4 text-center text-xs text-gray-400">
          한백 EV Infra Solutions
        </footer>
      </div>
    </div>
  );
}

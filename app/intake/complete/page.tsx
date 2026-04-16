'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IntakeSuccessResponse } from '@/types/intake';

export default function CompletePage() {
  const router = useRouter();
  const [data, setData] = useState<IntakeSuccessResponse | null>(null);
  const [showFiles, setShowFiles] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('intake_result');
    if (raw) {
      setData(JSON.parse(raw));
    } else {
      router.replace('/intake');
    }
  }, [router]);

  if (!data) return null;

  const totalFiles = data.classifiedFiles.length;
  const now = new Date();
  const dateStr = `${now.getFullYear()}. ${now.getMonth() + 1}. ${now.getDate()}. ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 접수자 이름·소속은 classifiedFiles의 standardName에서 현장명을 추출하거나 sessionStorage에서 가져옴
  const salesRep = (() => {
    try {
      const saved = localStorage.getItem('intake_salesRep');
      if (saved) return JSON.parse(saved);
    } catch { /* 무시 */ }
    return { name: '', company: '' };
  })();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* 성공 아이콘 + 메시지 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">접수 완료</h1>
          <p className="text-sm text-gray-500 mt-1">
            1~2일 내 한백 담당자가 회신드립니다
          </p>
        </div>

        {/* 접수 정보 박스 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-3">
          <InfoRow label="접수번호" value={data.intakeId} />
          <InfoRow
            label="접수자"
            value={
              salesRep.name && salesRep.company
                ? `${salesRep.name} · ${salesRep.company}`
                : salesRep.name || '—'
            }
          />
          <InfoRow label="접수일시" value={dateStr} />
          <InfoRow
            label="서류"
            value={`총 ${totalFiles}건 분류 완료`}
          />

          {data.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
              {data.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          {/* 분류 결과 토글 */}
          {totalFiles > 0 && (
            <div>
              <button
                onClick={() => setShowFiles(!showFiles)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                분류 결과 보기
                <span className={`transition-transform ${showFiles ? 'rotate-180' : ''}`}>
                  &#9660;
                </span>
              </button>
              {showFiles && (
                <ul className="mt-2 space-y-1">
                  {data.classifiedFiles.map((f, i) => (
                    <li
                      key={i}
                      className="text-sm bg-gray-50 border border-gray-100 rounded px-3 py-2 flex justify-between"
                    >
                      <span className="text-gray-800 truncate">{f.standardName}</span>
                      <span className="text-gray-400 flex-shrink-0 ml-2">{f.category}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 추가 접수 버튼 */}
        <button
          onClick={() => {
            sessionStorage.removeItem('intake_result');
            router.push('/intake');
          }}
          className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg shadow transition"
        >
          다른 건 추가 접수
        </button>

        <footer className="mt-6 text-center text-xs text-gray-400">
          한백 EV Infra Solutions
        </footer>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium text-right ml-4">{value}</span>
    </div>
  );
}

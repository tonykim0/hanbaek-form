import type { Metadata } from 'next';
import Link from 'next/link';
import MaterialsBrowser from '@/components/MaterialsBrowser';
import { getMaterials } from '@/lib/materials';

export const metadata: Metadata = {
  title: '영업자료 · 시방서 자료실 | 한백 전기차충전사업',
  description: '운영사별 영업자료와 시방서를 내려받는 곳',
};

// 자료를 올리면 배포 없이 바로 보이도록 매 요청마다 목록을 읽습니다
export const dynamic = 'force-dynamic';

export default async function MaterialsPage() {
  const { groups, fileCount, lastUpdated, storageMissing, error } =
    await getMaterials();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-5 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-5">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-700 transition mb-3"
          >
            <span aria-hidden>←</span> 홈으로
          </Link>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="한백" className="w-10 h-10 flex-none" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                영업자료 · 시방서
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {fileCount > 0
                  ? `자료 ${fileCount}개${lastUpdated ? ` · 최근 업데이트 ${lastUpdated}` : ''}`
                  : '운영사별 영업자료와 시방서를 내려받는 곳'}
              </p>
            </div>
          </div>
        </header>

        {(storageMissing || error) && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            자료를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
          </div>
        )}

        {groups.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <p className="text-sm font-semibold text-gray-900 mb-1">
              자료 준비 중입니다
            </p>
            <p className="text-sm text-gray-500">
              운영사별 영업자료와 시방서를 곧 올려드리겠습니다.
            </p>
          </div>
        ) : (
          <MaterialsBrowser groups={groups} />
        )}

        <footer className="mt-8 flex flex-col items-center gap-2 text-xs text-gray-400">
          <Link href="/admin/materials" className="hover:text-brand-700 transition">
            자료 관리 (담당자용)
          </Link>
          <p>한백 EV Infra Solutions</p>
        </footer>
      </div>
    </div>
  );
}

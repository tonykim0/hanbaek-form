import type { Metadata } from 'next';
import Link from 'next/link';
import MaterialsAdmin from '@/components/MaterialsAdmin';
import { getMaterials } from '@/lib/materials';

export const metadata: Metadata = {
  title: '자료실 관리 | 한백 전기차충전사업',
  robots: { index: false, follow: false },
};

// 올린 파일이 바로 보이도록 매 요청마다 Blob에서 목록을 읽습니다
export const dynamic = 'force-dynamic';

export default async function MaterialsAdminPage() {
  const { groups, fileCount, storageMissing, error } = await getMaterials();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <Link
            href="/materials"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-700 transition mb-3"
          >
            <span aria-hidden>←</span> 자료실로
          </Link>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="한백" className="w-10 h-10 flex-none" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">자료실 관리</h1>
              <p className="text-sm text-gray-500 mt-1">
                운영사별 영업자료 · 시방서 업로드 · 삭제 (현재 {fileCount}개)
              </p>
            </div>
          </div>
        </header>

        {storageMissing && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            파일 저장소(Vercel Blob)가 연결되지 않았습니다. Vercel 프로젝트에{' '}
            <code className="bg-amber-100 rounded px-1.5 py-0.5">
              BLOB_READ_WRITE_TOKEN
            </code>{' '}
            과{' '}
            <code className="bg-amber-100 rounded px-1.5 py-0.5">
              MATERIALS_ADMIN_PASSWORD
            </code>{' '}
            환경변수가 있어야 업로드가 됩니다.
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            목록을 불러오지 못했습니다 — {error}
          </div>
        )}

        <MaterialsAdmin groups={groups} />
      </div>
    </div>
  );
}

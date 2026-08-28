import type { Metadata } from 'next';
import Link from 'next/link';
import MaterialsBrowser from '@/components/MaterialsBrowser';
import SiteHeader from '@/components/SiteHeader';
import { getMaterials } from '@/lib/materials';

export const metadata: Metadata = {
  title: '운영사 자료실 | 한백 전기차충전사업',
  description: '운영사별 영업 · 시공 자료를 내려받는 곳',
  // 어떤 커밋이 배포됐는지 확인용 (화면에는 보이지 않음)
  other: { build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local' },
};

// 자료를 올리면 배포 없이 바로 보이도록 매 요청마다 목록을 읽습니다
export const dynamic = 'force-dynamic';

export default async function MaterialsPage() {
  const { groups, fileCount, lastUpdated, storageMissing, error } =
    await getMaterials();

  return (
    <div className="min-h-screen bg-[#f7f8f4]">
      <SiteHeader active="materials" />
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-10">
        <header className="mb-7">
          <p className="text-xs font-bold tracking-[0.14em] text-amber-700">RESOURCE LIBRARY</p>
          {/*
            * 제목은 「누구의 것인가」만 말한다 (한백 2026-08-28) — 분류를 열거하면
            * 분류를 고칠 때마다 제목이 어긋난다. 실제로 「영업자료 · 시방서」가 여섯으로
            * 갈리면서 그렇게 됐다. 분류는 아래 칩이 보여준다.
            */}
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-900">
            운영사 자료실
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {fileCount > 0
              ? `자료 ${fileCount}개${lastUpdated ? ` · 최근 업데이트 ${lastUpdated}` : ''}`
              : '운영사별 영업 · 시공 자료를 내려받는 곳'}
          </p>
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
              운영사별 영업 · 시공 자료를 곧 올려드리겠습니다.
            </p>
          </div>
        ) : (
          <MaterialsBrowser groups={groups} />
        )}

        <footer className="mt-8 flex flex-col items-center gap-2 text-xs text-slate-400">
          <p>한백 EV Infra Solutions</p>
        </footer>
      </main>
    </div>
  );
}

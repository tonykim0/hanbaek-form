import type { Metadata } from 'next';
import ChargerHistoryLookup from '@/components/ChargerHistoryLookup';
import SiteHeader from '@/components/SiteHeader';
import type { IndexMeta } from '@/lib/charger-history';
import type { SubsidyMeta } from '@/lib/subsidy-history';
import meta from '@/public/data/charger-history/meta.json';
import subsidyMeta from '@/public/data/subsidy-history/meta.json';

export const metadata: Metadata = {
  title: '충전기 · 보조금 이력 조회 | 한백 전기차충전사업',
  description: '주소로 기설치 충전기와 보조금 지원 이력을 확인합니다',
  other: { build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local' },
};

export default function ChargerHistoryPage() {
  return (
    <div className="min-h-screen bg-[#f7f8f4]">
      <SiteHeader active="charger-history" />
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-10">
        <header className="mb-7">
          <p className="text-xs font-bold tracking-[0.14em] text-sky-700">LOOKUP</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-900">
            충전기 · 보조금 이력 조회
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            두 개의 DB 를 조회합니다. 별개의 자료이니 일치하지 않는 부분은 실제 현장 확인
            바랍니다. 보조금 이력이 있으면 신규 신청 대수 · 기설치 이력 작성에 그대로 반영해야
            합니다.
          </p>
        </header>

        <ChargerHistoryLookup meta={meta as IndexMeta} subsidyMeta={subsidyMeta as SubsidyMeta} />

        <footer className="mt-8 text-center text-xs text-slate-400">
          한백 EV Infra Solutions
        </footer>
      </main>
    </div>
  );
}

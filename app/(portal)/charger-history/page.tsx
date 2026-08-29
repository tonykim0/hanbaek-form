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
          <h1 className="text-2xl font-black tracking-[-0.03em] text-slate-900">
            충전기 · 보조금 이력 조회
          </h1>
          {/*
            * 한 줄만 남긴다 — 「어떻게 쓰는가」가 아니라 ★틀리면 손해 보는 사실★ 둘이다:
            * 두 자료가 서로 다를 수 있다는 것, 보조금 이력은 신청 대수에 반영해야 한다는 것.
            */}
          <p className="mt-1 text-sm text-slate-400">
            충전기 · 보조금 두 자료는 별개라 다를 수 있습니다 · 보조금 이력은 신규 신청 대수에 반영
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

import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import { CONSOLE_URL } from '@/lib/portal-intake';

export const metadata: Metadata = {
  title: '접수는 콘솔에서 받습니다 | 한백 전기차충전사업',
  description: '포털 접수는 닫혔습니다. 계약 서류는 콘솔에서 접수합니다.',
  other: { build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local' },
};

/**
 * 접수 안내 — 포털 접수를 닫았다 (한백 지시 2026-08-26).
 *
 * ★주소를 없애지 않는다.★ 이 주소는 협력사에게 카톡·메일로 돌아다닌다. 404 로 두면
 * 「사이트가 죽었나」로 읽히고 물어볼 곳도 안 보인다 — 닫혔다는 것과 어디로 가야 하는지를
 * 그 자리에서 말한다(화면 규칙 3 과 같은 이치: 막는 것을 막힌 자리에 적는다).
 *
 * 접수 양식(ZIP 업로드 → 자동분류 → 노션)은 걷어냈다. 그 흐름은 콘솔의 접수 화면이
 * 이어받는다 — 거기는 로그인한 소속으로 들어와 콘솔 DB 에 바로 남는다(dual-write 금지).
 * 열려 있던 문 둘도 같이 닫았다: POST /api/intake, /api/upload 의 intake ZIP 토큰.
 */
export default function IntakeClosedPage() {
  return (
    <div className="min-h-screen bg-[#f7f8f4]">
      <SiteHeader active="intake" />
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-10">
        <header className="mb-7">
          <h1 className="text-2xl font-black tracking-[-0.03em] text-slate-900">
            접수는 콘솔에서 받습니다
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            포털 접수는 닫혔습니다 · 낸 서류가 그 자리에서 검수·진행으로 이어집니다
          </p>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-black tracking-[-0.02em] text-slate-900">접수하는 곳</h2>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">
            콘솔에 로그인한 뒤 <b className="font-bold text-slate-900">서류 접수</b> 에서
            현장 정보와 서류를 냅니다. 소속은 로그인 계정으로 붙습니다.
          </p>
          <a
            href={`${CONSOLE_URL}/projects/new`}
            className="mt-4 inline-flex items-center gap-1 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800"
          >
            콘솔에서 접수하기
            <span aria-hidden>→</span>
          </a>

          <p className="mt-5 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500">
            계정이 아직 없으면 한백 담당자에게 요청해주세요. 업체마다 계정 하나를 드리고,
            그 계정으로는 <b className="font-bold text-slate-700">자기 현장만</b> 보입니다.
          </p>
        </div>

        {/*
          * 계약서 작성은 그대로 열려 있다 — 포털은 협력사의 로그인 없는 입구로 남는다.
          * 닫은 것은 「작성한 서류를 내는 자리」 하나다.
          */}
        <p className="mt-5 text-sm leading-6 text-slate-500">
          계약서 작성·자료실·이력조회는 그대로입니다 — 로그인 없이 씁니다.
        </p>
      </main>
    </div>
  );
}

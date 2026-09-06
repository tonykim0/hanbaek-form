import { Suspense } from 'react';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import LoginForm from './LoginForm';
import { getSessionUser } from '@/lib/auth/session';
import { isUsingDevSeed } from '@/lib/auth/users';

export const metadata = { title: '로그인 — 한백 전기차사업관리시스템' };

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/projects');

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8f4] px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Image
            src="/logo.png"
            alt=""
            width={56}
            height={56}
            className="mx-auto mb-3 rounded-2xl"
            priority
          />
          <h1 className="text-h1 font-black text-slate-900">한백 전기차충전사업 관리시스템</h1>
        </div>

        <div className="rounded-panel border border-slate-200 bg-white p-6 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.5)]">
          <Suspense fallback={null}>
            <LoginForm devSeed={isUsingDevSeed()} />
          </Suspense>
        </div>

        {/*
          * ★포털 안내를 걷었다★ (한백 지시 2026-09-06).
          *
          * 「계약서 작성 · 접수는 로그인 없이 EV 업무 포털에서」라고 적혀 있었는데,
          * 접수는 2026-08-26 에 포털에서 닫았다 — 없는 길을 안내하고 있었다.
          * 계약서 작성은 아직 포털에 있지만, 로그인하러 온 사람에게 할 말이 아니다:
          * 콘솔에 들어오면 사이드바의 「계약서 작성」이 그 양식으로 데려간다.
          *
          * 설명 문구를 넣지 않는다(화면 규칙 2) — 여기 남은 것은 로그인 하나다.
          */}
      </div>
    </div>
  );
}

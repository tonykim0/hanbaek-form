import { Suspense } from 'react';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import LoginForm from './LoginForm';
import { getSessionUser } from '@/lib/auth/session';
import { isUsingDevSeed } from '@/lib/auth/users';

export const metadata = { title: '로그인 — 한백 EV 콘솔' };

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

        <p className="mt-5 text-center text-small text-slate-400">
          계약서 작성 · 접수는 로그인 없이{' '}
          <a href="/" className="font-semibold text-brand-700 hover:underline">
            EV 업무 포털
          </a>
          에서 이용하세요.
        </p>
      </div>
    </div>
  );
}

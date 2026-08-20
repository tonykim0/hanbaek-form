import { Suspense } from 'react';
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
          <p className="text-tiny font-bold tracking-[0.06em] text-brand-700">한백 전기차충전사업</p>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.03em] text-slate-900">현장 관리 콘솔</h1>
          <p className="mt-1.5 text-sm text-slate-500">접수 · 시공 · 정산</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.5)]">
          <Suspense fallback={null}>
            <LoginForm devSeed={isUsingDevSeed()} />
          </Suspense>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
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

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginForm({ devSeed }: { devSeed: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/projects';

  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? '로그인에 실패했습니다.');
        return;
      }
      router.replace(next.startsWith('/') ? next : '/projects');
      router.refresh();
    } catch {
      setError('서버에 연결하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold tracking-[0.1em] text-slate-500">아이디</span>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          autoComplete="username"
          autoFocus
          className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold tracking-[0.1em] text-slate-500">비밀번호</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-brand-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400"
      >
        {busy ? '확인 중…' : '로그인'}
      </button>

      {devSeed && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
          <b>개발 시드 계정</b>이 켜져 있습니다 (비밀번호 전부 <code className="font-mono">dev1234!</code>).
          <br />
          <code className="font-mono">admin</code> 한백 관리자 ·{' '}
          <code className="font-mono">ecoelec</code> 영업+시공 ·{' '}
          <code className="font-mono">daesang</code> 시공만 ·{' '}
          <code className="font-mono">navy</code> 영업만
          <br />
          운영에서는 <code className="font-mono">AUTH_USERS</code> 환경변수가 이 시드를 대체합니다.
        </div>
      )}
    </form>
  );
}

'use client';

import { Btn, FIELD, Note } from '@/components/ui';

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
        <span className="text-tiny font-bold tracking-[0.1em] text-slate-500">아이디</span>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          autoComplete="username"
          autoFocus
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-tiny font-bold tracking-[0.1em] text-slate-500">비밀번호</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className={FIELD}
        />
      </label>

      {error && <Note tone="stop">{error}</Note>}

      <Btn type="submit" busy={busy} busyLabel="확인 중…">
        로그인
      </Btn>

      {devSeed && (
        <Note tone="warn" className="leading-relaxed">
          <b>개발 시드 계정</b>이 켜져 있습니다 (비밀번호 전부 <code className="font-mono">dev1234!</code>).
          <br />
          <code className="font-mono">admin</code> 한백 관리자 ·{' '}
          <code className="font-mono">ecoelec</code> 영업+시공 ·{' '}
          <code className="font-mono">daesang</code> 시공만 ·{' '}
          <code className="font-mono">navy</code> 영업만
          <br />
          운영에서는 <code className="font-mono">AUTH_USERS</code> 환경변수가 이 시드를 대체합니다.
        </Note>
      )}
    </form>
  );
}

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

  /*
   * 눌렀는데 1초쯤 아무 일도 안 일어나 보였다(2026-08-22 제보). 로그인 요청 자체는
   * 150ms 안쪽이다 — 시간은 그 뒤 콘솔 첫 화면을 그리는 데 간다. 그래서 두 가지를 고쳤다.
   *
   * 1. 성공하면 busy 를 되돌리지 않는다. finally 로 풀면 다음 화면을 기다리는 동안
   *    버튼이 멀쩡한 「로그인」으로 돌아와서, 누른 것이 먹지 않은 것처럼 보인다.
   *    화면이 바뀌면 이 컴포넌트는 사라지므로 되돌릴 필요도 없다.
   *
   * 2. refresh() 를 뺀다. replace() 가 이미 새 쿠키로 다음 화면의 RSC 를 받아오는데,
   *    바로 뒤에 refresh() 를 부르면 같은 화면을 서버에서 한 번 더 그린다 —
   *    /projects 는 현장 전체를 읽는 화면이라 그 한 번이 대기의 절반쯤이었다.
   *    로그인 화면에는 /projects 로 가는 <Link> 가 없어 미리 받아둔 응답도 없다.
   */
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
        setBusy(false);
        return;
      }
      router.replace(next.startsWith('/') ? next : '/projects');
    } catch {
      setError('서버에 연결하지 못했습니다.');
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

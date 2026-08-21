'use client';

/**
 * 콘솔 화면이 터졌을 때 — 무엇이 안 됐고 무엇을 할 수 있는지 그 자리에 적는다.
 *
 * ★왜 필요한가★
 * 이 파일이 없으면 서버 오류가 빈 화면이나 멈춘 로딩으로 보인다 — 사용자는 자기가
 * 잘못 눌렀는지, 기다리면 되는지 알 수 없다(2026-08-21 실제로 그랬다).
 *
 * 오류 내용을 그대로 보여주지 않는다 — 접속 문자열·쿼리가 섞여 나올 수 있다.
 * 대신 다시 시도할 길을 준다(reset). digest 는 로그와 맞춰 볼 번호라 적어 둔다.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { Btn } from '@/components/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 서버 로그와 맞춰 보려면 브라우저 쪽에도 남아야 한다
    console.error('[console] 화면 오류:', error.message, error.digest ?? '');
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="text-h2 font-black text-slate-900">화면을 불러오지 못했습니다</h1>
      <p className="mt-2 text-base text-slate-500">
        잠시 뒤 다시 시도해 보세요. 계속 안 되면 이 번호를 알려주시면 로그에서 찾을 수 있습니다.
      </p>
      {error.digest && (
        <p className="mt-1 text-tiny font-bold tabular-nums text-slate-400">
          오류 번호 {error.digest}
        </p>
      )}
      <div className="mt-5 flex items-center gap-2">
        <Btn onClick={reset}>다시 시도</Btn>
        <Link
          href="/projects"
          className="rounded-ctl border border-slate-200 px-3.5 py-2 text-lead font-bold text-slate-600 transition hover:border-slate-300"
        >
          현장 보드로
        </Link>
      </div>
    </div>
  );
}

'use client';

/**
 * 서류 한 장의 반려 — 한백 전용.
 *
 * 승인 버튼은 없다. 제출된 서류는 기본이 통과이고, 한백이 하는 일은 문제 있는 것을
 * 골라내는 것뿐이다.
 *
 * 반려는 사유를 받는다 — 사유 없이 반려하면 협력사가 무엇을 고쳐야 할지 알 수 없다.
 * 서버에서도 같은 검사를 한다(422). 여기서 막는 것은 왕복을 줄이기 위한 것이다.
 */
import { useState } from 'react';
import type { ProjectDocument } from '@/types/project';
import { useAction } from '@/lib/use-action';

// ── 검수 조작 (한백 전용) ─────────────────────────────────────────
/**
 * 서류 하나의 승인·반려.
 *
 * 반려는 사유를 받는다 — 사유 없이 반려하면 협력사가 무엇을 고쳐야 할지 알 수 없다.
 * 서버에서도 같은 검사를 한다(422). 여기서 막는 것은 왕복을 줄이기 위한 것이고,
 * 최종 판정은 서버가 한다.
 */
export function DocReview({
  projectId,
  kind,
  status,
}: {
  projectId: string;
  kind: string;
  status: ProjectDocument['status'];
}) {
  const { busy, error, setError, run } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  async function send(next: 'approved' | 'rejected' | 'uploaded', why?: string) {
    const ok = await run({
      url: `/api/projects/${projectId}/documents/${kind}`,
      method: 'PATCH',
      body: { status: next, reason: why ?? null },
      fail: '처리에 실패했습니다.',
    });
    if (!ok) return;
    setRejecting(false);
    setReason('');
  }

  if (rejecting) {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          placeholder="반려 사유 — 협력사가 이 문장을 보고 고칩니다"
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[11px] leading-snug focus:border-brand-500 focus:outline-none"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() => send('rejected', reason)}
            className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
          >
            {busy ? '처리 중' : '반려 확정'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setRejecting(false); setReason(''); setError(null); }}
            className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-600"
          >
            취소
          </button>
        </div>
        {error && <p className="text-[11px] font-semibold text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex gap-1.5">
        {/*
          승인 버튼은 없다. 제출된 서류는 기본이 통과라서 누를 일이 없다 —
          한백이 하는 일은 문제 있는 것을 골라내는 것뿐이다.
        */}
        {status === 'rejected' ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => send('uploaded')}
              className="rounded-lg bg-brand-700 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-brand-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              반려 해제
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(true)}
              className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-700 transition hover:bg-red-50 disabled:text-slate-400"
            >
              사유 수정
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejecting(true)}
            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-700 transition hover:bg-red-50 disabled:text-slate-400"
          >
            반려
          </button>
        )}
      </div>
      {error && <p className="text-[11px] font-semibold text-red-700">{error}</p>}
    </div>
  );
}

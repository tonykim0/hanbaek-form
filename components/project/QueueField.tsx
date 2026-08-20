'use client';

/**
 * 환경부 보조금 신청 대기번호 — 한백이 넣고 협력사가 본다.
 *
 * ★머리말에 두는 이유★
 * 접수 뒤에 환경부에서 나오는 번호다. 협력사는 자기 현장이 몇 번을 받았는지 알아야 하는데,
 * 예전에는 한백이 표에서만 넣을 수 있었고 협력사에게는 「현장 정보」 열두 칸 사이에
 * 글자로만 있었다. 물어보는 일이 잦은 값이라 이름 바로 아래로 올렸다.
 *
 * ★넣고 나면 글자로 굳는다.★ 처음에는 늘 열린 입력칸이었는데, 확정된 번호가 계속
 * 고쳐질 수 있는 모양으로 있으면 옆을 지나가는 클릭에 값이 바뀐다. 고치려면 「고치기」를
 * 한 번 눌러야 한다 — 옆 칸(영업사·시공사)과 같은 문법이다.
 *
 * 영구히 잠그지는 않는다. 환경부에서 온 번호를 잘못 적는 일이 있고, 고칠 자리가 없으면
 * DB 를 직접 만지는 수밖에 없다.
 *
 * 협력사에게는 「고치기」가 없다. 한백이 통보받는 값이라 협력사가 적을 자리가 아니다.
 */
import { useState } from 'react';
import { useAction } from '@/lib/use-action';

export function QueueField({
  value, projectId, canEdit,
}: {
  value: string | null;
  projectId: string;
  canEdit: boolean;
}) {
  const { busy, error, setError, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  async function save(next: string) {
    const trimmed = next.trim();
    const ok = await run({
      url: `/api/projects/${projectId}/env-queue`,
      body: { value: trimmed === '' ? null : trimmed },
      fail: '저장하지 못했습니다.',
    });
    if (ok) setEditing(false);
  }

  return (
    <div className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
      <dt className="w-24 shrink-0 text-small font-bold text-slate-400">환경부 대기번호</dt>
      <dd className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-col gap-1.5 pb-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              placeholder="2026-595"
              // 받은 형태 그대로 넣는다 — 「2026-595」로도 「595」로도 온다
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save(draft);
                if (e.key === 'Escape') { setEditing(false); setDraft(value ?? ''); setError(null); }
              }}
              className="w-[160px] rounded-ctl border border-slate-200 px-2.5 py-1.5 text-base tabular-nums text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(draft)}
                className="rounded-ctl bg-brand-700 px-3 py-1 text-tiny font-bold text-white transition hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400"
              >
                {busy ? '저장 중…' : '저장'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setEditing(false); setDraft(value ?? ''); setError(null); }}
                className="rounded-ctl px-2 py-1 text-tiny font-bold text-slate-400 transition hover:text-slate-600"
              >
                취소
              </button>
              {error && <span className="text-tiny font-semibold text-red-700">{error}</span>}
            </div>
          </div>
        ) : (
          <span className="flex flex-wrap items-baseline gap-2">
            <span
              className={`font-semibold tabular-nums ${value ? 'text-slate-800' : 'text-slate-300'}`}
            >
              {value ?? '—'}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => { setDraft(value ?? ''); setEditing(true); }}
                className="text-tiny font-bold text-slate-400 underline decoration-slate-300 transition hover:text-brand-800"
              >
                {value ? '고치기' : '입력'}
              </button>
            )}
          </span>
        )}
      </dd>
    </div>
  );
}

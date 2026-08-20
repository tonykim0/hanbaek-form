'use client';

/**
 * 영업사·시공사 한 칸 — 고칠 수 있다.
 */
import { useState } from 'react';
import { useAction } from '@/lib/use-action';

/**
 * 영업사·시공사 한 칸.
 *
 * ★고칠 수 있어야 하는 이유★
 * 한백이 계정 없는 업체의 건을 대신 접수할 때 이 이름을 손으로 적는다. 그런데 이 문자열은
 * 협력사가 자기 현장을 보는 판정에 그대로 쓰이므로(문자열 일치), 오타 하나면 그 업체에게
 * 그 현장이 영구히 안 보인다. 고치는 자리가 없으면 DB 를 직접 만지는 수밖에 없다.
 *
 * 이미 쓰이는 이름을 눌러 넣게 한다 — 손으로 적으면 「에코일렉」과 「에코일렉 」이 갈린다.
 */
export function OrgField({
  label, field, value, projectId, canEdit, knownOrgs,
}: {
  label: string;
  field: 'salesOrg' | 'gcOrg';
  value: string | null;
  projectId: string;
  canEdit: boolean;
  knownOrgs: string[];
}) {
  const { busy, error, setError, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  async function save(next: string) {
    const ok = await run({
      url: `/api/projects/${projectId}/orgs`,
      method: 'PATCH',
      body: { [field]: next.trim() === '' ? null : next },
      fail: '고치지 못했습니다.',
    });
    if (ok) setEditing(false);
  }

  return (
    <div className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
      <dt className="w-24 shrink-0 text-small font-bold text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-col gap-1.5 pb-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              placeholder="비우면 어느 업체도 아닌 현장"
              className="w-full rounded-ctl border border-slate-200 px-2.5 py-1.5 text-base text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            {knownOrgs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {knownOrgs.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setDraft(o)}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-micro font-bold text-slate-500 transition hover:border-brand-300 hover:text-brand-800"
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(draft)}
                className="rounded-ctl bg-brand-700 px-3 py-1 text-tiny font-bold text-white transition hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400"
              >
                {busy ? '고치는 중…' : '저장'}
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
            <span className={value ? 'font-semibold text-slate-800' : 'font-semibold text-amber-700'}>
              {value ?? '미지정'}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => { setDraft(value ?? ''); setEditing(true); }}
                className="text-tiny font-bold text-slate-400 underline decoration-slate-300 transition hover:text-brand-800"
              >
                {value ? '고치기' : '지정'}
              </button>
            )}
          </span>
        )}
      </dd>
    </div>
  );
}

'use client';

/**
 * 환경부 보조금 신청 대기번호 — 한백이 넣고 협력사가 본다.
 *
 * ★머리말에 두는 이유★
 * 접수 뒤에 환경부에서 나오는 번호다. 협력사는 자기 현장이 몇 번을 받았는지 알아야 하는데,
 * 예전에는 한백이 표에서만 넣을 수 있었고 협력사에게는 「현장 정보」 열두 칸 사이에
 * 글자로만 있었다. 물어보는 일이 잦은 값이라 이름 바로 아래로 올렸다.
 *
 * 협력사에게는 입력칸을 주지 않는다. 한백이 통보받는 값이라 협력사가 적을 자리가 아니다 —
 * 못 하는 일은 눌리지 않게 한다.
 *
 * 칸을 떠날 때 저장한다. 글자마다 저장하면 「2026-5」 같은 반쪽 값이 계속 올라간다.
 */
import { useAction } from '@/lib/use-action';

export function QueueField({
  value, projectId, canEdit,
}: {
  value: string | null;
  projectId: string;
  canEdit: boolean;
}) {
  const { busy, error, run } = useAction();

  const save = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === (value ?? '')) return;
    void run({
      url: `/api/projects/${projectId}/env-queue`,
      body: { value: trimmed === '' ? null : trimmed },
      fail: '저장하지 못했습니다.',
    });
  };

  return (
    <div className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
      <dt className="w-24 shrink-0 text-small font-bold text-slate-400">환경부 대기번호</dt>
      <dd className="min-w-0 flex-1">
        {canEdit ? (
          <>
            <input
              aria-label="환경부 대기번호"
              defaultValue={value ?? ''}
              placeholder="2026-595"
              disabled={busy}
              onBlur={(e) => save(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className={`w-[132px] rounded-ctl border px-2 py-1 text-base font-semibold tabular-nums transition placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                error
                  ? 'border-red-400 text-red-800'
                  : value
                    ? 'border-slate-200 text-slate-800'
                    : 'border-dashed border-slate-300 text-slate-500'
              } ${busy ? 'opacity-50' : 'hover:border-brand-300'}`}
            />
            {error && <p className="mt-1 text-tiny font-semibold text-red-700">{error}</p>}
          </>
        ) : (
          <span
            className={`text-base font-semibold tabular-nums ${value ? 'text-slate-800' : 'text-slate-300'}`}
          >
            {value ?? '—'}
          </span>
        )}
      </dd>
    </div>
  );
}

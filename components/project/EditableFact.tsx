'use client';

/**
 * 머리말 사실 줄에서 고칠 수 있는 칸.
 *
 * ★왜 사실 줄 안에 두는가★
 * 영업사·시공사·환경부 대기번호는 운영사·대수·계약연수와 같은 급의 사실이다. 아래에
 * 따로 상자를 두면 같은 것을 두 군데서 읽어야 하고, 머리말이 두 층으로 길어진다.
 *
 * ★그래도 고칠 수 있어야 한다★
 *   영업사·시공사 — 협력사가 자기 현장을 보는 판정이 이 문자열의 일치다. 오타 하나면
 *     그 업체에게 그 현장이 영구히 안 보인다.
 *   환경부 대기번호 — 접수 뒤에 환경부에서 오는 값이라 한백이 나중에 넣는다.
 *
 * 평소에는 글자로 굳어 있다. 늘 열린 입력칸으로 두면 옆을 지나가는 클릭에 값이 바뀐다.
 * 고치려면 「고치기」를 눌러야 하고, 그때만 이 칸이 한 줄을 통째로 쓴다 — 좁은 칸에
 * 입력창을 끼우면 긴 업체 이름이 눌린다.
 *
 * 협력사에게는 「고치기」가 없다. 못 하는 일은 눌리지 않게 한다.
 */
import { useState } from 'react';
import { useAction } from '@/lib/use-action';
import { Btn, Empty, Err, FIELD, Picks, Val } from '@/components/ui';

export function EditableFact({
  label, value, canEdit, url, field, method = 'PATCH', empty = '—', placeholder,
  suggestions = [], na = false,
}: {
  label: string;
  value: string | null;
  canEdit: boolean;
  url: string;
  /** 보낼 본문의 키 — { [field]: 값 } 으로 나간다 */
  field: string;
  method?: 'POST' | 'PATCH';
  /** 값이 없을 때 보여줄 말. 비어 있음이 문제인 칸은 「미지정」처럼 눈에 띄게 적는다. */
  empty?: string;
  placeholder?: string;
  /** 눌러 넣을 후보 — 손으로 적으면 「에코일렉」과 「에코일렉 」이 갈린다 */
  suggestions?: string[];
  /**
   * 이 현장에는 해당없는 칸인가.
   *
   * 칸을 없애지 않는다 — 「빠뜨린 것」과 「원래 해당없는 것」은 다른 것이고,
   * 칸이 사라지면 둘이 같은 모양이 된다(서류 목록에서 해당없음 칸을 남기는 것과 같은 이유).
   * 고치는 자리는 주지 않는다 — 못 하는 일은 눌리지 않게 한다.
   */
  na?: boolean;
}) {
  const { busy, error, setError, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  async function save(next: string) {
    const trimmed = next.trim();
    const ok = await run({
      url,
      method,
      body: { [field]: trimmed === '' ? null : trimmed },
      fail: '수정하지 못했습니다.',
    });
    if (ok) setEditing(false);
  }

  const close = () => {
    setEditing(false);
    setDraft(value ?? '');
    setError(null);
  };

  if (na) {
    return (
      <div className="min-w-0">
        <dt className="text-tiny font-bold tracking-[0.04em] text-slate-400">{label}</dt>
        <dd className="mt-0.5"><Empty kind="na" /></dd>
      </div>
    );
  }

  // 고칠 때는 격자의 한 칸이 아니라 한 줄을 통째로 쓴다 — 좁은 칸에 입력창·후보가 눌린다
  if (editing) {
    return (
      <div className="col-span-full flex w-full flex-col gap-1.5 py-1">
        <dt className="text-micro font-bold tracking-[0.04em] text-slate-400">{label}</dt>
        <dd className="flex flex-col gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save(draft);
              if (e.key === 'Escape') close();
            }}
            className={`${FIELD} max-w-[280px]`}
          />
          <Picks options={suggestions} onPick={setDraft} />
          <div className="flex items-center gap-1.5">
            <Btn size="sm" busy={busy} busyLabel="저장 중…" onClick={() => void save(draft)}>
              저장
            </Btn>
            <Btn size="sm" kind="quiet" disabled={busy} onClick={close}>
              취소
            </Btn>
            <Err>{error}</Err>
          </div>
        </dd>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <dt className="text-tiny font-bold tracking-[0.04em] text-slate-400">{label}</dt>
      {/* 고치는 칩은 값 옆에 붙는다 — 라벨 줄에 두면 라벨이 값보다 길어져 열이 어긋난다 */}
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-1.5 break-keep">
        {/* 비어 있음은 「빠뜨린 것」이라 노랑이다 — 아직 올 때가 아닌 것(—)과 다른 말이다 */}
        {value ? <Val value={value} /> : <Empty kind="miss" label={empty === '—' ? undefined : empty} />}
        {canEdit && (
          <Btn size="sm" kind="quiet" onClick={() => { setDraft(value ?? ''); setEditing(true); }}>
            {value ? '수정' : '입력'}
          </Btn>
        )}
      </dd>
    </div>
  );
}

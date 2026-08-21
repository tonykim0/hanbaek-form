'use client';

/**
 * 현장 멈춤 컨트롤 — 상세 머리말과 보드 카드가 같이 쓴다. [한백 전용 동작]
 *
 * 여는 자리는 글자만이고(화면 규칙 12 — 확정이 아니다), 열면 보류·계약중단을
 * 고르고 사유를 적어야 확정된다. 사유 없는 멈춤은 몇 달 뒤 아무도 이유를 모른다.
 * 멈춘 현장에는 「재개」가 선다 — 되돌릴 길(규칙 7). 계약중단도 지우지 않는다,
 * 보드 끝 칸에 기록으로 남는 것이 이 상태의 뜻이다.
 */
import { useState } from 'react';
import type { HoldState } from '@/types/project';
import { HOLD_STATES } from '@/types/project';
import { useAction } from '@/lib/use-action';
import { Btn, Choice, Err, FIELD } from '@/components/ui';

export function StopControl({ projectId, held }: { projectId: string; held: HoldState | null }) {
  const { busy, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<HoldState>('보류');
  const [note, setNote] = useState('');

  const submit = (payload: { state: HoldState | null; note?: string }) =>
    run({
      url: `/api/projects/${projectId}/hold`,
      body: payload,
      fail: '처리하지 못했습니다.',
    });

  if (held) {
    return (
      <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Btn
          size="sm"
          kind="quiet"
          busy={busy}
          busyLabel="재개 중…"
          onClick={() => void submit({ state: null })}
        >
          재개
        </Btn>
        <Err>{error}</Err>
      </span>
    );
  }

  if (!open) {
    return (
      <Btn
        size="sm"
        kind="undo"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        중단
      </Btn>
    );
  }

  return (
    <div
      className="flex w-full flex-col gap-2 rounded-box border border-slate-200 bg-slate-50 p-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex gap-1.5">
        {HOLD_STATES.map((s) => (
          <Choice key={s} on={state === s} onClick={() => setState(s)}>
            {s}
          </Choice>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        autoFocus
        placeholder={state === '보류' ? '보류 사유' : '중단 사유'}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        className={FIELD}
      />
      <div className="flex items-center gap-1.5">
        <Btn
          size="sm"
          kind="side"
          busy={busy}
          busyLabel="처리 중…"
          disabled={!note.trim()}
          onClick={async () => {
            const ok = await submit({ state, note: note.trim() });
            if (ok) setOpen(false);
          }}
        >
          {state}으로 세우기
        </Btn>
        <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setOpen(false)}>
          취소
        </Btn>
        <Err>{error}</Err>
      </div>
    </div>
  );
}

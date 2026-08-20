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
import { Btn, Err, FIELD } from '@/components/ui';

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

  /*
   * 사유를 받을 때는 한 줄을 통째로 쓴다.
   * 카드 오른쪽 구석에 끼워 두면 사유 칸이 눌려서 두 줄짜리 문장을 쓸 수 없다.
   */
  if (rejecting) {
    return (
      <div className="mt-2 flex w-full flex-col gap-1.5">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          placeholder="반려 사유 — 협력사가 이 문장을 보고 고칩니다"
          className={`${FIELD} leading-snug`}
        />
        <div className="flex gap-1.5">
          <Btn size="sm" kind="stop" disabled={!reason.trim()} busy={busy} onClick={() => send('rejected', reason)}>
            반려 확정
          </Btn>
          <Btn size="sm" kind="side" disabled={busy} onClick={() => { setRejecting(false); setReason(''); setError(null); }}>
            취소
          </Btn>
        </div>
        <Err>{error}</Err>
      </div>
    );
  }

  /*
   * 평소에는 카드 오른쪽 아래 구석에 붙는다(ml-auto).
   * 미리보기·다운로드·올리기와 같은 줄에 두되 반대쪽 끝으로 밀어낸다 — 자주 누르는 것과
   * 되돌리기 어려운 것을 같은 자리에 나란히 두면 잘못 누른다.
   */
  return (
    <div className="ml-auto flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        {/*
          승인 버튼은 없다. 제출된 서류는 기본이 통과라서 누를 일이 없다 —
          한백이 하는 일은 문제 있는 것을 골라내는 것뿐이다.
        */}
        {status === 'rejected' ? (
          <>
            <Btn size="sm" busy={busy} onClick={() => send('uploaded')}>
              반려 해제
            </Btn>
            <Btn size="sm" kind="undo" disabled={busy} onClick={() => setRejecting(true)}>
              사유 수정
            </Btn>
          </>
        ) : (
          <Btn size="sm" kind="undo" disabled={busy} onClick={() => setRejecting(true)}>
            반려
          </Btn>
        )}
      </div>
      <Err>{error}</Err>
    </div>
  );
}

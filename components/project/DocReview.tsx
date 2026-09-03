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
  hasFile = true,
  onRejected,
}: {
  projectId: string;
  kind: string;
  status: ProjectDocument['status'];
  /**
   * 반려가 실제로 된 뒤에 부르는 것 — ★단계를 옮기는 일은 부르는 쪽이 안다★
   * (공정 서류는 준공보완으로 내려간다, 2026-08-31). 이 부품은 칸 하나만 판정한다.
   */
  onRejected?: () => void;
  /**
   * 이 칸에 파일이 있는가 — 반려를 푸는 길이 갈린다.
   *
   * 파일이 있으면 「반려 해제」(uploaded — 통과로). 파일이 없으면(누락 보완요청·미제출
   * 반려) 통과로 풀 수 없다 — 풀리는 순간 파일 한 장 없는 칸이 통과로 세어진다. 그래서
   * ★「반려 취소」(none — 미제출로)★다 (한백 지시 2026-09-03: 안 낸 서류도 칸마다
   * 반려·취소한다. 그전에는 묶음 보완요청 취소뿐이었다).
   */
  hasFile?: boolean;
}) {
  const { busy, error, setError, run } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  async function send(next: 'approved' | 'rejected' | 'uploaded' | 'none', why?: string) {
    const ok = await run({
      url: `/api/projects/${projectId}/documents/${kind}`,
      method: 'PATCH',
      body: { status: next, reason: why ?? null },
      fail: '처리에 실패했습니다.',
    });
    if (!ok) return;
    setRejecting(false);
    setReason('');
    if (next === 'rejected') onRejected?.();
  }

  /*
   * 사유를 받을 때는 한 줄을 통째로 쓴다.
   * 카드 오른쪽 구석에 끼워 두면 사유 칸이 눌려서 두 줄짜리 문장을 쓸 수 없다.
   */
  if (rejecting) {
    return (
      <div className="flex w-full flex-col gap-1.5">
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
   * 자리는 부르는 쪽이 정한다 — 카드의 조작 줄 오른쪽 끝이다(화면 규칙 8: 자주 누르는
   * 「파일 추가」와 반대쪽). 예전에는 이 부품이 ml-auto 를 쥐고 있어서, 줄 안에 다른
   * 것과 섞이면 어디에 설지 부품과 자리가 서로 다투었다.
   */
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {/*
          승인 버튼은 없다. 제출된 서류는 기본이 통과라서 누를 일이 없다 —
          한백이 하는 일은 문제 있는 것을 골라내는 것뿐이다.
        */}
        {status === 'rejected' ? (
          <>
            {hasFile ? (
              <Btn size="sm" busy={busy} onClick={() => send('uploaded')}>
                반려 해제
              </Btn>
            ) : (
              /* 파일 없는 반려는 통과가 아니라 미제출로 돌아간다 — 위 hasFile 주석 */
              <Btn size="sm" busy={busy} onClick={() => send('none')}>
                반려 취소
              </Btn>
            )}
            {/* 곁다리 동작은 고스트 칩이다 — 밑줄은 링크로 읽힌다(화면 규칙 4) */}
            <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setRejecting(true)}>
              사유 수정
            </Btn>
          </>
        ) : (
          /*
           * 붉은 테두리 칩(kind="warn") — 「누락 서류 보완요청」과 같은 모양이다.
           * 반려와 삭제가 같은 회색 글자라 구분이 안 됐고(한백 지적), 붉은 밑줄 글자로 뒀더니
           * 옆의 칩들 사이에서 눌리는 것으로 안 읽혔다. 배경 빨강은 「반려 확정」에만 쓴다(규칙 12).
           */
          <Btn size="sm" kind="warn" disabled={busy} onClick={() => setRejecting(true)}>
            반려
          </Btn>
        )}
      </div>
      <Err>{error}</Err>
    </div>
  );
}

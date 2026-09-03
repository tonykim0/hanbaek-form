'use client';

/**
 * 공지 목록 + 작성·수정·삭제(관리자).
 *
 * ★이 화면을 여는 것이 곧 「읽었다」다★ — 마운트에서 읽음 표시를 찍고(POST /read),
 * 상단바 배지(TopBar)는 화면을 옮길 때 다시 세므로 다음 이동에서 꺼진다.
 * 공지마다 「확인」 단추를 두지 않는다 — 열어서 눈에 들어온 것이 확인이고,
 * 단추를 두면 확인이 일이 된다.
 *
 * 글은 평소엔 글자, 고칠 때만 입력칸이다(화면 규칙 4). 삭제는 수정의 반대쪽 끝(규칙 8),
 * Confirm 으로 한 번 묻는다 — 지운 공지는 되살릴 수 없다.
 */
import { useEffect, useState } from 'react';
import type { Notice } from '@/types/project';
import { useAction } from '@/lib/use-action';
import { Btn, Confirm, Empty, Err, FIELD } from '@/components/ui';

const day = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function NoticeBoard({ items, canWrite }: {
  items: Notice[];
  /** 공지 쓰기 — 한백 관리자만. 서버(adminWrite)가 같은 판정을 한 번 더 한다 */
  canWrite: boolean;
}) {
  /*
   * 읽음 표시 — 한 번이면 된다. 실패해도 화면을 막지 않는다: 배지가 한 번 더 뜰 뿐이고,
   * 다음에 열면 다시 찍는다.
   */
  useEffect(() => {
    void fetch('/api/notices/read', { method: 'POST' }).catch(() => {});
  }, []);

  const [writing, setWriting] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        writing ? (
          <NoticeForm onDone={() => setWriting(false)} />
        ) : (
          <div>
            <Btn size="sm" onClick={() => setWriting(true)}>새 공지 쓰기</Btn>
          </div>
        )
      )}

      {items.length === 0 ? (
        <Empty kind="wait" label="공지 없음" />
      ) : (
        /* 상자 없이 얇은 선으로 가른다(화면 규칙 1) — 공지는 목록이지 카드 무더기가 아니다 */
        <ol className="flex flex-col divide-y divide-slate-100">
          {items.map((n) => (
            <NoticeItem key={n.id} notice={n} canWrite={canWrite} />
          ))}
        </ol>
      )}
    </div>
  );
}

function NoticeItem({ notice, canWrite }: { notice: Notice; canWrite: boolean }) {
  const { busy, error, setError, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);

  if (editing) {
    return (
      <li className="py-4">
        <NoticeForm notice={notice} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1.5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 className="break-keep text-lead font-black text-slate-900">{notice.title}</h2>
        <span className="text-tiny tabular-nums text-slate-400">
          {day(notice.createdAt)}
          {notice.updatedAt && ` · 수정 ${day(notice.updatedAt)}`}
        </span>
        {canWrite && (
          <span className="ml-auto flex items-center gap-1.5">
            <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setEditing(true)}>
              수정
            </Btn>
            {/* 삭제는 반대쪽 끝, 확정은 Confirm 이 묻는다 — 여는 자리는 글자만(규칙 12) */}
            <Btn size="sm" kind="undo" disabled={busy} onClick={() => setAsking(true)}>
              삭제
            </Btn>
          </span>
        )}
      </div>
      <p className="max-w-2xl whitespace-pre-line break-keep text-small leading-relaxed text-slate-700">
        {notice.body}
      </p>
      <Err>{error}</Err>
      <Confirm
        open={asking}
        title={`「${notice.title}」 공지를 지웁니다`}
        detail="지운 공지는 되살릴 수 없습니다."
        confirmLabel="공지 삭제"
        busy={busy}
        busyLabel="지우는 중…"
        error={error}
        onConfirm={() => {
          void run({
            url: `/api/notices/${notice.id}`,
            method: 'DELETE',
            fail: '공지를 지우지 못했습니다.',
          }).then((ok) => {
            if (ok) setAsking(false);
          });
        }}
        onCancel={() => { setAsking(false); setError(null); }}
      />
    </li>
  );
}

/** 작성(notice 없음)과 수정(있음)이 같은 칸을 쓴다 — 두 벌이면 모양이 갈린다 */
function NoticeForm({ notice, onDone }: { notice?: Notice; onDone: () => void }) {
  const { busy, error, setError, run } = useAction();
  const [title, setTitle] = useState(notice?.title ?? '');
  const [body, setBody] = useState(notice?.body ?? '');

  async function save() {
    const ok = await run({
      url: notice ? `/api/notices/${notice.id}` : '/api/notices',
      method: notice ? 'PATCH' : 'POST',
      body: { title, body },
      fail: '공지를 저장하지 못했습니다.',
    });
    if (ok) onDone();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-1.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목"
        autoFocus
        className={FIELD}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="내용 — 협력사 전체가 봅니다"
        className={`${FIELD} leading-relaxed`}
      />
      <div className="flex items-center gap-1.5">
        <Btn size="sm" busy={busy} busyLabel="저장 중…" disabled={!title.trim() || !body.trim()} onClick={() => void save()}>
          {notice ? '공지 수정' : '공지 올리기'}
        </Btn>
        <Btn size="sm" kind="quiet" disabled={busy} onClick={() => { setError(null); onDone(); }}>
          취소
        </Btn>
        <Err>{error}</Err>
      </div>
    </div>
  );
}

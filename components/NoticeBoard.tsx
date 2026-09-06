'use client';

/**
 * 공지 목록 + 작성·수정·삭제·첨부(관리자).
 *
 * ★이 화면을 여는 것이 곧 「읽었다」다★ — 마운트에서 읽음 표시를 찍고(POST /read),
 * 상단바 배지(TopBar)는 화면을 옮길 때 다시 세므로 다음 이동에서 꺼진다.
 * 공지마다 「확인」 단추를 두지 않는다 — 열어서 눈에 들어온 것이 확인이고,
 * 단추를 두면 확인이 일이 된다.
 *
 * ★날짜로 묶고, 글은 접어 둔다★ (한백 지시 2026-09-06 「글 다 펼치기 하지 말고
 * 날짜별로 정리」). 전에는 모든 공지의 본문이 한 화면에 다 펼쳐져 있어서, 공지가
 * 몇 건인지도 무엇이 새것인지도 스크롤을 다 내려야 알 수 있었다. 이제 한 줄에 하나씩
 * 서고 누른 것만 펼친다 — 목록은 훑는 자리고, 펼치는 것은 읽을 것을 고른 뒤다.
 *
 * 글은 평소엔 글자, 고칠 때만 입력칸이다(화면 규칙 4). 삭제는 수정의 반대쪽 끝(규칙 8),
 * Confirm 으로 한 번 묻는다 — 지운 공지는 되살릴 수 없다.
 */
import { useEffect, useState } from 'react';
import type { Notice, NoticeFile } from '@/types/project';
import { useAction } from '@/lib/use-action';
import { formatSize } from '@/lib/materials-meta';
import { Btn, Confirm, Empty, Err, FIELD, Tag } from '@/components/ui';

const day = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * 날짜별로 묶는다 — 목록은 이미 최신순이라(listNotices) 순서를 다시 세우지 않는다.
 * Map 은 넣은 순서를 지키므로 묶음도 최신 날짜부터 선다.
 */
function byDay(items: Notice[]): Array<[string, Notice[]]> {
  const out = new Map<string, Notice[]>();
  for (const n of items) {
    const k = day(n.createdAt);
    out.set(k, [...(out.get(k) ?? []), n]);
  }
  return [...out];
}

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
        <div className="flex flex-col gap-5">
          {byDay(items).map(([date, group]) => (
            <section key={date}>
              {/*
                * 날짜는 묶음의 머리다 — 줄마다 날짜를 달면 같은 날 공지가 여럿일 때
                * 같은 글자가 반복되고, 무엇이 하루치인지 눈으로 안 묶인다.
                */}
              <h2 className="mb-1 text-tiny font-bold tabular-nums tracking-[0.06em] text-slate-400">
                {date}
              </h2>
              {/* 상자 없이 얇은 선으로 가른다(화면 규칙 1) — 공지는 목록이지 카드 무더기가 아니다 */}
              <ol className="flex flex-col divide-y divide-slate-100 border-t border-slate-100">
                {group.map((n) => (
                  <NoticeItem key={n.id} notice={n} canWrite={canWrite} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function NoticeItem({ notice, canWrite }: { notice: Notice; canWrite: boolean }) {
  const { busy, error, setError, run } = useAction();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);

  if (editing) {
    return (
      <li className="py-3">
        <NoticeForm notice={notice} onDone={() => setEditing(false)} />
      </li>
    );
  }

  const files = notice.files.length;

  return (
    <li className="py-1">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {/*
          * 제목이 곧 펼치는 자리다 — 따로 「펼치기」 단추를 두지 않는다(누를 것이 둘이면
          * 어느 쪽이 그 일인지 묻게 된다). 화살표가 열렸는지 닫혔는지를 말한다.
          */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-ctl py-2 text-left transition hover:text-brand-800"
        >
          <span aria-hidden className={`shrink-0 text-tiny text-slate-300 transition ${open ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <span className="break-keep text-base font-bold text-slate-900">{notice.title}</span>
          {/* 세어진 꼬리표다 — 각지고(규칙 11), 열지 않고도 받을 것이 있는지 보인다 */}
          {files > 0 && <Tag>첨부 {files}</Tag>}
          {notice.updatedAt && (
            <span className="shrink-0 text-tiny tabular-nums text-slate-400">
              수정 {day(notice.updatedAt)}
            </span>
          )}
        </button>
        {canWrite && (
          <span className="flex items-center gap-1.5">
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

      {open && (
        <div className="flex flex-col gap-2.5 pb-3 pl-5">
          <p className="max-w-2xl whitespace-pre-line break-keep text-small leading-relaxed text-slate-700">
            {notice.body}
          </p>
          <NoticeFiles notice={notice} canWrite={canWrite} />
        </div>
      )}

      <Err>{error}</Err>
      <Confirm
        open={asking}
        title={`「${notice.title}」 공지를 지웁니다`}
        detail="지운 공지는 되살릴 수 없습니다. 붙은 첨부파일도 같이 지워집니다."
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

/**
 * 첨부 — 받아 가는 파일이다. 미리보기를 두지 않는다: 서류 칸과 달리 여기 오는 것은
 * 대개 엑셀 양식이라 브라우저가 못 그리고, 그릴 수 있는 것도 「받아서 쓰는 것」이다.
 */
function NoticeFiles({ notice, canWrite }: { notice: Notice; canWrite: boolean }) {
  if (notice.files.length === 0 && !canWrite) return null;

  return (
    <div className="flex max-w-2xl flex-col gap-1.5 border-t border-slate-900/[0.07] pt-2">
      {notice.files.map((f) => (
        <NoticeFileRow key={f.url} noticeId={notice.id} file={f} canWrite={canWrite} />
      ))}
      {canWrite && <NoticeUpload noticeId={notice.id} />}
    </div>
  );
}

function NoticeFileRow({ noticeId, file, canWrite }: {
  noticeId: string; file: NoticeFile; canWrite: boolean;
}) {
  const { busy, error, setError, run } = useAction();

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {/*
        * download 를 준다 — 엑셀·한글은 링크로 열면 브라우저가 알아서 받지만, PDF·그림은
        * 새 탭에서 열려 「받기」가 아니게 된다. 이름은 DB 의 것이 정본이라 Blob 경로가
        * 어떻든 올린 이름 그대로 저장된다.
        */}
      <a
        href={file.url}
        download={file.name}
        className="min-w-0 truncate text-small font-bold text-brand-800 underline decoration-brand-200 transition hover:decoration-brand-500"
      >
        {file.name}
      </a>
      <span className="shrink-0 text-tiny tabular-nums text-slate-400">{formatSize(file.size)}</span>
      {canWrite && (
        <Btn
          size="sm"
          kind="undo"
          busy={busy}
          busyLabel="빼는 중…"
          className="ml-auto"
          onClick={() => {
            void run({
              url: `/api/notices/${noticeId}/files`,
              method: 'DELETE',
              body: { url: file.url },
              fail: '첨부를 빼지 못했습니다.',
            });
          }}
        >
          빼기
        </Btn>
      )}
      <Err>{error}</Err>
    </div>
  );
}

/** 파일 고르기 — 종류를 좁히지 않는다(양식은 엑셀·한글·PDF 로 온다) */
function NoticeUpload({ noticeId }: { noticeId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/notices/${noticeId}/files`, { method: 'POST', body: form });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? '첨부를 올리지 못했습니다.');
      }
      window.location.reload(); // 목록은 서버 컴포넌트가 그린다 — 새로 받아야 보인다
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="cursor-pointer">
        <input
          type="file"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ''; // 같은 파일을 다시 골라도 onChange 가 돌게
            if (f) void upload(f);
          }}
        />
        <span className="inline-flex items-center rounded-ctl border border-slate-200 bg-white px-2.5 py-1 text-tiny font-bold text-slate-500 transition hover:border-brand-300 hover:text-brand-800">
          {busy ? '올리는 중…' : '첨부 올리기'}
        </span>
      </label>
      <Err>{error}</Err>
    </div>
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
      {/*
        * 첨부는 공지를 만든 뒤에 붙인다 — 아직 id 가 없으면 붙일 자리가 없다.
        * 작성 화면에서 파일까지 받으려면 「임시 첨부」를 어딘가에 두었다가 옮겨야 하는데,
        * 그 임시 자리가 실패하면 주인 없는 파일이 남는다(화면 규칙 7 의 반대편 —
        * 되돌릴 길이 없는 상태를 만들지 않는다).
        */}
      {!notice && (
        <p className="text-tiny text-slate-400">첨부파일은 공지를 올린 뒤에 붙입니다.</p>
      )}
    </div>
  );
}

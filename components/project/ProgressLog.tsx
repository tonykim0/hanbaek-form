'use client';

/**
 * 진행현황 및 메모.
 *
 * ★어느 칸에도 안 들어가는 사정이 여기 온다.★ 관리사무소가 공사를 미뤘다, 한전 불입이
 * 지연됐다 — 날짜 칸이나 서류 칸으로는 적을 수 없고, 전화로만 오가면 다음 사람이 모른다.
 */
import { useState } from 'react';
import type { ProjectNote } from '@/types/project';
import { useAction } from '@/lib/use-action';

/**
 * 진행현황 — 한백과 협력사가 이 현장의 특이사항을 남기는 자리.
 *
 * ★어느 칸에도 안 들어가는 사정이 여기 온다.★ 관리사무소가 공사를 미뤘다, 한전 불입이
 * 지연됐다, 운영사 승인이 늦다 — 날짜 칸이나 서류 칸으로는 적을 수 없고, 그렇다고
 * 전화로만 오가면 다음 사람이 알 수 없는 것들이다.
 *
 * 감사로그와 다르다. 감사로그는 「무슨 값이 무엇으로 바뀌었나」를 기계가 남기고,
 * 여기는 「무슨 일이 있었나」를 사람이 남긴다.
 *
 * 자기가 쓴 것은 고칠 수 있다(고친 흔적이 남는다). 남의 글은 못 고치고, 지우는 길은 없다.
 * 사람 이름은 안 적는다 — 회사마다 계정이 하나라 이름이 늘 같다. 대신 어느 쪽이 썼는지 남긴다.
 */
export function ProgressLog({
  projectId, notes, author,
}: {
  projectId: string;
  notes: ProjectNote[];
  /** 지금 남기면 붙을 이름 — 서버가 적는 값과 같다 */
  author: string;
}) {
  const { busy, error, run } = useAction();
  const [body, setBody] = useState('');
  const isHanbaek = author === '한백';

  async function save() {
    if (!body.trim()) return;
    const ok = await run({
      url: `/api/projects/${projectId}/notes`,
      body: { body },
      fail: '남기지 못했습니다.',
    });
    if (ok) setBody('');
  }

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-sm font-black tracking-[-0.01em] text-slate-900">진행현황 및 메모</h2>
        <span className="text-[11px] font-bold tabular-nums text-slate-400">{notes.length}건</span>
      </div>

      {/*
        * 입력칸을 늘 펴 둔다. 「특이사항 남기기」 버튼을 한 번 눌러야 칸이 나오게 했더니,
        * 적을 자리가 있다는 것 자체가 안 보였다 — 적게 만들려면 칸이 먼저 있어야 한다.
        */}
      <div className="rounded-xl border border-slate-200 bg-white p-2.5">
        {/* 조사(「~으로/로」)를 피해 앞에 붙인다 — 회사 이름 끝 글자에 따라 조사가 갈린다 */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400">작성자</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
              isHanbaek ? 'bg-slate-900 text-white' : 'bg-brand-600 text-white'
            }`}
          >
            {author}
          </span>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="예) 관리사무소 요청으로 착공 2주 연기 — 3월 첫째 주 재협의"
          className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            disabled={busy || !body.trim()}
            onClick={save}
            className="rounded-lg bg-brand-700 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {busy ? '남기는 중…' : '남기기'}
          </button>
          {error && <span className="text-[11px] font-semibold text-red-700">{error}</span>}
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="mt-3 text-center text-[12px] text-slate-400">아직 남긴 것이 없습니다</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {notes.map((n) => (
            <NoteItem key={n.id} projectId={projectId} note={n} author={author} />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * 진행현황 한 줄.
 *
 * 누가 남겼는지가 내용보다 먼저 읽혀야 한다 — 같은 현장에서 한백과 협력사가 번갈아 적으므로
 * 이름표만으로는 훑을 때 구분되지 않는다. 왼쪽 색 띠로 가른다(한백 검정 · 협력사 초록).
 *
 * 자기가 쓴 것만 고칠 수 있다. 고치면 「수정됨」이 붙는다 — 조용히 바뀌면 옛 내용을 기억하는
 * 사람이 무엇이 맞는지 알 수 없다.
 */
function NoteItem({
  projectId, note, author,
}: {
  projectId: string;
  note: ProjectNote;
  /** 보고 있는 쪽의 이름 — 이것과 같으면 자기 글이다 */
  author: string;
}) {
  const { busy, error, setError, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);

  const byHanbaek = note.author === '한백';
  const mine = note.author === author;

  async function save() {
    if (!body.trim()) return;
    const ok = await run({
      url: `/api/projects/${projectId}/notes`,
      method: 'PATCH',
      body: { noteId: note.id, body },
      fail: '고치지 못했습니다.',
    });
    if (ok) setEditing(false);
  }

  return (
    <li
      className={`rounded-lg border border-l-[3px] bg-white px-3 py-2 ${
        byHanbaek ? 'border-slate-200 border-l-slate-800' : 'border-slate-200 border-l-brand-500'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
            byHanbaek ? 'bg-slate-900 text-white' : 'bg-brand-100 text-brand-900'
          }`}
        >
          {note.author}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{note.at}</span>
        {note.editedAt && (
          <span className="shrink-0 text-[11px] text-slate-400" title={`${note.editedAt} 에 고침`}>
            수정됨
          </span>
        )}
        <span className="flex-1" />
        {mine && !editing && (
          <button
            type="button"
            onClick={() => { setBody(note.body); setEditing(true); }}
            className="shrink-0 text-[11px] font-bold text-slate-400 underline decoration-slate-300 transition hover:text-brand-800"
          >
            수정
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            autoFocus
            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[13px] leading-relaxed text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy || !body.trim()}
              onClick={save}
              className="rounded-lg bg-brand-700 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400"
            >
              {busy ? '고치는 중…' : '저장'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setEditing(false); setBody(note.body); setError(null); }}
              className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 transition hover:text-slate-600"
            >
              취소
            </button>
            {error && <span className="text-[11px] font-semibold text-red-700">{error}</span>}
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap break-keep text-[13px] leading-relaxed text-slate-700">
          {note.body}
        </p>
      )}
    </li>
  );
}

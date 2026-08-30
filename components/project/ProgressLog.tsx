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
import { Btn, Err, FIELD } from '@/components/ui';

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
 * 자기가 쓴 것은 고치고(고친 흔적이 남는다) 지운다(한백 지시 2026-08-30) — 남의 글은 둘 다
 * 못 한다. 잘못 눌러 남긴 줄과 딴 현장에 적은 글은 고치기로는 지울 수 없었다(빈 내용은
 * 저장이 막힌다). 지운 글은 감사기록에 통째로 남는다 — 화면에서 사라지는 것과 없던 일이
 * 되는 것은 다르다.
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

  /*
   * ★상자를 겹치지 않는다.★
   * 예전에는 머리말 카드 안에 회색 상자, 그 안에 흰 상자, 그 안에 입력칸이었다 — 네 겹이다.
   * 겹칠수록 안쪽 것이 무엇에 속하는지가 오히려 흐려진다.
   *
   * 지금은 얇은 선 하나로 구역을 가르고, 상자는 입력칸 자기 것 하나만 남긴다.
   * 목록도 줄 사이 선으로만 가른다 — 왼쪽 색 띠가 누가 썼는지를 이미 말해준다.
   */
  return (
    // 자리(위 선·여백)는 부모가 정한다 — 머리말 오른쪽 열에 설 때와 아래에 쌓일 때가 다르다
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-lead font-black text-slate-900">진행현황 및 메모</h2>
        <span className="text-tiny font-bold tabular-nums text-slate-400">{notes.length}건</span>
      </div>

      {/*
        * 입력칸을 늘 펴 둔다. 「특이사항 남기기」 버튼을 한 번 눌러야 칸이 나오게 했더니,
        * 적을 자리가 있다는 것 자체가 안 보였다 — 적게 만들려면 칸이 먼저 있어야 한다.
        */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="예) 관리사무소 요청으로 착공 2주 연기 — 3월 첫째 주 재협의"
        className={`${FIELD} resize-y leading-relaxed`}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Btn size="sm" disabled={!body.trim()} busy={busy} busyLabel="남기는 중…" onClick={save}>
          남기기
        </Btn>
        {/*
          * 누구 이름으로 남는지 — 버튼 옆에 둔다. 위에 따로 줄을 만들 값이 아니다.
          * 적기 시작할 때만 나온다 (한백 지시 2026-08-25) — 빈 칸 옆의 이름표는 남길 것이
          * 없는데도 누가 남기는지를 말하고 있어서, 칸이 비어 보이지 않게만 한다.
          */}
        {body.trim() && (
          <span
            className={`rounded-tag px-1.5 py-0.5 text-micro font-black ${
              isHanbaek ? 'bg-slate-900 text-white' : 'bg-brand-600 text-white'
            }`}
          >
            {author}
          </span>
        )}
        <Err>{error}</Err>
      </div>

      {/* 「아직 없습니다」를 적지 않는다 — 위의 0건이 이미 그 말이다 */}
      {/* 목록이 길어도 박스는 안 길어진다 — 안에서 스크롤한다(한백 지적: 박스가 너무 길다) */}
      {notes.length > 0 && (
        <ol className="mt-3 max-h-[340px] divide-y divide-slate-100 overflow-y-auto">
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
  const { busy, busyKey, error, setError, run } = useAction();
  const [editing, setEditing] = useState(false);
  /** 삭제는 한 번 더 묻는다 — 되돌릴 수 없다 */
  const [asking, setAsking] = useState(false);
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

  async function remove() {
    const ok = await run({
      key: 'del',
      url: `/api/projects/${projectId}/notes`,
      method: 'DELETE',
      body: { noteId: note.id },
      fail: '지우지 못했습니다.',
    });
    if (ok) setAsking(false);
  }

  return (
    <li
      className={`border-l-[3px] py-2 pl-3 ${
        byHanbaek ? 'border-l-slate-800' : 'border-l-brand-500'
      }`}
    >
      {/*
        * ★한 줄로 못 박는다★ (한백 지적 2026-08-30 「메모가 남겨지면 UI 도 너무 구려」).
        * flex-wrap 줄에 flex-1 빈 칸을 끼워 두었더니, 좁은 자리(현장 상세의 아래 단)에서
        * 그 빈 칸이 첫 줄을 다 먹고 단추가 한 줄에 하나씩 떨어져 ★넉 줄★이 됐다:
        *   한백 / 2026-08-30 17:07 / 수정 / 삭제
        * 접히지 않게 두 덩이로 나눈다 — 왼쪽(누가·언제)은 줄어들고 오른쪽(동작)은 안 줄어든다.
        */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-2 overflow-hidden">
          <span
            className={`shrink-0 rounded-tag px-1.5 py-0.5 text-micro font-black ${
              byHanbaek ? 'bg-slate-900 text-white' : 'bg-brand-100 text-brand-900'
            }`}
          >
            {note.author}
          </span>
          <span className="shrink-0 text-tiny tabular-nums text-slate-400">{note.at}</span>
          {note.editedAt && (
            <span className="shrink-0 text-tiny text-slate-400" title={`${note.editedAt} 에 고침`}>
              수정됨
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
        {mine && !editing && !asking && (
          <>
            <Btn size="sm" kind="quiet" onClick={() => { setBody(note.body); setEditing(true); }}>
              수정
            </Btn>
            {/* 되돌릴 수 없는 쪽은 글자 단추로 끝에 — 자주 누르는 것과 붙여 두지 않는다(화면 규칙 8) */}
            <Btn size="sm" kind="undo" onClick={() => setAsking(true)}>
              삭제
            </Btn>
          </>
        )}
        {asking && (
          <>
            <Btn size="sm" kind="undo" busy={busyKey === 'del'} busyLabel="삭제 중…" onClick={remove}>
              삭제합니다
            </Btn>
            <Btn size="sm" kind="quiet" disabled={busy} onClick={() => { setAsking(false); setError(null); }}>
              취소
            </Btn>
          </>
        )}
        </span>
      </div>
      {asking && <Err className="mt-1 block">{error}</Err>}

      {editing ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            autoFocus
            className={`${FIELD} resize-y leading-relaxed`}
          />
          <div className="flex items-center gap-1.5">
            <Btn size="sm" disabled={!body.trim()} busy={busy} busyLabel="고치는 중…" onClick={save}>
              저장
            </Btn>
            <Btn
              size="sm"
              kind="side"
              disabled={busy}
              onClick={() => { setEditing(false); setBody(note.body); setError(null); }}
            >
              취소
            </Btn>
            <Err>{error}</Err>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap break-keep text-base leading-relaxed text-slate-700">
          {note.body}
        </p>
      )}
    </li>
  );
}

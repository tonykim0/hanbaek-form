'use client';

/**
 * 검수 이력 — 반려하고 다시 올린 왕복을 되짚는다.
 *
 * ★왜 있는가★ 반려 사유는 다시 올리는 순간 지워진다(통과 상태인데 사유가 같이 뜨는 일이
 * 없게). 그래서 협력사가 「계약 재검토 요청」을 보내오면 한백은 ★무엇 때문에 돌려보냈고
 * 무엇이 새로 왔는지★ 알 길이 없었다(한백 지적 2026-09-01).
 *
 * 새로 적는 것은 없다 — audit_log 에 이미 다 남고 있었고 읽는 길이 없었을 뿐이다.
 *
 * ★열 때만 읽는다.★ 늘 펴 두면 현장 상세가 한 번 더 왕복하고, 평소에는 안 보는 목록이다.
 * 접힌 자리에 「검수 이력」만 서 있다가 누르면 그때 받아 온다.
 */
import { useState } from 'react';
import type { ReviewEvent } from '@/types/project';
import { Btn, Err } from '@/components/ui';

/** 행동마다 색 — 돌려보낸 것과 올라온 것이 한눈에 갈려야 한다 */
const TONE: Record<string, string> = {
  '서류 반려': 'text-red-700',
  '기설치 조사 반려': 'text-red-700',
  '누락 서류 보완요청': 'text-red-700',
  '서류 삭제': 'text-slate-500',
  '서류 파일 삭제': 'text-slate-500',
  '계약 확인': 'text-brand-700',
  '반려 해제': 'text-brand-700',
};

/** 「에코일렉(ecoelec)」에서 사람이 부르는 이름만 — 계정 id 는 감사기록에나 쓴다 */
const who = (actor: string) => actor.replace(/\s*\([^)]*\)\s*$/, '');

const day = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ReviewHistory({ projectId, labelOf }: {
  projectId: string;
  /** 서류 종류 키를 사람이 읽는 이름으로 — 부르는 쪽이 그 목록을 안다 */
  labelOf: (kind: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ReviewEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/history`);
      if (!res.ok) throw new Error('이력을 불러오지 못했습니다.');
      const b = (await res.json()) as { events?: ReviewEvent[] };
      setEvents(b.events ?? []);
      setOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      /* 스스로 flex 항목이 된다 — 감싸면 펼쳤을 때 한 줄을 못 차지한다 */
      <span className="flex items-center gap-1.5 self-center">
        {/*
          ★고스트 칩이 아니다★ (한백 2026-09-01 「검수 이력 안 나와」). 곁다리 동작의
          모양(kind="quiet")으로 두었더니 바로 옆 「전체 다운로드」의 진한 테두리에 묻혀
          있는 줄도 몰랐다. 이것은 곁다리가 아니라 ★열어서 읽는 것★이라 같은 무게로 선다.
        */}
        <Btn size="sm" kind="side" busy={busy} busyLabel="여는 중…" onClick={() => void load()}>
          검수 이력 보기
        </Btn>
        <Err>{error}</Err>
      </span>
    );
  }

  return (
    /* 펼치면 구역이 된다 — 머리말 줄 안에서 통째로 한 줄을 차지한다(basis-full) */
    <div className="mt-1 w-full basis-full">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-tiny font-black tracking-[0.1em] text-slate-500">검수 이력</h3>
        <span className="text-tiny font-bold tabular-nums text-slate-400">
          {events?.length ?? 0}건
        </span>
        <Btn size="sm" kind="quiet" className="ml-auto" onClick={() => setOpen(false)}>
          접기
        </Btn>
      </div>
      {events && events.length === 0 ? (
        /* 「아직 없습니다」는 적지 않는다 — 0건이 그 말이다(화면 규칙 6) */
        <p className="text-tiny text-slate-400">0건</p>
      ) : (
        <ol className="flex flex-col divide-y divide-slate-100">
          {events?.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
              <span className="w-24 shrink-0 text-tiny tabular-nums text-slate-400">{day(e.at)}</span>
              <span className="w-24 shrink-0 truncate text-tiny font-bold text-slate-600">
                {who(e.actor)}
              </span>
              <span className={`shrink-0 text-tiny font-black ${TONE[e.action] ?? 'text-slate-500'}`}>
                {e.action}
              </span>
              {/* 어느 서류인가 — 계약 확인처럼 서류가 아닌 것은 칸이 비어 있다(규칙 6) */}
              {e.kind && (
                <span className="text-tiny text-slate-700">{labelOf(e.kind)}</span>
              )}
              {/*
                ★사유는 줄을 통째로 쓴다★ — 한 문장이 넘는 일이 흔한데 옆에 끼워 두면
                다른 칸을 밀어내 날짜·이름이 줄바꿈된다.
              */}
              {e.note && (
                <p className="w-full rounded-ctl bg-red-50 px-2 py-1 text-tiny leading-snug text-red-800">
                  {e.note}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      <Err className="mt-1 block">{error}</Err>
    </div>
  );
}

'use client';

import {
  useEffect, useState,
} from 'react';
import type {
  ChargerModel, ProjectDetail,
} from '@/types/project';

import type { CountField, DateField, MilestoneRow } from './milestones';
import {
  DocDelete, DocFileActions, DocUpload,
} from '@/components/DocFiles';
import { DocReview } from '@/components/project/DocReview';
import { DatePicker } from '@/components/DatePicker';

import { Badge, Btn, Empty, Err, FIELD_CELL } from '@/components/ui';

import { DATE_CELL, ROW, ROW_STACK, RowLabel } from './shell';

/**
 * 충전기 모델 — 등록된 목록에서 고른다 (한백 지시 2026-08-26).
 *
 * 이름을 손으로 적지 않는 이유: 같은 모델이 「BAS1007.D1.1」·「BAS1007-D1-1」로 갈리면
 * 나중에 모델별로 세지 못한다. 목록에 없으면 한백이 그 자리에서 등록한다 —
 * 등록하러 다른 화면으로 보내면 고르던 일이 끊긴다.
 *
 * 내린 모델(active=false)도 고른 값이면 보여준다 — 옛 현장의 값이 사라지면 안 된다.
 */
export function ModelRow({
  value, canEdit, canRegister, busy, onSave,
}: {
  value: string | null;
  canEdit: boolean;
  /** 목록에 없는 모델을 그 자리에서 등록할 수 있는가 — 한백만 */
  canRegister: boolean;
  busy: boolean;
  onSave: (id: string | null) => void;
}) {
  const [models, setModels] = useState<ChargerModel[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch('/api/charger-models')
      .then((r) => (r.ok ? (r.json() as Promise<{ models: ChargerModel[] }>) : null))
      .then((d) => { if (alive && d) setModels(d.models); })
      .catch(() => { /* 목록이 안 뜰 뿐 — 화면을 막지 않는다 */ });
    return () => { alive = false; };
  }, []);

  const chosen = models?.find((m) => m.id === value) ?? null;
  /* 고를 수 있는 것은 살아 있는 모델 + 이미 고른 것(내려간 모델이어도 남긴다) */
  const options = (models ?? []).filter((m) => m.active || m.id === value);

  async function register() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/charger-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) { setError(body.error ?? '등록하지 못했습니다.'); return; }
      setModels((prev) => [...(prev ?? []), { id: body.id!, name: trimmed, maker: null, note: null, active: true }]);
      onSave(body.id);           // 등록한 것을 바로 고른 상태로 — 두 번 누르게 하지 않는다
      setAdding(false);
      setName('');
    } catch {
      setError('등록 중 오류가 났습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={ROW}>
      <RowLabel>충전기 모델</RowLabel>
      {!canEdit ? (
        chosen ? <span className="font-semibold text-slate-800">{chosen.name}</span> : <Empty kind="miss" />
      ) : adding ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void register(); }}
            placeholder="모델명 — 예: BAS1007.D1.1"
            className={`${FIELD_CELL} w-56`}
          />
          <Btn size="sm" busy={saving} busyLabel="등록 중…" disabled={!name.trim()} onClick={() => void register()}>
            등록하고 고르기
          </Btn>
          <Btn size="sm" kind="quiet" disabled={saving} onClick={() => { setAdding(false); setName(''); setError(null); }}>
            취소
          </Btn>
          <Err>{error}</Err>
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <select
            aria-label="충전기 모델"
            value={value ?? ''}
            disabled={busy || models === null}
            onChange={(e) => onSave(e.target.value || null)}
            className={`${FIELD_CELL} w-56`}
          >
            <option value="">{models === null ? '불러오는 중…' : '미지정'}</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.active ? '' : ' (중지)'}</option>
            ))}
          </select>
          {/* 목록에 없는 모델은 여기서 등록한다 — 다른 화면으로 보내면 고르던 일이 끊긴다 */}
          {canRegister && (
            <Btn size="sm" kind="quiet" onClick={() => setAdding(true)}>새 모델</Btn>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * 수량 한 줄 — 수령 수량(충전기·모뎀)과 설치 실적(거점·기)이 같은 모양을 쓴다.
 * 숫자는 칸을 떠날 때 저장한다. 오른쪽 끝의 비교 기준(계약 N대)이 다르면 노랗게 —
 * 맞는지 물으러 갈 곳이 따로 없어야 한다.
 */
export function CountsRow({
  label, items, canEdit, busyKey, onSave, compare,
}: {
  label: string;
  items: Array<{ field: CountField; unit: string; prefix?: string; value: number | null }>;
  canEdit: boolean;
  busyKey: string | null;
  onSave: (field: CountField, raw: string, before: number | null) => void;
  compare?: { label: string; mismatch: boolean };
}) {
  const any = items.some((c) => c.value !== null);
  return (
    <div className={ROW}>
      <RowLabel>{label}</RowLabel>
      {canEdit ? (
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {items.map((c) => (
            <span key={c.field} className="flex items-center gap-1">
              {c.prefix && <span className="text-small text-slate-500">{c.prefix}</span>}
              <input
                type="number"
                min={0}
                inputMode="numeric"
                aria-label={`${c.prefix ?? label} ${c.unit} 수`}
                defaultValue={c.value ?? ''}
                disabled={busyKey === c.field}
                onBlur={(e) => onSave(c.field, e.target.value, c.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className={`w-16 rounded-ctl border px-2 py-1 text-right font-semibold tabular-nums transition focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                  c.value !== null
                    ? 'border-slate-200 text-slate-800'
                    : 'border-dashed border-slate-300 text-slate-400'
                } ${busyKey === c.field ? 'opacity-50' : 'hover:border-brand-300'}`}
              />
              <span className="text-slate-500">{c.unit}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className={`font-semibold tabular-nums ${any ? 'text-slate-800' : 'text-slate-300'}`}>
          {any
            ? items.map((c) => `${c.prefix ? `${c.prefix} ` : ''}${c.value ?? '—'}${c.unit}`).join(' · ')
            : '비어 있음'}
        </span>
      )}
      {/* 비교 기준은 끝으로 — 빈 칸(flex-1)으로 밀면 wrap 줄에서 혼자 한 줄을 차지한다 */}
      {compare && (
        <span className={`ml-auto text-tiny font-semibold ${compare.mismatch ? 'text-amber-700' : 'text-slate-400'}`}>
          {compare.label}
        </span>
      )}
    </div>
  );
}

/** 날짜 한 줄 — 시공사 칸은 입력칸, 한백 전용 칸은 시공사에게 글자로 굳는다 */
export function DateRow({
  m, canEdit, lockedForPartner, busy, onSave,
}: {
  m: MilestoneRow;
  canEdit: boolean;
  /** 볼 수는 있는 사람에게 잠긴 칸인가 — 왜 입력칸이 아닌지 그 자리에서 말한다 */
  lockedForPartner: boolean;
  busy: boolean;
  onSave: (field: DateField, value: string) => void;
}) {
  return (
    <div className={ROW}>
      <RowLabel>{m.label}</RowLabel>
      {canEdit ? (
        <DatePicker
          ariaLabel={m.label}
          value={m.value}
          disabled={busy}
          onChange={(v) => onSave(m.field, v ?? '')}
        />
      ) : (
        <span
          className={`${DATE_CELL} font-semibold tabular-nums ${m.value ? 'text-slate-800' : 'text-slate-300'}`}
          title={lockedForPartner ? '한백이 적는 칸입니다' : undefined}
        >
          {m.value ?? (lockedForPartner ? '한백 입력 대기' : '비어 있음')}
        </span>
      )}
      {/* 날짜가 들어오면 기성 트리거가 열린다 — 사람이 봐야 하는 것이라 노랑이다 */}
      {m.trigger && (
        <span className="ml-auto">
          <Badge tone={m.value ? 'warn' : 'mute'}>{m.trigger} 트리거</Badge>
        </span>
      )}
    </div>
  );
}

/**
 * 서류 한 줄 — 이름·상태·날짜·액션이 한 줄에 선다.
 * 카드였을 때는 서류 하나가 화면 한 칸을 통째로 먹었다.
 * 「제출됨」이 통과다 — 공정 게이트(lib/process.ts)도 uploaded 를 통과로 본다.
 */
export function DocRow({
  projectId, siteName, spec, doc, canDelete, canRemove, canReview, onReject,
}: {
  projectId: string;
  siteName: string;
  spec: { key: string; name: string };
  doc: ProjectDetail['process']['docs'][number] | undefined;
  canDelete: boolean;
  /** 파일 한 장을 뺄 수 있는가 — 올리는 쪽(한백·그 현장 시공사)이면 뺄 수도 있다 */
  canRemove: boolean;
  /**
   * ★칸별로 반려할 수 있는가★ — 한백만 (한백 지시 2026-08-31).
   * 그전에는 단계 전체 판정(「보완 필요」)의 사유 글로 어느 칸이 문제인지 풀어 썼다.
   * 계약 서류는 이미 칸마다 반려하는데 공정만 그 자리가 없었다.
   */
  canReview?: boolean;
  /** 반려한 뒤 단계를 옮기는 일 — 어디로 갈지는 부르는 쪽이 안다(준공서류 → 준공보완) */
  onReject?: () => void;
}) {
  const done = doc?.status === 'uploaded' || doc?.status === 'approved';
  const rejected = doc?.status === 'rejected';
  const files = doc?.files.length ?? 0;
  return (
    /*
     * ★이름은 왼쪽 열, 나머지는 오른쪽 열에 쌓는다★
     * (한백 지적 2026-09-04 「서류 업로드하면 UI 가 틀어진다」 · 「파일들을 제출됨 왼쪽정렬」).
     *
     *   칸 이름 │ 상태 · 날짜 · 조작 단추
     *          │ ─────  파일 목록 (한 장에 한 줄: 미리보기 판 · 이름 · 받기 · 빼기)
     *          │ ─────  반려 사유
     *
     * 파일 목록이 「제출됨」과 같은 세로선에서 시작한다 — 들여쓰기를 손으로 적지 않고
     * 이름을 진짜 열로 세워서 얻는다. 폭·여백은 ./shell 이 정한다(RowLabel·ROW_STACK).
     *
     * 전에는 파일 목록이 이름·단추와 ★같은 flex 줄★에 있었다. DocFileActions 는 파일을
     * 세로로 쌓는 flex-col 이고 미리보기 판이 h-24(96px)라, 한 장만 올라와도 그 줄이
     * 96px 로 커지고 items-center 가 칸 이름·상태·날짜·단추를 그 가운데로 끌어내렸다 —
     * 여러 장이면 더 내려간다. 오른쪽 끝으로 미는 빈 칸(flex-1)도 wrap 줄에서 혼자
     * 한 줄을 차지해 삭제 단추를 엉뚱한 자리로 보냈다.
     *
     * ★계약 탭이 2026-08-25 에 같은 증상으로 이미 세 구역으로 갈랐다★
     * (IntakeTab 의 「카드를 세 구역으로 나눈다」) — 시공 탭만 그 고침을 못 받고 있었다.
     * 구역은 얇은 선으로만 가른다(화면 규칙 1). 파일이 없으면 선도 안 그린다 — 빈 줄에
     * 선만 그으면 칸마다 쓸모없는 층이 하나 늘어난다.
     */
    /* relative — 끌어다 놓는 덮개가 이 줄을 덮는다(DocFiles 의 DocUpload) */
    <div className={ROW_STACK}>
      <RowLabel>{spec.name}</RowLabel>

      {/* min-w-0 — 이것이 없으면 긴 파일 이름이 열을 밀어내 truncate 가 안 걸린다 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/*
          * 상태·버튼이 붙어 앉는다 — 예전엔 버튼을 오른쪽 끝으로 밀어서(ml-auto)
          * 넓은 화면에서 이름과 버튼이 양쪽 끝에 떨어져 있었다(한백 지적). 되돌리기 어려운
          * 삭제만 끝으로 민다(화면 규칙 8).
          */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`text-tiny font-black ${
            rejected ? 'text-red-700' : done ? 'text-brand-700' : 'text-slate-400'
          }`}>
            {rejected ? '반려' : done ? '제출됨' : '대기'}
          </span>
          {doc?.uploadedAt && <span className="text-tiny tabular-nums text-slate-400">{doc.uploadedAt}</span>}
          {/* 파일 실체가 없는 기록 — 옛 데이터에 있다. 제출됨으로만 보이면 볼 수도 없는 서류를 믿게 된다 */}
          {done && !doc?.blobUrl && (
            <span className="text-tiny font-bold text-amber-700" title="기록만 있고 파일이 없습니다 — 다시 올려주세요">
              파일 없음
            </span>
          )}
          {/* 부품은 자기 여백을 갖지 않는다 — 자리는 이 줄이 정한다(gap) */}
          <span className="flex flex-wrap items-center gap-1.5">
            <DocUpload projectId={projectId} kind={spec.key} rejected={rejected} fileCount={files} />
            {/*
              시공 서류는 파일 있는 칸만 반려한다 — 공정 서류의 미제출은 단계(준공서류 제출)가
              이미 막고 있어 칸마다 돌려보낼 일이 없다. 미제출 반려는 계약 탭의 일이다
              (한백 지시 2026-09-03 — 저장소는 양쪽 다 허락하고, 세울지는 화면이 정한다).
            */}
            {canReview && doc?.blobUrl && (
              <DocReview
                projectId={projectId}
                kind={spec.key}
                status={doc.status}
                onRejected={onReject}
              />
            )}
          </span>
          {/* 지우기는 한백만 — 협력사는 다시 올리는 것으로 고친다(덮어쓴다) */}
          {canDelete && doc && doc.status !== 'none' && (
            <span className="ml-auto">
              <DocDelete
                projectId={projectId}
                kind={spec.key}
                label={spec.name}
                filename={doc.filename}
                count={doc.files.length}
              />
            </span>
          )}
        </div>

        {/* 파일 목록 — 이름·단추와 같은 줄에 두지 않는다(위 머리말) */}
        {doc && files > 0 && (
          <div className="border-t border-slate-900/[0.07] pt-1.5">
            <DocFileActions
              doc={doc}
              siteName={siteName}
              label={spec.name}
              projectId={projectId}
              canRemove={canRemove}
            />
          </div>
        )}

        {/* 왜 돌려보냈는지 — 사유가 없으면 시공사는 무엇을 고칠지 알 수 없다 */}
        {rejected && doc?.rejectReason && (
          <p className="rounded-ctl bg-red-50 px-2.5 py-1.5 text-tiny leading-snug text-red-800">
            {doc.rejectReason}
          </p>
        )}
      </div>
    </div>
  );
}


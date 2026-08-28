'use client';

import {
  useEffect, useState,
} from 'react';
import type {
  ChargerModel, ProjectDetail,
} from '@/types/project';

import type { CheckField, CountField, DateField, GroupCheck, MilestoneRow } from './milestones';
import {
  DocDelete, DocFileActions, DocUpload,
} from '@/components/DocFiles';
import { DatePicker } from '@/components/DatePicker';

import {
  Badge, Btn, Empty, Err, FIELD, FIELD_CELL,
} from '@/components/ui';

/**
 * 수량 한 줄 — 수령 수량(충전기·모뎀)과 설치 실적(거점·기)이 같은 모양을 쓴다.
 * 숫자는 칸을 떠날 때 저장한다. 오른쪽 끝의 비교 기준(계약 N대)이 다르면 노랗게 —
 * 맞는지 물으러 갈 곳이 따로 없어야 한다.
 */
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
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 text-slate-500">충전기 모델</span>
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
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 text-slate-500">{label}</span>
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
      <span className="flex-1" />
      {compare && (
        <span className={`text-tiny font-semibold ${compare.mismatch ? 'text-amber-700' : 'text-slate-400'}`}>
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
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 text-slate-500">{m.label}</span>
      {canEdit ? (
        <DatePicker
          ariaLabel={m.label}
          value={m.value}
          disabled={busy}
          onChange={(v) => onSave(m.field, v ?? '')}
        />
      ) : (
        <span
          className={`w-[150px] font-semibold tabular-nums ${m.value ? 'text-slate-800' : 'text-slate-300'}`}
          title={lockedForPartner ? '한백이 적는 칸입니다' : undefined}
        >
          {m.value ?? (lockedForPartner ? '한백 입력 대기' : '비어 있음')}
        </span>
      )}
      <span className="flex-1" />
      {/* 날짜가 들어오면 기성 트리거가 열린다 — 사람이 봐야 하는 것이라 노랑이다 */}
      {m.trigger && (
        <Badge tone={m.value ? 'warn' : 'mute'}>{m.trigger} 트리거</Badge>
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
  projectId, siteName, spec, doc, canDelete, canRemove,
}: {
  projectId: string;
  siteName: string;
  spec: { key: string; name: string };
  doc: ProjectDetail['process']['docs'][number] | undefined;
  canDelete: boolean;
  /** 파일 한 장을 뺄 수 있는가 — 올리는 쪽(한백·그 현장 시공사)이면 뺄 수도 있다 */
  canRemove: boolean;
}) {
  const done = doc?.status === 'uploaded' || doc?.status === 'approved';
  return (
    /*
     * 이름·상태·버튼이 붙어 앉는다 — 예전엔 버튼을 오른쪽 끝으로 밀어서(ml-auto)
     * 넓은 화면에서 이름과 버튼이 양쪽 끝에 떨어져 있었다(한백 지적). 되돌리기 어려운
     * 삭제만 끝으로 민다(화면 규칙 8).
     */
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 text-slate-500">{spec.name}</span>
      <span className={`text-tiny font-black ${done ? 'text-brand-700' : 'text-slate-400'}`}>
        {done ? '제출됨' : '대기'}
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
        {doc && (
          <DocFileActions
            doc={doc}
            siteName={siteName}
            label={spec.name}
            projectId={projectId}
            canRemove={canRemove}
          />
        )}
        <DocUpload projectId={projectId} kind={spec.key} rejected={false} hasFile={Boolean(doc?.blobUrl)} />
      </span>
      <span className="flex-1" />
      {/* 지우기는 한백만 — 협력사는 다시 올리는 것으로 고친다(덮어쓴다) */}
      {canDelete && doc && doc.status !== 'none' && (
        <span>
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
  );
}

/**
 * 완료 선언 한 줄 — 이 묶음의 일을 끝냈다는 사람의 선언.
 *
 * ★체크박스가 아니라 단추다★ (한백 지시 2026-08-26). 이 선언은 단계를 넘기는 일이라
 * (CHECK_ADVANCES) 스치는 클릭으로 일어나서는 안 되고, 무엇이 모자라 못 누르는지
 * 이름에 적혀야 한다(화면 규칙 3). 체크박스는 눌러 봐야 되는지 알 수 있었다.
 *
 * 끝낸 뒤에는 날짜와 함께 굳고, 되돌리는 단추가 반대쪽 끝에 선다(규칙 7·8).
 */
/**
 * 다음 단계로 미는 줄 — 단추는 언제나 있고, 조건이 안 찼으면 흐리다.
 *
 * ★단추를 없애지 않는 이유★ (한백 지시 2026-08-26) — 조건이 찰 때만 단추가 나타나면,
 * 무엇을 더 채워야 다음으로 가는지 화면에 없다. 자리에 두고 이름에 이유를 적으면
 * 그 줄만 보고도 남은 일을 안다(화면 규칙 3).
 */
export function AdvanceRow({
  label, blockers, canEdit, busy, onGo,
}: {
  label: string;
  /** 없는 것들 — 비어 있으면 단추가 열린다. 판정은 lib/process 가 한다 */
  blockers: string[];
  canEdit: boolean;
  busy: boolean;
  onGo: () => void;
}) {
  if (!canEdit) return null;
  const ready = blockers.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
      <Btn disabled={!ready} busy={busy} busyLabel="넘기는 중…" onClick={onGo}>
        {ready ? `${label} →` : `${blockers[0]} 필요`}
      </Btn>
      {/* 둘 이상 비었으면 남은 것도 적는다 — 하나 채우고 또 막히는 일을 줄인다 */}
      {blockers.length > 1 && (
        <span className="text-tiny font-semibold text-slate-400">
          그리고 {blockers.slice(1).join(' · ')}
        </span>
      )}
    </div>
  );
}

/**
 * 할지 말지 먼저 고르는 줄 — 「필요」·「불필요」 두 단추.
 *
 * 예전에는 「행위신고 불필요」라는 체크 한 줄이었다. 이름과 단추가 같은 말을 두 번 해서
 * 무엇을 고르는 자리인지 읽히지 않았고, 「필요」라고 정한 것을 남길 곳도 없었다
 * (한백 지적 2026-08-26). 고르면 글자로 굳고, 되돌리는 자리는 반대쪽 끝이다(화면 규칙 4·8).
 */
export function NeedRow({
  need, requiredAt, skippedAt, canEdit, busy, onPick,
}: {
  need: { field: CheckField; skipField: CheckField; label: string; yes: string; no: string };
  requiredAt: string | null;
  skippedAt: string | null;
  canEdit: boolean;
  busy: boolean;
  onPick: (field: CheckField, checked: boolean) => void;
}) {
  const picked = requiredAt ? need.yes : skippedAt ? need.no : null;
  const at = requiredAt ?? skippedAt;

  return (
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 font-bold text-slate-700">{need.label}</span>
      {picked ? (
        <>
          <span className={`font-bold ${requiredAt ? 'text-brand-800' : 'text-slate-500'}`}>
            {picked} · {at}
          </span>
          {canEdit && (
            <Btn
              kind="quiet"
              size="sm"
              busy={busy}
              busyLabel="되돌리는 중…"
              onClick={() => onPick(requiredAt ? need.field : need.skipField, false)}
              className="ml-auto"
            >
              되돌리기
            </Btn>
          )}
        </>
      ) : canEdit ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {/* 대상을 고르면 아래 줄(신고일·서류)이 열리고, 아니면 진행 단추만 남는다 */}
          <Btn size="sm" busy={busy} busyLabel="처리 중…" onClick={() => onPick(need.field, true)}>
            {need.yes}
          </Btn>
          <Btn size="sm" kind="quiet" busy={busy} busyLabel="처리 중…" onClick={() => onPick(need.skipField, true)}>
            {need.no}
          </Btn>
        </span>
      ) : (
        <Empty kind="miss" />
      )}
    </div>
  );
}

export function CheckRow({
  check, value, canEdit, busy, onToggle,
}: {
  check: GroupCheck;
  value: string | null;
  canEdit: boolean;
  busy: boolean;
  onToggle: (field: CheckField, checked: boolean) => void;
}) {
  const done = Boolean(value);

  return (
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 font-bold text-slate-700">{check.label}</span>
      {done ? (
        <>
          <span className="font-bold text-brand-800">완료 · {value}</span>
          {/* 되돌리기는 반대쪽 끝 — 자주 누르는 것과 붙여 두지 않는다(규칙 8) */}
          {canEdit && (
            <Btn
              kind="quiet"
              size="sm"
              busy={busy}
              busyLabel="되돌리는 중…"
              onClick={() => onToggle(check.field, false)}
              className="ml-auto"
            >
              되돌리기
            </Btn>
          )}
        </>
      ) : canEdit ? (
        <Btn
          size="sm"
          disabled={!check.ready}
          busy={busy}
          busyLabel="처리 중…"
          onClick={() => onToggle(check.field, true)}
        >
          {/* 막는 것을 이름에 적는다 — 흐린 단추만으로는 왜 안 되는지 알 수 없다 */}
          {check.ready ? check.label : check.blocked}
        </Btn>
      ) : (
        <span className="font-bold text-slate-400">미완</span>
      )}
    </div>
  );
}

/**
 * 준공서류 검토 판정 — 한백만, 제출 완료 선언 뒤에만 선다.
 *
 * 이상 없으면 준공으로 확정하고, 아니면 사유와 함께 「준공보완」으로 보낸다.
 * 보완은 사유가 필수다 — 사유 없는 보완은 시공사가 무엇을 고칠지 모른다(반려와 같은 규칙).
 * 사유는 진행현황 메모로 남는다 — 보완 전달 채널이 정해질 때까지의 자리.
 */
export function CompletionReview({
  busy, onApprove, onFix,
}: {
  busy: boolean;
  onApprove: () => void;
  onFix: (reason: string) => void;
}) {
  const [fixing, setFixing] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <div className="max-w-2xl rounded-box border border-brand-200 bg-brand-50/40 px-3.5 py-3">
      <p className="text-tiny font-bold tracking-[0.06em] text-slate-500">검토 판정</p>
      {fixing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            rows={2}
            placeholder="보완할 내용 — 진행현황에 남아 시공사가 봅니다"
            className={FIELD}
          />
          <div className="flex items-center gap-2">
            <Btn
              size="sm"
              kind="side"
              busy={busy}
              busyLabel="보내는 중…"
              disabled={!reason.trim()}
              onClick={() => onFix(reason.trim())}
            >
              보완으로 보내기
            </Btn>
            <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setFixing(false)}>
              취소
            </Btn>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Btn size="sm" busy={busy} busyLabel="처리 중…" onClick={onApprove}>
            이상 없음 — 준공으로
          </Btn>
          <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setFixing(true)}>
            보완 필요
          </Btn>
        </div>
      )}
    </div>
  );
}


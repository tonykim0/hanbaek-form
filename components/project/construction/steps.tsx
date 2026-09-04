'use client';

/**
 * 걸음을 옮기는 줄 — 다음으로 미는 단추 · 필요/불필요 · 완료 선언 · 준공 검토.
 *
 * 날짜·서류·수량을 「적는 줄」(rows.tsx)과 갈라 둔다. 이쪽은 값을 적는 자리가 아니라
 * 사람이 「끝냈다」·「안 한다」·「다음으로」를 선언하는 자리다 — 눌리는 조건과 되돌리는
 * 길이 규칙(화면 규칙 3·7·8)의 무게가 여기 걸린다.
 */
import { useState } from 'react';

import type { CheckField, GroupCheck } from './milestones';

import { Btn, Empty, FIELD } from '@/components/ui';

import { ROW, RowLabel } from './shell';

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
    /* 이름 열이 없는 줄 — 단추가 왼쪽 끝에서 시작한다. 여백·틈은 다른 줄과 같다 */
    <div className={ROW}>
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
    <div className={ROW}>
      <RowLabel strong>{need.label}</RowLabel>
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

/**
 * 완료 선언 한 줄 — 이 묶음의 일을 끝냈다는 사람의 선언.
 *
 * ★체크박스가 아니라 단추다★ (한백 지시 2026-08-26). 이 선언은 단계를 넘기는 일이라
 * (CHECK_ADVANCES) 스치는 클릭으로 일어나서는 안 되고, 무엇이 모자라 못 누르는지
 * 이름에 적혀야 한다(화면 규칙 3). 체크박스는 눌러 봐야 되는지 알 수 있었다.
 *
 * 끝낸 뒤에는 날짜와 함께 굳고, 되돌리는 단추가 반대쪽 끝에 선다(규칙 7·8).
 */
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
    <div className={ROW}>
      <RowLabel strong>{check.label}</RowLabel>
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
/**
 * 준공서류 검토 판정 — 한백이 본다.
 *
 * ★반려는 언제든, 승인은 다 낸 뒤에★ (한백 지시 2026-08-31). 그전에는 둘 다 시공사의
 * 「준공서류 제출 완료」 선언 뒤에만 열렸다 — 잘못된 서류가 이미 올라와 있어도 선언
 * 전에는 한백이 아무 말도 못 했고, 선언을 안 하고 두면 그대로 멈춰 있었다.
 * 검수를 「예외를 걸러내는 방식」으로 둔 것과 같은 결이다: 제출된 것은 기본이 통과이고
 * 문제 있는 것만 돌려보낸다 — 돌려보내는 데 「다 냈다」는 선언이 필요할 이유가 없다.
 *
 * 승인은 다르다. 다 냈다는 선언 없이 준공으로 넘기면 빠진 서류가 그대로 묻힌다.
 * 못 누르는 이유는 단추 이름에 적는다(화면 규칙 3).
 */
export function CompletionReview({
  busy, submitted, onApprove, onFix,
}: {
  busy: boolean;
  /** 시공사가 「준공서류 제출 완료」를 눌렀는가 — 승인만 이것을 요구한다 */
  submitted: boolean;
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
          <Btn
            size="sm"
            busy={busy}
            busyLabel="처리 중…"
            disabled={!submitted}
            onClick={onApprove}
          >
            {submitted ? '이상 없음 — 준공완료로' : '준공서류 제출 완료 전 — 준공 불가'}
          </Btn>
          <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setFixing(true)}>
            보완 필요
          </Btn>
        </div>
      )}
    </div>
  );
}


'use client';

/**
 * 협력사 지급 탭 — 지급조건 · 계약 라인 · 지급. 기성은 딴 탭이다(ReceivableTab).
 *
 * 「정산」 한 탭에 지급과 기성이 같이 있었는데 갈랐다(한백 확인) — 지급은 협력사와
 * 같이 보는 화면이고 기성은 한백만 보는 화면이라, 섞여 있으면 어디까지 보여도 되는지
 * 매번 따져야 한다.
 *
 * 협력사에게는 자기 몫만 보인다. 가리는 것이 아니라 저장소에서 지워서 온다
 * (redactForViewer) — 서버가 렌더한 데이터는 브라우저에 통째로 실린다.
 */
import { Fragment, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type {
  CpoName, PayoutCategory, PayoutEntry, PayoutKind, ProjectDetail, SettlementRule,
  SettlementRuleChoice, SettlementStep,
} from '@/types/project';
import { PAYOUT_CATEGORIES, replLabel } from '@/types/project';
import {
  adjustEntriesOf, collectionRate, distributionUnit, entryTypeOf, payoutSideOf, payoutStepsOf,
  STEP_LABEL, STEP_TONE, triggerSource, turnkeyUnit,
} from '@/lib/settlement';
import type { Visibility } from '@/lib/roles';
import type { RuleOptions } from '@/lib/pricing-match';
import { useAction } from '@/lib/use-action';
import { won } from '@/lib/format';
import { today } from '@/lib/date';
import {
  Badge, Btn, Choice, Confirm, Empty, Err, FIELD, FIELD_BASE, FIELD_CELL, HR, Note, Saved, Tag,
  Td, Th,
} from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';

// ── 정산 탭 ─────────────────────────────────────────────────────
const STEP_STYLE: Record<SettlementStep['state'], string> = {
  na: 'border-l-slate-200 bg-white',
  waiting: 'border-l-slate-300 bg-white',
  open: 'border-l-amber-500 bg-amber-50/70',
  collected: 'border-l-brand-500 bg-brand-50/60',
};

export function SettlementTab({
  detail, vis, canReview, ruleOptions,
}: {
  detail: ProjectDetail;
  vis: Visibility;
  canReview: boolean;
  ruleOptions: RuleOptions | null;
}) {
  const { settlement, lines } = detail;

  return (
    <div className="flex flex-col gap-7">
      {/* 조건이 맨 위다(한백 확인) — 여기서 고른 케이스가 아래 모든 금액을 정한다 */}
      {canReview && ruleOptions && (
        <PayConditions
          projectId={detail.project.id}
          lines={lines}
          cpo={detail.project.cpo}
          ruleOptions={ruleOptions}
          confirmedAt={detail.project.payoutTermsConfirmedAt}
          paidCount={detail.payoutEntries.filter((e) => entryTypeOf(e.category) === '지급').length}
        />
      )}

      {/*
        * ★메모를 오른쪽 기둥에서 지급 내역 밑으로 내렸다 (한백 지시 2026-08-28).★
        * 380px 짜리 오른쪽 기둥에 있으면 표가 그만큼 좁아지고, 메모를 적으려면 눈이
        * 화면을 가로질러야 했다. 위에서 아래로 읽는 순서(조건 → 라인 → 지급 → 메모)가
        * 실제로 일하는 순서와도 같다.
        */}
      <ContractLines lines={lines} cpo={detail.project.cpo} vis={vis} />

      <PaymentSection
        projectId={detail.project.id}
        lines={lines}
        entries={detail.payoutEntries}
        salesOrg={detail.project.salesOrg}
        gcOrg={detail.project.gcOrg}
        vis={vis}
        canReview={canReview}
      />

      <PayNoteBox
        projectId={detail.project.id}
        payNote={settlement.payNote}
        canReview={canReview}
      />
    </div>
  );
}

/**
 * 기성 탭 — 한백만. 운영사에게서 받는 돈이라 협력사에게는 탭 자체가 없다.
 * 예전에는 정산 탭 안의 구역이었는데, 볼 수 없는 사람에게 자리를 보여줄 이유가 없어
 * 탭으로 갈랐다(한백 확인).
 */
export function ReceivableTab({
  detail, canReview, settlementRuleChoices,
}: {
  detail: ProjectDetail;
  canReview: boolean;
  /** 정산 규칙 후보 — 이름에 기성 모양이 들어 있어 한백이 아니면 null */
  settlementRuleChoices: SettlementRuleChoice[] | null;
}) {
  /*
   * 이 탭은 한백만 본다(DetailView 가 canReview 일 때만 그린다) — 그래도 admin 이
   * 없을 수 있다는 것을 타입이 말하므로 빈 값으로 받아 둔다. 협력사 응답에는 이 키가 없다.
   */
  const admin = detail.admin;
  const steps = admin?.steps ?? [];
  const rate = collectionRate(steps);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <RuleFact
          projectId={detail.project.id}
          rule={admin?.settlementRule ?? null}
          canEdit={canReview}
          choices={settlementRuleChoices}
        />
        <div className="flex flex-wrap items-baseline gap-3">
          {rate !== null && (
            <span className="text-tiny font-bold text-slate-500">
              수금률 <span className="tabular-nums text-slate-800">{rate}%</span>
            </span>
          )}
          <CloseDateFact
            projectId={detail.project.id}
            date={admin?.cpoCloseDate ?? null}
            canEdit={canReview}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((s) => (
          <div
            key={s.no}
            className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-box border border-slate-200 border-l-[3px] px-4 py-3 ${STEP_STYLE[s.state]}`}
          >
            <span className="w-10 shrink-0 text-tiny font-bold text-slate-400">{s.no}차</span>
            <div className="min-w-0 flex-1">
              <p className="text-lead font-bold text-slate-800">
                {s.trigger === '해당없음' ? '해당없음' : `${s.trigger} · ${s.basisLabel}`}
              </p>
              <p className="text-tiny text-slate-500">
                {s.state === 'na' ? '해당 차수 없음' : triggerSource(s.trigger)}
              </p>
            </div>
            {/* 규칙상 없는 차수는 배지가 아니라 빈 값이다(화면 규칙 10) */}
            {s.state === 'na' ? (
              <Empty kind="na" />
            ) : (
              <Badge tone={STEP_TONE[s.state]}>{STEP_LABEL[s.state]}</Badge>
            )}
            <span className="w-28 shrink-0 text-right text-lead font-black tabular-nums text-slate-800">
              {s.planAmount === null ? <span className="text-slate-300">—</span> : won(s.planAmount)}
            </span>
            <CollectControl projectId={detail.project.id} step={s} canEdit={canReview} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * 준공마감일 — 운영사가 통보하는 날. 평소엔 글자, 고칠 때만 달력(화면 규칙 4).
 *
 * 공정에서 유도할 수 없어 사람이 적는다. 대부분 마지막 기성(잔액)의 트리거라,
 * 이 칸이 비어 있으면 그 차수가 영원히 「대기」로 남는다 — 그래서 비었을 때를
 * 노랑으로 둔다(화면 규칙 10: 「미지정」은 넣어야 하는데 안 넣은 것이다).
 */
function CloseDateFact({
  projectId, date, canEdit,
}: {
  projectId: string;
  date: string | null;
  canEdit: boolean;
}) {
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);

  const save = (v: string | null) =>
    void run({
      url: `/api/projects/${projectId}/settlement`,
      body: { closeDate: v },
      fail: '준공마감일을 저장하지 못했습니다.',
    }).then((ok) => { if (ok) setEditing(false); });

  return (
    <span className="flex flex-wrap items-center gap-2 text-tiny font-bold text-slate-500">
      준공마감{' '}
      {editing ? (
        <>
          <DatePicker value={date} onChange={save} disabled={busy} ariaLabel="준공마감일" />
          <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setEditing(false)}>취소</Btn>
        </>
      ) : (
        <>
          {date ? (
            <span className="tabular-nums text-slate-800">{date}</span>
          ) : (
            <span className="text-amber-700">통보 없음</span>
          )}
          {canEdit && (
            <Btn size="sm" kind="quiet" onClick={() => setEditing(true)}>
              {date ? '수정' : '지정'}
            </Btn>
          )}
        </>
      )}
      <Err>{error}</Err>
    </span>
  );
}

/**
 * 기성 한 차수의 수금 기록.
 *
 * ★날짜와 금액을 같이 받는다.★ 「받았다」는 날짜로 표시하고, 받은 금액이 계획액과
 * 다르면 그 금액을 적는다 — 협의로 턴키단가와 다르게 받는 현장이 있다(예: 케이스는
 * 150만/기인데 190만/기로 협의). 금액을 비우면 계획액대로 받은 것이다.
 *
 * 조건이 안 찬 차수(waiting)에는 단추를 두지 않는다 — 무엇을 기다리는지는 같은 줄의
 * 배지와 트리거가 이미 말한다(화면 규칙 2·3).
 */
function CollectControl({
  projectId, step, canEdit,
}: {
  projectId: string;
  step: SettlementStep;
  canEdit: boolean;
}) {
  const { busy, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<string | null>(today());
  const [amount, setAmount] = useState('');

  if (step.state === 'na') return null;

  const send = (body: unknown, fail: string) =>
    void run({ url: `/api/projects/${projectId}/settlement`, body, fail })
      .then((ok) => { if (ok) { setOpen(false); setAmount(''); } });

  if (step.state === 'collected') {
    return (
      <span className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-tiny font-bold tabular-nums text-brand-800">
          {step.collectedAt}
          {step.collectedAmount !== null && step.collectedAmount !== step.planAmount && (
            <span className="ml-1 text-slate-600">받은 금액 {won(step.collectedAmount)}</span>
          )}
        </span>
        {canEdit && (
          <Btn
            size="sm" kind="quiet" busy={busy} busyLabel="되돌리는 중…"
            onClick={() => send({ collected: { no: step.no, at: null } }, '수금을 되돌리지 못했습니다.')}
          >
            되돌리기
          </Btn>
        )}
        <Err>{error}</Err>
      </span>
    );
  }

  if (!canEdit || step.state !== 'open') return null;

  if (!open) {
    return (
      <span className="flex shrink-0 items-center gap-2">
        <Btn size="sm" onClick={() => setOpen(true)}>수금 기록</Btn>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 flex-wrap items-center gap-2">
      <DatePicker value={at} onChange={setAt} disabled={busy} ariaLabel={`${step.no}차 수금일`} />
      <input
        type="text"
        inputMode="numeric"
        value={amount}
        disabled={busy}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder={step.planAmount === null ? '받은 금액' : `${won(step.planAmount)} (계획대로면 비움)`}
        aria-label={`${step.no}차 받은 금액`}
        className={`${FIELD} w-52 text-right tabular-nums`}
      />
      <Btn
        size="sm" busy={busy} busyLabel="저장 중…"
        disabled={!at}
        onClick={() => send(
          { collected: { no: step.no, at, amount: amount === '' ? null : Number(amount) } },
          '수금을 기록하지 못했습니다.'
        )}
      >
        {at ? '저장' : '수금일을 고르세요'}
      </Btn>
      <Btn size="sm" kind="quiet" disabled={busy} onClick={() => { setOpen(false); setAmount(''); }}>
        취소
      </Btn>
      <Err>{error}</Err>
    </span>
  );
}

/**
 * 정산 규칙 — 평소엔 글자, 고칠 때만 셀렉트(화면 규칙 4).
 *
 * 단가 케이스를 지정하면 제안값이 들어오지만, 그것은 현장에 규칙이 없을 때 한 번뿐이다.
 * 제안이 틀린 현장·제안값이 없는 케이스의 현장을 여기서 고친다 — 넣는 자리를 만들면
 * 고치는 자리도 만든다(규칙 7). 이 자리가 없어서 DB 를 직접 만져야 했다.
 *
 * 규칙이 없으면 아래 세 차수가 전부 「해당없음」에 금액 — 로 서는데, 그 이유가 이 줄이다 —
 * 미지정이 그 말이므로 따로 안내문을 두지 않는다.
 */
function RuleFact({
  projectId, rule, canEdit, choices,
}: {
  projectId: string;
  rule: SettlementRule | null;
  canEdit: boolean;
  choices: SettlementRuleChoice[] | null;
}) {
  const { busy, error, setError, run } = useAction();
  const [editing, setEditing] = useState(false);

  const pick = (ruleId: string) =>
    void run({
      url: `/api/projects/${projectId}/settlement-rule`,
      body: { ruleId: ruleId || null },
      fail: '정산 규칙을 적용하지 못했습니다.',
    }).then((ok) => { if (ok) setEditing(false); });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-tiny font-bold tracking-[0.04em] text-slate-400">정산 규칙</span>
      {editing && choices ? (
        <>
          <select
            autoFocus
            value={rule?.id ?? ''}
            disabled={busy}
            onChange={(e) => pick(e.target.value)}
            className={`${FIELD} max-w-[420px]`}
          >
            <option value="">미지정</option>
            {/*
              * 적용된 중지 규칙은 후보에 없다 — 그대로 두면 셀렉트가 빈칸으로 그려져,
              * 빈칸인 줄 알고 고르다 멀쩡한 현장이 미지정이 된다(단가 셀렉트와 같은 이유).
              */}
            {rule && !choices.some((c) => c.id === rule.id) && (
              <option value={rule.id}>{rule.name} (중지됨)</option>
            )}
            {choices.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Btn size="sm" kind="quiet" disabled={busy} onClick={() => { setEditing(false); setError(null); }}>
            취소
          </Btn>
          <Err>{error}</Err>
        </>
      ) : (
        <>
          {rule
            ? <span className="text-base font-bold text-slate-800">{rule.name}</span>
            : <Empty kind="miss" />}
          {canEdit && choices && (
            <Btn size="sm" kind="quiet" onClick={() => setEditing(true)}>
              {rule ? '수정' : '지정'}
            </Btn>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 계약 라인 · 단가 — 지급조건 바로 아래.
 *
 * 읽는 자리다. 케이스를 고르는 것은 위 「지급조건」에서 한다 — 고르는 자리를 두 곳에 두면
 * 어느 쪽이 정본인지 알 수 없게 된다. 확정일은 안 적는다(한백 확인) — 언제 골랐는지는
 * 감사 기록의 일이고, 이 표는 무엇이 적용 중인지만 말한다.
 */
function ContractLines(
  { lines, cpo, vis }: { lines: ProjectDetail['lines']; cpo: CpoName; vis: Visibility }
) {
  return (
    <section>
      <h2 className="mb-2 text-h3 font-black text-slate-900">적용조건</h2>
      <div className="overflow-x-auto rounded-box border border-slate-200">
        <table className="w-full min-w-[560px] text-base">
          <thead className="bg-slate-50 text-tiny font-bold tracking-[0.08em] text-slate-500">
            <tr>
              <Th tight className="py-2">라인</Th>
              <Th tight className="py-2">적용 단가 케이스</Th>
              <Th tight num className="py-2">영업비/대</Th>
              <Th tight num className="py-2">시공비/대</Th>
              {/*
                * 협력사가 말하는 턴키단가 = 영업비 + 시공비 (배포가, 한백 확인).
                * 마진은 이 탭에 없다 — 운영사 쪽 금액(마진 포함 턴키)은 기성 탭의 일이다.
                * 양쪽을 다 보는 사람(턴키업체·한백)에게만 합이 뜬다.
                */}
              {vis.sales && vis.cons && <Th tight num className="py-2">턴키단가/대</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => (
              <tr key={l.id}>
                <Td tight className="whitespace-nowrap py-2 font-bold text-slate-800">
                  {l.termYears}년 × {l.qty}대
                  {[l.replType, l.powerType].filter(Boolean).length > 0 && (
                    <span className="ml-1.5 text-tiny font-semibold text-slate-400">
                      {[l.replType && replLabel(cpo, l.replType), l.powerType]
                        .filter(Boolean).join(' · ')}
                    </span>
                  )}
                </Td>
                <Td tight className="py-2 text-slate-600">
                  {l.rule ? (
                    l.rule.caseName
                  ) : (
                    <span className="text-slate-400">미지정 — 위 「지급조건」에서 고릅니다</span>
                  )}
                </Td>
                <Money show={vis.sales} value={l.rule?.salesUnit ?? null} />
                <Money show={vis.cons} value={l.rule?.consUnit ?? null} />
                {vis.sales && vis.cons && (
                  <Money show value={l.rule ? distributionUnit(l.rule) : null} />
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Money({ show, value }: { show: boolean; value: number | null }) {
  if (!show) {
    return (
      <Td tight num className="py-2">
        <Tag>권한 없음</Tag>
      </Td>
    );
  }
  return (
    <Td tight num className="whitespace-nowrap py-2 font-semibold text-slate-800">
      {value === null ? <span className="text-slate-300">—</span> : won(value)}
    </Td>
  );
}

// ── 지급조건 ────────────────────────────────────────────────────
/**
 * 지급조건 — 라인마다 단가 케이스를 고른다. 탭 맨 위다(한백 확인).
 *
 * 「지급」 구역 안에 있었는데 이름을 바꿔 앞으로 뺐다 — 여기서 고른 케이스가
 * 계약 라인 표와 지급 카드의 모든 금액을 정하므로, 뿌리가 열매보다 먼저 보여야 한다.
 * 라인 이름과 셀렉트를 한 줄에 둔다 — 박스가 세로로 길면 조건 두 개에 화면 반이 나간다.
 */
function PayConditions({
  projectId, lines, cpo, ruleOptions, confirmedAt, paidCount,
}: {
  projectId: string;
  lines: ProjectDetail['lines'];
  /** 교체유형 표기가 운영사로 갈린다 — 안 가르는 운영사는 「자체투자」 한 마디다 */
  cpo: CpoName;
  ruleOptions: RuleOptions;
  /** 확정한 날 — 값이 있으면 잠긴 것이다 */
  confirmedAt: string | null;
  /** 이미 나간 지급 건수 — 해제할 때 무엇이 걸려 있는지 말해 준다 */
  paidCount: number;
}) {
  const { busy, error, run } = useAction();
  const locked = Boolean(confirmedAt);
  const unpriced = lines.filter((l) => !l.pricingRuleId).length;

  const pickRule = (lineId: string, ruleId: string) =>
    void run({
      url: `/api/projects/${projectId}/lines/${lineId}`,
      method: 'PATCH',
      body: { pricingRuleId: ruleId || null },
      fail: '단가 지정에 실패했습니다.',
    });

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="text-h3 font-black text-slate-900">지급조건</h2>
        {locked ? (
          <>
            <Badge tone="ok">확정 {confirmedAt}</Badge>
            {/*
              * 해제는 되돌릴 길이다(화면 규칙 7). 이미 나간 지급이 있으면 그 사실을
              * 단추 이름에 적는다 — 무엇이 걸려 있는지 모르고 풀지 않도록(규칙 3).
              */}
            <Btn
              kind="undo" size="sm" busy={busy} busyLabel="해제 중…"
              onClick={() => void run({
                url: `/api/projects/${projectId}/payout-terms`,
                body: { confirmed: false },
                fail: '확정을 해제하지 못했습니다.',
              })}
            >
              {paidCount > 0 ? `확정 해제 — 지급 ${paidCount}건이 이미 나갔습니다` : '확정 해제'}
            </Btn>
          </>
        ) : (
          <Btn
            size="sm" busy={busy} busyLabel="확정 중…" disabled={unpriced > 0}
            onClick={() => void run({
              url: `/api/projects/${projectId}/payout-terms`,
              body: { confirmed: true },
              fail: '확정하지 못했습니다.',
            })}
          >
            {unpriced > 0 ? `단가 미지정 ${unpriced}건 — 확정 불가` : '지급조건 확정'}
          </Btn>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {lines.map((l) => {
          const opts = ruleOptions[l.id];
          const list = opts ? [...opts.exact, ...opts.others] : [];
          const turnkey = l.rule ? turnkeyUnit(l.rule) : null;
          return (
            <div key={l.id} className="rounded-box border border-slate-200 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="whitespace-nowrap text-base font-bold text-slate-800">
                  {l.termYears}년 × {l.qty}대
                </span>
                {/*
                  * 교체유형을 적는다 — 라인이 갈리는 축이 연수·수전방식·교체유형 셋인데
                  * 앞의 둘만 보였다. 자투 11기가 「10대 · 1대」 두 줄로 서 있고 두 줄이
                  * 똑같아 보이면, 왜 갈렸는지 화면에 없다(한백 2026-08-26).
                  */}
                {l.replType && <Tag>{replLabel(cpo, l.replType)}</Tag>}
                {l.powerType && <Tag>{l.powerType}</Tag>}
                {/* 확정된 조건은 글자로 굳힌다 — 못 바꾸는 것은 눌리지 않게(화면 규칙 3·4) */}
                {locked ? (
                  <span className="min-w-[240px] flex-1 text-base font-bold text-slate-800">
                    {l.rule?.caseName ?? <span className="text-amber-700">단가 미지정</span>}
                  </span>
                ) : (
                <select
                  value={l.pricingRuleId ?? ''}
                  disabled={busy}
                  onChange={(e) => pickRule(l.id, e.target.value)}
                  className={`${FIELD_CELL} min-w-[240px] flex-1`}
                >
                  <option value="">단가 케이스 선택 —</option>
                  {/*
                    * 후보(matchingRules)는 사용중 케이스만 담는다. 지정된 케이스가 그 뒤
                    * 중지되면 value 와 맞는 option 이 없어 셀렉트가 빈칸으로 그려진다 —
                    * 아래에는 그 케이스로 계산한 금액이 찍혀 있는데도. 빈칸인 줄 알고
                    * 「선택 —」을 고르면 멀쩡히 계산되던 라인이 정말로 미지정이 된다.
                    * 그래서 지정된 중지 케이스는 여기 한 줄로 남긴다.
                    */}
                  {l.pricingRuleId
                    && l.rule
                    && !list.some((r) => r.id === l.pricingRuleId) && (
                      <option value={l.pricingRuleId}>(중지) {l.rule.caseName}</option>
                    )}
                  {opts && opts.exact.length > 0 && (
                    <optgroup label="조건이 맞는 케이스">
                      {opts.exact.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.caseName} · 영업 {won(r.salesUnit)} / 시공 {won(r.consUnit)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {opts && opts.others.length > 0 && (
                    <optgroup label="같은 운영사의 다른 케이스">
                      {opts.others.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.caseName} · 영업 {won(r.salesUnit)} / 시공 {won(r.consUnit)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                )}
              </div>
              {(opts || turnkey !== null) && (
                <p className="mt-1 text-tiny tabular-nums text-slate-400">
                  {opts && `${opts.usedAxes.join(' · ')} 후보 ${opts.exact.length}건`}
                  {turnkey !== null && (
                    <span className="ml-2 text-slate-500">
                      받는 단가 {won(turnkey)}/대 · 이 라인 {won(turnkey * l.qty)}
                    </span>
                  )}
                </p>
              )}
              {list.length === 0 && (
                <p className="mt-1 text-small text-amber-700">
                  이 운영사의 단가 케이스가 없습니다 — 매트릭스를 확인해주세요.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <Err className="mt-1.5">{error}</Err>
    </section>
  );
}

// ── 지급 ────────────────────────────────────────────────────────
/**
 * 지급 — 한백이 협력사에게 주는 돈. 계획은 유도되고, 실적은 원장에 적는다.
 *
 * 계획(단가 케이스 × 대수, 회차 70:30)은 사람이 손대지 않는다. 확정한 지급은 계획과
 * 어긋난다 — 선금·차액·회수·차감이 노션 정산관리 115행 중 10행에 비고 문장으로만 있었다.
 * 그래서 확정한 지급은 원장에 한 건씩 적고, 잔액 = 계획 + 조정 − 지급 으로 센다.
 */

function PaymentSection({
  projectId, lines, entries, salesOrg, gcOrg, vis, canReview,
}: {
  projectId: string;
  lines: ProjectDetail['lines'];
  entries: PayoutEntry[];
  salesOrg: string | null;
  gcOrg: string | null;
  vis: Visibility;
  canReview: boolean;
}) {
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const unpriced = lines.filter((l) => !l.rule).length;

  const sides = ([
    {
      kind: '영업비' as PayoutKind, org: salesOrg, show: vis.sales,
      plan: lines.reduce((s, l) => s + (l.rule?.salesUnit ?? 0) * l.qty, 0),
    },
    {
      kind: '시공비' as PayoutKind, org: gcOrg, show: vis.cons,
      plan: lines.reduce((s, l) => s + (l.rule?.consUnit ?? 0) * l.qty, 0),
    },
  ]).filter((side) => side.show);

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-h3 font-black text-slate-900">지급관리</h2>
          <span className="text-tiny text-slate-400">계약 {totalQty}대 기준</span>
        </div>
        {/* 거래명세서는 이 데이터에서 유도된다 — 같은 것의 다른 면 (지급 내역이 그리로 합쳐졌다) */}
        <Link href="/statements" className="text-tiny font-bold text-brand-700 hover:underline">
          협력사 거래명세서 →
        </Link>
      </div>

      {unpriced > 0 && (
        <Note tone="warn" className="mb-3 font-semibold">
          단가 미지정 라인 {unpriced}건 — 지급액이 계산되지 않습니다.
        </Note>
      )}

      {/*
        * 한 표에 다 있다(한백 확인) — 영업비·시공비가 딴 상자에 갈라져 있어 총액은
        * 머리로 더해야 했다. 행이 구분(영업비·시공비·합계), 열이 돈의 단계다:
        * 대당 → 총 지급액 → 1·2차 → 지급됨 → 잔액. 서로 겹치지도 빠지지도 않는다.
        * 대당은 라인마다 다를 수 있어 하나일 때만 숫자를 적는다 — 라인별 값은 적용조건 표가 말한다.
        * 합계는 배포가(영업+시공)다 — 턴키는 마진까지 포함한 운영사 쪽 금액이라 이 표의 합이 아니다.
        */}
      {(() => {
        const unitOf = (pick: (r: NonNullable<ProjectDetail['lines'][number]['rule']>) => number | null) => {
          const values = lines
            .filter((l) => l.rule)
            .map((l) => pick(l.rule!))
            .filter((v): v is number => v !== null);
          if (values.length === 0) return null;
          const uniq = [...new Set(values)];
          return uniq.length === 1 ? uniq[0] : ('mixed' as const);
        };
        const rows = sides.map((side) => {
          const { adjust, paid } = payoutSideOf(entries, side.kind);
          const steps = payoutStepsOf(side.plan, adjust, paid);
          return {
            ...side,
            unit: unitOf((r) => (side.kind === '영업비' ? r.salesUnit : r.consUnit)),
            adjust, steps, paid,
            /*
             * ★계획보다 더 나간 돈.★ 표가 계획(계획+조정)과 회차 금액만 보여 줘서, 실제로
             * 얼마가 나갔는지는 어디에도 없었다 — 단가를 잘못 알고 더 준 현장이 「1차
             * 지급완료」로만 보였다(반달마을푸르지오, 2026-08-28). 그 차이를 줄에 적는다.
             */
            over: Math.max(0, paid - (side.plan + adjust)),
            stepAt: (cat: '1차' | '2차') =>
              entries.find((e) => e.kind === side.kind && e.category === cat)?.at ?? null,
            /*
             * 그 회차로 실제 나간 금액. 계획(parts)이 아니라 원장이다 —
             * 「1차 105만 지급완료」라고 적혀 있는데 실제로는 178.5만이 나간 현장이 있었다
             * (반달마을푸르지오). 계획만 보여 주면 회차가 얼마나 넘쳤는지 화면에 없다.
             */
            stepPaid: (cat: '1차' | '2차') =>
              entries.find((e) => e.kind === side.kind && e.category === cat)?.amount ?? null,
          };
        });
        const unitCell = (unit: number | 'mixed' | null) =>
          unit === null ? <span className="text-slate-300">—</span>
          : unit === 'mixed' ? <span className="text-tiny font-semibold text-slate-400">라인별</span>
          : won(unit);
        return (
        <div className="overflow-x-auto rounded-box border border-slate-200">
          <table className="w-full min-w-[680px] text-base">
            <thead className="bg-slate-50 text-tiny font-bold tracking-[0.08em] text-slate-500">
              <tr>
                <Th tight className="py-2">구분</Th>
                <Th tight num className="py-2">대당</Th>
                <Th tight num className="py-2">대수</Th>
                <Th tight num className="py-2">총 지급액</Th>
                <Th tight num className="border-l border-slate-200 py-2">1차 · 70%</Th>
                <Th tight className="py-2">지급시기</Th>
                <Th tight num className="border-l border-slate-200 py-2">2차 · 잔액</Th>
                <Th tight className="py-2">지급시기</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {rows.map((r) => (
                <tr key={r.kind}>
                  <Td className="whitespace-nowrap">
                    <span className="font-black text-slate-900">{r.kind}</span>
                    {r.org ? (
                      <span className="ml-1.5 text-tiny text-slate-500">→ {r.org}</span>
                    ) : (
                      <span className="ml-1.5 text-tiny font-bold text-amber-700">받는 곳 미지정</span>
                    )}
                  </Td>
                  <Td num className="whitespace-nowrap font-semibold text-slate-700">
                    {unitCell(r.unit)}
                  </Td>
                  <Td num className="whitespace-nowrap font-semibold text-slate-700">
                    {totalQty}대
                  </Td>
                  <Td num className="whitespace-nowrap font-black text-slate-900">
                    {won(r.steps.due)}
                    {r.adjust !== 0 && (
                      <span className="block text-tiny font-semibold text-slate-400">
                        조정 {r.adjust > 0 ? '+' : ''}{won(r.adjust)} 포함
                      </span>
                    )}
                    {r.over > 0 && (
                      <span className="mt-0.5 block text-tiny font-black text-red-700">
                        실지급 {won(r.paid)} · 초과 {won(r.over)}
                      </span>
                    )}
                  </Td>
                  {([1, 2] as const).map((no) => {
                    const done = no === 1 ? r.steps.step1Done : r.steps.step2Done;
                    const planned = r.steps.open?.no === no ? r.steps.open.amount : r.steps.parts[no - 1];
                    const at = r.stepAt(`${no}차`);
                    const paidHere = r.stepPaid(`${no}차`);
                    // 나간 돈이 있으면 그것이 이 칸의 값이다 — 계획은 다를 때만 밑에 남긴다
                    const amount = paidHere ?? planned;
                    const gap = paidHere !== null && paidHere !== planned;
                    return (
                      <Fragment key={no}>
                        <Td num className="whitespace-nowrap border-l border-slate-100">
                          <span className={`font-bold ${done ? 'text-slate-900' : 'text-slate-500'}`}>
                            {won(amount)}
                          </span>
                          {gap && (
                            <span className="block text-tiny font-semibold text-red-700">
                              계획 {won(planned)} · {paidHere! > planned ? '초과' : '부족'} {won(Math.abs(paidHere! - planned))}
                            </span>
                          )}
                        </Td>
                        {/*
                          지급시기 — 지급완료(날짜) · 미지급 · 초과 충당.
                          ★셋째가 필요했다★(한백 지적 2026-08-28): 회차 완료를 금액 누적으로
                          재는 탓에, 앞 회차에 계획보다 많이 나가면 뒤 회차가 날짜도 없이
                          「지급완료」로 보였다. 나갈 돈이 없는 것은 맞으니 그렇게 적는다.
                        */}
                        {/* 태그 아래 날짜 — 옆으로 붙이면 마지막 열이 날짜만큼 밀려 표가 가로로 넘친다 */}
                        <Td className="whitespace-nowrap">
                          {done && !at ? (
                            /*
                              그 회차 항목이 원장에 없다. 돈이 어디서 왔는지로 말이 갈린다 —
                              계획을 넘겨 나갔으면 「초과 충당」, 그렇지 않으면 선금·차액 같은
                              딴 명목으로 나간 것이다. 둘을 뭉뚱그리면 초과가 아닌 현장에도
                              초과라고 적힌다(개발 시험에서 실제로 그랬다).
                            */
                            <span className="rounded-tag bg-slate-100 px-1.5 py-0.5 text-tiny font-bold text-slate-600">
                              {r.over > 0 ? '초과 충당' : '다른 명목으로 지급'}
                            </span>
                          ) : done ? (
                            <span className="inline-flex flex-col items-start gap-0.5">
                              <span className="rounded-tag bg-brand-50 px-1.5 py-0.5 text-tiny font-bold text-brand-800">
                                지급완료
                              </span>
                              <span className="text-tiny font-semibold tabular-nums text-slate-500">{at ?? ''}</span>
                            </span>
                          ) : (
                            <span className="rounded-tag bg-amber-100 px-1.5 py-0.5 text-tiny font-bold text-amber-900">
                              미지급
                            </span>
                          )}
                        </Td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
              {rows.length > 1 && (
                <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-black">
                  <Td className="text-slate-900">합계</Td>
                  <Td num className="whitespace-nowrap text-slate-700">
                    {unitCell(
                      rows.every((r) => typeof r.unit === 'number')
                        ? rows.reduce((sum, r) => sum + (r.unit as number), 0)
                        : rows.some((r) => r.unit === 'mixed') ? 'mixed' : null
                    )}
                  </Td>
                  <Td num className="whitespace-nowrap text-slate-700">{totalQty}대</Td>
                  <Td num className="whitespace-nowrap text-slate-900">
                    {won(rows.reduce((sum, r) => sum + r.steps.due, 0))}
                  </Td>
                  <Td /><Td /><Td /><Td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        );
      })()}

      {/*
        * 조정 내역 — 표는 「조정 −100,000 포함」으로 접어서 말한다. 무엇이 왜 깎였는지는
        * 여기서 줄로 본다. 보이는 구분만 넘긴다(협력사는 자기 쪽만).
        */}
      <AdjustBox
        projectId={projectId}
        entries={entries}
        kinds={sides.map((side) => side.kind)}
        canReview={canReview}
      />
    </section>
  );
}

/** 손으로 적는 조정 명목 — 자재비·추가공사비·차감·프로모션 비용 차감·재정산 */
const ADJUST_CATEGORIES = PAYOUT_CATEGORIES.filter((c) => c.type === '조정' && c.manual);

/**
 * 조정 내역 — 계획에 없는 돈을 한 건씩 적고, ★적은 것을 되돌린다★.
 *
 * ★적을 수만 있고 되돌릴 수 없었다★ (한백 지적 2026-08-29, 부산 거제미소지움). 차감을
 * 적으면 지급관리 표의 「조정 −100,000 포함」 한 줄로만 접혀서, 무엇이 왜 깎였는지 볼
 * 수도 지울 수도 없었다 — 지우는 길은 처음부터 있었는데 그것을 부르는 자리가 화면에
 * 없었다. 고치기(PATCH)는 없다: ★지우고 다시 적는 것이 고치는 길이다★ — 반쯤 고친
 * 흔적보다 지운 값이 감사 로그에 온전히 남는 것이 낫다(라우트와 같은 판단).
 *
 * ★모양을 다시 잡았다★ (한백 지적 2026-08-29 「엉망이야」). 세 가지가 문제였다:
 *  1. 줄이 flex 로 흘러서 금액이 세로로 안 맞았다 — 표로 세워 자릿수를 맞춰 훑는다.
 *  2. 적는 자리가 칸 일곱 개짜리 한 줄이었다. 이름표도 없고, 좁은 칸(FIELD_CELL)과
 *     날짜 고르개가 높이가 달라 들쭉날쭉했다 — 칸마다 이름을 붙이고 두 줄로 나눴다.
 *  3. 지우기를 인라인 두 단추로 물었다 — 이 저장소는 되돌릴 수 없는 것을 Confirm
 *     대화상자로 묻는다(파일 빼기·현장 삭제와 같은 모양).
 *
 * 명목은 다 열려 있다 — 프로모션 차감 하나만 열려 있어서 다른 차감과 추가공사비는 비고
 * 문장으로만 떠돌았다(노션 정산관리 115행 중 10행). 원장에 없으면 총 지급액·1차 70%·
 * 거래명세서에 반영되지 않는다. 부호는 명목이 정하고 사람은 양수만 적는다 — 「-100000」을
 * 치게 하면 부호를 빠뜨린 반대 입력이 생긴다. 무엇이 될 일인지는 단추 이름이 말한다.
 *
 * 회수는 여기 없다 — 조정이 아니라 음수 지급이라 배치·세금계산서에 묶인다.
 */
function AdjustBox({
  projectId, entries, kinds, canReview,
}: {
  projectId: string;
  entries: PayoutEntry[];
  kinds: PayoutKind[];
  canReview: boolean;
}) {
  const { busy, busyKey, error, run } = useAction();
  const [open, setOpen] = useState(false);
  /** 삭제는 대화상자로 묻는다 — 되돌릴 수 없다 */
  const [killing, setKilling] = useState<PayoutEntry | null>(null);
  const [category, setCategory] = useState<PayoutCategory>('차감');
  const [kind, setKind] = useState<PayoutKind>(kinds[0] ?? '영업비');
  /** 추가공사비를 누가 안나 — 영업비에서 빼거나, 한백이 안는다 */
  const [bears, setBears] = useState<'영업비' | '한백'>('영업비');
  /** 재정산의 방향 — 깎기인가 더 주기인가 */
  const [minus, setMinus] = useState(true);
  const [amount, setAmount] = useState('');
  const [at, setAt] = useState<string>(today());
  const [note, setNote] = useState('');

  /* 최근 것이 위로 — 같은 날이 여럿이면 적은 순서를 지킨다 */
  const list = entries
    .filter((e) => entryTypeOf(e.category) === '조정' && kinds.includes(e.kind))
    .sort((a, b) => b.at.localeCompare(a.at) || a.createdAt.localeCompare(b.createdAt));

  const cat = ADJUST_CATEGORIES.find((c) => c.key === category) ?? ADJUST_CATEGORIES[0];
  const extra = category === '추가공사비';
  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed > 0;
  /* 무엇이 원장에 남을지는 규칙이 정한다(lib/settlement) — 화면은 그것을 보여주고 보낸다 */
  const planned = valid
    ? adjustEntriesOf({
      category,
      kind: extra ? '영업비' : kind,
      amount: parsed,
      at,
      note: note.trim() || null,
      minus,
      hanbaekBears: extra && bears === '한백',
    })
    : [];
  const label = !valid ? '금액을 적으세요'
    : planned.length > 1
      ? `${planned[0].kind}에서 ${won(parsed)}원 빼서 ${planned[1].kind}로`
      : planned[0].amount < 0
        ? `${planned[0].kind}에서 ${won(parsed)}원 빼기`
        : `${planned[0].kind}에 ${won(parsed)}원 더하기`;

  const save = async () => {
    const ok = await run({
      /* 줄마다 삭제가 도니 무엇이 도는 중인지 열쇠로 가른다 — 안 주면 단추가 다 같이 돈다 */
      key: 'save',
      url: `/api/projects/${projectId}/payouts`,
      // 배열이면 한 트랜잭션이다 — 추가공사비의 두 줄이 반쪽만 남으면 안 된다
      body: planned,
      fail: '조정을 적지 못했습니다.',
    });
    if (ok) { setOpen(false); setAmount(''); setNote(''); }
  };

  const remove = async (entryId: string) => {
    const ok = await run({
      key: entryId,
      url: `/api/projects/${projectId}/payouts`,
      method: 'DELETE',
      body: { entryId },
      fail: '지우지 못했습니다.',
    });
    if (ok) setKilling(null);
  };

  return (
    <div className="mt-3 rounded-box border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline gap-2 px-3.5 pb-2 pt-3">
        <h3 className="text-base font-black text-slate-900">조정 내역</h3>
        <span className="text-tiny text-slate-400">{list.length}건</span>
        {canReview && !open && (
          <span className="ml-auto">
            <Btn size="sm" kind="quiet" onClick={() => setOpen(true)}>조정 적기</Btn>
          </span>
        )}
      </div>

      {/* 표로 세운다 — 금액은 자릿수를 맞춰 훑는 자리다 */}
      {list.length === 0 ? (
        <p className="px-3.5 pb-3 text-tiny text-slate-400">0건</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-small">
            {/* 표 머리는 tiny 다 — 위 지급관리 표와 같은 눈금(2026-08-29 자료실과 같은 손질) */}
            <thead className="border-y border-slate-100 bg-slate-50/70 text-tiny font-bold tracking-[0.08em] text-slate-500">
              <tr>
                <Th tight className="py-1.5">구분</Th>
                <Th tight className="py-1.5">명목</Th>
                <Th tight num className="py-1.5">금액</Th>
                <Th tight className="py-1.5">반영일</Th>
                <Th tight className="py-1.5">사유</Th>
                {canReview && <Th tight num className="py-1.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((e) => (
                <tr key={e.id}>
                  <Td tight className="whitespace-nowrap py-2 font-bold text-slate-700">{e.kind}</Td>
                  <Td tight className="whitespace-nowrap py-2 text-slate-600">{e.category}</Td>
                  {/* 나가는 돈과 빼는 돈이 한눈에 갈려야 한다 — 부호와 색이 같이 말한다 */}
                  <Td tight num className={`whitespace-nowrap py-2 font-black ${
                    e.amount < 0 ? 'text-red-700' : 'text-slate-900'
                  }`}>
                    {e.amount < 0 ? '−' : '+'}{won(Math.abs(e.amount))}
                  </Td>
                  <Td tight className="whitespace-nowrap py-2 tabular-nums text-slate-500">{e.at}</Td>
                  <Td tight className="py-2 text-tiny text-slate-500">
                    {e.note ?? <Empty kind="wait" />}
                  </Td>
                  {canReview && (
                    <Td tight num className="whitespace-nowrap py-2">
                      <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setKilling(e)}>삭제</Btn>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <>
          {/* 상자 안에 상자를 넣지 않는다 — 얇은 선으로 나눈다(화면 규칙 1번) */}
          <HR />
          <div className="px-3.5 py-3">
            {/* 칸마다 이름을 붙인다 — 이름 없는 칸 일곱 개가 한 줄에 흐르면 무엇을 적는지 모른다 */}
            <div className="flex flex-wrap items-end gap-x-2.5 gap-y-2">
              <Cell label="명목">
                <select
                  aria-label="명목"
                  className={`${FIELD_BASE} w-44`}
                  value={category}
                  disabled={busy}
                  onChange={(e) => setCategory(e.target.value as PayoutCategory)}
                >
                  {ADJUST_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.key}</option>
                  ))}
                </select>
              </Cell>

              {/*
                * 추가공사비는 갈 곳이 정해져 있다 — 시공사가 받는다(한백 지시 2026-08-29).
                * 그래서 묻는 것이 「어느 쪽 돈이냐」가 아니라 ★누가 안느냐★다.
                */}
              {extra ? (
                <Cell label="부담">
                  <span className="flex gap-1">
                    {(['영업비', '한백'] as const).map((b) => (
                      <Choice key={b} on={bears === b} disabled={busy} onClick={() => setBears(b)}>
                        {b}
                      </Choice>
                    ))}
                  </span>
                </Cell>
              ) : kinds.length > 1 && (
                <Cell label="구분">
                  <span className="flex gap-1">
                    {kinds.map((k) => (
                      <Choice key={k} on={kind === k} disabled={busy} onClick={() => setKind(k)}>{k}</Choice>
                    ))}
                  </span>
                </Cell>
              )}

              {/* 방향이 없는 명목(재정산)만 사람에게 묻는다 */}
              {cat.sign === 0 && (
                <Cell label="방향">
                  <span className="flex gap-1">
                    <Choice on={minus} disabled={busy} onClick={() => setMinus(true)}>깎기</Choice>
                    <Choice on={!minus} disabled={busy} onClick={() => setMinus(false)}>더 주기</Choice>
                  </span>
                </Cell>
              )}

              <Cell label="금액">
                <input
                  inputMode="numeric"
                  aria-label="금액"
                  value={amount}
                  disabled={busy}
                  /* 숫자만 남긴다 — 부호는 명목이 정하므로 사람이 못 적는다 */
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  className={`${FIELD_BASE} w-36 text-right tabular-nums`}
                />
              </Cell>

              <Cell label="반영일">
                <DatePicker ariaLabel="반영일" value={at} onChange={(v) => setAt(v ?? today())} disabled={busy} />
              </Cell>
            </div>

            <div className="mt-2.5 flex flex-wrap items-end gap-x-2.5 gap-y-2">
              <Cell label="사유" className="min-w-[240px] flex-1">
                <input
                  aria-label="사유"
                  value={note}
                  disabled={busy}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 6개월 250원 프로모션 연장"
                  className={`${FIELD_BASE} w-full`}
                />
              </Cell>
              {/* 무엇이 될 일인지 단추 이름이 말한다 — 부호를 사람이 안 적으므로 */}
              <Btn busy={busyKey === 'save'} busyLabel="적는 중…" disabled={!valid} onClick={() => void save()}>
                {label}
              </Btn>
              <Btn kind="quiet" disabled={busy} onClick={() => setOpen(false)}>취소</Btn>
            </div>
            <Err className="mt-1.5">{error}</Err>
          </div>
        </>
      )}

      <Confirm
        open={killing !== null}
        title={killing
          ? `${killing.kind} ${killing.category} ${killing.amount < 0 ? '−' : '+'}${won(Math.abs(killing.amount))}원을 삭제합니다`
          : ''}
        detail="총 지급액과 1·2차 회차 금액이 다시 계산됩니다. 고치려면 지운 뒤 다시 적으세요."
        confirmLabel="예, 삭제합니다"
        busy={busyKey === killing?.id}
        busyLabel="지우는 중…"
        error={error}
        onConfirm={() => { if (killing) void remove(killing.id); }}
        onCancel={() => setKilling(null)}
      />
    </div>
  );
}

/** 적는 칸 한 개 — 이름표가 위에 붙는다. 칸 안 컨트롤이 aria-label 을 갖는다 */
function Cell({
  label, children, className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {/* 칸 이름표도 tiny 다 — micro 는 단위·꼬리표 자리다 */}
      <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">{label}</span>
      {children}
    </div>
  );
}

/**
 * 정산 메모 — 그때그때 한 줄씩 남긴다(한백 확인). 특이사항·회수·추가지급이 여기 온다.
 *
 * 별도 테이블 없이 비고(payNote)에 날짜 스탬프 줄로 쌓는다 — 한 줄이 한 건이고,
 * 고치기·지우기는 그 줄만 갈아 끼우거나 걷어낸다. 전용 기능(원장)은 쓰면서 다시 정하기로 했다.
 * 협력사는 읽기만 한다.
 *
 * ★고치는 자리를 같이 만든다 (한백 2026-08-30, 화면 규칙 7).★ 그전에는 남기기와 삭제만
 * 있어서, 오타 한 자를 고치려면 지우고 다시 적어야 했다 — 그러면 날짜가 오늘로 바뀌어
 * 「언제 있었던 일인가」가 사라진다. 그래서 고침은 날짜 앞머리를 그대로 두고 본문만 바꾼다.
 * 삭제는 한 번 더 묻는다 — 수정 옆에 한 번 누르면 지워지는 단추를 두면 오눌림이 곧
 * 삭제다(화면 규칙 8·12). 진행현황 메모와 같은 꼴이다.
 */
function PayNoteBox({
  projectId, payNote, canReview,
}: {
  projectId: string;
  payNote: string | null;
  canReview: boolean;
}) {
  const { busy, busyKey, error, run } = useAction();
  const [draft, setDraft] = useState('');
  /* 고치는 중인 줄 · 지울지 묻는 중인 줄 — 한 번에 하나다(둘이 동시에 열리면 어느 것을 누른 건지 흐려진다) */
  const [editing, setEditing] = useState<number | null>(null);
  const [edit, setEdit] = useState('');
  const [asking, setAsking] = useState<number | null>(null);
  const entries = (payNote ?? '').split('\n').map((t) => t.trim()).filter(Boolean);

  /* 「2026-08-30 본문」 — 날짜는 남긴 날이라 고쳐도 그대로 간다 */
  const split = (line: string) => {
    const m = line.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)$/);
    return { date: m ? m[1] : null, text: m ? m[2] : line };
  };

  const saveAll = (next: string[], key?: string) =>
    run({
      url: `/api/projects/${projectId}/payment`,
      method: 'PATCH',
      body: { payNote: next.join('\n') },
      fail: '저장에 실패했습니다.',
      key,
    });

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    const ok = await saveAll([`${today()} ${text}`, ...entries]);
    if (ok) setDraft('');
  };

  const openEdit = (i: number) => {
    setAsking(null);
    setEditing(i);
    setEdit(split(entries[i]).text);
  };

  /* 고침은 그 줄만 갈아 끼운다 — 날짜 앞머리는 유지한다 */
  const saveEdit = async (i: number) => {
    const text = edit.trim();
    if (!text) return;
    const { date } = split(entries[i]);
    const ok = await saveAll(
      entries.map((line, j) => (j === i ? (date ? `${date} ${text}` : text) : line)),
      `edit-${i}`
    );
    if (ok) setEditing(null);
  };

  const remove = async (i: number) => {
    const ok = await saveAll(entries.filter((_, j) => j !== i), `del-${i}`);
    if (ok) setAsking(null);
  };

  return (
    /* 지급 내역 아래에 선다(2026-08-28) — 표들과 같은 급의 상자다 */
    <div className="rounded-box border border-slate-200 bg-white p-3.5">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-base font-black text-slate-900">메모</h3>
        <span className="text-tiny text-slate-400">{entries.length}건</span>
      </div>

      {canReview && (
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="회수·추가지급·특이사항"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
            }}
            className={FIELD}
          />
          <Btn size="sm" busy={busy} busyLabel="저장 중…" disabled={!draft.trim()} onClick={() => void add()}>
            남기기
          </Btn>
        </div>
      )}
      <Err className="block">{error}</Err>

      <ul className="mt-2 flex max-h-[560px] flex-col gap-1.5 overflow-y-auto">
        {entries.map((line, i) => {
          const { date, text } = split(line);
          return (
            <li key={`${i}-${line}`} className="flex items-baseline gap-2 rounded-box bg-slate-50 px-2.5 py-1.5">
              {date && <span className="shrink-0 text-tiny tabular-nums text-slate-400">{date}</span>}
              {editing === i ? (
                <>
                  {/* 고칠 때만 입력칸이다(화면 규칙 4) — 평소에는 글자로 굳어 있다 */}
                  <input
                    value={edit}
                    autoFocus
                    disabled={busy}
                    onChange={(e) => setEdit(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveEdit(i);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    className={FIELD}
                  />
                  <Btn
                    size="sm"
                    busy={busyKey === `edit-${i}`}
                    busyLabel="저장 중…"
                    disabled={!edit.trim()}
                    onClick={() => void saveEdit(i)}
                  >
                    저장
                  </Btn>
                  <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setEditing(null)}>
                    취소
                  </Btn>
                </>
              ) : (
                <>
                  <span className="min-w-0 whitespace-pre-wrap text-small text-slate-700">{text}</span>
                  {canReview && (
                    /* 되돌릴 수 없는 것은 한 번 더 묻는다 — 수정 옆에 그냥 두면 오눌림이 곧 삭제다
                       (화면 규칙 8·12, 진행현황 메모와 같은 꼴) */
                    <span className="ml-auto flex shrink-0 items-baseline gap-1">
                      {asking === i ? (
                        <>
                          <Btn
                            size="sm"
                            kind="undo"
                            busy={busyKey === `del-${i}`}
                            busyLabel="삭제 중…"
                            onClick={() => void remove(i)}
                          >
                            삭제합니다
                          </Btn>
                          <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setAsking(null)}>
                            취소
                          </Btn>
                        </>
                      ) : (
                        <>
                          <Btn size="sm" kind="quiet" disabled={busy} onClick={() => openEdit(i)}>
                            수정
                          </Btn>
                          <Btn
                            size="sm"
                            kind="quiet"
                            disabled={busy}
                            onClick={() => { setEditing(null); setAsking(i); }}
                          >
                            삭제
                          </Btn>
                        </>
                      )}
                    </span>
                  )}
                </>
              )}
            </li>
          );
        })}
        {entries.length === 0 && <li className="text-tiny text-slate-400">0건</li>}
      </ul>
    </div>
  );
}

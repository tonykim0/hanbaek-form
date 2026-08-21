'use client';

/**
 * 협력사 지급관리 — 송금 대상·금액·지급일을 확정하는 업무함.
 *
 * 금액 차례와 업무 조건을 모두 충족한 줄만 선택할 수 있다.
 *   영업비 1차 = 계약완료 · 2차 = 개통완료
 *   시공비 1차 = 설치완료 · 2차 = 개통완료
 *
 * 표 한 벌이 전부다(한백 확인) — 현장·구분마다 총 지급액, 1차·2차 각각의 금액과
 * 지급시기(트리거)·지급일(나갔으면)·조건(안 나갔으면)이 한 줄에 선다. 위에 있던
 * 「영업비 지급 계획」 합계 구역은 걷어냈다 — 줄마다 다 보이는 것을 또 합쳐 보여줄
 * 이유가 없다. 남은 금액 열도 걷어냈다(한백 확인) — 2차 칸이 그 말을 한다.
 *
 * 「확정」은 실제 은행 이체가 아니라 송금할 묶음을 원장에 고정하는 일이다. 바로 기록하지
 * 않고 검토 단계를 한 번 거친다 — 대상·금액·날짜 중 하나를 잘못 고른 채 묶음 전체가
 * 원장에 들어가는 것을 막기 위해서다.
 */
import { useMemo, useState } from 'react';
import type { PayoutKind, PayoutMilestones, SettlementSummary } from '@/types/project';
import { payoutPrerequisiteBlockersOf, payoutReleaseOf, payoutStepsOf } from '@/lib/settlement';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { DatePicker } from '@/components/DatePicker';
import { Btn, Empty as EmptyValue, Err, FIELD_CELL, Saved, Tag } from '@/components/ui';
import { CrossLink, Empty, Frame, SiteLink, won } from './parts';

interface Payout {
  key: string;
  projectId: string;
  projectName: string;
  cpo: string;
  kind: PayoutKind;
  org: string | null;
  plan: number;
  adjust: number;
  confirmed: number;
  unpriced: number;
  milestones: PayoutMilestones;
  feeMissing: string[];
  /** 회차 지급 기록의 지급일 — 원장에서 유도(stepAt) */
  step1At: string | null;
  step2At: string | null;
}

type WorkState = '지급 가능' | '조건 대기' | '확정 완료';

interface PayoutWork extends Payout {
  state: WorkState;
  blockers: string[];
  open: { no: 1 | 2; amount: number } | null;
  release: ReturnType<typeof payoutReleaseOf> | null;
  due: number;
  step1Amount: number;
  step2Amount: number;
  step1Done: boolean;
  step2Done: boolean;
  remaining: number;
}

function payoutsOf(rows: SettlementSummary[]): Payout[] {
  return rows.flatMap((r) => [
    {
      key: `${r.id}|영업비`, projectId: r.id, projectName: r.name, cpo: r.cpo,
      kind: '영업비' as const, org: r.salesOrg, plan: r.salesTotal,
      adjust: r.salesAdjust, confirmed: r.salesPaid,
      unpriced: r.unpricedLines, milestones: r.payoutMilestones,
      feeMissing: r.salesFeeMissing,
      step1At: r.salesStep1At, step2At: r.salesStep2At,
    },
    {
      key: `${r.id}|시공비`, projectId: r.id, projectName: r.name, cpo: r.cpo,
      kind: '시공비' as const, org: r.gcOrg, plan: r.consTotal,
      adjust: r.consAdjust, confirmed: r.consPaid,
      unpriced: r.unpricedLines, milestones: r.payoutMilestones,
      feeMissing: [],
      step1At: r.consStep1At, step2At: r.consStep2At,
    },
  ]);
}

function workOf(p: Payout): PayoutWork {
  const steps = payoutStepsOf(p.plan, p.adjust, p.confirmed);
  const remaining = steps.due - p.confirmed;
  const prerequisites = payoutPrerequisiteBlockersOf({
    kind: p.kind, org: p.org, unpriced: p.unpriced, feeMissing: p.feeMissing,
  });
  const stepFields = {
    due: steps.due,
    step1Amount: steps.parts[0],
    step2Amount: steps.parts[1],
    step1Done: steps.step1Done,
    step2Done: steps.step2Done,
  };

  if (p.unpriced > 0) {
    return {
      ...p, ...stepFields, state: '조건 대기', blockers: prerequisites,
      open: null, release: null, remaining: 0,
    };
  }

  if (!steps.open) {
    return { ...p, ...stepFields, state: '확정 완료', blockers: [], open: null, release: null, remaining };
  }

  const release = payoutReleaseOf(p.kind, steps.open.no, p.milestones);
  const blockers = [...prerequisites];
  if (!release.met) blockers.push(`${release.trigger} 대기`);

  return {
    ...p,
    ...stepFields,
    state: blockers.length > 0 ? '조건 대기' : '지급 가능',
    blockers,
    open: steps.open,
    release,
    remaining,
  };
}

/**
 * 필터 두 축 — 구분(영업비/시공비)과 지급시기(회차)를 따로 고른다(한백 확인).
 * 한 드롭다운에 「영업비 1차」로 묶으면 「영업비 전체」를 볼 방법이 없다.
 * 지급시기 1차·2차는 「지금 그 회차가 차례인 줄」이다 — 다 나간 줄은 전체에서만 보인다.
 */
const KIND_FILTERS = ['전체', '영업비', '시공비'] as const;
const STEP_FILTERS = ['전체', '1차', '2차'] as const;
type KindFilter = (typeof KIND_FILTERS)[number];
type StepFilter = (typeof STEP_FILTERS)[number];

export default function PayoutWorkBoard({ rows }: { rows: SettlementSummary[] }) {
  const [org, setOrg] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('전체');
  const [stepFilter, setStepFilter] = useState<StepFilter>('전체');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [at, setAt] = useState(today());
  const [reviewing, setReviewing] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const { busy, error, setError, run } = useAction();

  const work = useMemo(() => payoutsOf(rows).map(workOf), [rows]);
  const orgs = useMemo(
    () => [...new Set(work.map((p) => p.org).filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b, 'ko')),
    [work]
  );

  const confirmedTotal = useMemo(() => work.reduce((n, p) => n + p.confirmed, 0), [work]);

  const shown = work
    .filter((p) => org === null || p.org === org)
    .filter((p) => kindFilter === '전체' || p.kind === kindFilter)
    .filter((p) => stepFilter === '전체' || p.open?.no === (stepFilter === '1차' ? 1 : 2));
  const selectable = shown.filter((p) => p.state === '지급 가능' && p.open !== null);
  const selected = selectable.filter((p) => sel.has(p.key));
  const selectedTotal = selected.reduce((n, p) => n + (p.open?.amount ?? 0), 0);
  const selectedOrgs = new Set(selected.map((p) => p.org).filter(Boolean)).size;

  const resetChoice = () => {
    setSel(new Set());
    setReviewing(false);
    setJustConfirmed(false);
    setError(null);
  };

  const toggle = (key: string) => {
    setReviewing(false);
    setJustConfirmed(false);
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allShownSelected = selectable.length > 0 && selectable.every((p) => sel.has(p.key));
  const toggleAll = () => {
    setReviewing(false);
    setJustConfirmed(false);
    setSel((prev) => {
      const next = new Set(prev);
      if (allShownSelected) selectable.forEach((p) => next.delete(p.key));
      else selectable.forEach((p) => next.add(p.key));
      return next;
    });
  };

  async function confirmBatch() {
    const ok = await run({
      url: '/api/payouts',
      body: { at, items: selected.map((p) => ({ projectId: p.projectId, kind: p.kind })) },
      fail: '지급 확정에 실패했습니다.',
    });
    if (ok) {
      setSel(new Set());
      setReviewing(false);
      setJustConfirmed(true);
    }
  }

  const blocked = selected.length === 0 ? '선택 없음' : !at ? '지급일 미입력' : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* 필터는 펼쳐 두지 않는다(한백 확인) — 칩 일곱 개가 표보다 먼저 눈을 먹었다 */}
        <label className="flex items-center gap-1.5 text-small font-bold text-slate-500">
          구분
          <select
            value={kindFilter}
            onChange={(e) => { resetChoice(); setKindFilter(e.target.value as KindFilter); }}
            className={`${FIELD_CELL} w-auto min-w-[92px]`}
          >
            {KIND_FILTERS.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-small font-bold text-slate-500">
          지급시기
          <select
            value={stepFilter}
            onChange={(e) => { resetChoice(); setStepFilter(e.target.value as StepFilter); }}
            className={`${FIELD_CELL} w-auto min-w-[92px]`}
          >
            {STEP_FILTERS.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>

        {orgs.length > 1 && (
          <label className="flex items-center gap-1.5 text-small font-bold text-slate-500">
            지급처
            <select
              value={org ?? ''}
              onChange={(e) => { resetChoice(); setOrg(e.target.value || null); }}
              className={`${FIELD_CELL} w-auto min-w-[140px]`}
            >
              <option value="">전체</option>
              {orgs.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DatePicker
            ariaLabel="지급일"
            value={at || null}
            disabled={busy}
            onChange={(value) => {
              setAt(value ?? '');
              setReviewing(false);
              setJustConfirmed(false);
            }}
            empty="지급일 선택"
          />
          <Btn disabled={blocked !== null} onClick={() => { setError(null); setReviewing(true); }}>
            {blocked ?? `선택 ${selected.length}건 ${won(selectedTotal)}원 확정 내용 검토`}
          </Btn>
          {justConfirmed && <Saved>지급 확정됨</Saved>}
        </div>
      </div>
      <div className="mb-3 text-right"><Err>{error}</Err></div>

      {reviewing && selected.length > 0 && (
        <section aria-label="송금 대상 확정 검토" className="mb-4 rounded-panel border border-brand-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-h3 font-black text-slate-900">송금 대상 확정 검토</h2>
              <p className="mt-0.5 text-small text-slate-500">실제 이체가 아니라 송금할 묶음을 원장에 확정합니다.</p>
            </div>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-base tabular-nums">
              <div><dt className="inline text-slate-400">지급일 </dt><dd className="inline font-black text-slate-900">{at}</dd></div>
              <div><dt className="inline text-slate-400">지급처 </dt><dd className="inline font-black text-slate-900">{selectedOrgs}곳</dd></div>
              <div><dt className="inline text-slate-400">금액 </dt><dd className="inline font-black text-slate-900">{won(selectedTotal)}원</dd></div>
            </dl>
          </div>

          <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
            {selected.map((p) => (
              <li key={p.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-base">
                <span className="w-36 shrink-0 font-black text-slate-800">{p.org}</span>
                <span className="min-w-[180px] flex-1 text-slate-600">{p.projectName} · {p.kind} {p.open?.no}차</span>
                <span className="font-black tabular-nums text-slate-900">{won(p.open?.amount ?? 0)}원</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Btn kind="side" disabled={busy} onClick={() => setReviewing(false)}>다시 선택</Btn>
            <Btn busy={busy} busyLabel="확정 중…" onClick={confirmBatch}>
              {selected.length}건 · {won(selectedTotal)}원 · {at} 확정
            </Btn>
          </div>
        </section>
      )}

      {shown.length === 0 ? (
        <Empty />
      ) : (
        <Frame min="1000px">
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" aria-label="보이는 지급 가능 항목 전부 선택"
                  checked={allShownSelected} disabled={selectable.length === 0 || busy} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2.5 text-left">현장</th>
              <th className="px-3 py-2.5 text-left">지급처</th>
              <th className="px-3 py-2.5 text-left">구분</th>
              <th className="px-3 py-2.5 text-right">총 지급액</th>
              <th className="px-3 py-2.5 text-right">1차 · 70%</th>
              <th className="px-3 py-2.5 text-right">2차 · 잔액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((p) => (
              <tr key={p.key} className="transition hover:bg-brand-50/40">
                <td className="px-3 py-2.5 text-center">
                  {p.state === '지급 가능' ? (
                    <input type="checkbox" aria-label={`${p.projectName} ${p.kind} ${p.open?.no}차 선택`}
                      checked={sel.has(p.key)} disabled={busy} onChange={() => toggle(p.key)} />
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <SiteLink id={p.projectId} name={p.projectName} tab="settlement" />
                  <p className="mt-0.5 text-tiny text-slate-400">{p.cpo}</p>
                </td>
                <td className="px-3 py-2.5 text-slate-600">{p.org ?? <EmptyValue kind="miss" />}</td>
                <td className="px-3 py-2.5">
                  <Tag tone={p.kind === '영업비' ? 'stage' : 'ok'}>{p.kind}</Tag>
                  {p.adjust !== 0 && <p className="mt-0.5 text-micro font-semibold text-slate-400">조정 {p.adjust > 0 ? '+' : ''}{won(p.adjust)}</p>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
                  <p className="font-black tabular-nums text-slate-900">
                    {p.due > 0 ? won(p.due) : <span className="text-slate-300">—</span>}
                  </p>
                  {/* 금액 자체가 안 서는 사정(단가 미지정 등)은 회차가 아니라 총액의 일이다 */}
                  {p.due <= 0 && p.blockers.map((reason) => (
                    <p key={reason} className="text-micro font-bold text-amber-700">{reason}</p>
                  ))}
                </td>
                <StepCell p={p} no={1} />
                <StepCell p={p} no={2} />
              </tr>
            ))}
          </tbody>
        </Frame>
      )}

      <CrossLink href="/payments" label="지급 및 기성관리" amount={confirmedTotal} note="송금 대상으로 확정한 누계는" />
    </div>
  );
}

/**
 * 회차 한 칸 — 금액 밑에 지급시기(트리거)와 그 회차의 사정이 붙는다.
 * 나갔으면 지급일, 지금 차례면 지급 가능 또는 막는 조건, 아직이면 「1차 뒤」.
 */
function StepCell({ p, no }: { p: PayoutWork; no: 1 | 2 }) {
  if (p.due <= 0) {
    return <td className="px-3 py-2.5 text-right align-top text-slate-300">—</td>;
  }
  const done = no === 1 ? p.step1Done : p.step2Done;
  const at = no === 1 ? p.step1At : p.step2At;
  const amount = p.open?.no === no ? p.open.amount : no === 1 ? p.step1Amount : p.step2Amount;
  // 회차의 지급시기 — 영업비 1차=계약완료 · 시공비 1차=설치완료 · 2차=개통완료
  const trigger = payoutReleaseOf(p.kind, no, p.milestones).trigger;

  return (
    <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
      <p className={`font-black tabular-nums ${done ? 'text-slate-400' : 'text-slate-900'}`}>
        {won(amount)}
      </p>
      <p className="text-micro text-slate-400">지급시기 {trigger}</p>
      {done ? (
        <p className="text-micro font-bold text-brand-800">지급 {at ?? '완료'}</p>
      ) : p.open?.no === no ? (
        p.state === '지급 가능' ? (
          <Tag tone="ok">지급 가능</Tag>
        ) : (
          // 지급시기는 바로 윗줄에 있다 — 트리거 대기는 「대기」로 줄여 같은 말을 두 번 안 적는다
          p.blockers.map((reason) => (
            <p key={reason} className="text-micro font-bold text-amber-700">
              {reason === `${trigger} 대기` ? '대기' : reason}
            </p>
          ))
        )
      ) : (
        <p className="text-micro font-bold text-slate-300">1차 뒤</p>
      )}
    </td>
  );
}

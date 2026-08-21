'use client';

/**
 * 하도급사 지급관리 — 송금 대상·금액·지급일을 확정하는 업무함.
 *
 * 금액 차례와 업무 조건을 모두 충족한 줄만 선택할 수 있다.
 *   영업비 1차 = 계약완료 · 2차 = 개통완료
 *   시공비 1차 = 설치완료 · 2차 = 개통완료
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
import { Btn, Choice, Empty as EmptyValue, Err, FIELD_CELL, Saved, Tag } from '@/components/ui';
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
    },
    {
      key: `${r.id}|시공비`, projectId: r.id, projectName: r.name, cpo: r.cpo,
      kind: '시공비' as const, org: r.gcOrg, plan: r.consTotal,
      adjust: r.consAdjust, confirmed: r.consPaid,
      unpriced: r.unpricedLines, milestones: r.payoutMilestones,
      feeMissing: [],
    },
  ]);
}

function workOf(p: Payout): PayoutWork {
  const steps = payoutStepsOf(p.plan, p.adjust, p.confirmed);
  const remaining = steps.due - p.confirmed;
  const prerequisites = payoutPrerequisiteBlockersOf({
    kind: p.kind, org: p.org, unpriced: p.unpriced, feeMissing: p.feeMissing,
  });

  if (p.unpriced > 0) {
    return {
      ...p, state: '조건 대기', blockers: prerequisites,
      open: null, release: null, due: steps.due,
      step1Amount: steps.parts[0], step2Amount: steps.parts[1], remaining: 0,
    };
  }

  if (!steps.open) {
    return {
      ...p, state: '확정 완료', blockers: [], open: null, release: null,
      due: steps.due, step1Amount: steps.parts[0], step2Amount: steps.parts[1], remaining,
    };
  }

  const release = payoutReleaseOf(p.kind, steps.open.no, p.milestones);
  const blockers = [...prerequisites];
  if (!release.met) blockers.push(`${release.trigger} 대기`);

  return {
    ...p,
    state: blockers.length > 0 ? '조건 대기' : '지급 가능',
    blockers,
    open: steps.open,
    release,
    due: steps.due,
    step1Amount: steps.parts[0],
    step2Amount: steps.parts[1],
    remaining,
  };
}

const PAYOUT_FILTERS = [
  { label: '전체' },
  { label: '영업비', kind: '영업비' as const },
  { label: '시공비', kind: '시공비' as const },
  { label: '영업비 1차 지급시기', kind: '영업비' as const, no: 1 as const },
  { label: '영업비 2차 지급시기', kind: '영업비' as const, no: 2 as const },
  { label: '시공비 1차 지급시기', kind: '시공비' as const, no: 1 as const },
  { label: '시공비 2차 지급시기', kind: '시공비' as const, no: 2 as const },
] as const;
type PayoutFilter = (typeof PAYOUT_FILTERS)[number]['label'];

export default function PayoutWorkBoard({ rows }: { rows: SettlementSummary[] }) {
  const [org, setOrg] = useState<string | null>(null);
  const [payoutFilter, setPayoutFilter] = useState<PayoutFilter>('전체');
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

  const money = useMemo(() => {
    const sum = (list: PayoutWork[], value: (p: PayoutWork) => number) =>
      list.reduce((n, p) => n + value(p), 0);
    const sales = work.filter((p) => p.kind === '영업비');
    return {
      salesTotal: sum(sales, (p) => p.due),
      salesStep1: sum(sales, (p) => p.step1Amount),
      salesStep2: sum(sales, (p) => p.step2Amount),
      salesUnpriced: sum(sales, (p) => p.unpriced),
      confirmed: sum(work, (p) => p.confirmed),
    };
  }, [work]);

  const filter = PAYOUT_FILTERS.find((item) => item.label === payoutFilter)!;
  const shown = work
    .filter((p) => org === null || p.org === org)
    .filter((p) => !('kind' in filter) || p.kind === filter.kind)
    .filter((p) => !('no' in filter) || p.open?.no === filter.no);
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
      <section aria-label="영업비 지급 계획" className="mb-5 rounded-panel border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <h2 className="text-h3 font-black text-slate-900">영업비 지급 계획</h2>
          {money.salesUnpriced > 0 && <Tag tone="warn">단가 미지정 {money.salesUnpriced}건 제외</Tag>}
        </div>
        <dl className="mt-3 grid gap-x-8 gap-y-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
          <div>
            <dt className="text-tiny font-bold tracking-[0.06em] text-slate-400">총 지급 영업비</dt>
            <dd className="mt-1 text-xl font-black tabular-nums text-slate-900">{won(money.salesTotal)}<span className="ml-1 text-xs text-slate-400">원</span></dd>
          </div>
          <div>
            <dt className="text-tiny font-bold tracking-[0.06em] text-slate-400">1차 지급액 · 70%</dt>
            <dd className="mt-1 text-xl font-black tabular-nums text-brand-900">{won(money.salesStep1)}<span className="ml-1 text-xs text-slate-400">원</span></dd>
          </div>
          <div>
            <dt className="text-tiny font-bold tracking-[0.06em] text-slate-400">2차 잔액</dt>
            <dd className="mt-1 text-xl font-black tabular-nums text-amber-800">{won(money.salesStep2)}<span className="ml-1 text-xs text-slate-400">원</span></dd>
          </div>
        </dl>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" aria-label="지급 구분과 회차">
          {PAYOUT_FILTERS.map((item) => (
            <Choice
              key={item.label}
              on={payoutFilter === item.label}
              onClick={() => { resetChoice(); setPayoutFilter(item.label); }}
            >
              {item.label}
            </Choice>
          ))}
        </div>

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
        <Frame min="1120px">
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" aria-label="보이는 지급 가능 항목 전부 선택"
                  checked={allShownSelected} disabled={selectable.length === 0 || busy} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2.5 text-left">현장</th>
              <th className="px-3 py-2.5 text-left">지급처</th>
              <th className="px-3 py-2.5 text-left">구분</th>
              <th className="px-3 py-2.5 text-left">현재 회차</th>
              <th className="px-3 py-2.5 text-left">지급 조건</th>
              <th className="px-3 py-2.5 text-right">이번 확정액</th>
              <th className="px-3 py-2.5 text-right">확정 누계</th>
              <th className="px-3 py-2.5 text-right">남은 금액</th>
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
                <td className="px-3 py-2.5">
                  {p.open ? <><span className="font-black text-slate-800">{p.open.no}차</span><p className="text-micro text-slate-400">{p.open.no === 1 ? '70%' : '잔액'}</p></>
                    : <span className="font-bold text-slate-400">완료</span>}
                </td>
                <td className="px-3 py-2.5">
                  {p.state === '확정 완료' ? <Tag>확정 완료</Tag> : <>
                    {p.release && <p className={`text-small font-bold ${p.release.met ? 'text-brand-800' : 'text-amber-800'}`}>{p.release.trigger} {p.release.metAt ?? '대기'}</p>}
                    {p.blockers.map((reason) => <p key={reason} className="text-micro font-bold text-amber-700">{reason}</p>)}
                    {p.state === '지급 가능' && <Tag tone="ok">지급 가능</Tag>}
                  </>}
                </td>
                <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-900">
                  {p.open ? won(p.open.amount) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-500">
                  {p.confirmed > 0 ? won(p.confirmed) : <span className="text-slate-300">—</span>}
                </td>
                <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${p.remaining > 0 ? 'text-amber-800' : p.remaining < 0 ? 'text-red-700' : 'text-slate-300'}`}>
                  {p.remaining === 0 ? '—' : won(p.remaining)}
                </td>
              </tr>
            ))}
          </tbody>
        </Frame>
      )}

      <CrossLink href="/payments" label="지급 내역" amount={money.confirmed} note="송금 대상으로 확정한 누계는" />
    </div>
  );
}

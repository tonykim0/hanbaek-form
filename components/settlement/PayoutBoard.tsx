'use client';

/**
 * 하도급사 지급관리 — 모아서 지급하는 자리.
 *
 * 회차 금액은 정해져 있다(지급할 총액의 1차 70% · 2차 잔액, lib/settlement.ts payoutStepsOf).
 * 그래서 이 화면에서 사람이 하는 일은 하나다 — 지급할 회차를 골라 지급일 하나로 처리한다.
 * 「8월 영업비를 한꺼번에」가 그것이다: 영업 필터 → 전체 선택 → 지급 처리.
 *
 * 축은 상대와 방향이다. 현장 하나가 두 줄이 된다 — 영업사에게 줄 돈과 시공사에게 줄 돈은
 * 받는 곳이 다르고 따로 나간다.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PayoutKind, SettlementSummary } from '@/types/project';
import { payoutStepsOf } from '@/lib/settlement';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { Btn, Choice, Err } from '@/components/ui';
import { CrossLink, Empty, Frame, SiteLink, Tile, won } from './parts';

/** 지급 한 줄 — 현장 하나에 영업·시공 두 줄이 붙는다 */
interface Payout {
  key: string;
  projectId: string;
  projectName: string;
  cpo: string;
  kind: PayoutKind;
  org: string | null;
  /** 계획 = Σ(단가 × 대수) */
  plan: number;
  adjust: number;
  paid: number;
  step1At: string | null;
  step2At: string | null;
  unpriced: number;
}

function payoutsOf(rows: SettlementSummary[]): Payout[] {
  return rows.flatMap((r) => [
    {
      key: `${r.id}|영업비`, projectId: r.id, projectName: r.name, cpo: r.cpo, kind: '영업비' as const,
      org: r.salesOrg, plan: r.salesTotal, adjust: r.salesAdjust, paid: r.salesPaid,
      step1At: r.salesStep1At, step2At: r.salesStep2At, unpriced: r.unpricedLines,
    },
    {
      key: `${r.id}|시공비`, projectId: r.id, projectName: r.name, cpo: r.cpo, kind: '시공비' as const,
      org: r.gcOrg, plan: r.consTotal, adjust: r.consAdjust, paid: r.consPaid,
      step1At: r.consStep1At, step2At: r.consStep2At, unpriced: r.unpricedLines,
    },
  ]);
}

const KIND_FILTERS = ['전체', '영업비', '시공비'] as const;

export default function PayoutBoard({ rows }: { rows: SettlementSummary[] }) {
  const [org, setOrg] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<(typeof KIND_FILTERS)[number]>('전체');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [at, setAt] = useState(today());
  const { busy, error, run } = useAction();

  const payouts = useMemo(() => payoutsOf(rows), [rows]);

  const orgs = useMemo(
    () =>
      [...new Set(payouts.map((p) => p.org).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b, 'ko')
      ),
    [payouts]
  );

  /*
   * ★받는 곳이 없는 줄은 합계에서 빼고, 지급 처리도 막는다.★
   * 줄 사람이 정해지지 않은 돈을 내보낼 수는 없다 — 업체를 지정하면 들어온다.
   */
  const payable = useMemo(() => payouts.filter((p) => p.org !== null), [payouts]);
  const orphan = useMemo(() => payouts.filter((p) => p.org === null), [payouts]);

  const money = useMemo(() => {
    const of = (kind: PayoutKind) => payable.filter((p) => p.kind === kind);
    const due = (list: Payout[]) => list.reduce((n, p) => n + p.plan + p.adjust, 0);
    const remaining = (list: Payout[]) => list.reduce((n, p) => n + (p.plan + p.adjust - p.paid), 0);
    return {
      salesDue: due(of('영업비')),
      salesRemaining: remaining(of('영업비')),
      consDue: due(of('시공비')),
      consRemaining: remaining(of('시공비')),
      due: due(payable),
      remaining: remaining(payable),
      receivable: rows.reduce((n, r) => n + r.planTotal, 0),
      margin: rows.reduce((n, r) => n + r.marginTotal, 0),
      unpriced: rows.filter((r) => r.unpricedLines > 0).length,
      orphanCount: orphan.length,
      orphanSites: [...new Map(orphan.map((p) => [p.projectId, p.projectName]))]
        .map(([id, name]) => ({ id, name })),
      orphanDue: due(orphan),
    };
  }, [payable, orphan, rows]);

  const shown = payable
    .filter((p) => org === null || p.org === org)
    .filter((p) => kindFilter === '전체' || p.kind === kindFilter);

  /** 지금 지급할 회차가 있는 줄 — 체크할 수 있는 것 */
  const openOf = (p: Payout) => payoutStepsOf(p.plan, p.adjust, p.paid).open;
  const selectable = shown.filter((p) => openOf(p) !== null);
  const selected = selectable.filter((p) => sel.has(p.key));
  const selectedTotal = selected.reduce((n, p) => n + (openOf(p)?.amount ?? 0), 0);

  const toggle = (key: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allShownSelected = selectable.length > 0 && selectable.every((p) => sel.has(p.key));
  const toggleAll = () =>
    setSel((prev) => {
      const next = new Set(prev);
      if (allShownSelected) selectable.forEach((p) => next.delete(p.key));
      else selectable.forEach((p) => next.add(p.key));
      return next;
    });

  async function pay() {
    const ok = await run({
      url: '/api/payouts',
      body: { at, items: selected.map((p) => ({ projectId: p.projectId, kind: p.kind })) },
      fail: '지급 처리에 실패했습니다.',
    });
    if (ok) setSel(new Set());
  }

  // 못 하는 이유를 버튼 이름에 적는다(화면 규칙 3)
  const blocked = selected.length === 0 ? '선택 없음' : !at ? '지급일 미입력' : null;

  return (
    <div>
      <section aria-label="지급 합계" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="영업비" value={money.salesDue} tone="out"
          note={`잔액 ${won(money.salesRemaining)}원`} />
        <Tile label="시공비" value={money.consDue} tone="out"
          note={`잔액 ${won(money.consRemaining)}원`} />
        <Tile label="내려줄 지급 합계" value={money.due}
          note={`잔액 ${won(money.remaining)}원`} />
        <Tile label="한백 몫" value={money.margin} note="받을 기성 − 내려줄 지급" />
      </section>

      {money.orphanCount > 0 && (
        <p className="mb-4 rounded-xl border-l-[3px] border-amber-500 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-900">
          받는 곳이 정해지지 않은 지급 <b>{money.orphanCount}건</b> (
          {/* 이름이 곧 가는 길이다 — 고치는 자리(현장 정보)는 어느 탭에서든 머리말에 보인다 */}
          {money.orphanSites.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ' · '}
              <Link href={`/projects/${s.id}`} className="font-bold underline underline-offset-2 hover:text-amber-950">
                {s.name}
              </Link>
            </span>
          ))}
          ) — 합계 {won(money.orphanDue)}원. <b>합계에서 빼 두었고 지급 처리도 안 됩니다.</b>{' '}
          현장 상세의 현장 정보에서 영업사·시공사를 지정하면 들어옵니다.
        </p>
      )}

      {money.unpriced > 0 && (
        <p className="mb-4 rounded-xl border-l-[3px] border-amber-500 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-900">
          단가가 안 붙은 라인이 있는 현장 <b>{money.unpriced}건</b> — 그 라인은 0원으로 더해지므로
          지급액이 실제보다 적게 잡힙니다. 현장 상세의 정산 탭에서 단가 케이스를 지정해야 합니다.
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* 구분 고르기 — 「8월 영업비만 모아서」가 이 필터다 */}
        <div className="flex gap-1">
          {KIND_FILTERS.map((k) => (
            <Choice key={k} on={kindFilter === k} onClick={() => setKindFilter(k)}>
              {k}
            </Choice>
          ))}
        </div>

        {/* 받는 곳 고르기 — 한 번에 하나다 */}
        {orgs.length > 1 && (
          <div className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-0.5">
            {[null, ...orgs].map((o) => (
              <button
                key={o ?? '전체'}
                type="button"
                aria-current={org === o}
                onClick={() => setOrg(o)}
                className={`whitespace-nowrap rounded-[10px] px-3 py-1.5 text-small font-bold transition ${
                  org === o ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {o ?? '전체'}
              </button>
            ))}
          </div>
        )}

        {/* 지급 처리 — 선택한 회차들이 이 지급일 하나로 나간다 */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={at}
            disabled={busy}
            aria-label="지급일"
            onChange={(e) => setAt(e.target.value)}
            className="rounded-ctl border border-slate-200 bg-white px-2 py-1.5 text-small tabular-nums"
          />
          <Btn disabled={blocked !== null} busy={busy} busyLabel="지급 처리 중…" onClick={pay}>
            {blocked ?? `선택 ${selected.length}건 ${won(selectedTotal)}원 지급 처리`}
          </Btn>
        </div>
      </div>
      <div className="mb-3 text-right"><Err>{error}</Err></div>

      {shown.length === 0 ? (
        <Empty />
      ) : (
        <Frame min="1080px">
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="보이는 지급할 회차 전부 선택"
                  checked={allShownSelected}
                  disabled={selectable.length === 0 || busy}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2.5 text-left">현장</th>
              <th className="px-3 py-2.5 text-left">구분</th>
              <th className="px-3 py-2.5 text-left">받는 곳</th>
              <th className="px-3 py-2.5 text-right">1차 70%</th>
              <th className="px-3 py-2.5 text-right">2차 잔액</th>
              <th className="px-3 py-2.5 text-right">잔액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((p) => {
              const steps = payoutStepsOf(p.plan, p.adjust, p.paid);
              const remaining = steps.due - p.paid;
              return (
                <tr key={p.key} className="transition hover:bg-brand-50/40">
                  <td className="px-3 py-2.5 text-center">
                    {steps.open ? (
                      <input
                        type="checkbox"
                        aria-label={`${p.projectName} ${p.kind} ${steps.open.no}차 선택`}
                        checked={sel.has(p.key)}
                        disabled={busy}
                        onChange={() => toggle(p.key)}
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <SiteLink id={p.projectId} name={p.projectName} tab="settlement" />
                    <p className="mt-0.5 text-tiny text-slate-400">{p.cpo}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-tiny font-bold ${
                        p.kind === '영업비' ? 'bg-sky-100 text-sky-900' : 'bg-brand-100 text-brand-900'
                      }`}
                    >
                      {p.kind}
                    </span>
                    {p.adjust !== 0 && (
                      <p className="mt-0.5 text-micro font-semibold text-slate-400">
                        조정 {p.adjust > 0 ? '+' : ''}{won(p.adjust)}
                      </p>
                    )}
                    {p.unpriced > 0 && (
                      <p
                        className="mt-0.5 text-micro font-bold text-amber-700"
                        title="단가가 안 붙은 라인이 있어 실제보다 적습니다"
                      >
                        단가 미지정
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{p.org}</td>
                  <StepCell
                    amount={steps.open?.no === 1 ? steps.open.amount : steps.parts[0]}
                    done={steps.step1Done}
                    at={p.step1At}
                    openNow={steps.open?.no === 1}
                    waitLabel={null}
                  />
                  <StepCell
                    amount={steps.open?.no === 2 ? steps.open.amount : steps.parts[1]}
                    done={steps.step2Done}
                    at={p.step2At}
                    openNow={steps.open?.no === 2}
                    waitLabel={steps.open?.no === 1 ? '1차 뒤' : null}
                  />
                  <td
                    className={`px-3 py-2.5 text-right font-bold tabular-nums ${
                      remaining > 0 ? 'text-amber-800' : remaining < 0 ? 'text-red-700' : 'text-slate-300'
                    }`}
                  >
                    {/* 음수 잔액은 더 준 것이다 — 회수·재정산으로 풀어야 하는 상태라 빨강 */}
                    {remaining !== 0 ? won(remaining) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Frame>
      )}

      <CrossLink
        href="/receivables"
        label="운영사 기성관리"
        amount={money.receivable}
        note="이 현장들에서 운영사에게 받을 기성은"
      />
    </div>
  );
}

/**
 * 회차 한 칸 — 금액과 상태.
 * 상태는 셋: 지급일(끝) · 미지급(지금 지급할 차례) · 1차 뒤(아직 차례 아님).
 * 원장 전의 기록으로 채워진 회차는 지급일이 없다 — 「기록 없음」이 아니라 —로 둔다.
 */
function StepCell({
  amount, done, at, openNow, waitLabel,
}: {
  amount: number;
  done: boolean;
  at: string | null;
  openNow: boolean;
  waitLabel: string | null;
}) {
  return (
    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
      <span className={`font-bold ${done ? 'text-slate-400' : 'text-slate-800'}`}>{won(amount)}</span>
      <p className={`text-micro ${done ? 'font-semibold text-brand-800' : openNow ? 'font-bold text-amber-700' : 'text-slate-300'}`}>
        {done ? at ?? '지급됨' : openNow ? '미지급' : waitLabel ?? '—'}
      </p>
    </td>
  );
}

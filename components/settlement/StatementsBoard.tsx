'use client';

/**
 * 거래명세서 작업대 — 위가 「지급 가능」 풀, 아래가 배치 목록.
 *
 * 풀: 조건이 찬 회차(트리거 충족·막힘 없음)만 모인다 — /payouts 표에서 흩어져 있던
 * 「지급 가능」 줄이 여기서는 그것만 모여 선다. 판정은 workOf(lib/payout-board) 한 벌 —
 * 두 화면이 같은 계산을 쓰므로 한쪽에만 보이는 줄이 생길 수 없다.
 *
 * 체크해서 지급일 하나로 확정하면(runPayoutBatch, 전부 되거나 전부 안 됨) 지급처가
 * 여럿 섞여 있어도 배치는 (지급처 × 지급일)로 저절로 갈라진다 — 명세서도 그 단위다.
 *
 * 배치 줄의 세금계산서 상태: 미첨부 → 금액 미확인(판독 실패) → 일치 ✓ / 차액 △.
 * 대조 기준은 공급가액이다 — 원장 금액이 공급가액이다(한백 확인 2026-08-23).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PayoutRow, TaxInvoice } from '@/types/project';
import { payoutReleaseOf } from '@/lib/settlement';
import {
  payDateChoices, workOf, type PayoutRowInput, type PayoutWork,
} from '@/lib/payout-board';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { Badge, Blank, Btn, Choice, Empty, Err, Tag } from '@/components/ui';
import { Frame, SiteLink, won } from './parts';

const dayLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;

interface Batch {
  paidAt: string;
  org: string | null;
  count: number;
  total: number;
  invoice: TaxInvoice | null;
}

/** 배치와 세금계산서의 대조 — 기준은 공급가액 */
type MatchState =
  | { kind: 'none' }
  | { kind: 'unknown' }
  | { kind: 'match' }
  | { kind: 'diff'; gap: number };

function matchOf(b: Batch): MatchState {
  if (!b.invoice) return { kind: 'none' };
  if (b.invoice.supplyAmount === null) return { kind: 'unknown' };
  if (b.invoice.supplyAmount === b.total) return { kind: 'match' };
  return { kind: 'diff', gap: b.invoice.supplyAmount - b.total };
}

export default function StatementsBoard({
  plans, history, invoices, canConfirm,
}: {
  plans: PayoutRowInput[];
  history: PayoutRow[];
  invoices: TaxInvoice[];
  /** 확정할 수 있는가 — 관리자만. 열람 전용은 풀·배치를 읽기만 한다. */
  canConfirm: boolean;
}) {
  const payable = useMemo(
    () =>
      plans
        .map(workOf)
        .filter((p): p is PayoutWork & { open: NonNullable<PayoutWork['open']> } =>
          p.state === '지급 가능' && p.open !== null
        )
        .sort((a, b) => (a.org ?? '').localeCompare(b.org ?? '', 'ko')),
    [plans]
  );

  const batches = useMemo<Batch[]>(() => {
    const inv = new Map(invoices.map((i) => [`${i.payDate}|${i.org}`, i]));
    const map = new Map<string, Batch>();
    for (const r of history) {
      const key = `${r.paidAt}|${r.org ?? ''}`;
      const b = map.get(key) ?? {
        paidAt: r.paidAt, org: r.org, count: 0, total: 0,
        invoice: r.org ? inv.get(`${r.paidAt}|${r.org}`) ?? null : null,
      };
      b.count += 1;
      b.total += r.amount;
      map.set(key, b);
    }
    return [...map.values()].sort(
      (a, b) => b.paidAt.localeCompare(a.paidAt) || (a.org ?? '').localeCompare(b.org ?? '', 'ko')
    );
  }, [history, invoices]);

  return (
    <div className="flex flex-col gap-7">
      <PayablePool payable={payable} canConfirm={canConfirm} />

      <section>
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-h3 font-black text-slate-900">배치</h2>
          <span className="text-tiny font-bold tabular-nums text-slate-400">{batches.length}건</span>
          <Link
            href="/payments"
            className="ml-auto text-small font-bold text-slate-500 transition hover:text-brand-800"
          >
            개별 내역은 지급 및 기성관리 →
          </Link>
        </div>
        {batches.length === 0 ? (
          <Blank>0건</Blank>
        ) : (
          <Frame min="760px">
            <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-left">지급일</th>
                <th className="px-3 py-2.5 text-left">지급처</th>
                <th className="px-3 py-2.5 text-right">건수</th>
                <th className="px-3 py-2.5 text-right">공급가액</th>
                <th className="px-3 py-2.5 text-left">세금계산서</th>
                <th className="px-3 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <BatchRow key={`${b.paidAt}|${b.org ?? ''}`} b={b} />
              ))}
            </tbody>
          </Frame>
        )}
      </section>
    </div>
  );
}

/* ── 지급 가능 풀 ─────────────────────────────────────────────────────────
 * 체크 → 지급일(익월 10·25) → 확정. 지급처가 섞여 있어도 배치는 저절로 갈라진다.
 */
function PayablePool({ payable, canConfirm }: { payable: PayoutWork[]; canConfirm: boolean }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [at, setAt] = useState<string | null>(null);

  const chosen = payable.filter((p) => picked.has(p.key));
  const sum = chosen.reduce((n, p) => n + (p.open?.amount ?? 0), 0);

  /*
   * 지급일 후보 — 고른 항목들의 트리거 충족일 중 가장 늦은 것의 익월 10·25일.
   * 이른 항목 기준으로 잡으면 늦은 항목이 규칙(충족 익월)보다 먼저 나가는 날이 된다.
   */
  const latestMet = chosen.reduce<string | null>((last, p) => {
    const met = p.open ? payoutReleaseOf(p.kind, p.open.no, p.milestones).metAt : null;
    return met && (!last || met > last) ? met : last;
  }, null);
  const [d10, d25] = payDateChoices(latestMet ?? today());
  const pickedAt = at === d10 || at === d25 ? at : d10;

  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function confirm() {
    const ok = await run({
      url: '/api/payouts',
      body: {
        at: pickedAt,
        items: chosen.map((p) => ({ projectId: p.projectId, kind: p.kind })),
      },
      fail: '확정하지 못했습니다.',
    });
    if (!ok) return;
    setPicked(new Set());
    // 확정된 줄은 풀에서 빠지고 아래 배치에 나타난다 — 서버 데이터만 다시 그린다
    router.refresh();
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-h3 font-black text-slate-900">지급 가능</h2>
        <span className="text-tiny font-bold tabular-nums text-slate-400">{payable.length}건</span>
      </div>

      {payable.length === 0 ? (
        /* 세었고 없다 — 조건(트리거·서류·단가)이 찬 회차가 아직 없는 것 */
        <Blank>0건 — 조건이 찬 회차가 없습니다</Blank>
      ) : (
        <>
          <Frame min="880px">
            <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
              <tr>
                {canConfirm && <th className="w-10 px-3 py-2.5"></th>}
                <th className="px-3 py-2.5 text-left">지급처</th>
                <th className="px-3 py-2.5 text-left">현장</th>
                <th className="px-3 py-2.5 text-left">구분 · 회차</th>
                <th className="px-3 py-2.5 text-left">지급시기</th>
                <th className="px-3 py-2.5 text-right">금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payable.map((p) => {
                const release = p.open ? payoutReleaseOf(p.kind, p.open.no, p.milestones) : null;
                return (
                  <tr
                    key={p.key}
                    onClick={canConfirm ? () => toggle(p.key) : undefined}
                    className={`transition ${canConfirm ? 'cursor-pointer' : ''} ${
                      picked.has(p.key) ? 'bg-brand-50/60' : 'hover:bg-brand-50/40'
                    }`}
                  >
                    {canConfirm && (
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`${p.projectName} ${p.kind} 선택`}
                          checked={picked.has(p.key)}
                          onChange={() => toggle(p.key)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 accent-brand-600"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5 font-bold text-slate-800">
                      {p.org ?? <Empty kind="miss" />}
                    </td>
                    <td className="px-3 py-2.5">
                      <SiteLink id={p.projectId} name={p.projectName} tab="settlement" />
                      <p className="mt-0.5 text-tiny text-slate-400">{p.cpo}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Tag tone={p.kind === '영업비' ? 'stage' : 'ok'}>{p.kind}</Tag>
                      <span className="ml-1.5 text-small font-bold text-slate-600">{p.open?.no}차</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-small text-slate-500">
                      {release ? `${release.trigger} ${release.metAt ?? ''}` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-black tabular-nums text-slate-900">
                      {won(p.open?.amount ?? 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Frame>

          {canConfirm && (
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <span className="text-small font-bold text-slate-600">
                {chosen.length}건 · <span className="tabular-nums">{won(sum)}</span>원
              </span>
              <span className="flex gap-1">
                <Choice on={pickedAt === d10} disabled={busy} onClick={() => setAt(d10)}>
                  {dayLabel(d10)}
                </Choice>
                <Choice on={pickedAt === d25} disabled={busy} onClick={() => setAt(d25)}>
                  {dayLabel(d25)}
                </Choice>
              </span>
              <Btn
                disabled={chosen.length === 0}
                busy={busy}
                busyLabel="확정 중…"
                onClick={() => void confirm()}
              >
                {chosen.length === 0 ? '회차를 골라 확정' : `${chosen.length}건 지급 확정`}
              </Btn>
              <Err>{error}</Err>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function BatchRow({ b }: { b: Batch }) {
  const m = matchOf(b);
  return (
    <tr className="transition hover:bg-brand-50/40">
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">
        {b.paidAt}
        {b.paidAt >= today() && (
          <span className="ml-1.5"><Badge tone="stage">예정</Badge></span>
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-700">
        {b.org ?? <Empty kind="miss" label="받는 곳 미지정" />}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-500">{b.count}건</td>
      <td className={`whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums ${b.total < 0 ? 'text-amber-800' : 'text-slate-800'}`}>
        {won(b.total)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        {m.kind === 'none' && <Empty kind="miss" label="미첨부" />}
        {m.kind === 'unknown' && <Badge tone="warn">금액 미확인</Badge>}
        {m.kind === 'match' && <Badge tone="ok">일치</Badge>}
        {m.kind === 'diff' && (
          <Badge tone="stop">차액 {m.gap > 0 ? '+' : ''}{won(m.gap)}</Badge>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right">
        {b.org && (
          <Link
            href={`/payments/statement?org=${encodeURIComponent(b.org)}&date=${b.paidAt}`}
            className="text-small font-bold text-brand-700 transition hover:text-brand-900"
          >
            명세서 →
          </Link>
        )}
      </td>
    </tr>
  );
}

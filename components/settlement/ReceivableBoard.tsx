'use client';

/**
 * 운영사 기성관리 — 운영사에게서 받을 돈.
 *
 * 축은 차수와 트리거다. 기성은 우리가 청구해서 받는 게 아니라 조건이 차면 열린다 —
 * 환경부 승인일·실착공일·준공마감일. 그래서 각 차수가 어느 트리거를 기다리는지가
 * 금액보다 먼저 보여야 한다.
 *
 * 협력사 지급은 여기 없다. 별도 화면이다 — 두 방향을 한 표에 놓으면 상계해서 보는
 * 사람이 생기고, 「얼마 남았나」가 어느 쪽 이야기인지 매번 따져야 한다.
 */
import { useMemo, useState } from 'react';
import type { SettlementSummary } from '@/types/project';
import { STEP_LABEL, STEP_TONE } from '@/lib/settlement';
import { Badge, Blank, Choice, Empty, Note } from '@/components/ui';
import { CrossLink, Frame, SiteLink, Tile, won } from './parts';

export default function ReceivableBoard({ rows }: { rows: SettlementSummary[] }) {
  const [openOnly, setOpenOnly] = useState(false);

  const money = useMemo(() => {
    const sum = (f: (r: SettlementSummary) => number) => rows.reduce((n, r) => n + f(r), 0);
    return {
      plan: sum((r) => r.planTotal),
      collected: sum((r) => r.collectedTotal),
      open: sum((r) =>
        r.steps.filter((s) => s.state === 'open').reduce((m, s) => m + (s.planAmount ?? 0), 0)
      ),
      payout: sum((r) => r.salesTotal + r.consTotal),
      noRule: rows.filter((r) => r.ruleName === null).length,
    };
  }, [rows]);

  const openCount = rows.filter((r) => r.steps.some((s) => s.state === 'open')).length;
  const shown = openOnly ? rows.filter((r) => r.steps.some((s) => s.state === 'open')) : rows;
  const rate = money.plan > 0 ? Math.round((money.collected / money.plan) * 1000) / 10 : null;

  return (
    <div>
      <section aria-label="기성 합계" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="받을 기성" value={money.plan} />
        <Tile label="회수" value={money.collected} tone="in"
          note={rate !== null ? `회수율 ${rate}%` : undefined} />
        <Tile label="청구 가능" value={money.open} tone="wait"
          note="트리거가 열렸고 아직 안 들어온 돈" />
        <Tile label="미회수" value={Math.max(0, money.plan - money.collected)} />
      </section>

      {money.noRule > 0 && (
        <Note tone="warn" className="mb-4">
          정산 규칙이 없는 현장 <b>{money.noRule}건</b> — 기성 차수와 금액이 계산되지 않습니다.
          현장 상세의 기성 탭에서 규칙을 지정해야 합니다.
        </Note>
      )}

      <div className="mb-3">
        <Choice on={openOnly} onClick={() => setOpenOnly(!openOnly)}>
          청구 가능한 것만 <span className="tabular-nums">{openCount}</span>
        </Choice>
      </div>

      {shown.length === 0 ? (
        <Blank>조건에 맞는 현장이 0건</Blank>
      ) : (
        <Frame min="960px">
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left">현장</th>
              <th className="px-3 py-2.5 text-left">정산 규칙</th>
              <th className="px-3 py-2.5 text-left">1차</th>
              <th className="px-3 py-2.5 text-left">2차</th>
              <th className="px-3 py-2.5 text-left">3차</th>
              <th className="px-3 py-2.5 text-right">받을 금액</th>
              <th className="px-3 py-2.5 text-right">회수</th>
              <th className="px-3 py-2.5 text-right">미회수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => (
              <tr key={r.id} className="transition hover:bg-brand-50/40">
                <td className="px-3 py-2.5">
                  <SiteLink id={r.id} name={r.name} tab="receivable" />
                  <p className="mt-0.5 text-tiny text-slate-400">
                    {r.cpo} · {r.qty}대 · {r.status}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  {r.ruleName ? (
                    <span className="text-small text-slate-600">{r.ruleName}</span>
                  ) : (
                    <Badge tone="warn">미적용</Badge>
                  )}
                </td>
                {[1, 2, 3].map((no) => {
                  const s = r.steps.find((x) => x.no === no);
                  if (!s) return <td key={no} className="px-3 py-2.5"><Empty kind="na" /></td>;
                  return (
                    <td key={no} className="px-3 py-2.5">
                      {/* 규칙상 없는 차수는 배지가 아니라 빈 값이다(화면 규칙 10) */}
                      {s.state === 'na' ? (
                        <Empty kind="na" />
                      ) : (
                        <Badge tone={STEP_TONE[s.state]}>{STEP_LABEL[s.state]}</Badge>
                      )}
                      <p className="mt-0.5 text-tiny font-bold tabular-nums text-slate-700">
                        {s.planAmount === null ? '—' : won(s.planAmount)}
                      </p>
                      <p className="text-micro text-slate-400">{s.trigger}</p>
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-800">
                  {won(r.planTotal)}
                </td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-brand-800">
                  {r.collectedTotal > 0 ? won(r.collectedTotal) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-500">
                  {won(Math.max(0, r.planTotal - r.collectedTotal))}
                </td>
              </tr>
            ))}
          </tbody>
        </Frame>
      )}

      <CrossLink
        href="/payouts"
        label="협력사 지급관리"
        amount={money.payout}
        note="이 현장들에서 하도급사에 내려줄 지급은"
      />
    </div>
  );
}

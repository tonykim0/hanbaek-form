'use client';

/**
 * 운영사 기성관리 — 운영사에게서 받을 돈.
 *
 * 축은 차수와 트리거다. 기성은 우리가 청구해서 받는 게 아니라 조건이 차면 열린다 —
 * 환경부 승인일·실착공일·준공마감일. 그래서 각 차수가 지금 어디까지 왔는지가
 * 합계보다 먼저 보여야 한다.
 *
 * 협력사 지급은 여기 없다. 별도 화면이다 — 두 방향을 한 표에 놓으면 상계해서 보는
 * 사람이 생기고, 「얼마 남았나」가 어느 쪽 이야기인지 매번 따져야 한다.
 * 화면 아래에 협력사 지급 합계를 건너가는 줄로 붙여 뒀던 것도 걷어냈다(한백 확인
 * 2026-08-23) — 받을 돈만 보는 화면에 내려줄 돈의 총액이 있으면 그 상계를 부른다.
 *
 * ★말★ 들어오는 돈은 「수금」이다. 「회수」는 지급 원장에서 협력사에게 잘못 준 돈을
 * 돌려받는 뜻으로 이미 쓰고 있어서(PAYOUT_KINDS), 같은 글자가 정반대 방향을 가리켰다.
 */
import { useMemo } from 'react';
import type { SettlementSummary } from '@/types/project';
import { STEP_LABEL, STEP_TONE } from '@/lib/settlement';
import { Badge, Blank, Empty, Note } from '@/components/ui';
import { Frame, SiteLink, Tile, won } from './parts';

export default function ReceivableBoard({ rows }: { rows: SettlementSummary[] }) {
  const money = useMemo(() => {
    const sum = (f: (r: SettlementSummary) => number) => rows.reduce((n, r) => n + f(r), 0);
    return {
      plan: sum((r) => r.planTotal),
      collected: sum((r) => r.collectedTotal),
      open: sum((r) =>
        r.steps.filter((s) => s.state === 'open').reduce((m, s) => m + (s.planAmount ?? 0), 0)
      ),
      noRule: rows.filter((r) => r.ruleName === null).length,
    };
  }, [rows]);

  const rate = money.plan > 0 ? Math.round((money.collected / money.plan) * 1000) / 10 : null;

  return (
    <div>
      <section aria-label="기성 합계" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="받을 기성" value={money.plan} />
        <Tile label="수금" value={money.collected} tone="in"
          note={rate !== null ? `수금률 ${rate}%` : undefined} />
        <Tile label="청구 가능" value={money.open} tone="wait"
          note="트리거가 열렸고 아직 안 들어온 돈" />
        <Tile label="미수금" value={Math.max(0, money.plan - money.collected)} />
      </section>

      {/*
        * 정산 규칙 열은 표에서 뺐다(한백 확인 2026-08-23) — 규칙 이름은 차수·금액을 그대로
        * 풀어 쓴 긴 문자열이라 표에서 한 열을 통째로 먹으면서, 정작 표가 답해야 하는
        * 「어느 차수까지 왔고 얼마 남았나」와는 상관이 없다. 규칙은 현장 상세의 기성 탭에서 본다.
        * 규칙이 아예 없어 계산이 안 되는 현장은 세어서 여기 띠로 남긴다 — 그건 막힘이다.
        */}
      {money.noRule > 0 && (
        <Note tone="warn" className="mb-4">
          정산 규칙이 없는 현장 <b>{money.noRule}건</b> — 기성 차수와 금액이 계산되지 않습니다.
          현장 상세의 기성 탭에서 규칙을 지정해야 합니다.
        </Note>
      )}

      {rows.length === 0 ? (
        <Blank>현장 0건</Blank>
      ) : (
        <Frame min="900px">
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left">현장</th>
              {/* 차수 열의 값은 그 차수의 상태다. 금액은 그 아래 딸린 값이다(계획액). */}
              <th className="px-3 py-2.5 text-left">1차</th>
              <th className="px-3 py-2.5 text-left">2차</th>
              <th className="px-3 py-2.5 text-left">3차</th>
              <th className="px-3 py-2.5 text-right">받을 금액</th>
              <th className="px-3 py-2.5 text-right">수금</th>
              <th className="px-3 py-2.5 text-right">미수금</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="transition hover:bg-brand-50/40">
                <td className="px-3 py-2.5">
                  <SiteLink id={r.id} name={r.name} tab="receivable" />
                  <p className="mt-0.5 text-tiny text-slate-400">
                    {r.cpo} · {r.qty}대 · {r.status}
                  </p>
                </td>
                {([1, 2, 3] as const).map((no) => (
                  <StepCell key={no} step={r.steps.find((x) => x.no === no) ?? null} />
                ))}
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
    </div>
  );
}

/**
 * 차수 한 칸 — 상태가 값이고, 계획액이 그 아래 딸린다.
 *
 * 트리거(환경부 승인·착공·준공마감)는 걷어냈다(한백 확인 2026-08-23). 그것은 정산 규칙이
 * 정한 것이라 현장마다 바뀌지 않고, 이 표에서 매 줄 반복되면 상태와 금액을 가린다.
 * 어느 트리거를 기다리는지는 현장 상세의 기성 탭에서 본다.
 */
function StepCell({ step }: { step: { state: keyof typeof STEP_LABEL; planAmount: number | null } | null }) {
  // 규칙상 없는 차수는 배지가 아니라 빈 값이다(화면 규칙 10번)
  if (!step || step.state === 'na') {
    return (
      <td className="px-3 py-2.5">
        <Empty kind="na" />
      </td>
    );
  }
  return (
    <td className="px-3 py-2.5">
      <Badge tone={STEP_TONE[step.state]}>{STEP_LABEL[step.state]}</Badge>
      <p className="mt-0.5 text-tiny font-bold tabular-nums text-slate-700">
        {step.planAmount === null ? '—' : won(step.planAmount)}
      </p>
    </td>
  );
}

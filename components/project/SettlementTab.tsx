'use client';

/**
 * 정산 탭 — 계약 라인 · 지급 · 기성.
 *
 * 협력사에게는 자기 몫만 보인다. 가리는 것이 아니라 저장소에서 지워서 온다
 * (redactForViewer) — 서버가 렌더한 데이터는 브라우저에 통째로 실린다.
 */
import { useState } from 'react';
import type { ProjectDetail, SettlementStep } from '@/types/project';
import { triggerSource, recoveryRate, turnkeyUnit, payInstallments } from '@/lib/settlement';
import type { Visibility } from '@/lib/roles';
import type { RuleOptions } from '@/lib/pricing-match';
import { useAction } from '@/lib/use-action';
import { won } from '@/lib/format';

// ── 정산 탭 ─────────────────────────────────────────────────────
const STEP_STYLE: Record<SettlementStep['state'], string> = {
  na: 'border-l-slate-200 bg-white',
  waiting: 'border-l-slate-300 bg-white',
  open: 'border-l-amber-500 bg-amber-50/70',
  collected: 'border-l-brand-500 bg-brand-50/60',
};

const STEP_LABEL: Record<SettlementStep['state'], string> = {
  na: '해당없음',
  waiting: '트리거 대기',
  open: '청구 가능',
  collected: '회수 완료',
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
  const rate = recoveryRate(settlement.steps);

  return (
    <div className="flex flex-col gap-7">
      {/* 금액의 뿌리가 여기다 — 지급·기성보다 먼저 본다 */}
      <ContractLines lines={lines} vis={vis} />

      <PaymentSection
        projectId={detail.project.id}
        lines={lines}
        settlement={settlement}
        vis={vis}
        canReview={canReview}
        ruleOptions={ruleOptions}
      />

      {/*
        * 기성은 한백만 본다 — 운영사에게서 받는 돈이라 협력사가 볼 자리가 아니다.
        * 예전에는 구역을 그려놓고 「한백 관리자만 볼 수 있습니다」로 막았는데,
        * 볼 수 없는 것을 자리까지 만들어 보여줄 이유가 없다.
        */}
      {vis.cost && (
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-h3 font-black text-slate-900">기성</h2>
            <div className="flex flex-wrap items-baseline gap-3">
              {rate !== null && (
                <span className="text-xs font-bold text-slate-500">
                  회수율 <span className="tabular-nums text-slate-800">{rate}%</span>
                </span>
              )}
              <span className="text-xs font-bold text-slate-500">
                준공마감{' '}
                {settlement.cpoCloseDate ? (
                  <span className="tabular-nums text-slate-800">{settlement.cpoCloseDate}</span>
                ) : (
                  <span className="text-amber-700">통보 없음</span>
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {settlement.steps.map((s) => (
              <div
                key={s.no}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 border-l-[3px] px-4 py-3 ${STEP_STYLE[s.state]}`}
              >
                <span className="w-10 shrink-0 text-xs font-bold text-slate-400">{s.no}차</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800">
                    {s.trigger === '해당없음' ? '해당없음' : `${s.trigger} · ${s.basisLabel}`}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {s.state === 'na' ? '해당 차수 없음' : triggerSource(s.trigger)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    s.state === 'open'
                      ? 'bg-amber-200 text-amber-900'
                      : s.state === 'collected'
                        ? 'bg-brand-200 text-brand-900'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {STEP_LABEL[s.state]}
                </span>
                <span className="w-28 shrink-0 text-right text-sm font-black tabular-nums text-slate-800">
                  {s.planAmount === null ? <span className="text-slate-300">—</span> : won(s.planAmount)}
                </span>
              </div>
            ))}
          </div>

          {!detail.settlementRule && (
            <p className="mt-3 rounded-xl border-l-[3px] border-amber-500 bg-amber-50/60 px-4 py-2.5 text-xs font-semibold text-amber-900">
              정산 규칙 미적용 — 기성 단계와 금액이 계산되지 않습니다
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * 계약 라인 · 단가 — 정산 탭 맨 위.
 *
 * 계약 탭에 있었는데 정산으로 옮겼다. 여기 적힌 금액이 아래 지급·기성의 뿌리이므로,
 * 그 금액을 보는 자리에서 가장 먼저 보여야 한다.
 *
 * 읽는 자리다. 케이스를 고르는 것은 아래 「지급」에서 한다 — 고르는 자리를 두 곳에 두면
 * 어느 쪽이 정본인지 알 수 없게 된다.
 */
function ContractLines({ lines, vis }: { lines: ProjectDetail['lines']; vis: Visibility }) {
  return (
    <section>
      <h2 className="mb-3 text-h3 font-black text-slate-900">계약 라인 · 단가</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left">라인</th>
              <th className="px-4 py-2.5 text-left">적용 단가 케이스</th>
              <th className="px-4 py-2.5 text-right">영업비/대</th>
              <th className="px-4 py-2.5 text-right">시공비/대</th>
              {vis.cost && <th className="px-4 py-2.5 text-right">턴키/대</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-800">
                  {l.termYears}년 × {l.qty}대
                  {l.powerType && (
                    <span className="ml-1.5 text-[11px] font-semibold text-slate-400">
                      {l.powerType}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {l.rule ? (
                    <>
                      {l.rule.caseName}
                      <span className="ml-1.5 text-[11px] text-slate-400">
                        {l.pricedAt} 확정
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400">미지정 — 아래 「지급」에서 고릅니다</span>
                  )}
                </td>
                <Money show={vis.sales} value={l.rule?.salesUnit ?? null} />
                <Money show={vis.cons} value={l.rule?.consUnit ?? null} />
                {vis.cost && <Money show value={l.rule ? turnkeyUnit(l.rule) : null} />}
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
      <td className="px-4 py-3 text-right">
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
          권한 없음
        </span>
      </td>
    );
  }
  return (
    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
      {value === null ? <span className="text-slate-300">—</span> : won(value)}
    </td>
  );
}

// ── 지급 ────────────────────────────────────────────────────────
/**
 * 지급 — 한백이 협력사에게 주는 돈.
 *
 * 금액을 사람이 적지 않는다. 계약 라인에 단가 케이스를 붙이면 영업비·시공비가 정해지고,
 * 여기에 대수와 회차 비율(70:30)을 곱해 나온다. 손으로 적게 두면 매트릭스와 어긋난 금액이
 * 남고, 나중에 어느 쪽이 맞는지 판단할 근거가 없어진다.
 *
 * 사람이 정하는 것은 셋뿐이다 — 어느 케이스인가 · 언제 줬는가 · 무슨 사정이 있었는가.
 */
function PaymentSection({
  projectId, lines, settlement, vis, canReview, ruleOptions,
}: {
  projectId: string;
  lines: ProjectDetail['lines'];
  settlement: ProjectDetail['settlement'];
  vis: Visibility;
  canReview: boolean;
  ruleOptions: RuleOptions | null;
}) {
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);

  const [dates, setDates] = useState({
    salesPay1Date: settlement.salesPay1Date ?? '',
    salesPay2Date: settlement.salesPay2Date ?? '',
    consPay1Date: settlement.consPay1Date ?? '',
    consPay2Date: settlement.consPay2Date ?? '',
  });
  const [note, setNote] = useState(settlement.payNote ?? '');

  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const salesTotal = lines.reduce((s, l) => s + (l.rule?.salesUnit ?? 0) * l.qty, 0);
  const consTotal = lines.reduce((s, l) => s + (l.rule?.consUnit ?? 0) * l.qty, 0);
  const unpriced = lines.filter((l) => !l.rule).length;

  const dirty =
    note !== (settlement.payNote ?? '')
    || (Object.keys(dates) as Array<keyof typeof dates>).some(
      (k) => dates[k] !== (settlement[k] ?? '')
    );

  const pickRule = (lineId: string, ruleId: string) =>
    void run({
      url: `/api/projects/${projectId}/lines/${lineId}`,
      method: 'PATCH',
      body: { pricingRuleId: ruleId || null },
      fail: '단가 지정에 실패했습니다.',
    });

  async function save() {
    setSaved(false);
    const ok = await run({
      url: `/api/projects/${projectId}/payment`,
      method: 'PATCH',
      body: { ...dates, payNote: note },
      fail: '저장에 실패했습니다.',
    });
    if (ok) setSaved(true);
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-h3 font-black text-slate-900">지급</h2>
        <span className="text-xs text-slate-400">계약 {totalQty}대 기준</span>
      </div>

      {/* 적용 단가 — 여기서 고른 케이스가 아래 금액을 정한다 */}
      {canReview && ruleOptions && (
        <div className="mb-4 flex flex-col gap-2">
          {lines.map((l) => {
            const opts = ruleOptions[l.id];
            const list = opts ? [...opts.exact, ...opts.others] : [];
            return (
              <div key={l.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-bold text-slate-800">
                    {l.termYears}년 × {l.qty}대
                  </span>
                  {l.powerType && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                      {l.powerType}
                    </span>
                  )}
                  {opts && (
                    <span className="text-[11px] text-slate-400">
                      {opts.usedAxes.join(' · ')}(으)로 후보 {opts.exact.length}건
                    </span>
                  )}
                </div>

                <select
                  value={l.pricingRuleId ?? ''}
                  disabled={busy}
                  onChange={(e) => pickRule(l.id, e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-slate-50"
                >
                  <option value="">단가 케이스 선택 —</option>
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

                {(() => {
                  const turnkey = l.rule ? turnkeyUnit(l.rule) : null;
                  if (turnkey === null) return null;
                  return (
                    <p className="mt-1.5 text-xs tabular-nums text-slate-500">
                      턴키 {won(turnkey)}/대 · 이 라인 {won(turnkey * l.qty)}
                    </p>
                  );
                })()}
                {list.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    이 운영사의 단가 케이스가 없습니다 — 매트릭스를 확인해주세요.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unpriced > 0 && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
          단가 미지정 라인 {unpriced}건 — 지급액이 계산되지 않습니다.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left">항목</th>
              <th className="px-4 py-2.5 text-left">비율</th>
              <th className="px-4 py-2.5 text-right">금액</th>
              <th className="px-4 py-2.5 text-right">지급일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <PayRow show={vis.sales} label="영업비 1차" ratio="70%" amount={payInstallments(salesTotal)[0]}
              date={dates.salesPay1Date} editable={canReview} busy={busy}
              onChange={(v) => setDates((d) => ({ ...d, salesPay1Date: v }))} />
            <PayRow show={vis.sales} label="영업비 2차" ratio="30%" amount={payInstallments(salesTotal)[1]}
              date={dates.salesPay2Date} editable={canReview} busy={busy}
              onChange={(v) => setDates((d) => ({ ...d, salesPay2Date: v }))} />
            <PayRow show={vis.cons} label="시공비 1차" ratio="70%" amount={payInstallments(consTotal)[0]}
              date={dates.consPay1Date} editable={canReview} busy={busy}
              onChange={(v) => setDates((d) => ({ ...d, consPay1Date: v }))} />
            <PayRow show={vis.cons} label="시공비 2차" ratio="30%" amount={payInstallments(consTotal)[1]}
              date={dates.consPay2Date} editable={canReview} busy={busy}
              onChange={(v) => setDates((d) => ({ ...d, consPay2Date: v }))} />
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <label htmlFor="payNote" className="text-xs font-bold text-slate-500">비고</label>
        {canReview ? (
          <textarea
            id="payNote"
            value={note}
            rows={2}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder="감액·보류 사유 등 금액만으로 설명되지 않는 것"
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm leading-relaxed focus:border-brand-500 focus:outline-none disabled:bg-slate-50"
          />
        ) : (
          <p className="mt-1 text-sm text-slate-600">
            {settlement.payNote || <span className="text-slate-300">없음</span>}
          </p>
        )}
      </div>

      {canReview && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={save}
            className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {busy ? '저장 중' : dirty ? '지급일·비고 저장' : '변경 없음'}
          </button>
          {saved && !dirty && <span className="text-xs font-bold text-brand-700">저장됨</span>}
          {error && <span className="text-xs font-semibold text-red-700">{error}</span>}
        </div>
      )}
    </section>
  );
}

function PayRow({
  show, label, ratio, amount, date, editable, busy, onChange,
}: {
  show: boolean;
  label: string;
  ratio: string;
  amount: number;
  date: string;
  editable: boolean;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-800">{label}</td>
      <td className="px-4 py-3 text-slate-500">{ratio}</td>
      {show ? (
        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
          {amount > 0 ? won(Math.round(amount)) : <span className="text-slate-300">단가 미지정</span>}
        </td>
      ) : (
        <td className="px-4 py-3 text-right">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
            권한 없음
          </span>
        </td>
      )}
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-500">
        {editable ? (
          <input
            type="date"
            value={date}
            disabled={busy}
            aria-label={`${label} 지급일`}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm tabular-nums focus:border-brand-500 focus:outline-none disabled:bg-slate-50"
          />
        ) : (
          date || <span className="text-slate-300">—</span>
        )}
      </td>
    </tr>
  );
}

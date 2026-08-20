'use client';

/**
 * 정산 탭 — 계약 라인 · 지급 · 기성.
 *
 * 협력사에게는 자기 몫만 보인다. 가리는 것이 아니라 저장소에서 지워서 온다
 * (redactForViewer) — 서버가 렌더한 데이터는 브라우저에 통째로 실린다.
 */
import { useState } from 'react';
import type { PayoutCategory, PayoutEntry, PayoutKind, ProjectDetail, SettlementStep } from '@/types/project';
import { PAYOUT_CATEGORIES, PAYOUT_KINDS } from '@/types/project';
import {
  entryTypeOf, payInstallments, payoutSideOf, recoveryRate, triggerSource, turnkeyUnit,
} from '@/lib/settlement';
import { today } from '@/lib/date';
import type { Visibility } from '@/lib/roles';
import type { RuleOptions } from '@/lib/pricing-match';
import { useAction } from '@/lib/use-action';
import { won } from '@/lib/format';
import { Btn, Choice, Err, FIELD, FIELD_CELL, Note, Saved, Tag } from '@/components/ui';

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
        entries={detail.payoutEntries}
        salesOrg={detail.project.salesOrg}
        gcOrg={detail.project.gcOrg}
        payNote={settlement.payNote}
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
                <span className="text-tiny font-bold text-slate-500">
                  회수율 <span className="tabular-nums text-slate-800">{rate}%</span>
                </span>
              )}
              <span className="text-tiny font-bold text-slate-500">
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
                <span
                  className={`rounded-full px-2.5 py-0.5 text-tiny font-bold ${
                    s.state === 'open'
                      ? 'bg-amber-200 text-amber-900'
                      : s.state === 'collected'
                        ? 'bg-brand-200 text-brand-900'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {STEP_LABEL[s.state]}
                </span>
                <span className="w-28 shrink-0 text-right text-lead font-black tabular-nums text-slate-800">
                  {s.planAmount === null ? <span className="text-slate-300">—</span> : won(s.planAmount)}
                </span>
              </div>
            ))}
          </div>

          {!detail.settlementRule && (
            <Note tone="warn" className="mt-3 font-semibold">
              정산 규칙 미적용 — 기성 단계와 금액이 계산되지 않습니다
            </Note>
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
      <div className="overflow-x-auto rounded-box border border-slate-200">
        <table className="w-full min-w-[640px] text-base">
          <thead className="bg-slate-50 text-tiny font-bold tracking-[0.08em] text-slate-500">
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
                    <span className="ml-1.5 text-tiny font-semibold text-slate-400">
                      {l.powerType}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {l.rule ? (
                    <>
                      {l.rule.caseName}
                      <span className="ml-1.5 text-tiny text-slate-400">
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
        <Tag>권한 없음</Tag>
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
 * 지급 — 한백이 협력사에게 주는 돈. 계획은 유도되고, 실적은 원장에 적는다.
 *
 * 계획(단가 케이스 × 대수, 회차 70:30)은 사람이 손대지 않는다. 실제로 나간 돈은 계획과
 * 어긋난다 — 선금·차액·회수·차감이 노션 정산관리 115행 중 10행에 비고 문장으로만 있었다.
 * 그래서 나간 돈은 원장에 한 건씩 적고, 잔액 = 계획 + 조정 − 지급 으로 센다.
 */
const CATEGORY_INFO = new Map(PAYOUT_CATEGORIES.map((c) => [c.key, c]));

function PaymentSection({
  projectId, lines, entries, salesOrg, gcOrg, payNote, vis, canReview, ruleOptions,
}: {
  projectId: string;
  lines: ProjectDetail['lines'];
  entries: PayoutEntry[];
  salesOrg: string | null;
  gcOrg: string | null;
  payNote: string | null;
  vis: Visibility;
  canReview: boolean;
  ruleOptions: RuleOptions | null;
}) {
  const { busy, error, run } = useAction();

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

  const pickRule = (lineId: string, ruleId: string) =>
    void run({
      url: `/api/projects/${projectId}/lines/${lineId}`,
      method: 'PATCH',
      body: { pricingRuleId: ruleId || null },
      fail: '단가 지정에 실패했습니다.',
    });

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-h3 font-black text-slate-900">지급</h2>
        <span className="text-tiny text-slate-400">계약 {totalQty}대 기준</span>
      </div>

      {/* 적용 단가 — 여기서 고른 케이스가 아래 금액을 정한다 */}
      {canReview && ruleOptions && (
        <div className="mb-4 flex flex-col gap-2">
          {lines.map((l) => {
            const opts = ruleOptions[l.id];
            const list = opts ? [...opts.exact, ...opts.others] : [];
            return (
              <div key={l.id} className="rounded-box border border-slate-200 p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-lead font-bold text-slate-800">
                    {l.termYears}년 × {l.qty}대
                  </span>
                  {l.powerType && (
                    <Tag>{l.powerType}</Tag>
                  )}
                  {opts && (
                    <span className="text-tiny text-slate-400">
                      {opts.usedAxes.join(' · ')}(으)로 후보 {opts.exact.length}건
                    </span>
                  )}
                </div>

                <select
                  value={l.pricingRuleId ?? ''}
                  disabled={busy}
                  onChange={(e) => pickRule(l.id, e.target.value)}
                  className={`${FIELD} mt-2`}
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

                {(() => {
                  const turnkey = l.rule ? turnkeyUnit(l.rule) : null;
                  if (turnkey === null) return null;
                  return (
                    <p className="mt-1.5 text-small tabular-nums text-slate-500">
                      턴키 {won(turnkey)}/대 · 이 라인 {won(turnkey * l.qty)}
                    </p>
                  );
                })()}
                {list.length === 0 && (
                  <p className="mt-1.5 text-small text-amber-700">
                    이 운영사의 단가 케이스가 없습니다 — 매트릭스를 확인해주세요.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unpriced > 0 && (
        <Note tone="warn" className="mb-3 font-semibold">
          단가 미지정 라인 {unpriced}건 — 지급액이 계산되지 않습니다.
        </Note>
      )}

      {/* 잔액의 뿌리 — 계획(유도) + 조정 − 지급. 원장이 아래에 있다. */}
      <div className={`grid gap-2 ${sides.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {sides.map((side) => {
          const { adjust, paid } = payoutSideOf(entries, side.kind);
          const due = side.plan + adjust;
          const remaining = due - paid;
          const parts = payInstallments(Math.max(0, due));
          return (
            <div key={side.kind} className="rounded-box border border-slate-200 p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-base font-black text-slate-900">{side.kind}</h3>
                {side.org ? (
                  <span className="text-small text-slate-500">→ {side.org}</span>
                ) : (
                  <span className="text-small font-bold text-amber-700">받는 곳 미지정</span>
                )}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-base tabular-nums">
                <div className="flex justify-between"><dt className="text-slate-500">계획</dt><dd className="font-semibold text-slate-800">{won(side.plan)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">조정</dt>
                  <dd className={`font-semibold ${adjust === 0 ? 'text-slate-300' : adjust > 0 ? 'text-slate-800' : 'text-amber-800'}`}>
                    {adjust === 0 ? '—' : `${adjust > 0 ? '+' : ''}${won(adjust)}`}
                  </dd>
                </div>
                <div className="flex justify-between"><dt className="text-slate-500">나간 돈</dt><dd className="font-semibold text-slate-800">{won(paid)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">잔액</dt>
                  <dd className={`font-black ${remaining > 0 ? 'text-amber-800' : remaining < 0 ? 'text-red-700' : 'text-slate-300'}`}>
                    {remaining === 0 ? '0원' : won(remaining)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 border-t border-slate-100 pt-2 text-tiny tabular-nums text-slate-400">
                회차 기준 1차 70% {won(parts[0])} · 2차 30% {won(parts[1])}
              </p>
            </div>
          );
        })}
      </div>

      <Ledger projectId={projectId} entries={entries} canReview={canReview} />

      <PayNoteBox projectId={projectId} payNote={payNote} canReview={canReview} />
    </section>
  );
}

/**
 * 지급 원장 — 나간 돈(지급)과 줘야 할 금액의 변화(조정)를 한 건씩 적는다.
 *
 * 고치기가 없다 — 지우고 다시 넣는다. 지운 값은 감사 로그에 남는다.
 * 지우기는 두 번 누른다(지우기 → 삭제 확정) — 금액 기록이라 스치는 클릭에 없어지면 안 된다.
 */
function Ledger({
  projectId, entries, canReview,
}: {
  projectId: string;
  entries: PayoutEntry[];
  canReview: boolean;
}) {
  const { busy, error, run } = useAction();
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  // 넣는 폼
  const [kind, setKind] = useState<PayoutKind>('영업비');
  const [category, setCategory] = useState<PayoutCategory>('1차');
  const [amount, setAmount] = useState('');
  const [minus, setMinus] = useState(false); // 재정산만 방향을 고른다
  const [at, setAt] = useState(today());
  const [note, setNote] = useState('');

  const cat = CATEGORY_INFO.get(category)!;
  const magnitude = Math.abs(Math.round(Number(amount)));
  const amountOk = amount.trim() !== '' && Number.isFinite(Number(amount)) && magnitude > 0;

  // 못 넣는 이유를 버튼 이름에 적는다(화면 규칙 3)
  const blocked = !amountOk ? '금액 미입력' : !at ? '날짜 미입력' : null;

  async function add() {
    const signed = cat.sign === -1 ? -magnitude : cat.sign === 1 ? magnitude : minus ? -magnitude : magnitude;
    const ok = await run({
      url: `/api/projects/${projectId}/payouts`,
      body: { kind, category, amount: signed, at, note: note.trim() || null },
      fail: '기록하지 못했습니다.',
    });
    if (ok) {
      setAmount('');
      setNote('');
    }
  }

  const del = (entryId: string) =>
    void run({
      url: `/api/projects/${projectId}/payouts`,
      method: 'DELETE',
      body: { entryId },
      fail: '지우지 못했습니다.',
    }).then(() => setConfirmDel(null));

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-base font-black text-slate-900">원장</h3>
        <span className="text-tiny text-slate-400">{entries.length}건</span>
      </div>

      {entries.length > 0 && (
        <div className="overflow-x-auto rounded-box border border-slate-200">
          <table className="w-full min-w-[560px] text-base">
            <thead className="bg-slate-50 text-tiny font-bold tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">날짜</th>
                <th className="px-3 py-2 text-left">구분</th>
                <th className="px-3 py-2 text-left">명목</th>
                <th className="px-3 py-2 text-right">금액</th>
                <th className="px-3 py-2 text-left">메모</th>
                {canReview && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{e.at}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Tag tone={e.kind === '영업비' ? 'stage' : 'ok'}>{e.kind}</Tag>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {e.category}
                    <span className="ml-1 text-micro text-slate-400">{entryTypeOf(e.category)}</span>
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums ${e.amount < 0 ? 'text-amber-800' : 'text-slate-800'}`}>
                    {won(e.amount)}
                  </td>
                  <td className="px-3 py-2 text-small text-slate-500">
                    {e.note ?? <span className="text-slate-300">—</span>}
                  </td>
                  {canReview && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {confirmDel === e.id ? (
                        <span className="inline-flex items-center gap-1">
                          <Btn kind="stop" size="sm" busy={busy} busyLabel="지우는 중…" onClick={() => del(e.id)}>
                            삭제 확정
                          </Btn>
                          <Btn kind="undo" size="sm" disabled={busy} onClick={() => setConfirmDel(null)}>
                            취소
                          </Btn>
                        </span>
                      ) : (
                        <Btn kind="undo" size="sm" disabled={busy} onClick={() => setConfirmDel(e.id)}>
                          지우기
                        </Btn>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {entries.length === 0 && (
        <p className="rounded-box border border-dashed border-slate-200 py-5 text-center text-base text-slate-400">
          기록 0건
        </p>
      )}

      {canReview && (
        <div className="mt-3 rounded-box border border-slate-200 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex gap-1">
              {PAYOUT_KINDS.map((k) => (
                <Choice key={k} on={kind === k} disabled={busy} onClick={() => setKind(k)}>
                  {k}
                </Choice>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-micro font-bold text-slate-500">명목</span>
              <select
                value={category}
                disabled={busy}
                onChange={(e) => setCategory(e.target.value as PayoutCategory)}
                className={FIELD_CELL}
              >
                <optgroup label="지급 — 돈이 나갔다">
                  {PAYOUT_CATEGORIES.filter((c) => c.type === '지급').map((c) => (
                    <option key={c.key} value={c.key}>{c.key}</option>
                  ))}
                </optgroup>
                <optgroup label="조정 — 줘야 할 금액이 바뀐다">
                  {PAYOUT_CATEGORIES.filter((c) => c.type === '조정').map((c) => (
                    <option key={c.key} value={c.key}>{c.key}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-micro font-bold text-slate-500">
                금액(원){cat.sign === -1 && ' — 빼는 돈으로 적힌다'}
              </span>
              <input
                type="number"
                min={0}
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(e.target.value)}
                className={`${FIELD_CELL} w-32 tabular-nums`}
              />
            </label>
            {cat.sign === 0 && (
              <div className="flex gap-1">
                <Choice on={!minus} disabled={busy} onClick={() => setMinus(false)}>더 줌</Choice>
                <Choice on={minus} disabled={busy} onClick={() => setMinus(true)}>덜 줌</Choice>
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-micro font-bold text-slate-500">
                {cat.type === '지급' ? '지급일' : '발생일'}
              </span>
              <input
                type="date"
                value={at}
                disabled={busy}
                onChange={(e) => setAt(e.target.value)}
                className={`${FIELD_CELL} tabular-nums`}
              />
            </label>
            <label className="flex min-w-[160px] flex-1 flex-col gap-1">
              <span className="text-micro font-bold text-slate-500">메모</span>
              <input
                type="text"
                value={note}
                disabled={busy}
                onChange={(e) => setNote(e.target.value)}
                className={FIELD_CELL}
              />
            </label>
            <Btn disabled={blocked !== null} busy={busy} busyLabel="기록 중…" onClick={add}>
              {blocked ?? '기록'}
            </Btn>
          </div>
          <Err className="mt-2">{error}</Err>
        </div>
      )}
      {!canReview && <Err className="mt-2">{error}</Err>}
    </div>
  );
}

/** 지급 비고 — 금액만으로 설명되지 않는 사정. 원장 메모보다 현장 전체 이야기가 온다. */
function PayNoteBox({
  projectId, payNote, canReview,
}: {
  projectId: string;
  payNote: string | null;
  canReview: boolean;
}) {
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState(payNote ?? '');
  const dirty = note !== (payNote ?? '');

  async function save() {
    setSaved(false);
    const ok = await run({
      url: `/api/projects/${projectId}/payment`,
      method: 'PATCH',
      body: { payNote: note },
      fail: '저장에 실패했습니다.',
    });
    if (ok) setSaved(true);
  }

  return (
    <div className="mt-3">
      <label htmlFor="payNote" className="text-tiny font-bold text-slate-500">비고</label>
      {canReview ? (
        <>
          <textarea
            id="payNote"
            value={note}
            rows={2}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder="감액·보류 사유 등 금액만으로 설명되지 않는 것"
            className={`${FIELD} mt-1 leading-relaxed`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Btn disabled={!dirty} busy={busy} busyLabel="저장 중…" onClick={save}>
              {dirty ? '비고 저장' : '변경 없음'}
            </Btn>
            {saved && !dirty && <Saved />}
            <Err>{error}</Err>
          </div>
        </>
      ) : (
        <p className="mt-1 text-base text-slate-600">
          {payNote || <span className="text-slate-300">없음</span>}
        </p>
      )}
    </div>
  );
}

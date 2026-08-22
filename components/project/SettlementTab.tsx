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
import { Fragment, useState } from 'react';
import Link from 'next/link';
import type {
  PayoutEntry, PayoutKind, ProjectDetail, SettlementRule, SettlementRuleChoice,
  SettlementStep,
} from '@/types/project';
import {
  distributionUnit, entryTypeOf, payoutSideOf, payoutStepsOf, recoveryRate, STEP_LABEL, STEP_TONE,
  triggerSource, turnkeyUnit,
} from '@/lib/settlement';
import type { Visibility } from '@/lib/roles';
import type { RuleOptions } from '@/lib/pricing-match';
import { useAction } from '@/lib/use-action';
import { won } from '@/lib/format';
import { today } from '@/lib/date';
import { Badge, Btn, Choice, Empty, Err, FIELD, FIELD_CELL, Note, Saved, Tag } from '@/components/ui';

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
        <PayConditions projectId={detail.project.id} lines={lines} ruleOptions={ruleOptions} />
      )}

      {/*
        * 적용조건·지급관리 두 표가 같은 폭으로 나란히 서고, 메모가 오른쪽 기둥
        * 전체를 쓴다(한백 확인) — 메모는 표 하나가 아니라 정산 전체에 딸린 기록이다.
        */}
      <div className="grid items-start gap-x-6 gap-y-7 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-7">
          <ContractLines lines={lines} vis={vis} />

          <PaymentSection
            projectId={detail.project.id}
            lines={lines}
            entries={detail.payoutEntries}
            salesOrg={detail.project.salesOrg}
            gcOrg={detail.project.gcOrg}
            vis={vis}
            canReview={canReview}
          />
        </div>

        <PayNoteBox
          projectId={detail.project.id}
          payNote={settlement.payNote}
          canReview={canReview}
        />
      </div>
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
  const rate = recoveryRate(steps);

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
              회수율 <span className="tabular-nums text-slate-800">{rate}%</span>
            </span>
          )}
          <span className="text-tiny font-bold text-slate-500">
            준공마감{' '}
            {admin?.cpoCloseDate ? (
              <span className="tabular-nums text-slate-800">{admin.cpoCloseDate}</span>
            ) : (
              <span className="text-amber-700">통보 없음</span>
            )}
          </span>
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
          </div>
        ))}
      </div>
    </section>
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
function ContractLines({ lines, vis }: { lines: ProjectDetail['lines']; vis: Visibility }) {
  return (
    <section>
      <h2 className="mb-2 text-h3 font-black text-slate-900">적용조건</h2>
      <div className="overflow-x-auto rounded-box border border-slate-200">
        <table className="w-full min-w-[560px] text-base">
          <thead className="bg-slate-50 text-tiny font-bold tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">라인</th>
              <th className="px-3 py-2 text-left">적용 단가 케이스</th>
              <th className="px-3 py-2 text-right">영업비/대</th>
              <th className="px-3 py-2 text-right">시공비/대</th>
              {/*
                * 협력사가 말하는 턴키단가 = 영업비 + 시공비 (배포가, 한백 확인).
                * 마진은 이 탭에 없다 — 운영사 쪽 금액(마진 포함 턴키)은 기성 탭의 일이다.
                * 양쪽을 다 보는 사람(턴키업체·한백)에게만 합이 뜬다.
                */}
              {vis.sales && vis.cons && <th className="px-3 py-2 text-right">턴키단가/대</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-3 py-2 font-bold text-slate-800">
                  {l.termYears}년 × {l.qty}대
                  {l.powerType && (
                    <span className="ml-1.5 text-tiny font-semibold text-slate-400">
                      {l.powerType}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {l.rule ? (
                    l.rule.caseName
                  ) : (
                    <span className="text-slate-400">미지정 — 위 「지급조건」에서 고릅니다</span>
                  )}
                </td>
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
      <td className="px-3 py-2 text-right">
        <Tag>권한 없음</Tag>
      </td>
    );
  }
  return (
    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
      {value === null ? <span className="text-slate-300">—</span> : won(value)}
    </td>
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
  projectId, lines, ruleOptions,
}: {
  projectId: string;
  lines: ProjectDetail['lines'];
  ruleOptions: RuleOptions;
}) {
  const { busy, error, run } = useAction();

  const pickRule = (lineId: string, ruleId: string) =>
    void run({
      url: `/api/projects/${projectId}/lines/${lineId}`,
      method: 'PATCH',
      body: { pricingRuleId: ruleId || null },
      fail: '단가 지정에 실패했습니다.',
    });

  return (
    <section>
      <h2 className="mb-2 text-h3 font-black text-slate-900">지급조건</h2>
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
                {l.powerType && <Tag>{l.powerType}</Tag>}
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
              </div>
              {(opts || turnkey !== null) && (
                <p className="mt-1 text-tiny tabular-nums text-slate-400">
                  {opts && `${opts.usedAxes.join(' · ')} 후보 ${opts.exact.length}건`}
                  {turnkey !== null && (
                    <span className="ml-2 text-slate-500">
                      턴키 {won(turnkey)}/대 · 이 라인 {won(turnkey * l.qty)}
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
  lines, entries, salesOrg, gcOrg, vis,
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
        {/* 지급 내역·거래명세서는 이 데이터에서 유도된다 — 같은 것의 다른 면 */}
        <Link href="/payments" className="text-tiny font-bold text-brand-700 hover:underline">
          지급 내역 · 거래명세서 →
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
            adjust, steps,
            stepAt: (cat: '1차' | '2차') =>
              entries.find((e) => e.kind === side.kind && e.category === cat)?.at ?? null,
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
                <th className="px-3 py-2 text-left">구분</th>
                <th className="px-3 py-2 text-right">대당</th>
                <th className="px-3 py-2 text-right">대수</th>
                <th className="px-3 py-2 text-right">총 지급액</th>
                <th className="border-l border-slate-200 px-3 py-2 text-right">1차 · 70%</th>
                <th className="px-3 py-2 text-left">지급시기</th>
                <th className="border-l border-slate-200 px-3 py-2 text-right">2차 · 잔액</th>
                <th className="px-3 py-2 text-left">지급시기</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {rows.map((r) => (
                <tr key={r.kind}>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="font-black text-slate-900">{r.kind}</span>
                    {r.org ? (
                      <span className="ml-1.5 text-tiny text-slate-500">→ {r.org}</span>
                    ) : (
                      <span className="ml-1.5 text-tiny font-bold text-amber-700">받는 곳 미지정</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-slate-700">
                    {unitCell(r.unit)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-slate-700">
                    {totalQty}대
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-black text-slate-900">
                    {won(r.steps.due)}
                    {r.adjust !== 0 && (
                      <span className="block text-tiny font-semibold text-slate-400">
                        조정 {r.adjust > 0 ? '+' : ''}{won(r.adjust)} 포함
                      </span>
                    )}
                  </td>
                  {([1, 2] as const).map((no) => {
                    const done = no === 1 ? r.steps.step1Done : r.steps.step2Done;
                    const amount = r.steps.open?.no === no ? r.steps.open.amount : r.steps.parts[no - 1];
                    const at = r.stepAt(`${no}차`);
                    return (
                      <Fragment key={no}>
                        <td className="whitespace-nowrap border-l border-slate-100 px-3 py-2.5 text-right">
                          <span className={`font-bold ${done ? 'text-slate-900' : 'text-slate-500'}`}>
                            {won(amount)}
                          </span>
                        </td>
                        {/* 지급시기 — 상태는 둘뿐이다: 지급완료(날짜) 또는 미지급 */}
                        {/* 태그 아래 날짜 — 옆으로 붙이면 마지막 열이 날짜만큼 밀려 표가 가로로 넘친다 */}
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {done ? (
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
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
              {rows.length > 1 && (
                <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-black">
                  <td className="px-3 py-2.5 text-slate-900">합계</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-700">
                    {unitCell(
                      rows.every((r) => typeof r.unit === 'number')
                        ? rows.reduce((sum, r) => sum + (r.unit as number), 0)
                        : rows.some((r) => r.unit === 'mixed') ? 'mixed' : null
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-700">{totalQty}대</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-900">
                    {won(rows.reduce((sum, r) => sum + r.steps.due, 0))}
                  </td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        );
      })()}
    </section>
  );
}

/**
 * 정산 메모 — 그때그때 한 줄씩 남긴다(한백 확인). 특이사항·회수·추가지급이 여기 온다.
 *
 * 별도 테이블 없이 비고(payNote)에 날짜 스탬프 줄로 쌓는다 — 한 줄이 한 건이고,
 * 지우기는 그 줄만 걷어낸다. 전용 기능(원장)은 쓰면서 다시 정하기로 했다.
 * 협력사는 읽기만 한다.
 */
function PayNoteBox({
  projectId, payNote, canReview,
}: {
  projectId: string;
  payNote: string | null;
  canReview: boolean;
}) {
  const { busy, error, run } = useAction();
  const [draft, setDraft] = useState('');
  const entries = (payNote ?? '').split('\n').map((t) => t.trim()).filter(Boolean);

  const saveAll = (next: string[]) =>
    run({
      url: `/api/projects/${projectId}/payment`,
      method: 'PATCH',
      body: { payNote: next.join('\n') },
      fail: '저장에 실패했습니다.',
    });

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    const ok = await saveAll([`${today()} ${text}`, ...entries]);
    if (ok) setDraft('');
  };

  return (
    /* 오른쪽 기둥 전체가 메모다 — 표들과 같은 급의 상자로 세워 자리를 잡아 준다 */
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
          const m = line.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)$/);
          return (
            <li key={`${i}-${line}`} className="flex items-baseline gap-2 rounded-box bg-slate-50 px-2.5 py-1.5">
              {m ? (
                <>
                  <span className="shrink-0 text-tiny tabular-nums text-slate-400">{m[1]}</span>
                  <span className="min-w-0 whitespace-pre-wrap text-small text-slate-700">{m[2]}</span>
                </>
              ) : (
                <span className="min-w-0 whitespace-pre-wrap text-small text-slate-700">{line}</span>
              )}
              {canReview && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveAll(entries.filter((_, j) => j !== i))}
                  className="ml-auto shrink-0 text-micro font-bold text-slate-300 transition hover:text-red-700 disabled:opacity-40"
                >
                  지우기
                </button>
              )}
            </li>
          );
        })}
        {entries.length === 0 && <li className="text-tiny text-slate-400">0건</li>}
      </ul>
    </div>
  );
}

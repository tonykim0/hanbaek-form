'use client';

/**
 * 협력사 지급관리 — 줄에서 바로 확정하는 표.
 *
 *   영업비 1차 = 계약완료 · 2차 = 개통완료
 *   시공비 1차 = 설치완료 · 2차 = 개통완료
 *
 * 현장·구분마다 총 지급액, 회차 금액(지급시기 포함), 회차 지급 칸이 한 줄에 선다.
 * 지급 칸은 나갔으면 지급일, 차례가 왔으면 지급일을 골라 그 자리에서 확정한다(한백만).
 *
 * ★지급일 규칙★ 조건 충족 시 익월 10일 또는 25일 지급이다(한백 확인). 그래서
 * 지급일은 달력이 아니라 그 두 날짜 중 하나를 고른다 — 트리거 충족일의 다음 달로
 * 계산한다.
 *
 * ★일괄 확정(체크박스 → 검토 → 묶음 확정)은 걷어냈다(한백 확인).★ 「송금 대상으로
 * 확정한 누계」까지 끌고 다니는 흐름이 너무 복잡했다 — 지급은 한 줄씩 확정한다.
 *
 * ★협력사도 본다.★ 자기 몫 줄만 내려오고(페이지가 가른다, lib/payout-board) 확정
 * 칸은 읽기다 — 이번에 받을 금액과 지급시기를 여기서 확인한다.
 *
 * ★지급된 내역 테이블은 걷어냈다(한백 확인 2026-08-23).★ 같은 원장이 세 자리에
 * 그려지고 있었다 — 지급표의 지급일 칸 · 여기 원장 줄 · /payments 의 월별 원장.
 * 지급표가 이미 지급일을 품고 있으니 이 화면에서 줄 단위 원장은 잃을 게 없고,
 * 개별 줄·메모의 정본은 /payments 와 현장 상세 정산 탭이다. 그 자리에는 거래명세서
 * 배치(지급일 × 지급처) 목록을 둔다 — 지급이 익월 10·25일 배치로 나가고 명세서도
 * 배치 단위 한 장이라, 「이번 25일에 누구에게 총 얼마」가 송금 준비 그 자체다.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PayoutRow } from '@/types/project';
import { payoutPrerequisiteBlockersOf, payoutReleaseOf, payoutStepsOf } from '@/lib/settlement';
import type { PayoutRowInput } from '@/lib/payout-board';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { Badge, Blank, Btn, Choice, Empty, Err, FIELD_CELL, Tag } from '@/components/ui';
import { Frame, SiteLink, won } from './parts';

/** 지급일 후보 — 트리거 충족일의 익월 10일·25일 (지급 규칙, 한백 확인) */
function payDateChoices(metAt: string): [string, string] {
  const [y, m] = metAt.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const mm = String(m === 12 ? 1 : m + 1).padStart(2, '0');
  return [`${ny}-${mm}-10`, `${ny}-${mm}-25`];
}

const dayLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;

type WorkState = '지급 가능' | '조건 대기' | '확정 완료';

interface PayoutWork extends PayoutRowInput {
  state: WorkState;
  blockers: string[];
  open: { no: 1 | 2; amount: number } | null;
  due: number;
  step1Amount: number;
  step2Amount: number;
  step1Done: boolean;
  step2Done: boolean;
}

function workOf(p: PayoutRowInput): PayoutWork {
  const steps = payoutStepsOf(p.plan, p.adjust, p.confirmed);
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
    return { ...p, ...stepFields, state: '조건 대기', blockers: prerequisites, open: null };
  }
  if (!steps.open) {
    return { ...p, ...stepFields, state: '확정 완료', blockers: [], open: null };
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

export default function PayoutWorkBoard({
  rows, history, canConfirm,
}: {
  rows: PayoutRowInput[];
  /** 지급된 내역 — 원장의 지급 한 건이 한 줄. 저장소가 보는 사람 몫으로 걸러서 준다. */
  history: PayoutRow[];
  /** 지급일을 골라 확정할 수 있는가 — 한백만. 협력사는 같은 표를 읽기만 한다. */
  canConfirm: boolean;
}) {
  const [org, setOrg] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('전체');
  const [stepFilter, setStepFilter] = useState<StepFilter>('전체');

  const work = useMemo(() => rows.map(workOf), [rows]);
  const orgs = useMemo(
    () => [...new Set(work.map((p) => p.org).filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b, 'ko')),
    [work]
  );

  const shown = work
    .filter((p) => org === null || p.org === org)
    .filter((p) => kindFilter === '전체' || p.kind === kindFilter)
    .filter((p) => stepFilter === '전체' || p.open?.no === (stepFilter === '1차' ? 1 : 2));

  /*
   * 거래명세서 배치 — 원장을 (지급일 × 지급처)로 묶는다. 명세서가 이 단위 한 장이다.
   * 구분·지급시기 필터는 태우지 않는다 — 배치를 명목으로 쪼개면 여기 합계가 명세서의
   * 합계와 어긋난다. 지급처 필터만 탄다(배치가 지급처 단위라 어긋날 것이 없다).
   */
  const batches = useMemo(() => {
    const map = new Map<string, { paidAt: string; org: string | null; count: number; total: number }>();
    for (const r of history) {
      if (org !== null && r.org !== org) continue;
      const key = `${r.paidAt}|${r.org ?? ''}`;
      const b = map.get(key) ?? { paidAt: r.paidAt, org: r.org, count: 0, total: 0 };
      b.count += 1;
      b.total += r.amount;
      map.set(key, b);
    }
    // 내림차순 — 예정(미래 지급일)이 저절로 맨 위에 서고, 그 아래가 최근에 나간 것
    return [...map.values()].sort(
      (a, b) => b.paidAt.localeCompare(a.paidAt) || (a.org ?? '').localeCompare(b.org ?? '', 'ko')
    );
  }, [history, org]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* 필터는 펼쳐 두지 않는다(한백 확인) — 칩 일곱 개가 표보다 먼저 눈을 먹었다 */}
        <label className="flex items-center gap-1.5 whitespace-nowrap text-small font-bold text-slate-500">
          구분
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            className={`${FIELD_CELL} w-auto min-w-[92px]`}
          >
            {KIND_FILTERS.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 whitespace-nowrap text-small font-bold text-slate-500">
          지급시기
          <select
            value={stepFilter}
            onChange={(e) => setStepFilter(e.target.value as StepFilter)}
            className={`${FIELD_CELL} w-auto min-w-[92px]`}
          >
            {STEP_FILTERS.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>

        {orgs.length > 1 && (
          <label className="flex items-center gap-1.5 whitespace-nowrap text-small font-bold text-slate-500">
            지급처
            <select
              value={org ?? ''}
              onChange={(e) => setOrg(e.target.value || null)}
              className={`${FIELD_CELL} w-auto min-w-[140px]`}
            >
              <option value="">전체</option>
              {orgs.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
      </div>

      {shown.length === 0 ? (
        <Blank>조건에 맞는 지급이 0건</Blank>
      ) : (
        <Frame min="1120px">
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left">현장</th>
              <th className="px-3 py-2.5 text-left">지급처</th>
              <th className="px-3 py-2.5 text-left">구분</th>
              <th className="px-3 py-2.5 text-right">총 지급액</th>
              <th className="px-3 py-2.5 text-right">1차 · 70%</th>
              <th className="px-3 py-2.5 text-right">1차 지급</th>
              <th className="px-3 py-2.5 text-right">2차 · 잔액</th>
              <th className="px-3 py-2.5 text-right">2차 지급</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((p) => (
              <tr key={p.key} className="transition hover:bg-brand-50/40">
                <td className="px-3 py-2.5 align-top">
                  <SiteLink id={p.projectId} name={p.projectName} tab="settlement" />
                  <p className="mt-0.5 text-tiny text-slate-400">{p.cpo}</p>
                </td>
                <td className="px-3 py-2.5 align-top text-slate-600">{p.org ?? <Empty kind="miss" />}</td>
                <td className="px-3 py-2.5 align-top">
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
                <StepAmountCell p={p} no={1} />
                <StepPayCell p={p} no={1} canConfirm={canConfirm} />
                <StepAmountCell p={p} no={2} />
                <StepPayCell p={p} no={2} canConfirm={canConfirm} />
              </tr>
            ))}
          </tbody>
        </Frame>
      )}

      {/* 거래명세서 — 배치(지급일 × 지급처)가 한 줄. 명세서가 이 단위 한 장이다. */}
      <section className="mt-7">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-h3 font-black text-slate-900">거래명세서</h2>
          <span className="text-tiny font-bold tabular-nums text-slate-400">{batches.length}건</span>
          {/* 원장 줄 하나하나(회수·조정·메모)는 나간 돈의 화면이 정본이다 */}
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
          <Frame min="640px">
            <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-left">지급일</th>
                <th className="px-3 py-2.5 text-left">지급처</th>
                <th className="px-3 py-2.5 text-right">건수</th>
                <th className="px-3 py-2.5 text-right">금액</th>
                <th className="px-3 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <tr key={`${b.paidAt}|${b.org ?? ''}`} className="transition hover:bg-brand-50/40">
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">
                    {b.paidAt}
                    {/* 지급일이 아직 안 온 배치 — 이번에 나갈 돈이다. 오늘 것도 아직 예정으로 본다 */}
                    {b.paidAt >= today() && (
                      <span className="ml-1.5"><Badge tone="stage">예정</Badge></span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {b.org ?? <Empty kind="miss" label="받는 곳 미지정" />}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-500">
                    {b.count}건
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums ${b.total < 0 ? 'text-amber-800' : 'text-slate-800'}`}>
                    {won(b.total)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {/* 명세서는 업체 × 지급일 한 장 — 받는 곳이 없으면 만들 장이 없다 */}
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
              ))}
            </tbody>
          </Frame>
        )}
      </section>
    </div>
  );
}

/** 회차 금액 한 칸 — 금액 밑에 지급시기(트리거)가 늘 붙는다 */
function StepAmountCell({ p, no }: { p: PayoutWork; no: 1 | 2 }) {
  if (p.due <= 0) {
    return <td className="px-3 py-2.5 text-right align-top text-slate-300">—</td>;
  }
  const done = no === 1 ? p.step1Done : p.step2Done;
  const amount = p.open?.no === no ? p.open.amount : no === 1 ? p.step1Amount : p.step2Amount;
  // 회차의 지급시기 — 영업비 1차=계약완료 · 시공비 1차=설치완료 · 2차=개통완료
  const trigger = payoutReleaseOf(p.kind, no, p.milestones).trigger;

  return (
    <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
      <p className={`font-black tabular-nums ${done ? 'text-slate-400' : 'text-slate-900'}`}>
        {won(amount)}
      </p>
      <p className="text-micro text-slate-400">지급시기 {trigger}</p>
    </td>
  );
}

/**
 * 회차 지급 한 칸 — 나갔으면 지급일, 차례면 지급일을 골라 확정(한백) 또는
 * 「지급 예정」(협력사), 조건이 안 찼으면 그 사정, 아직이면 「1차 뒤」.
 */
function StepPayCell({ p, no, canConfirm }: { p: PayoutWork; no: 1 | 2; canConfirm: boolean }) {
  if (p.due <= 0) {
    return <td className="px-3 py-2.5 text-right align-top text-slate-300">—</td>;
  }
  const done = no === 1 ? p.step1Done : p.step2Done;
  const at = no === 1 ? p.step1At : p.step2At;
  const release = payoutReleaseOf(p.kind, no, p.milestones);

  return (
    <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
      {done ? (
        // 확정해도 줄은 안 없어진다(한백 확인) — 지급 칸이 지급일로 굳어 기록으로 남는다
        <p className="text-small font-bold tabular-nums text-brand-800">{at ?? '지급됨'}</p>
      ) : p.open?.no === no ? (
        p.state === '지급 가능' ? (
          canConfirm ? (
            <StepConfirm p={p} metAt={release.metAt} />
          ) : (
            <>
              <Tag tone="ok">지급 예정</Tag>
              {/* 협력사가 언제 받는지 묻지 않게 — 규칙(익월 10·25일)을 날짜로 보여준다 */}
              {release.metAt && (
                <p className="mt-0.5 text-micro font-bold text-slate-400">
                  {Number(payDateChoices(release.metAt)[0].slice(5, 7))}월 10·25일
                </p>
              )}
            </>
          )
        ) : (
          // 지급시기는 옆 칸에 있다 — 트리거 대기는 「대기」로 줄여 같은 말을 두 번 안 적는다
          p.blockers.map((reason) => (
            <p key={reason} className="text-micro font-bold text-amber-700">
              {reason === `${release.trigger} 대기` ? '대기' : reason}
            </p>
          ))
        )
      ) : (
        <p className="text-micro font-bold text-slate-300">1차 뒤</p>
      )}
    </td>
  );
}

/**
 * 줄에서 바로 확정 — 지급일을 골라 그 회차를 원장에 고정한다.
 * 지급일은 달력이 아니라 익월 10일·25일 둘 중 하나다(지급 규칙, 한백 확인).
 * 금액은 보내지 않는다 — 1차 70% / 2차 잔액은 정해져 있어 저장소가 계산해 넣는다.
 */
function StepConfirm({ p, metAt }: { p: PayoutWork; metAt: string | null }) {
  const { busy, error, run } = useAction();
  // 지급 가능이면 트리거 충족일이 있다 — 없을 길은 방어로만 남긴다
  const [d10, d25] = payDateChoices(metAt ?? today());
  const [at, setAt] = useState(d10);

  const confirm = () =>
    void run({
      url: '/api/payouts',
      body: { at, items: [{ projectId: p.projectId, kind: p.kind }] },
      fail: '확정하지 못했습니다.',
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Choice on={at === d10} disabled={busy} onClick={() => setAt(d10)}>{dayLabel(d10)}</Choice>
        <Choice on={at === d25} disabled={busy} onClick={() => setAt(d25)}>{dayLabel(d25)}</Choice>
      </div>
      <Btn size="sm" busy={busy} busyLabel="확정 중…" onClick={confirm}>
        {p.open?.no}차 확정
      </Btn>
      <Err>{error}</Err>
    </div>
  );
}

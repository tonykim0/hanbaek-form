'use client';

/**
 * 협력사 지급관리 — 전 현장의 지급현황을 한 표로 보고, 여기서 체크해 가확정한다.
 *
 *   영업비 1차 = 계약완료 · 2차 = 개통완료
 *   시공비 1차 = 설치완료 · 2차 = 개통완료
 *
 * ★두 단계 확정★ (한백 확인 2026-08-24 — 세금계산서와 맞물리는 실무 순서)
 *   가확정  이 표에서 지급 가능한 줄을 체크해 지급일 하나로 묶는다. 협력사의 할 일에
 *           「세금계산서 발행」이 떠 그 합계로 발행한다(1~2일 회전).
 *   확정    계산서가 오면 협력사 거래명세서의 배치 줄에서 첨부하고 확정 — 배치가 잠긴다.
 * 「1차 확정」이라 부르지 않는다 — 이 표의 1차·2차는 회차(70%/선지급)라 뜻이 겹친다.
 *
 * ★지급일 규칙★ 조건 충족 시 익월 10일 또는 25일 지급이 기본이다(한백 확인). 후보는
 * 고른 줄들의 트리거 충족일 중 가장 늦은 것 기준 — 이른 줄 기준으로 잡으면 늦은 줄이
 * 규칙보다 먼저 나가는 날이 된다. 다른 날 지급도 있다(한백 확인 2026-08-23) —
 * 「다른 날」로 날짜를 직접 고른다. 정기일이 원클릭, 예외가 한 걸음 더다.
 *
 * 줄마다 있던 확정 버튼(지급일 선택 포함)은 체크박스로 바꿨다 — 실무가 「다음 달
 * 7일쯤 목록을 훑어 한 번에 추리는」 배치 작업이라, 한 줄씩 누르면 지급일이 줄마다
 * 갈라질 수 있고 협력사는 계산서를 몇 장으로 끊어야 할지 알 수 없게 된다.
 *
 * ★협력사도 본다.★ 자기 몫 줄만 내려오고(페이지가 가른다, lib/payout-board) 체크
 * 칸이 없다 — 이번에 받을 금액과 지급시기를 여기서 확인한다.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BatchFinal } from '@/types/project';
import { payoutReleaseOf } from '@/lib/settlement';
import { batchKey, payDateChoices, workOf, type PayoutRowInput, type PayoutWork } from '@/lib/payout-board';
import { DatePicker } from '@/components/DatePicker';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { Badge, Blank, Btn, Choice, Empty, Err, FIELD_CELL, Tag } from '@/components/ui';
import { Frame, SiteLink, won } from './parts';

const dayLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;

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
  rows, finals, canConfirm,
}: {
  rows: PayoutRowInput[];
  /** 확정된 배치(지급처×구분×지급일) — 지급 칸의 가확정/확정 배지가 본다 */
  finals: BatchFinal[];
  /** 지급일을 골라 확정할 수 있는가 — 한백만. 협력사는 같은 표를 읽기만 한다. */
  canConfirm: boolean;
}) {
  const [org, setOrg] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('전체');
  const [stepFilter, setStepFilter] = useState<StepFilter>('전체');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const work = useMemo(() => rows.map(workOf), [rows]);
  // 배치 확정 여부 — 지급 칸이 「가확정」과 「확정」을 가르는 데 쓴다
  const finalizedBatches = useMemo(
    () => new Set(finals.map((f) => batchKey(f.payDate, f.org, f.kind))),
    [finals]
  );
  const orgs = useMemo(
    () => [...new Set(work.map((p) => p.org).filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b, 'ko')),
    [work]
  );

  const shown = work
    .filter((p) => org === null || p.org === org)
    .filter((p) => kindFilter === '전체' || p.kind === kindFilter)
    .filter((p) => stepFilter === '전체' || p.open?.no === (stepFilter === '1차' ? 1 : 2));

  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // 필터로 가려진 줄은 확정에 안 실린다 — 안 보이는 것이 함께 나가면 합계가 거짓말이 된다
  const chosen = shown.filter((p) => p.state === '지급 가능' && picked.has(p.key));


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
              {canConfirm && <th className="w-10 px-3 py-2.5"></th>}
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
              <tr
                key={p.key}
                className={`transition ${picked.has(p.key) && p.state === '지급 가능' ? 'bg-brand-50/60' : 'hover:bg-brand-50/40'}`}
              >
                {canConfirm && (
                  <td className="px-3 py-2.5 align-top">
                    {/* 조건이 안 찬 줄에는 칸 자체가 비어 있다 — 눌리지 않는 체크박스보다 분명하다 */}
                    {p.state === '지급 가능' && (
                      <input
                        type="checkbox"
                        aria-label={`${p.projectName} ${p.kind} 가확정 선택`}
                        checked={picked.has(p.key)}
                        onChange={() => toggle(p.key)}
                        className="h-4 w-4 accent-brand-600"
                      />
                    )}
                  </td>
                )}
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
                <StepPayCell p={p} no={1} finalizedBatches={finalizedBatches} canConfirm={canConfirm} />
                <StepAmountCell p={p} no={2} />
                <StepPayCell p={p} no={2} finalizedBatches={finalizedBatches} canConfirm={canConfirm} />
              </tr>
            ))}
          </tbody>
        </Frame>
      )}

      {canConfirm && shown.some((p) => p.state === '지급 가능') && (
        <ConfirmBar chosen={chosen} onDone={() => setPicked(new Set())} />
      )}
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
 * 회차 지급 한 칸 — 아직이면 「1차 뒤」, 조건 대기면 그 사정, 차례가 왔으면 「지급 가능」,
 * 배치에 실렸으면 지급일 위에 그 배치의 자리(가확정 → 확정 → 지급일 경과 시 날짜만).
 * 가확정을 이 표에서도 보이게 한다(한백 확인 2026-08-24) — 배치 화면까지 안 가도
 * 어느 줄이 계산서를 기다리는 중인지 여기서 읽힌다.
 */
function StepPayCell({
  p, no, finalizedBatches, canConfirm,
}: {
  p: PayoutWork;
  no: 1 | 2;
  finalizedBatches: Set<string>;
  canConfirm: boolean;
}) {
  if (p.due <= 0) {
    return <td className="px-3 py-2.5 text-right align-top text-slate-300">—</td>;
  }
  const done = no === 1 ? p.step1Done : p.step2Done;
  const at = no === 1 ? p.step1At : p.step2At;
  const entryId = no === 1 ? p.step1EntryId : p.step2EntryId;
  const release = payoutReleaseOf(p.kind, no, p.milestones);
  const finalized = at !== null && finalizedBatches.has(batchKey(at, p.org, p.kind));

  return (
    <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
      {done ? (
        // 배치에 실려도 줄은 안 없어진다(한백 확인) — 지급 칸이 지급일로 굳어 기록으로 남는다
        <>
          {/* 지급일이 지난 것은 상태가 아니라 사실이다 — 날짜만 남긴다 */}
          {at && at >= today() && (
            <p className="mb-0.5">
              {finalized ? <Badge tone="ok">확정</Badge> : <Badge tone="warn">가확정</Badge>}
            </p>
          )}
          <p className="text-small font-bold tabular-nums text-brand-800">{at ?? '지급됨'}</p>
          {/*
            * 가확정 무르기 — 그 자리에서(한백 확인 2026-08-24). 회차가 지급 가능으로
            * 돌아가 다시 체크할 수 있다. 확정된 것은 명세서에서 해제부터라 여기 없다.
            */}
          {canConfirm && !finalized && at && at >= today() && entryId && (
            <StepCancel p={p} entryId={entryId} />
          )}
        </>
      ) : p.open?.no === no ? (
        p.state === '지급 가능' ? (
          <>
            {/* 확정은 왼쪽 체크 → 아래 가확정 바에서 — 여기는 상태만 말한다 */}
            <Tag tone="ok">지급 가능</Tag>
            {/* 언제 받는지 묻지 않게 — 규칙(익월 10·25일)을 날짜로 보여준다 */}
            {release.metAt && (
              <p className="mt-0.5 text-micro font-bold text-slate-400">
                {Number(payDateChoices(release.metAt)[0].slice(5, 7))}월 10·25일
              </p>
            )}
          </>
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

/** 가확정 취소 한 칸 — 원장에서 그 회차를 지워 지급 가능으로 되돌린다 */
function StepCancel({ p, entryId }: { p: PayoutWork; entryId: string }) {
  const router = useRouter();
  const { busy, error, run } = useAction();

  async function cancel() {
    const ok = await run({
      url: `/api/projects/${p.projectId}/payouts`,
      method: 'DELETE',
      body: { entryId },
      fail: '취소하지 못했습니다.',
    });
    if (ok) router.refresh();
  }

  return (
    <p className="mt-0.5">
      <Btn kind="quiet" size="sm" busy={busy} onClick={() => void cancel()}>
        취소
      </Btn>
      <Err className="block">{error}</Err>
    </p>
  );
}

/**
 * 가확정 바 — 체크한 줄들을 지급일 하나로 묶어 원장에 올린다.
 *
 * 금액은 보내지 않는다 — 1차 70% / 2차 잔액은 정해져 있어 저장소가 계산해 넣는다.
 * 전부 되거나 전부 안 된다(runPayoutBatch). 지급처가 섞여 있어도 배치는
 * (지급처 × 지급일)로 저절로 갈라진다 — 협력사마다 계산서 한 장이 되는 단위다.
 */
function ConfirmBar({ chosen, onDone }: { chosen: PayoutWork[]; onDone: () => void }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [at, setAt] = useState<string | null>(null);
  /** null 이면 정기일(10·25) 모드 — 「다른 날」은 지금 고른 날로 채워 열려서 빈 날짜 상태가 없다 */
  const [customDate, setCustomDate] = useState<string | null>(null);

  // 고른 줄들의 트리거 충족일 중 가장 늦은 것 기준 익월 10·25일
  const latestMet = chosen.reduce<string | null>((last, p) => {
    const met = p.open ? payoutReleaseOf(p.kind, p.open.no, p.milestones).metAt : null;
    return met && (!last || met > last) ? met : last;
  }, null);
  const [d10, d25] = payDateChoices(latestMet ?? today());
  const custom = customDate !== null;
  const pickedAt = customDate ?? (at === d10 || at === d25 ? at : d10);
  const sum = chosen.reduce((n, p) => n + (p.open?.amount ?? 0), 0);
  const orgCount = new Set(chosen.map((p) => p.org)).size;

  async function confirm() {
    const ok = await run({
      url: '/api/payouts',
      body: { at: pickedAt, items: chosen.map((p) => ({ projectId: p.projectId, kind: p.kind })) },
      fail: '가확정하지 못했습니다.',
    });
    if (!ok) return;
    onDone();
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2.5">
      <span className="text-small font-bold text-slate-600">
        {chosen.length}건 · 지급처 {orgCount}곳 · <span className="tabular-nums">{won(sum)}</span>원
      </span>
      <span className="flex items-center gap-1">
        {[d10, d25].map((d) => (
          <Choice
            key={d}
            on={!custom && pickedAt === d}
            disabled={busy}
            onClick={() => { setAt(d); setCustomDate(null); }}
          >
            {dayLabel(d)}
          </Choice>
        ))}
        {/* 정기일 밖의 지급 — 예외라서 누르면 그때 열리되, 지금 고른 날로 채워 연다 */}
        <Choice on={custom} disabled={busy} onClick={() => setCustomDate((v) => (v === null ? pickedAt : null))}>
          다른 날
        </Choice>
        {custom && (
          <DatePicker
            ariaLabel="지급일 직접 지정"
            value={customDate}
            onChange={setCustomDate}
            disabled={busy}
          />
        )}
      </span>
      <Btn disabled={chosen.length === 0} busy={busy} busyLabel="가확정 중…" onClick={() => void confirm()}>
        {chosen.length === 0 ? '줄을 체크해 가확정' : `${chosen.length}건 가확정`}
      </Btn>
      {/* 다음 걸음이 어디인지 — 가확정 뒤 협력사가 계산서를 발행하고 저기서 최종 확정한다 */}
      <Link href="/statements" className="text-small font-bold text-slate-500 transition hover:text-brand-800">
        협력사 거래명세서 →
      </Link>
      <Err>{error}</Err>
    </div>
  );
}

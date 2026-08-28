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
 *   확정    배치가 잠긴다. 계산서 첨부는 협력사 거래명세서에서 하고, ★확정·해제는
 *           여기서도 된다★(한백 확인 2026-08-25) — 가확정과 그 취소가 이 표에 있는데
 *           다음 단계만 다른 화면으로 가라는 것이 어색했다. 두 화면이 같은 훅을 쓴다.
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
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BatchFinal } from '@/types/project';
import { payoutReleaseOf } from '@/lib/settlement';
import { batchKey, batchStateOf, payDateChoices, workOf, type PayoutRowInput, type PayoutWork } from '@/lib/payout-board';
import { DatePicker } from '@/components/DatePicker';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { Badge, Blank, Btn, Choice, Empty, Err, FIELD_CELL, Tag } from '@/components/ui';
import { Frame, SiteLink, won } from './parts';
import { useFinalizeBatch } from './use-batch';

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

        {/*
          가확정 바 — 표 오른쪽 위 (한백 요청 2026-08-25). 표 아래에 있었는데, 체크는
          표에서 하고 확인은 맨 아래로 내려가야 해서 손이 오르내렸다. 필터(왼쪽)와
          동작(오른쪽)이 한 줄에 서는 것은 다른 표들과 같은 꼴이다.
        */}
        {canConfirm && shown.some((p) => p.state === '지급 가능') && (
          <ConfirmBar chosen={chosen} onDone={() => setPicked(new Set())} />
        )}
      </div>

      {shown.length === 0 ? (
        <Blank>조건에 맞는 지급이 0건</Blank>
      ) : (
        <Frame min={canConfirm ? '1520px' : '1300px'}>
          {/*
            머리가 두 줄이다 — 「N차 지급」 한 칸에 배지·날짜·단추가 세로로 쌓여 있던 것을
            지급일·상태·동작 열로 폈다(한백 요청 2026-08-25). 쌓인 칸은 줄마다 높이가
            달라지고, 단추가 값 사이에 끼어 어디를 눌러야 하는지 훑어야 했다.
            열로 펴면 한 열을 위아래로 읽는 것이 곧 비교다(단가표 케이스 표와 같은 이유).
          */}
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              {canConfirm && <th rowSpan={2} className="w-10 px-3 py-2.5"></th>}
              <th rowSpan={2} className="px-3 py-2.5 text-left">현장</th>
              <th rowSpan={2} className="px-3 py-2.5 text-left">지급처</th>
              <th rowSpan={2} className="px-3 py-2.5 text-left">구분</th>
              <th rowSpan={2} className="px-3 py-2.5 text-right">총 지급액</th>
              <th colSpan={canConfirm ? 4 : 3} className="border-l border-slate-200 px-3 pt-2 text-center">1차 · 70%</th>
              <th colSpan={canConfirm ? 4 : 3} className="border-l border-slate-200 px-3 pt-2 text-center">2차 · 잔액</th>
            </tr>
            <tr>
              {[1, 2].map((no) => (
                <Fragment key={no}>
                  <th className="border-l border-slate-200 px-3 pb-2 text-right font-semibold">금액</th>
                  <th className="px-3 pb-2 text-right font-semibold">지급일</th>
                  <th className="px-3 pb-2 text-left font-semibold">상태</th>
                  {canConfirm && <th className="px-3 pb-2 text-left font-semibold"></th>}
                </Fragment>
              ))}
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
                  {/*
                    * ★계획보다 더 나간 돈은 여기서 말한다★ (2026-08-28) — 단가를 잘못 알고
                    * 더 준 현장이 「확정 완료」로만 보여서, 전 현장을 훑어도 초과가 안 잡혔다.
                    * 돌려받든 잔금에서 빼든 사람이 처리해야 하는 자리라 눈에 띄어야 한다.
                    */}
                  {p.confirmed > p.plan + p.adjust && (
                    <p className="text-micro font-black text-red-700">
                      초과 {won(p.confirmed - p.plan - p.adjust)}
                    </p>
                  )}
                </td>
                {([1, 2] as const).map((no) => (
                  <StepCells key={no} p={p} no={no} finalizedBatches={finalizedBatches} canConfirm={canConfirm} />
                ))}
              </tr>
            ))}
          </tbody>
        </Frame>
      )}

    </div>
  );
}

/**
 * 회차 하나의 네 칸 — 금액 · 지급일 · 상태 · 동작.
 *
 * 한 칸에 배지·날짜·단추를 세로로 쌓던 것을 열로 폈다(한백 요청 2026-08-25).
 * 쌓인 칸은 줄마다 높이가 달라지고, 단추가 값 사이에 끼어 어디를 눌러야 하는지
 * 훑어야 했다. 네 칸이 같은 사정을 봐야 하므로 판정은 여기서 한 번 한다.
 *
 * 총액 자체가 안 서는 줄(due ≤ 0)은 회차 칸을 통째로 묶어 「—」 하나만 둔다 —
 * 빈 칸 네 개는 「값이 넷 다 빠졌다」로 읽힌다.
 */
function StepCells({
  p, no, finalizedBatches, canConfirm,
}: {
  p: PayoutWork;
  no: 1 | 2;
  finalizedBatches: Set<string>;
  canConfirm: boolean;
}) {
  if (p.due <= 0) {
    return (
      <td colSpan={canConfirm ? 4 : 3} className="border-l border-slate-100 px-3 py-2.5 text-center align-top text-slate-300">
        —
      </td>
    );
  }

  const done = no === 1 ? p.step1Done : p.step2Done;
  const at = no === 1 ? p.step1At : p.step2At;
  const entryId = no === 1 ? p.step1EntryId : p.step2EntryId;
  /*
   * ★원장에 없는 회차는 「지급됨」이 아니다★ (한백 지적 2026-08-28).
   *
   * 회차 완료는 금액 누적으로 판정한다 — 앞 회차에 계획보다 많이 나가면 뒤 회차가 저절로
   * 채워진다. 그것을 「지급됨」이라 적으면 나가지도 않은 돈에 날짜 없는 완료 표시가 붙는다
   * (반달마을푸르지오 영업비 2차가 그랬다). 나갈 돈이 없는 것은 맞으니 「초과 충당」이라 적는다.
   */
  const covered = done && entryId === null && at === null;
  const amount = p.open?.no === no ? p.open.amount : no === 1 ? p.step1Amount : p.step2Amount;
  const openHere = p.open?.no === no;
  const release = payoutReleaseOf(p.kind, no, p.milestones);
  const finalized = at !== null && finalizedBatches.has(batchKey(at, p.org, p.kind));
  // 자리 판정은 배치 목록·명세서와 같은 정본이다 — 세 화면이 다른 이름을 말하면 안 된다
  const state = at !== null ? batchStateOf({ paidAt: at, finalized }) : null;

  return (
    <>
      {/*
        금액 — 밑에 트리거의 지금 사실이 붙는다 (한백 요청 2026-08-25).
        「지급시기 계약완료」라고 규칙만 적어 두면 그 계약완료가 됐는지 안 됐는지를
        딴 데서 찾아야 했다. 됐으면 날짜(그날이 곧 증거다), 아직이면 「전」 —
        상태 열의 「대기」는 회차의 자리고, 이것은 트리거의 사실이라 겹치지 않는다.
      */}
      <td className="whitespace-nowrap border-l border-slate-100 px-3 py-2.5 text-right align-top">
        <p className={`font-black tabular-nums ${done ? 'text-slate-400' : 'text-slate-900'}`}>
          {won(amount)}
        </p>
        {release.metAt ? (
          <p className="text-micro tabular-nums text-slate-400">
            {release.trigger} {release.metAt.slice(5)}
          </p>
        ) : (
          <p className="text-micro font-bold text-amber-700">{release.trigger} 전</p>
        )}
      </td>

      {/* 지급일 — 배치에 실렸으면 그 날짜, 지급 가능이면 규칙(익월 10·25일)을 예정으로 */}
      <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
        {covered ? (
          <span className="text-slate-300">—</span>
        ) : done ? (
          <p className="text-small font-bold tabular-nums text-brand-800">{at ?? '지급됨'}</p>
        ) : openHere && p.state === '지급 가능' && release.metAt ? (
          <p className="text-micro font-bold text-slate-400">
            {Number(payDateChoices(release.metAt)[0].slice(5, 7))}월 10·25일
          </p>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>

      {/*
        상태 — 배치의 자리(가확정→확정→지급완료 · 확정 누락) 또는 그 앞의 사정.

        ★한 열에 한 부품이다 (한백 지적 2026-08-25).★ 지급 가능은 각진 Tag, 배치 상태는
        동근 Badge, 대기·1차 뒤는 맨 텍스트 — 셋이 섞여 있었다. 이 칸의 값은 전부
        「그 회차가 지금 있는 자리」 하나라 전부 동근 Badge 다(화면 규칙 11번).

        ★「1차 뒤」도 「대기」다 (한백 확인 2026-08-25).★ 트리거 전과 1차 미지급을 다른
        이름으로 갈랐었는데, 보는 사람에게는 둘 다 「아직 못 나간다」일 뿐이고 이유는
        딴 칸이 이미 말한다 — 트리거는 금액 칸의 「계약완료 전」(주황)이, 1차 미지급은
        바로 왼쪽 1차 열이. 그래서 대기는 조용한 회색이다: 주황 신호는 이유 쪽에 있다.
        그 밖의 사정(수수료 미정 등)은 상태가 아니라 이유라 배지 밑에 글로 남는다.
      */}
      <td className="whitespace-nowrap px-3 py-2.5 align-top">
        {covered ? (
          <Badge tone="mute">초과 충당</Badge>
        ) : done && state ? (
          <Badge tone={
            state === '확정' ? 'ok'
              : state === '가확정' ? 'warn'
                : state === '확정 누락' ? 'stop'
                  : 'mute'
          }>
            {state}
          </Badge>
        ) : openHere ? (
          p.state === '지급 가능' ? (
            /* 가확정은 왼쪽 체크 → 가확정 바에서 — 여기는 상태만 말한다 */
            <Badge tone="stage">지급 가능</Badge>
          ) : (
            <>
              <Badge tone="mute">대기</Badge>
              {p.blockers
                .filter((reason) => reason !== `${release.trigger} 대기`)
                .map((reason) => (
                  <p key={reason} className="mt-0.5 text-micro font-bold text-amber-700">
                    {reason}
                  </p>
                ))}
            </>
          )
        ) : (
          <Badge tone="mute">대기</Badge>
        )}
      </td>

      {/*
        동작 — 이 배치에서 지금 누를 수 있는 것.
          가확정      확정(배치 잠금) · 취소(이 회차를 지급 가능으로 되돌림)
          확정 누락   확정(놓친 전제를 그 자리에서 채운다)
          확정        해제
        확정·해제는 배치(지급처×구분×지급일) 단위다 — 같은 배치의 다른 줄도 함께 움직인다.
      */}
      {canConfirm && (
        <td className="whitespace-nowrap px-3 py-2.5 align-top">
          {done && state && p.org && at ? (
            <span className="inline-flex items-center gap-1.5">
              {(state === '가확정' || state === '확정 누락') && (
                <StepFinalize org={p.org} kind={p.kind} at={at} />
              )}
              {state === '가확정' && entryId && <StepCancel p={p} entryId={entryId} />}
              {state === '확정' && <StepFinalize org={p.org} kind={p.kind} at={at} undo />}
            </span>
          ) : null}
        </td>
      )}
    </>
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
    <span className="inline-block">
      <Btn kind="quiet" size="sm" busy={busy} onClick={() => void cancel()}>
        취소
      </Btn>
      <Err className="block">{error}</Err>
    </span>
  );
}

/**
 * 확정·해제 한 칸 — 배치 단위 동작이다. 배치 목록·명세서와 같은 훅(useFinalizeBatch)을
 * 쓴다 — 세 자리가 다른 길로 서버를 부르면 갈린다.
 */
function StepFinalize({
  org, kind, at, undo = false,
}: {
  org: string;
  kind: PayoutWork['kind'];
  at: string;
  /** true 면 해제 — 확정된 배치를 다시 연다 */
  undo?: boolean;
}) {
  const { busy, error, finalize } = useFinalizeBatch(org, kind, at);
  return (
    <span className="inline-block">
      <Btn
        kind={undo ? 'undo' : 'quiet'}
        size="sm"
        busy={busy}
        busyLabel={undo ? '해제 중…' : '확정 중…'}
        title={`${at} ${org} ${kind} 배치 전체가 ${undo ? '풀립니다' : '잠깁니다'} — 같은 배치의 다른 줄도 함께`}
        onClick={() => void finalize(undo)}
      >
        {undo ? '해제' : '확정'}
      </Btn>
      <Err className="block">{error}</Err>
    </span>
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
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
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

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
import {
  batchKey, batchStateOf, payDateChoices, workGroupOf, workOf,
  type PayoutRowInput, type PayoutWork, type WorkGroup,
} from '@/lib/payout-board';
import { DatePicker } from '@/components/DatePicker';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { Badge, Blank, Btn, Choice, Empty, Err, FIELD_CELL } from '@/components/ui';
import { Frame, SiteLink, won } from './parts';
import { useFinalizeBatch } from './use-batch';

const dayLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;

/**
 * 줄 순서 (한백 지적 2026-08-30 「정렬도 안 되어 있고」).
 *
 * ★전에는 순서가 없었다★ — 저장소가 읽어 온 차례 그대로라 같은 지급처의 줄이 표 여기저기에
 * 흩어졌다. 이 표에서 하는 일이 「지금 낼 수 있는 줄을 지급처별로 추려 한 날짜로 묶는」
 * 것이라, 그 일의 순서가 곧 줄의 순서여야 한다.
 *
 * 기본은 ★낼 것 먼저★다 — 지급 가능한 줄이 위로 올라오고, 그 안에서 지급처로 뭉친다.
 */
/**
 * 무엇부터 보나 — ★기본은 「지금 낼 것」이다★ (한백 지적 2026-08-31).
 *
 * 프로덕션 298줄 중 지금 낼 수 있는 것은 ★10줄★이다(2026-08-31 실측). 나머지 96%를
 * 지나며 그 열 줄을 찾고 있었다 — 정렬로 위에 올려 봐야 아래 288줄이 그대로 깔려 있다.
 * 이 화면에서 하는 일이 「낼 것을 추려 한 날짜로 묶는」 것이니, 열 때 그것만 서 있는 것이 맞다.
 * 나머지는 위 타일을 눌러 본다 — 몇 건인지는 늘 보인다.
 */
const GROUPS: Array<{ key: WorkGroup | '전체'; label: string; hint: string }> = [
  /* 이름은 보는 쪽에 따라 갈린다 — 한백은 내고 협력사는 받는다(아래에서 바꿔 끼운다) */
  { key: '지급 가능', label: '지금 낼 것', hint: '조건이 다 찼다' },
  { key: '채울 것 있음', label: '채울 것 있음', hint: '서류·단가가 빈다' },
  { key: '공정 대기', label: '공정 대기', hint: '설치·개통을 기다린다' },
  { key: '확정 완료', label: '확정 완료', hint: '더 낼 것이 없다' },
  { key: '전체', label: '전체', hint: '' },
];

type SortKey = 'ready' | 'org' | 'amount' | 'name';
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'ready', label: '낼 것 먼저' },
  { key: 'org', label: '지급처별' },
  { key: 'amount', label: '금액 큰 순' },
  { key: 'name', label: '현장명' },
];

const byOrgThenSite = (a: PayoutWork, b: PayoutWork) =>
  (a.org ?? '힣').localeCompare(b.org ?? '힣', 'ko')
  || a.kind.localeCompare(b.kind)
  || a.projectName.localeCompare(b.projectName, 'ko');

const SORTERS: Record<SortKey, (a: PayoutWork, b: PayoutWork) => number> = {
  /* 지급 가능이 위로 — 체크할 것을 찾아 훑지 않게 한다 */
  ready: (a, b) =>
    Number(b.state === '지급 가능') - Number(a.state === '지급 가능') || byOrgThenSite(a, b),
  org: byOrgThenSite,
  amount: (a, b) => b.due - a.due || byOrgThenSite(a, b),
  name: (a, b) => a.projectName.localeCompare(b.projectName, 'ko') || a.kind.localeCompare(b.kind),
};

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
  const [sort, setSort] = useState<SortKey>('ready');
  const [group, setGroup] = useState<WorkGroup | '전체'>('지급 가능');

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

  /* 상태별 건수·금액 — 타일이 적는다. 다른 필터(구분·지급처·지급시기)는 먹인 뒤에 센다 */
  const inOtherFilters = useMemo(
    () => work
      .filter((p) => org === null || p.org === org)
      .filter((p) => kindFilter === '전체' || p.kind === kindFilter)
      .filter((p) => stepFilter === '전체' || p.open?.no === (stepFilter === '1차' ? 1 : 2)),
    [work, org, kindFilter, stepFilter]
  );
  const countByGroup = useMemo(() => {
    const m = new Map<WorkGroup | '전체', { n: number; won: number }>();
    for (const p of inOtherFilters) {
      const g = workGroupOf(p);
      const amount = p.open?.amount ?? p.due;
      for (const key of [g, '전체' as const]) {
        const cur = m.get(key) ?? { n: 0, won: 0 };
        m.set(key, { n: cur.n + 1, won: cur.won + amount });
      }
    }
    return m;
  }, [inOtherFilters]);

  const shown = inOtherFilters
    .filter((p) => group === '전체' || workGroupOf(p) === group)
    .sort(SORTERS[sort]);

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
      {/*
        * ★무엇부터 볼지를 맨 위에서 고른다★ (한백 지적 2026-08-31 「눈에 잘 안 들어와」).
        * 건수와 금액이 적혀 있어 누르기 전에 안다 — 「지금 낼 것 10건 5,067만」이 이 화면의
        * 첫 문장이어야 한다. 0건인 자리도 지운다: 사라지면 자리를 외울 수 없다.
        */}
      <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {GROUPS.map((g) => {
          const c = countByGroup.get(g.key) ?? { n: 0, won: 0 };
          const on = group === g.key;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroup(g.key)}
              aria-pressed={on}
              className={`rounded-box border px-3 py-2 text-left transition ${
                on
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 bg-white hover:border-brand-300'
              }`}
            >
              <span className={`block text-tiny font-bold ${on ? 'text-brand-800' : 'text-slate-500'}`}>
                {g.key === '지급 가능' && !canConfirm ? '지금 받을 것' : g.label}
              </span>
              <span className="mt-0.5 flex items-baseline gap-1.5">
                <span className={`text-lead font-black tabular-nums ${c.n === 0 ? 'text-slate-300' : 'text-slate-900'}`}>
                  {c.n}
                </span>
                <span className="text-tiny text-slate-400">건</span>
                {c.n > 0 && (
                  <span className="ml-auto text-tiny font-bold tabular-nums text-slate-500">{won(c.won)}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

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

        <label className="flex items-center gap-1.5 whitespace-nowrap text-small font-bold text-slate-500">
          정렬
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className={`${FIELD_CELL} w-auto min-w-[120px]`}
          >
            {SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
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
        <div className="flex flex-col gap-3">
          <Blank>
            {group === '지급 가능'
              ? `${canConfirm ? '지금 낼 것' : '지금 받을 것'} 0건`
              : '조건에 맞는 지급이 0건'}
          </Blank>
          {/* 거른 사람만 막다른 곳에 선다 — 되돌릴 길을 그 자리에 둔다 */}
          {group !== '전체' && (
            <span className="text-center">
              <Btn size="sm" kind="quiet" onClick={() => setGroup('전체')}>전체 보기</Btn>
            </span>
          )}
        </div>
      ) : (
        <Frame min={orgs.length > 1 ? (canConfirm ? '1520px' : '1300px') : (canConfirm ? '1380px' : '1160px')}>
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
              {/*
                지급처가 하나뿐이면 열을 안 세운다 — 협력사에게는 모든 줄에 제 회사 이름이
                되풀이된다(2026-08-30). 위 필터가 같은 조건으로 이미 감춰져 있었다.
              */}
              {orgs.length > 1 && <th rowSpan={2} className="px-3 py-2.5 text-left">지급처</th>}
              <th rowSpan={2} className="px-3 py-2.5 text-left">구분</th>
              <th rowSpan={2} className="px-3 py-2.5 text-right">총 지급액</th>
              {/*
                머리 두 줄에 무게를 준다 (2026-08-31) — 둘 다 같은 회색 tiny 라 「네 칸이
                한 회차」라는 것이 안 읽혔다. 묶음 이름은 진하게, 칸 이름은 옅게.
              */}
              <th colSpan={canConfirm ? 4 : 3} className="border-l border-slate-200 px-3 pt-2 text-center text-small font-black text-slate-700">
                1차 · 70%
              </th>
              <th colSpan={canConfirm ? 4 : 3} className="border-l border-slate-200 px-3 pt-2 text-center text-small font-black text-slate-700">
                2차 · 잔액
              </th>
            </tr>
            <tr className="text-slate-400">
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
          {/*
            줄 사이 선을 divide-y 로 긋지 않는다 — 지급처가 바뀌는 자리에만 굵은 선을
            넣으려면 같은 속성을 두 곳에서 쓰게 되고, 어느 쪽이 이길지가 유틸리티가 찍히는
            차례에 달린다(2026-08-28 실측한 함정). 줄마다 직접 긋는다.
          */}
          <tbody>
            {shown.map((p, i) => {
              /*
               * ★지금 낼 수 있는 줄이 스스로 드러나야 한다★ (한백 지적 2026-08-30
               * 「표가 눈에 잘 안 들어와」). 스무 줄 가운데 체크할 수 있는 서너 줄을 눈으로
               * 찾아야 했다 — 체크칸이 비어 있다는 것만이 신호였다. 왼쪽에 색 막대를 세운다.
               * 배경색을 쓰지 않는 이유: 고른 줄(brand)과 겹쳐 둘이 섞인다.
               */
              const ready = p.state === '지급 가능';
              const lead = `border-l-[3px] ${ready ? 'border-l-amber-400' : 'border-l-transparent'}`;
              /* 지급처가 바뀌는 자리에 굵은 선 — 어느 정렬에서도 「여기부터 다른 회사」가 맞다 */
              const newOrg = i > 0 && shown[i - 1].org !== p.org;
              const rule = i === 0 ? '' : newOrg ? 'border-t-2 border-t-slate-200' : 'border-t border-t-slate-100';
              return (
              <tr
                key={p.key}
                className={`transition ${rule} ${picked.has(p.key) && ready ? 'bg-brand-50/60' : 'hover:bg-brand-50/40'}`}
              >
                {canConfirm && (
                  <td className={`px-3 py-2.5 align-top ${lead}`}>
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
                {/* 줄을 찾는 열쇠는 현장명이다 — 한 줄에서 가장 먼저 읽혀야 한다 */}
                <td className={`min-w-[13rem] px-3 py-2.5 align-top ${canConfirm ? '' : lead}`}>
                  <SiteLink id={p.projectId} name={p.projectName} tab="settlement" />
                  <p className="text-tiny text-slate-400">{p.cpo}</p>
                </td>
                {orgs.length > 1 && (
                  <td className="px-3 py-2.5 align-top text-slate-600">{p.org ?? <Empty kind="miss" />}</td>
                )}
                {/*
                  * ★구분은 분류지 상태가 아니다★ (2026-08-31). 각진 칩(Tag)이라 누르는 것으로
                  * 읽혔고, 같은 줄의 둥근 배지(상태)와 섞여 한 줄에 부품이 셋이었다
                  * (화면 규칙 11: 동글면 상태, 각지면 누르는 것). 값이 둘뿐이라 색 글자면 된다.
                  */}
                <td className="whitespace-nowrap px-3 py-2.5 align-top">
                  <p className={`font-bold ${p.kind === '영업비' ? 'text-sky-800' : 'text-brand-800'}`}>
                    {p.kind}
                  </p>
                  {p.adjust !== 0 && (
                    <p className="text-tiny font-semibold text-slate-400">
                      조정 {p.adjust > 0 ? '+' : ''}{won(p.adjust)}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
                  <p className="font-black tabular-nums text-slate-900">
                    {p.due > 0 ? won(p.due) : <span className="text-slate-300">—</span>}
                  </p>
                  {/* 금액 자체가 안 서는 사정(단가 미지정 등)은 회차가 아니라 총액의 일이다 */}
                  {p.due <= 0 && p.blockers.map((reason) => (
                    <p key={reason} className="text-tiny font-bold text-amber-700">{reason}</p>
                  ))}
                  {/*
                    * ★계획보다 더 나간 돈은 여기서 말한다★ (2026-08-28) — 단가를 잘못 알고
                    * 더 준 현장이 「확정 완료」로만 보여서, 전 현장을 훑어도 초과가 안 잡혔다.
                    * 돌려받든 잔금에서 빼든 사람이 처리해야 하는 자리라 눈에 띄어야 한다.
                    */}
                  {p.confirmed > p.plan + p.adjust && (
                    <p className="text-tiny font-black text-red-700">
                      초과 {won(p.confirmed - p.plan - p.adjust)}
                    </p>
                  )}
                </td>
                {([1, 2] as const).map((no) => (
                  <StepCells key={no} p={p} no={no} finalizedBatches={finalizedBatches} canConfirm={canConfirm} />
                ))}
              </tr>
              );
            })}
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
  // 초과로 채워진 것과 딴 명목(선금·차액)으로 나간 것을 가른다 — 뭉뚱그리면 거짓말이 된다
  const overflow = p.confirmed > p.plan + p.adjust;
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
          <p className="text-tiny tabular-nums text-slate-400">
            {release.trigger} {release.metAt.slice(5)}
          </p>
        ) : (
          <p className="text-tiny font-bold text-amber-700">{release.trigger} 전</p>
        )}
      </td>

      {/* 지급일 — 배치에 실렸으면 그 날짜, 지급 가능이면 규칙(익월 10·25일)을 예정으로 */}
      <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
        {covered ? (
          <span className="text-slate-300">—</span>
        ) : done ? (
          /* 지난 일은 조용하다 — 브랜드색이면 끝난 회차가 지금 낼 것보다 세게 읽힌다 */
          <p className="text-small font-bold tabular-nums text-slate-500">{at ?? '지급됨'}</p>
        ) : openHere && p.state === '지급 가능' && release.metAt ? (
          <p className="text-tiny font-bold text-slate-400">
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
          <Badge tone="mute">{overflow ? '초과 충당' : '다른 명목으로 지급'}</Badge>
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
                  <p key={reason} className="mt-0.5 text-tiny font-bold text-amber-700">
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

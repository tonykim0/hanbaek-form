'use client';

/**
 * 협력사 지급관리 — 전 현장의 지급현황을 한 표로 보고, 여기서 체크해 가확정한다.
 *
 *   영업비 1차 = 계약서류 확인 완료 · 2차 = 준공완료
 *   시공비 1차 = 설치완료 · 2차 = 준공완료
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
import { PAYOUT_KINDS, type BatchFinal, type PayoutKind } from '@/types/project';
import { payoutReleaseOf } from '@/lib/settlement';
import {
  batchKey, batchStateOf, isPayoutSubject, payDateChoices, workGroupOf, workOf,
  type PayoutRowInput, type PayoutWork, type WorkGroup,
} from '@/lib/payout-board';
import { DatePicker } from '@/components/DatePicker';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { Badge, Blank, Btn, Choice, Empty, Err, FIELD_CELL, Segments, Td, Th } from '@/components/ui';
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
 * 무엇부터 보나 — ★기본은 「지급 가능」이다★ (한백 지적 2026-08-31).
 *
 * ★이름은 상태 이름 그대로 쓴다★ (한백 지적 2026-08-31 「지금 낼 것 이라는 단어부터
 * 고쳐」). 「지금 낼 것」·「채울 것 있음」은 말투지 낱말이 아니고, 보는 쪽에 따라
 * 「지금 받을 것」으로 갈아 끼우고 있었다 — 같은 칸이 사람마다 다른 이름이면 서로 말이
 * 안 통한다. 상태 열의 배지가 이미 「지급 가능」이라 적는다. 타일과 배지가 한 낱말이다.
 *
 * 프로덕션 298줄 중 지금 낼 수 있는 것은 ★10줄★이다(2026-08-31 실측). 나머지 96%를
 * 지나며 그 열 줄을 찾고 있었다 — 정렬로 위에 올려 봐야 아래 288줄이 그대로 깔려 있다.
 * 이 화면에서 하는 일이 「낼 것을 추려 한 날짜로 묶는」 것이니, 열 때 그것만 서 있는 것이 맞다.
 * 나머지는 위 타일을 눌러 본다 — 몇 건인지는 늘 보인다.
 */
const GROUPS: Array<{ key: WorkGroup; hint: string }> = [
  { key: '지급 가능', hint: '조건이 다 찼다' },
  { key: '보완 필요', hint: '서류·단가가 비거나 초과가 났다' },
  { key: '공정 대기', hint: '설치·준공을 기다린다' },
  { key: '지급 완료', hint: '더 낼 것이 없다' },
  /*
   * 「전체」 타일은 없다 (한백 지시 2026-08-31 「전체는 필요없어」). 네 칸이 모든 줄을
   * 이미 나눠 갖고 있어 합계일 뿐이었고, 눌러 봐야 149줄이 섞여 나올 뿐이다.
   */
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

const STEP_FILTERS = ['전체', '1차', '2차'] as const;
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
  const [stepFilter, setStepFilter] = useState<StepFilter>('전체');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('ready');
  const [group, setGroup] = useState<WorkGroup>('지급 가능');

  // 지급이라는 것이 애초에 없는 줄은 세지 않는다 — 「낼 것이 없다」와 「다 냈다」는 다르다
  const work = useMemo(() => rows.map(workOf).filter(isPayoutSubject), [rows]);
  /*
   * ★구분은 갈래다 — 필터가 아니다★ (한백 지시 2026-08-31).
   *
   * 배치 열쇠가 지급일 × 지급처 × 구분이라 한 번의 가확정이 두 구분에 걸치는 일이
   * 구조적으로 없다. 받는 회사도 다르고(영업비 → 영업사, 시공비 → 시공사) 1차를 여는
   * 사실도 다르다(계약완료 / 설치완료). 그래서 섞어 보여주고 좁히게 하지 않고,
   * 처음부터 한쪽에 서게 한다. 이 화면이 하는 일이 한 구분 안에서만 돌기 때문이다.
   *
   * 이 사람에게 실제로 있는 구분만 갈래가 된다 — 영업만 하는 협력사에게 시공비 갈래는
   * 늘 0건이다. 하나뿐이면 갈래를 안 그린다(Segments 가 판정한다).
   */
  const kinds = useMemo(
    () => PAYOUT_KINDS.filter((k) => work.some((p) => p.kind === k)),
    [work]
  );
  const [kind, setKind] = useState<PayoutKind | null>(null);
  // 고른 것이 없거나 이 사람에게 없는 구분이면 첫 갈래에 선다
  const kindNow = kind !== null && kinds.includes(kind) ? kind : kinds[0] ?? '영업비';
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
      .filter((p) => p.kind === kindNow)
      .filter((p) => stepFilter === '전체' || p.open?.no === (stepFilter === '1차' ? 1 : 2)),
    [work, org, kindNow, stepFilter]
  );
  /* 갈래에 적는 건수 — 「지금 낼 수 있는 것」이 몇 건인가. 안 보고 있는 쪽도 보여야 한다 */
  const readyByKind = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of work) {
      if (workGroupOf(p) !== '지급 가능') continue;
      if (org !== null && p.org !== org) continue;
      m.set(p.kind, (m.get(p.kind) ?? 0) + 1);
    }
    return m;
  }, [work, org]);

  /*
   * ★타일의 금액은 「이 칸이 풀리면 나갈 돈」 하나다★ (한백 지적 2026-08-31 「확정완료에
   * 이상한 데이터가 들어가 있는 듯」).
   *
   * 전에는 `open?.amount ?? due` 였다 — 열린 회차가 있으면 그 회차 금액(지금 낼 돈),
   * 없으면 총액(계획+조정)이라 ★칸마다 다른 뜻의 숫자가 나란히 섰다.★ 확정 완료가
   * 그 자리다: 더 낼 것이 없는데 총 계획액 150만이 적혀, 지급 가능 5,067만 옆에서
   * 더해도 되는 숫자처럼 보였다. 단가 미지정 줄도 총액(=0)을 적고 있었다.
   * 열린 회차가 없으면 나갈 돈도 없다 — 0 이다.
   */
  const countByGroup = useMemo(() => {
    const m = new Map<WorkGroup, { n: number; won: number }>();
    for (const p of inOtherFilters) {
      const g = workGroupOf(p);
      const cur = m.get(g) ?? { n: 0, won: 0 };
      m.set(g, { n: cur.n + 1, won: cur.won + (p.open?.amount ?? 0) });
    }
    return m;
  }, [inOtherFilters]);

  const shown = inOtherFilters
    .filter((p) => workGroupOf(p) === group)
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
        * 구분은 갈래다 — 타일보다 위에 선다. 아래 모든 셈(타일의 건수·금액, 표, 가확정)이
        * 이 갈래 안에서 돈다. 하나뿐인 사람에게는 안 그려진다(위 kinds 주석).
        */}
      <Segments
        className="mb-3"
        value={kindNow}
        options={kinds.map((k) => ({ key: k, count: readyByKind.get(k) ?? 0 }))}
        onPick={(v) => { setKind(v as PayoutKind); setPicked(new Set()); }}
      />

      {/*
        * ★무엇부터 볼지를 맨 위에서 고른다★ (한백 지적 2026-08-31 「눈에 잘 안 들어와」).
        * 건수와 금액이 적혀 있어 누르기 전에 안다 — 「지급 가능 10건 5,067만」이 이 화면의
        * 첫 문장이어야 한다. 0건인 자리도 지운다: 사라지면 자리를 외울 수 없다.
        */}
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
                {g.key}
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
          <Blank>{`${group} 0건`}</Blank>
          {/* 거른 사람만 막다른 곳에 선다 — 되돌릴 길을 그 자리에 둔다(이제 갈 곳은 첫 칸이다) */}
          {group !== '지급 가능' && (
            <span className="text-center">
              <Btn size="sm" kind="quiet" onClick={() => setGroup('지급 가능')}>지급 가능 보기</Btn>
            </span>
          )}
        </div>
      ) : (
        <Frame min={orgs.length > 1 ? (canConfirm ? '1420px' : '1200px') : (canConfirm ? '1280px' : '1060px')}>
          {/*
            머리가 두 줄이다 — 「N차 지급」 한 칸에 배지·날짜·단추가 세로로 쌓여 있던 것을
            지급일·상태·동작 열로 폈다(한백 요청 2026-08-25). 쌓인 칸은 줄마다 높이가
            달라지고, 단추가 값 사이에 끼어 어디를 눌러야 하는지 훑어야 했다.
            열로 펴면 한 열을 위아래로 읽는 것이 곧 비교다(단가표 케이스 표와 같은 이유).
          */}
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              {canConfirm && <Th rowSpan={2} className="w-10" />}
              <Th left rowSpan={2}>현장</Th>
              {/*
                지급처가 하나뿐이면 열을 안 세운다 — 협력사에게는 모든 줄에 제 회사 이름이
                되풀이된다(2026-08-30). 위 필터가 같은 조건으로 이미 감춰져 있었다.
              */}
              {orgs.length > 1 && <Th rowSpan={2}>지급처</Th>}
              <Th rowSpan={2} money>총 지급액</Th>
              {/*
                머리 두 줄에 무게를 준다 (2026-08-31) — 둘 다 같은 회색 tiny 라 「네 칸이
                한 회차」라는 것이 안 읽혔다. 묶음 이름은 진하게, 칸 이름은 옅게.
              */}
              {/*
                ★회차를 여는 사실을 머리에 박는다★ (2026-08-31, 갈래로 나눈 덕이다).
                1차의 뜻이 구분마다 다르다 — 영업비는 계약완료, 시공비는 설치완료다.
                섞여 있을 때는 머리에 적을 수 없어 줄마다 금액 밑에 되풀이했다.
              */}
              <Th tight colSpan={canConfirm ? 4 : 3} className="border-l border-slate-200 pt-2 text-small font-black text-slate-700">
                1차 · {kindNow === '영업비' ? '계약서류 확인 완료' : '설치완료'} 시 70%
              </Th>
              <Th tight colSpan={canConfirm ? 4 : 3} className="border-l border-slate-200 pt-2 text-small font-black text-slate-700">
                2차 · 준공완료 시 잔액
              </Th>
            </tr>
            <tr className="text-slate-400">
              {[1, 2].map((no) => (
                <Fragment key={no}>
                  <Th tight money className="border-l border-slate-200 pb-2 font-semibold">금액</Th>
                  <Th tight className="pb-2 font-semibold">지급일</Th>
                  <Th tight className="pb-2 font-semibold">상태</Th>
                  {canConfirm && <Th tight className="w-px pb-2" />}
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
                  <Td className={lead}>
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
                  </Td>
                )}
                {/* 줄을 찾는 열쇠는 현장명이다 — 한 줄에서 가장 먼저 읽혀야 한다 */}
                <Td left className={`min-w-[13rem] ${canConfirm ? '' : lead}`}>
                  <SiteLink id={p.projectId} name={p.projectName} tab="settlement" />
                  <p className="text-tiny text-slate-400">{p.cpo}</p>
                </Td>
                {orgs.length > 1 && (
                  <Td className="text-slate-600">{p.org ?? <Empty kind="miss" />}</Td>
                )}
                {/*
                  * 구분 열은 없다 — 갈래가 이미 말한다(2026-08-31). 한 화면 안의 모든 줄이
                  * 같은 구분이라 열로 세우면 같은 값이 스무 번 되풀이된다(지급처 열을
                  * 하나뿐일 때 감추는 것과 같은 이유). 조정은 총액의 일이라 이 칸으로 왔다.
                  */}
                <Td money>
                  <p className="font-black text-slate-900">
                    {p.due > 0 ? won(p.due) : <span className="text-slate-300">—</span>}
                  </p>
                  {/* 금액 자체가 안 서는 사정(단가 미지정 등)은 회차가 아니라 총액의 일이다 */}
                  {p.due <= 0 && p.blockers.map((reason) => (
                    <p key={reason} className="ml-auto max-w-[11rem] whitespace-normal text-tiny font-bold text-amber-700">
                      {reason}
                    </p>
                  ))}
                  {/*
                    * ★계획보다 더 나간 돈은 여기서 말한다★ (2026-08-28) — 단가를 잘못 알고
                    * 더 준 현장이 「확정 완료」로만 보여서, 전 현장을 훑어도 초과가 안 잡혔다.
                    * 돌려받든 잔금에서 빼든 사람이 처리해야 하는 자리라 눈에 띄어야 한다.
                    */}
                  {p.adjust !== 0 && (
                    <p className="whitespace-nowrap text-tiny font-semibold text-slate-400">
                      조정 {p.adjust > 0 ? '+' : ''}{won(p.adjust)} 포함
                      {/* 회차에 붙은 몫은 어느 회차인지 적는다 — 총액만으로는 어디서 빠지는지 모른다 */}
                      {(p.adjustBy[1] !== 0 || p.adjustBy[2] !== 0) && (
                        <span className="text-slate-400">
                          {' ('}
                          {[1, 2].filter((n) => p.adjustBy[n] !== 0)
                            .map((n) => `${n}차 ${p.adjustBy[n] > 0 ? '+' : '-'}${won(Math.abs(p.adjustBy[n]))}`)
                            .join(' · ')}
                          {')'}
                        </span>
                      )}
                    </p>
                  )}
                  {p.confirmed > p.plan + p.adjust && (
                    <p className="whitespace-nowrap text-tiny font-black text-red-700">
                      초과 {won(p.confirmed - p.plan - p.adjust)}
                    </p>
                  )}
                </Td>
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
      <Td colSpan={canConfirm ? 4 : 3} className="border-l border-slate-100 text-slate-300">
        —
      </Td>
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
  /*
   * ★나간 회차는 원장 금액을 적는다★ (한백 지시 2026-09-04). 예전에는 끝난 회차에도
   * 다시 계산한 기준액을 적어서, 조정을 하나 넣으면 세금계산서까지 나간 1차가 이 표에서만
   * 조용히 줄었다 — 거래명세서와 다른 숫자를 말하는 화면이 됐다. 현장 상세의 같은 표는
   * 이미 원장을 먼저 적는다(components/project/SettlementTab.tsx) — 둘을 맞춘다.
   */
  const ledgerHere = p.ledger[no - 1];
  const amount = p.open?.no === no
    ? p.open.amount
    : ledgerHere ?? (no === 1 ? p.step1Amount : p.step2Amount);
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
      <Td money className="whitespace-nowrap border-l border-slate-100">
        <p className={`font-black ${done ? 'text-slate-400' : 'text-slate-900'}`}>
          {won(amount)}
        </p>
        {release.metAt ? (
          <p className="text-tiny text-slate-400">
            {release.trigger} {release.metAt.slice(5)}
          </p>
        ) : (
          <p className="text-tiny font-bold text-amber-700">{release.trigger} 전</p>
        )}
      </Td>

      {/* 지급일 — 배치에 실렸으면 그 날짜, 지급 가능이면 규칙(익월 10·25일)을 예정으로 */}
      <Td className="whitespace-nowrap tabular-nums">
        {covered ? (
          <span className="text-slate-300">—</span>
        ) : done ? (
          /* 지난 일은 조용하다 — 브랜드색이면 끝난 회차가 지금 내는 것보다 세게 읽힌다 */
          <p className="text-small font-bold text-slate-500">{at ?? '지급됨'}</p>
        ) : openHere && p.state === '지급 가능' && release.metAt ? (
          <p className="text-tiny font-bold text-slate-400">
            {Number(payDateChoices(release.metAt)[0].slice(5, 7))}월 10·25일
          </p>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </Td>

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
      <Td className="max-w-[13rem]">
        {/* 차감이 이 회차 몫을 통째로 먹으면 나간 돈이 0 이다 — 없는 지급을 지어내지 않는다 */}
        {covered ? (
          <Badge tone="mute">
            {overflow ? '초과 충당' : amount === 0 ? '차감으로 없음' : '다른 명목으로 지급'}
          </Badge>
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
                  <p key={reason} className="mt-0.5 text-tiny font-bold leading-snug text-amber-700">
                    {reason}
                  </p>
                ))}
            </>
          )
        ) : (
          <Badge tone="mute">대기</Badge>
        )}
      </Td>

      {/*
        동작 — 이 배치에서 지금 누를 수 있는 것.
          가확정      확정(배치 잠금) · 취소(이 회차를 지급 가능으로 되돌림)
          확정 누락   확정(놓친 전제를 그 자리에서 채운다)
          확정        해제
        확정·해제는 배치(지급처×구분×지급일) 단위다 — 같은 배치의 다른 줄도 함께 움직인다.
      */}
      {canConfirm && (
        <Td className="w-px whitespace-nowrap">
          {done && state && p.org && at ? (
            <span className="inline-flex items-center gap-1.5">
              {(state === '가확정' || state === '확정 누락') && (
                <StepFinalize org={p.org} kind={p.kind} at={at} />
              )}
              {state === '가확정' && entryId && <StepCancel p={p} entryId={entryId} />}
              {state === '확정' && <StepFinalize org={p.org} kind={p.kind} at={at} undo />}
            </span>
          ) : null}
        </Td>
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

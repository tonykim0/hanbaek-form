'use client';

/**
 * 단가 케이스 관리. [한백 전용]
 *
 * 세 구역이다.
 *   1) 빈 자리 — 운영사 × 교체유형 중 케이스가 0건인 칸. 이게 이 화면의 이유다.
 *   2) 케이스 — 등록된 것 전부. 수정·개정·중지가 여기 있다.
 *   3) 폼 — 새 케이스·수정·개정이 같은 폼이다. 돈은 흐름 순서로 들어온다:
 *      받는 단가(운영사) → 마진 → 지급 단가 → 영업비·시공비 나눔 → 기성 단계.
 *
 * ★고치는 길은 참조 전까지만이다.★
 * 계약 라인은 금액을 복사하지 않고 케이스를 참조한다 — 참조된 케이스를 고치면 그 현장의
 * 지급액·기성이 소급해서 바뀐다. 그래서 참조 없는 케이스만 「수정」이고, 참조된 케이스는
 * 전 값이 채워진 「개정」(새 케이스)으로 연다. 반년마다 단가가 바뀌는 것은 고침이 아니라
 * 새 케이스다 — 옛 것은 중지한다.
 *
 * 지우는 자리는 없다. 이미 참조하는 라인이 있으면 지급액을 계산할 수 없게 된다 —
 * 중지하면 새로 붙일 수는 없고, 이미 붙은 것은 그대로 계산된다.
 */
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  BUILDING_TYPES, bizTypeOfRepl, CHANNELS, CPO_NAMES, REPL_TYPES,
  type BuildingType, type Channel, type CpoName, type LineAxes, type PricingRule, type ReplType,
  type PromoExtendOption, type PromoStep, type SettlementRule, type SettlementStepRule, type Trigger,
} from '@/types/project';
import { won } from '@/lib/format';
import { useAction } from '@/lib/use-action';
import { halfEndKey, halfKeyOf, halfLabel, startKey } from '@/lib/pricing-match';
import { checkSettlementSteps, RECEIVE_TRIGGERS, settlementStepsKeyOf, stepUnits } from '@/lib/settlement';
import { Badge, Blank, Btn, Choice, Empty, Err, FIELD, FIELD_CELL, PANEL, Tag } from '@/components/ui';

const POWER_TYPES = ['한전불입', '모자분리'] as const;

/**
 * 건축물 축 두 칸이 실제로 무엇을 뜻하는가 — 운영사마다 다르다.
 *
 * ★「공동 / 공동 외」로 줄여 적던 것을 걷어냈다 (한백 지적 2026-08-23).★
 * 줄이면 두 칸이 같은 말을 두 번 하는 것처럼 보이고, 무엇보다 운영사마다 경계가 다른 것을
 * 감춘다 — 플러그링크는 주거용 오피스텔이 공동주택 쪽에 들고(정책 배포본 260629),
 * 나이스는 「공동주택 외(주거형 오피스텔 · 지식산업센터 등)」로 반대쪽에 든다.
 * 같은 「공동 외」 라벨 아래 정반대의 것이 들어 있었다.
 *
 * DB 의 저장값은 그대로 '공동주택' · '상업시설' 이다 — 여기서 바꾸는 것은 이름표뿐이다.
 * 축을 운영사마다 쪼개면 케이스 판정(matchingRules)까지 갈라져야 하고, 경계가 갈리는 것은
 * 「어느 건물이 어느 쪽인가」일 뿐 축의 개수는 둘 그대로다.
 * 무엇이 드는지 자세한 것은 아래 설치조건 행이 말한다.
 */
const BLDG_LABEL: Partial<Record<CpoName, Record<BuildingType, string>>> = {
  플러그링크: { 공동주택: '공동주택 · 주거용 오피스텔', 상업시설: '그 외' },
};
const BLDG_LABEL_DEFAULT: Record<BuildingType, string> = {
  공동주택: '공동주택',
  상업시설: '공동주택 외',
};
const bldgAxisLabel = (cpo: CpoName, b: BuildingType) =>
  BLDG_LABEL[cpo]?.[b] ?? BLDG_LABEL_DEFAULT[b];

const TERMS = [5, 7, 10] as const;

/** 폼으로 넘기는 값 — 채워진 것만 프리필된다. 그리드 칸·막힌 라인은 축만, 수정·개정은 전부 싣는다 */
export interface Prefill {
  cpo?: CpoName;
  replType?: ReplType;
  powerType?: (typeof POWER_TYPES)[number];
  terms?: number[];
  bldgs?: BuildingType[];
  channel?: Channel;
  bizYear?: number;
  startDate?: string;
  salesUnit?: number;
  consUnit?: number;
  margin?: number;
  steps?: SettlementStepRule[];
  supplyItems?: string;
  promo?: PromoStep[] | null;
  promoExtend?: PromoExtendOption[] | null;
  chargeRate?: number | null;
  installTerms?: string;
  otherSupport?: string;
  coexistTerms?: string;
  miscTerms?: string;
  note?: string;
  /**
   * 개정일 때 원 케이스의 startKey — 새 시작이 이보다 늦어야 저장된다.
   * 이르거나 같으면 매트릭스가 옛 케이스를 최신으로 집어 개정이 안 보이는 상태가 된다.
   */
  after?: string;
}

/** 케이스 → 프리필 — 수정·개정이 같은 값을 들고 폼을 연다. 옛 저장값 '시공만' 은 '시공' 으로 읽는다 */
function prefillOf(r: PricingRule, settle: SettlementRule | null): Prefill {
  return {
    cpo: r.cpo, replType: r.replType, powerType: r.powerType,
    terms: r.termYears, bldgs: r.bldgTypes,
    channel: (r.channel as string) === '시공만' ? '시공' : r.channel,
    bizYear: r.bizYear,
    salesUnit: r.salesUnit, consUnit: r.consUnit, margin: r.margin,
    steps: settle?.steps,
    supplyItems: r.supplyItems ?? undefined,
    promo: r.promo,
    promoExtend: r.promoExtend,
    chargeRate: r.chargeRate,
    installTerms: r.installTerms ?? undefined,
    otherSupport: r.otherSupport ?? undefined,
    coexistTerms: r.coexistTerms ?? undefined,
    miscTerms: r.miscTerms ?? undefined,
    note: r.note ?? undefined,
  };
}

/** 받는 단가 — 운영사가 대당 주는 총액(기성으로 받는다) = 영업비 + 시공비 + 마진 */
const receiveUnitOf = (r: PricingRule) => r.salesUnit + r.consUnit + r.margin;
/** 지급 단가 — 마진을 뗀 뒤 협력사에 내려주는 총액 = 영업비 + 시공비 */
const payoutUnitOf = (r: PricingRule) => r.salesUnit + r.consUnit;

/** 폼이 열리는 방식 — editId 가 있으면 그 케이스를 자리에서 고치고, 없으면 새 케이스(개정 포함)다 */
interface FormOpen {
  prefill: Prefill;
  editId?: string;
}

/**
 * 고칠 수 있는가 — 열람 전용이면 false 다.
 *
 * 프롭으로 내리지 않고 컨텍스트로 두는 이유: 이 화면의 「고치는 자리」는 네 겹 안쪽까지
 * 흩어져 있다(머리말의 새 케이스 · 막힌 라인의 만들기 · 그리드 칸 · 케이스 줄의 수정·개정·중지).
 * 여섯 자리에 같은 값을 나르려고 중간 부품 셋의 프롭을 늘리면, 다음에 단추를 하나 더
 * 넣는 사람이 그 사슬을 다시 잇거나 빠뜨린다.
 *
 * 판정의 정본은 서버다 — /api/pricing 은 adminWrite 라 열람 전용이면 403 이다.
 * 여기서 하는 일은 못 하는 것을 눌리지 않게 두는 것뿐이다(화면 규칙 3번).
 */
const CanEdit = createContext(true);

export default function PricingMatrix({
  rules, settlementRules, blockedLines, referencedIds, canEdit,
}: {
  rules: PricingRule[];
  /** 정산 규칙 표 — 케이스의 기성 단계를 그리는 데 쓴다. 케이스가 단계를 정의하면 저장소에 쌓인다 */
  settlementRules: SettlementRule[];
  /** 활성 케이스가 하나도 안 맞는 실제 라인 — 서버(page)가 판정해서 넘긴다 */
  blockedLines: LineAxes[];
  /** 계약 라인이 참조하는 케이스 id — 「수정」(자리 고침)과 「개정」(새 케이스)을 가른다 */
  referencedIds: string[];
  /** 고칠 수 있는가 — 열람 전용은 표만 본다 */
  canEdit: boolean;
}) {
  /*
   * 폼은 「무엇을 들고 여는가」와 함께 열린다 — 그리드의 빈 칸·막힌 라인은 축만,
   * 수정·개정은 케이스 전부를 싣는다. null 이면 닫힘. key 로 다시 마운트해 프리필을 확실히 싣는다.
   */
  const [form, setForm] = useState<FormOpen | null>(null);

  const settleById = useMemo(
    () => new Map(settlementRules.map((s) => [s.id, s])),
    [settlementRules]
  );
  const referenced = useMemo(() => new Set(referencedIds), [referencedIds]);

  const live = rules.filter((r) => r.active);
  const stopped = rules.length - live.length;

  return (
    <CanEdit.Provider value={canEdit}>
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black text-slate-900">단가표</h1>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-base text-slate-500">
            <span>
              사용 <b className="tabular-nums text-slate-800">{live.length}</b>건
            </span>
            {/* 0건도 적는다 — 「중지한 것이 없다」와 「중지 칸이 없다」는 다른 말이다 */}
            <span>
              중지 <b className="tabular-nums text-slate-800">{stopped}</b>건
            </span>
          </p>
        </div>
        {/* 폼이 열리면 감춘다 — 채운 초록이 둘이면 「케이스 넣기」와 헷갈리고,
            이걸 누르면 입력이 통째로 사라진다. 닫는 길은 폼 안의 취소 하나다. */}
        {canEdit && !form && <Btn onClick={() => setForm({ prefill: {} })}>새 케이스</Btn>}
      </header>

      {form && (
        <CaseForm
          key={JSON.stringify(form)}
          prefill={form.prefill}
          editId={form.editId}
          settlementRules={settlementRules}
          onDone={() => setForm(null)}
        />
      )}

      <BlockedLines lines={blockedLines} onFill={(prefill) => setForm({ prefill })} />
      <Grid rules={live} settleById={settleById} onOpen={setForm} />
      <CaseList
        rules={rules}
        settleById={settleById}
        referenced={referenced}
        onOpen={setForm}
      />
    </div>
    </CanEdit.Provider>
  );
}

/* ── 막힌 라인 ────────────────────────────────────────────────────────────
 * 「모든 현장에 대응한다」의 잣대는 이 목록이 0건인 것이다. 축 공간(180칸)을 다 채우는
 * 것이 아니라 — 실제로 들어온 라인이 케이스를 못 찾을 때만 여기 나타난다.
 */
function BlockedLines({ lines, onFill }: { lines: LineAxes[]; onFill: (p: Prefill) => void }) {
  const canEdit = useContext(CanEdit);
  if (lines.length === 0) return null;
  return (
    <section className={`${PANEL} border-amber-200 p-5 sm:p-6`}>
      <h2 className="mb-4 text-h3 font-black text-slate-900">
        막힌 라인 <span className="tabular-nums text-amber-700">{lines.length}건</span>
      </h2>
      <div className="flex flex-col divide-y divide-slate-100">
        {lines.map((l) => {
          const repl = l.lineReplType ?? l.projectReplType;
          return (
            <div key={l.lineId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <span className="font-bold text-slate-800">{l.projectName}</span>
              <span className="flex flex-wrap gap-1">
                <Tag>{l.cpo}</Tag>
                {repl ? <Tag>{repl}</Tag> : <Tag tone="warn">교체유형 미지정</Tag>}
                <Tag>{l.termYears}년 × {l.qty}대</Tag>
                {l.powerType ? <Tag>{l.powerType}</Tag> : <Tag tone="warn">수전 미지정</Tag>}
                {l.bldgType ? <Tag>{l.bldgType}</Tag> : <Tag tone="warn">유형 미지정</Tag>}
              </span>
              {canEdit && (
              <Btn
                size="sm"
                kind="side"
                className="ml-auto"
                onClick={() =>
                  onFill({
                    cpo: l.cpo,
                    replType: repl ?? undefined,
                    powerType: l.powerType ?? undefined,
                    terms: [l.termYears],
                    bldgs: l.bldgType ? [l.bldgType] : undefined,
                  })
                }
              >
                이 축으로 케이스 만들기
              </Btn>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── 운영사별 원자 칸 그리드 ──────────────────────────────────────────────
 * 줄 = 교체유형 × 수전방식(6), 칸 = 연수 × 건축물유형(6). 케이스 한 행이 여러 칸을 덮는
 * 블록이라, 행 목록만 봐서는 어느 칸이 비었는지 알 수 없다 — 칸으로 펴서 보인다.
 *
 * ★시기 탭★ 단가는 반년마다 갱신되므로 매트릭스도 반기 단위로 편다. 한 칸에 최신
 * 개정만 보이면 상반기 단가가 ×N 뒤에 숨는다 — 실제로 「왜 안 보이나」가 됐다.
 * 고른 반기까지 시작된 케이스 중 최신이 그 시기의 값이고, 이전 반기에서 이월된
 * 값(이 시기 개정 없음)은 연하게 보인다.
 *
 * 빈 칸은 조용한 「—」다. 진짜 경보는 위의 막힌 라인이 맡는다 — 축 공간 대부분은
 * 그 조합의 현장이 아직 없어서 비어 있는 것뿐이다.
 * 빈 칸을 누르면 그 축이 채워진 폼이, 찬 칸을 누르면 현재 케이스의 전 값을 실은
 * 개정 폼이 열린다 — 적용 시작만 비워서, 새 시작을 적어야 저장되게.
 */
function Grid({
  rules, settleById, onOpen,
}: {
  rules: PricingRule[];
  settleById: Map<string, SettlementRule>;
  onOpen: (f: FormOpen) => void;
}) {
  const canEdit = useContext(CanEdit);
  const [cpo, setCpo] = useState<CpoName>(CPO_NAMES[0]);
  const [halfPick, setHalfPick] = useState<string | null>(null);

  /* 턴키 채널만 격자에 편다 — 영업·시공 채널은 드물어 목록에서 본다. 있으면 아래에 개수로 보인다 */
  const mine = rules.filter((r) => r.cpo === cpo && r.channel === '턴키');

  /*
   * 연수 열은 그 운영사의 케이스에서 유도한다 — 5·7·10년을 늘 펴 두면 5년 정책이 있는 곳은
   * 에버온뿐이라(한백 확인 2026-08-22) 나머지 넷은 늘 빈 열 둘을 끌고 다닌다.
   * 그 빈 칸은 「케이스가 없다」가 아니라 「그 운영사에 없는 계약기간」이고, 둘은 다른 말이다.
   * 케이스가 아직 없는 운영사는 7·10년으로 편다 — 격자의 빈 칸이 케이스를 만드는 입구다.
   */
  const gridTerms = (() => {
    const found = [...new Set(mine.flatMap((r) => r.termYears))].sort((a, b) => a - b);
    return found.length > 0 ? found : [7, 10];
  })();
  const sideCount = rules.filter((r) => r.cpo === cpo && r.channel !== '턴키').length;

  /* 시기 탭은 전 운영사의 케이스에서 뽑는다 — 운영사를 바꿔도 탭이 그대로라 길을 잃지 않는다 */
  const halves = [...new Set(rules.filter((r) => r.channel === '턴키').map(halfKeyOf))].sort();
  const half = halfPick && halves.includes(halfPick) ? halfPick : halves[halves.length - 1] ?? null;

  /** 칸에서 이 시기에 적용 중인 케이스 — 그 반기까지 시작된 것 중 최신. 이전 반기 것이면 이월이다 */
  const at = (repl: ReplType, power: (typeof POWER_TYPES)[number], term: number, bldg: BuildingType) => {
    if (!half) return { now: null, carried: false };
    const end = halfEndKey(half);
    const hits = mine
      .filter((r) =>
        r.replType === repl && r.powerType === power &&
        r.termYears.includes(term) && r.bldgTypes.includes(bldg) &&
        startKey(r) <= end
      )
      .sort((a, b) => startKey(b).localeCompare(startKey(a)));
    const now = hits[0] ?? null;
    return { now, carried: now !== null && halfKeyOf(now) !== half };
  };

  /*
   * ── 정책 조건 행 ──────────────────────────────────────────────────────
   * 단가 아래에 조건을 같은 표의 행으로 잇는다 — 정책서가 그 꼴이고(구분 | 기준),
   * 조건이 연수·건축물유형으로 갈리는 것도 여기서 그대로 보인다(주차면 5% vs 2%).
   *
   * 한 칸의 값은 그 칸에 지금 적용 중인 케이스들에서 모은다 — 값이 서로 다르면 둘 다 적는다.
   * 감추면 「이 축의 조건이 갈린다」는 사실이 사라진다.
   */
  /*
   * num 행(충전요금·프로모션·연장차감)은 가운데 + tabular-nums, 글 행은 왼쪽 — 정렬을
   * 병합 폭이 아니라 행의 종류가 정한다. 폭으로 정하면 같은 행이 시기마다 다르게 선다.
   */
  const POLICY_ROWS: { label: string; num?: boolean; of: (r: PricingRule) => string | null }[] = [
    { label: '충전요금', num: true, of: (r) => (r.chargeRate === null ? null : `${won(r.chargeRate)}원`) },
    {
      label: '프로모션',
      num: true,
      of: (r) => (r.promo === null ? null
        : r.promo.length === 0 ? '없음'
          : r.promo.map((x) => `${x.months}개월 ${won(x.rate)}원`).join(' + ')),
    },
    {
      /*
       * 연장은 고를 수 있는 것이 여럿이다 — 늘리는 요금마다 차감액이 다르다
       * (플러그링크: 6개월 149원 20만 · 6개월 249원 10만). 하나만 적으면 고를 것이
       * 하나뿐인 것처럼 보이므로 전부 적는다. 숫자 한 칸이 아니게 되어 num 을 뗀다.
       */
      label: '연장 차감',
      of: (r) => (r.promoExtend === null ? null
        : r.promoExtend.length === 0 ? '없음'
          : r.promoExtend
            .map((x) => `${x.months}개월 ${won(x.rate)}원 → ${won(x.deduct)}원`)
            .join(' · ')),
    },
    { label: '지급자재', of: (r) => r.supplyItems },
    { label: '설치조건', of: (r) => r.installTerms },
    { label: '병행', of: (r) => r.coexistTerms },
    { label: '기타지원', of: (r) => r.otherSupport },
    { label: '기타', of: (r) => r.miscTerms },
  ];

  /** 한 칸(연수 × 유형)에 지금 적용 중인 케이스들 — 값 칸에 숫자가 뜨는 그 케이스들이다 */
  const casesAt = (term: number, bldg: BuildingType) =>
    REPL_TYPES.flatMap((repl) =>
      POWER_TYPES.map((power) => at(repl, power, term, bldg).now)
    ).filter((r): r is PricingRule => r !== null);

  /** 칸 하나의 정책 값 — 케이스마다 다르면 둘 다 적는다. 아무 케이스도 없으면 null */
  const policyAt = (term: number, bldg: BuildingType, of: (r: PricingRule) => string | null) => {
    const vals = [...new Set(casesAt(term, bldg).map(of).filter((v): v is string => Boolean(v)))];
    // 값이 여럿이면(케이스마다 갈리면) 줄로 가른다 — ' / ' 로 이으면 긴 글이 한 덩어리가 된다
    return vals.length === 0 ? null : vals.join('\n');
  };

  /*
   * 값이 같은 옆칸을 하나로 묶는다 — 안 묶으면 「스탠드폴 + 가림막」이 여섯 번 적힌다.
   * 정책서도 같은 값은 셀을 병합해 두었고, 병합된 폭이 곧 「이 조건이 어디까지 같은가」다.
   *
   * ★값이 한 가지뿐이면 전 칸을 한 칸으로 묶는다.★ 열이 여섯이라 칸 하나가 100px 남짓인데,
   * 설치조건 같은 긴 글이 그 폭에 들어가면 한 행이 열 줄이 된다. 조건은 대개 축과 무관하게
   * 같은 값이고(빈 칸은 그 축에 케이스가 없다는 뜻일 뿐이다), 그럴 때 쪼개 봤자 읽히지 않는다.
   * 실제로 갈리는 조건(연수마다 다른 프로모션)만 칸이 쪼개진다.
   */
  /*
   * ── 글 행의 공통/차이 분해 ──────────────────────────────────────────────
   * 한 칸의 값은 그 칸 케이스들(교체유형×수전이 합쳐진)의 글을 겹치지 않게 모은 것이다.
   * 칸끼리 문자열 통째로 견주면 몇 줄만 달라도 「다른 값」이 되어, 공통 불릿까지 칸마다
   * 통째로 반복된다 — 기타 행에서 같은 일곱 줄이 세 칸에 찍혔다(2026-08-23 한백 지적).
   * 그래서 줄(불릿) 단위로 가른다: 값이 있는 모든 칸에 든 줄은 「공통」으로 전 폭에 한 번,
   * 나머지만 칸별로 남긴다.
   */
  const bulletsAt = (term: number, bldg: BuildingType, of: (r: PricingRule) => string | null) => {
    const out: string[] = [];
    for (const r of casesAt(term, bldg)) {
      const v = of(r);
      if (!v) continue;
      for (const line of v.split('\n')) if (!out.includes(line)) out.push(line);
    }
    return out;
  };

  const splitCommon = (of: (r: PricingRule) => string | null) => {
    const cells = gridTerms.flatMap((t) => BUILDING_TYPES.map((b) => bulletsAt(t, b, of)));
    const filled = cells.filter((c) => c.length > 0);
    const common = filled.length === 0
      ? []
      : filled[0].filter((line) => filled.every((c) => c.includes(line)));
    const rest = cells.map((c) => {
      const left = c.filter((line) => !common.includes(line));
      return left.length > 0 ? left.join('\n') : null;
    });
    return { common, rest };
  };

  /** 남은 칸별 값(또는 숫자 행의 칸 값)을 같은 값끼리 병합한다 */
  const spansOf = (of: (r: PricingRule) => string | null) => {
    const cells = gridTerms.flatMap((t) => BUILDING_TYPES.map((b) => policyAt(t, b, of)));
    const distinct = [...new Set(cells.filter((v): v is string => v !== null))];
    if (distinct.length <= 1) {
      return [{ value: distinct[0] ?? null, span: cells.length }];
    }
    const out: { value: string | null; span: number }[] = [];
    for (const v of cells) {
      const last = out[out.length - 1];
      if (last && last.value === v) last.span += 1;
      else out.push({ value: v, span: 1 });
    }
    return out;
  };

  return (
    <section className={`${PANEL} p-5 sm:p-6`}>
      {/*
        시기·운영사는 드롭다운이고 왼쪽에 몰려 있다 — 칩으로 늘어놓으면 해가 바뀔 때마다
        칩이 늘어(2026 상·하 → 2027 상·하 …) 줄바꿈되고, 그러면 표 머리가 아래로 밀린다.
        고르는 것이 둘뿐이라 한 줄에 나란히 두면 「무엇을 보고 있는가」가 한눈에 읽힌다.
      */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-h3 font-black text-slate-900">매트릭스</h2>
        <div className="w-40">
          <select
            aria-label="시기"
            className={FIELD}
            value={half ?? ''}
            onChange={(e) => setHalfPick(e.target.value)}
          >
            {halves.map((h) => (
              <option key={h} value={h}>{halfLabel(h)}</option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <select
            aria-label="운영사"
            className={FIELD}
            value={cpo}
            onChange={(e) => setCpo(e.target.value as CpoName)}
          >
            {CPO_NAMES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        {/*
          table-fixed + colgroup 으로 열 너비를 못 박는다. auto 레이아웃에서는 브라우저가
          내용으로 너비를 정해서, 값이 든 열은 넓어지고 「—」만 있는 열은 좁아진다 —
          그러면 5·7·10년 머리글(colSpan 2)과 그 아래 공동·상업 칸이 어긋난다.
        */}
        {/* 표 안 글자는 text-small 한 벌이다 — 단가·조건이 크기로 갈리면 다른 표처럼 읽힌다 */}
        <table className="w-full min-w-[860px] table-fixed text-small">
          <colgroup>
            <col className="w-56" />
            {gridTerms.flatMap((t) =>
              BUILDING_TYPES.map((b) => <col key={`${t}-${b}`} />)
            )}
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left" rowSpan={2}>교체유형 · 수전</th>
              {gridTerms.map((t) => (
                <th key={t} colSpan={2} className="border-l border-slate-100 px-3 pt-2 text-center">{t}년</th>
              ))}
            </tr>
            <tr>
              {gridTerms.flatMap((t) =>
                BUILDING_TYPES.map((b) => (
                  <th
                    key={`${t}-${b}`}
                    className={`break-keep px-3 pb-2 text-right font-semibold ${b === '공동주택' ? 'border-l border-slate-100' : ''}`}
                  >
                    {/* 줄여 적지 않는다 — 운영사마다 경계가 다르다(BLDG_LABEL) */}
                    {bldgAxisLabel(cpo, b)}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {REPL_TYPES.flatMap((repl) =>
              POWER_TYPES.map((power) => (
                <tr key={`${repl}-${power}`}>
                  {/* 열 너비가 고정이라 줄바꿈을 막지 않는다 — 막으면 「자체투자 (제자리교체)」가 칸을 넘는다 */}
                  <td className="px-3 py-2">
                    <span className="font-bold text-slate-700">{repl}</span>
                    <span className="ml-1.5 text-tiny text-slate-400">{power}</span>
                  </td>
                  {gridTerms.flatMap((term) =>
                    BUILDING_TYPES.map((bldg) => {
                      const { now, carried } = at(repl, power, term, bldg);
                      return (
                        <td key={`${term}-${bldg}`} className={`px-1 py-1 text-right ${bldg === '공동주택' ? 'border-l border-slate-100' : ''}`}>
                          <button
                            type="button"
                            disabled={!canEdit}
                            title={
                              !canEdit
                                ? now
                                  ? `${now.startDate}부터 적용`
                                  : '케이스 없음'
                                : now
                                ? carried
                                  ? `${now.startDate} 단가가 계속 적용 — 이 시기 개정 없음. 누르면 개정 폼이 열린다`
                                  : `${now.startDate}부터 적용 — 누르면 전 값을 실은 개정 폼이 열린다`
                                : '누르면 이 축으로 케이스를 넣는다'
                            }
                            onClick={() =>
                              onOpen({
                                prefill: now
                                  ? { ...prefillOf(now, settleById.get(now.defaultSettlementRuleId) ?? null), after: startKey(now) }
                                  : { cpo, replType: repl, powerType: power, terms: [term], bldgs: [bldg] },
                              })
                            }
                            className="w-full rounded-ctl px-2 py-1 text-right tabular-nums transition enabled:hover:bg-brand-50 disabled:cursor-default"
                          >
                            {now ? (
                              <span className={`font-bold ${carried ? 'text-slate-400' : 'text-slate-800'}`}>
                                {won(receiveUnitOf(now))}
                                {/* 부기 — 이 금액을 읽는 순간 같이 봐야 하는 조건 (한전불입 10기 이내 등) */}
                                {now.note && (
                                  <span className="block whitespace-normal break-keep text-tiny font-semibold text-slate-400">
                                    {now.note}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="font-bold text-slate-300">—</span>
                            )}
                          </button>
                        </td>
                      );
                    })
                  )}
                </tr>
              ))
            )}
          </tbody>

          {/* 단가와 조건을 한 표로 잇는다 — 굵은 선 한 겹으로만 가른다(상자를 겹치지 않는다) */}
          <tbody className="divide-y divide-slate-100 border-t-2 border-slate-200">
            {POLICY_ROWS.map((row) => {
              /* 숫자 행은 칸 값 그대로, 글 행은 공통 불릿을 떼어 전 폭에 한 번만 */
              if (row.num) {
                return (
                  <tr key={row.label} className="align-top">
                    <td className="px-3 py-2 font-bold text-slate-700">{row.label}</td>
                    {spansOf(row.of).map((c, i) => (
                      <td
                        key={i}
                        colSpan={c.span}
                        className={`whitespace-pre-line break-keep px-3 py-2 text-small text-center font-bold tabular-nums text-slate-800 ${i === 0 ? '' : 'border-l border-slate-100'}`}
                      >
                        {c.value === null ? <Empty kind="wait" /> : c.value}
                      </td>
                    ))}
                  </tr>
                );
              }
              const { common, rest } = splitCommon(row.of);
              const diffs: { value: string | null; span: number }[] = [];
              for (const v of rest) {
                const last = diffs[diffs.length - 1];
                if (last && last.value === v) last.span += 1;
                else diffs.push({ value: v, span: 1 });
              }
              const hasDiff = rest.some((v) => v !== null);
              const cols = gridTerms.length * BUILDING_TYPES.length;
              return (
                <Fragment key={row.label}>
                  <tr className="align-top">
                    {/* 행 라벨은 축 라벨(교체유형)과 같은 톤 — 표 안에 글자 크기를 셋 두지 않는다 */}
                    <td className="px-3 py-2 font-bold text-slate-700" rowSpan={common.length > 0 && hasDiff ? 2 : 1}>
                      {row.label}
                    </td>
                    {common.length > 0 ? (
                      <td colSpan={cols} className="whitespace-pre-line break-keep px-3 py-2 text-left text-small text-slate-700">
                        {common.join('\n')}
                      </td>
                    ) : hasDiff ? (
                      diffs.map((c, i) => (
                        <td
                          key={i}
                          colSpan={c.span}
                          className={`whitespace-pre-line break-keep px-3 py-2 text-left text-small text-slate-700 ${i === 0 ? '' : 'border-l border-slate-100'}`}
                        >
                          {c.value === null ? <Empty kind="wait" /> : c.value}
                        </td>
                      ))
                    ) : (
                      <td colSpan={cols} className="px-3 py-2 text-left text-small"><Empty kind="wait" /></td>
                    )}
                  </tr>
                  {/* 축마다 갈리는 줄만 아래 칸별로 — 공통이 없으면 위 행이 이미 칸별이다 */}
                  {common.length > 0 && hasDiff && (
                    <tr className="align-top">
                      {diffs.map((c, i) => (
                        <td
                          key={i}
                          colSpan={c.span}
                          className={`whitespace-pre-line break-keep px-3 pb-2 text-left text-small text-slate-700 ${i === 0 ? '' : 'border-l border-slate-100'}`}
                        >
                          {c.value === null ? <span className="text-slate-300">—</span> : c.value}
                        </td>
                      ))}
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 flex flex-wrap gap-x-4 text-tiny text-slate-400">
        <span>칸 값은 고른 시기에 적용 중인 받는 단가 · 연한 값은 이전 시기 단가의 이월</span>
        {sideCount > 0 && <span>영업·시공 채널 케이스 {sideCount}건은 아래 목록에</span>}
      </p>
    </section>
  );
}

/* ── 케이스 목록 ──────────────────────────────────────────────────────── */
function CaseList({
  rules, settleById, referenced, onOpen,
}: {
  rules: PricingRule[];
  settleById: Map<string, SettlementRule>;
  referenced: Set<string>;
  onOpen: (f: FormOpen) => void;
}) {
  const [cpo, setCpo] = useState<CpoName | '전체'>('전체');
  // 운영사끼리 모으고 그 안에서 최신 시기가 위 — 이름순은 이름을 걷어내며 의미를 잃었다
  const shown = (cpo === '전체' ? rules : rules.filter((r) => r.cpo === cpo))
    .slice()
    .sort((a, b) => a.cpo.localeCompare(b.cpo, 'ko') || startKey(b).localeCompare(startKey(a)));

  /*
   * 기성 열 수는 보이는 케이스에서 뽑는다 — 규칙은 1~3단계고 운영사마다 다르다.
   * 3칸을 늘 펴 두면 2차까지인 운영사만 걸렀을 때 빈 열이 따라다니고, 그 빈 칸은
   * 「값이 없다」가 아니라 「그 차수가 없다」다(화면 규칙 10번). 케이스가 하나도
   * 없거나 전부 기성 미정이면 1칸은 남긴다 — 「기성 미정」이 설 자리다.
   */
  const stepCols = Math.max(
    1,
    ...shown.map((r) => settleById.get(r.defaultSettlementRuleId)?.steps.length ?? 0)
  );

  return (
    <section className={`${PANEL} p-5 sm:p-6`}>
      {/* 매트릭스와 같은 모양으로 — 두 구역의 필터가 다르게 생기면 같은 일을 두 번 배운다 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-h3 font-black text-slate-900">케이스</h2>
        <div className="w-40">
          <select
            aria-label="운영사"
            className={FIELD}
            value={cpo}
            onChange={(e) => setCpo(e.target.value as CpoName | '전체')}
          >
            {(['전체', ...CPO_NAMES] as const).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <Blank>{cpo === '전체' ? '케이스 0건' : `${cpo} 케이스 0건`}</Blank>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          {/*
            ★한 칸에 여러 값을 접어 넣지 않는다.★ 축 다섯 개가 꼬리표로 한 칸에 뭉쳐 있어서
            「7년 공동주택 케이스만 보자」고 눈으로 훑을 수가 없었다. 지급 단가와 기성 단계도
            같은 문제였다 — 영업·시공이 한 칸의 잔글씨였고, 기성은 차수가 세로로 쌓여
            케이스끼리 1차를 견주려면 줄을 세어야 했다. 값마다 열을 주면 한 열을 위아래로
            읽는 것이 곧 비교다.

            머리글이 두 줄이다 — 열이 열넷이라 한 줄이면 무엇이 축이고 무엇이 돈인지
            구분이 사라진다. 매트릭스도 같은 두 줄 머리다.

            정책 조건 열은 걷어냈다(한백 요청 2026-08-23). 같은 값이 매트릭스 아래
            정책 조건 행에 축별로 이미 있었다 — 한 화면에 두 번 두면 갈린다(화면 규칙 5번).
            케이스 하나의 전문은 「수정」·「개정」 폼에 있다.
          */}
          <table className="w-full min-w-[1760px] text-base">
            <thead className="border-b border-slate-200 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
              <tr>
                <th className="px-3 pt-2.5 text-left" rowSpan={2}>케이스</th>
                <th colSpan={5} className="border-l border-slate-200 px-3 pt-2 text-center">축</th>
                <th colSpan={5} className="border-l border-slate-200 px-3 pt-2 text-center">단가 (대당)</th>
                <th colSpan={stepCols} className="border-l border-slate-200 px-3 pt-2 text-center">기성 단계 (대당)</th>
                <th className="border-l border-slate-200 px-3 pt-2.5 text-right" rowSpan={2}>상태</th>
              </tr>
              <tr>
                <th className="border-l border-slate-200 px-3 pb-2 text-left font-semibold">교체유형</th>
                <th className="px-3 pb-2 text-left font-semibold">수전</th>
                <th className="px-3 pb-2 text-left font-semibold">연수</th>
                <th className="px-3 pb-2 text-left font-semibold">건축물</th>
                <th className="px-3 pb-2 text-left font-semibold">채널</th>
                {/* 돈의 흐름 순서 — 받는 단가에서 마진을 떼면 지급 단가, 그것을 영업·시공으로 나눈다 */}
                <th className="border-l border-slate-200 px-3 pb-2 text-right font-semibold">받는</th>
                <th className="px-3 pb-2 text-right font-semibold">마진</th>
                <th className="px-3 pb-2 text-right font-semibold">지급</th>
                <th className="px-3 pb-2 text-right font-semibold">영업</th>
                <th className="px-3 pb-2 text-right font-semibold">시공</th>
                {Array.from({ length: stepCols }, (_, i) => (
                  <th
                    key={i}
                    className={`px-3 pb-2 text-right font-semibold ${i === 0 ? 'border-l border-slate-200' : ''}`}
                  >
                    {i + 1}차
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <Row
                  key={r.id}
                  r={r}
                  settle={settleById.get(r.defaultSettlementRuleId) ?? null}
                  referenced={referenced.has(r.id)}
                  stepCols={stepCols}
                  onOpen={onOpen}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/*
 * 케이스 한 줄.
 *
 * 정책 조건(충전요금·프로모션·연장차감·지급자재·설치조건·기타지원) 칸은 걷어냈다
 * (한백 요청 2026-08-23). 같은 값이 매트릭스 아래 정책 조건 행에 축별로 이미 있고,
 * 여기서는 여섯 값을 폭 256px 한 칸에 접어 넣느라 긴 글은 두 줄로 자르고 있었다 —
 * 자른 글은 견줄 수도 없다. 케이스 하나의 전문은 「수정」·「개정」 폼이 정본이다.
 */
function Row({
  r, settle, referenced, stepCols, onOpen,
}: {
  r: PricingRule;
  settle: SettlementRule | null;
  referenced: boolean;
  /** 표 전체가 쓰는 기성 열 수 — 이 케이스의 차수가 그보다 적으면 남는 칸은 「—」다 */
  stepCols: number;
  onOpen: (f: FormOpen) => void;
}) {
  const canEdit = useContext(CanEdit);
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [startDraft, setStartDraft] = useState(r.startDate);
  // 기성 차수별 대당 금액 — 이 케이스의 받는 단가에 규칙을 적용한 값
  const stepAmount = settle ? stepUnits(settle.steps, receiveUnitOf(r)) : [];

  /*
   * 참조 없는 케이스는 「수정」으로 폼을 통째로 연다 — 이 빠른 칸은 참조된 케이스용이다.
   * 참조되면 금액·축이 소급이라 못 고치고, 적용 시작만 여기서 고친다
   * (지급액 계산에 안 쓰인다. 시드가 「2026년 하반기」처럼 대략만 아는 값을 넣는 일이 실제로 있다).
   */
  async function saveMeta() {
    const ok = await run({
      url: '/api/pricing',
      method: 'PATCH',
      body: { id: r.id, startDate: startDraft },
      fail: '고치지 못했습니다.',
    });
    if (ok) setEditing(false);
  }

  return (
    <tr className={r.active ? '' : 'bg-slate-50/60'}>
      <td className="px-3 py-2.5">
        {/* 이름을 따로 짓지 않는다 — 케이스의 정체는 운영사·시기·축이다. caseName 은 셀렉트용 파생 라벨로만 남는다 */}
        <p className={`break-keep font-bold ${r.active ? 'text-slate-800' : 'text-slate-400'}`}>
          {r.cpo}
          <span className={`ml-1.5 text-tiny font-semibold ${r.active ? 'text-slate-500' : 'text-slate-400'}`}>
            {r.startDate}
          </span>
        </p>
        {editing ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <input
              value={startDraft}
              onChange={(e) => setStartDraft(e.target.value)}
              placeholder="2026년 7월 21일"
              className={`${FIELD_CELL} max-w-[150px]`}
            />
            <Btn size="sm" busy={busy} busyLabel="저장 중…" onClick={() => void saveMeta()}>
              저장
            </Btn>
            <Btn
              size="sm"
              kind="quiet"
              disabled={busy}
              onClick={() => { setEditing(false); setStartDraft(r.startDate); }}
            >
              취소
            </Btn>
          </div>
        ) : (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-tiny text-slate-400">
            <code className="text-micro">{r.id}</code>
            {canEdit && referenced && (
              <Btn size="sm" kind="quiet" onClick={() => setEditing(true)}>적용 시작 수정</Btn>
            )}
          </p>
        )}
      </td>
      {/*
        축 다섯 — 값마다 한 칸이다. 꼬리표(Tag)를 벗기고 글자로 둔다: 열이 이미
        「무엇인가」를 말하고 있어서 꼬리표는 테를 한 겹 더 그리는 일뿐이고,
        누르는 것도 아니다(화면 규칙 11번 — 각지면 누르는 것).
      */}
      <td className="break-keep border-l border-slate-100 px-3 py-2.5 text-slate-700">{r.replType}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{r.powerType}</td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{r.termYears.join('·')}년</td>
      <td className="break-keep px-3 py-2.5 text-slate-700">
        {/* 매트릭스 머리글과 같은 이름표 — 두 자리가 다르게 부르면 같은 축인지 알 수 없다 */}
        {r.bldgTypes.length === 2 ? '전체' : bldgAxisLabel(r.cpo, r.bldgTypes[0])}
      </td>
      {/* 턴키가 대부분이라 연하게 — 눈에 걸려야 하는 것은 드문 영업·시공 채널이다 */}
      <td className={`whitespace-nowrap px-3 py-2.5 ${r.channel === '턴키' ? 'text-slate-400' : 'font-bold text-slate-700'}`}>
        {r.channel}
      </td>

      <td className="border-l border-slate-100 px-3 py-2.5 text-right font-black tabular-nums text-slate-900">
        {won(receiveUnitOf(r))}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{won(r.margin)}</td>
      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-800">{won(payoutUnitOf(r))}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{won(r.salesUnit)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{won(r.consUnit)}</td>

      {/*
        기성은 차수마다 한 칸이다 — 트리거와 대당 금액을 같이 적는다. 금액만 두면
        「40%인지 잔액인지」가 사라지고, 트리거만 두면 얼마인지가 사라진다.
        규칙이 없는 케이스는 차수 칸을 통째로 묶어 「기성 미정」 하나만 적는다 —
        빈 칸 세 개로 두면 「1차가 없다」로 읽힌다.
      */}
      {settle === null ? (
        <td colSpan={stepCols} className="border-l border-slate-100 px-3 py-2.5">
          {/* 미정과 해당없음을 가르지 않는다 — 규칙이 없으면 이 케이스의 현장은 기성이 계산되지 않는다 */}
          <Tag tone="warn">기성 미정</Tag>
        </td>
      ) : (
        Array.from({ length: stepCols }, (_, i) => {
          const step = settle.steps[i];
          return (
            <td
              key={i}
              className={`px-3 py-2.5 text-right ${i === 0 ? 'border-l border-slate-100' : ''}`}
            >
              {step ? (
                <>
                  <p className="font-bold tabular-nums text-slate-800">{won(stepAmount[i])}</p>
                  <p className="break-keep text-tiny text-slate-400">{step.trigger}</p>
                </>
              ) : (
                // 이 운영사에는 없는 차수다 — 값이 빠진 것이 아니다
                <Empty kind="na" />
              )}
            </td>
          );
        })
      )}
      <td className="border-l border-slate-100 px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          {r.active ? <Badge tone="ok">사용</Badge> : <Badge tone="hold">중지</Badge>}
          {/*
            * 참조 전에는 자리에서 고치고(수정), 참조 뒤에는 전 값을 실은 새 케이스로 연다(개정) —
            * 참조된 케이스의 금액을 고치면 그 현장의 지급액이 소급해서 바뀌기 때문이다.
            */}
          {canEdit &&
            (referenced ? (
              <Btn
                size="sm"
                kind="quiet"
                onClick={() => onOpen({ prefill: { ...prefillOf(r, settle), after: startKey(r) } })}
              >
                개정
              </Btn>
            ) : (
              <Btn
                size="sm"
                kind="quiet"
                onClick={() =>
                  onOpen({ prefill: { ...prefillOf(r, settle), startDate: r.startDate }, editId: r.id })
                }
              >
                수정
              </Btn>
            ))}
          {/* 중지는 되돌릴 수 있다 — 넣는 자리를 만들면 되돌리는 자리도 만든다 */}
          {canEdit && (
            <Btn
              size="sm"
              kind={r.active ? 'undo' : 'quiet'}
              busy={busy}
              onClick={() =>
                void run({
                  url: '/api/pricing',
                  method: 'PATCH',
                  body: { id: r.id, active: !r.active },
                  fail: '바꾸지 못했습니다.',
                })
              }
            >
              {r.active ? '중지' : '다시 사용'}
            </Btn>
          )}
        </div>
        {/* 실패 문구는 누른 단추 옆 — 첫 칸에 두면 좁은 창에서 스크롤 밖이다(규칙 9) */}
        <Err className="mt-1 block text-right">{error}</Err>
      </td>
    </tr>
  );
}

/* ── 케이스 폼 — 새 케이스·수정·개정이 같은 폼이다 ───────────────────────── */

/** 기성 단계 한 줄의 입력 상태 — 값 칸은 고정이면 원, 비율이면 % 다 */
interface StepDraft {
  trigger: Trigger;
  kind: '고정' | '비율' | '잔액';
  value: string;
}

function CaseForm({
  prefill, editId, settlementRules, onDone,
}: {
  prefill: Prefill;
  /** 있으면 이 케이스를 자리에서 고친다(PUT) — 참조 없는 케이스만. 없으면 새 케이스(POST)다 */
  editId?: string;
  /** 쌓여 있는 정산 규칙 — 기성 단계를 규칙에서 불러오는 셀렉트가 쓴다 */
  settlementRules: SettlementRule[];
  onDone: () => void;
}) {
  const { busy, error, run } = useAction();

  const money = (n?: number) => (n ? String(n) : '');
  const [cpo, setCpo] = useState<CpoName>(prefill.cpo ?? '플러그링크');
  const [replType, setReplType] = useState<ReplType>(prefill.replType ?? '환경부 신규');
  const [powerType, setPowerType] = useState<(typeof POWER_TYPES)[number]>(prefill.powerType ?? '한전불입');
  const [terms, setTerms] = useState<number[]>(prefill.terms ?? [10]);
  const [bldgs, setBldgs] = useState<BuildingType[]>(prefill.bldgs ?? ['공동주택']);
  const [channel, setChannel] = useState<Channel>(prefill.channel ?? '턴키');

  /*
   * 시기는 연도·반기·시작일(선택)로 구조화해 받는다 — 자유 텍스트로 두면 「2026-08-22」처럼
   * 정렬이 못 읽는 표기가 들어와 케이스가 매트릭스에서 사라진다. 시작일을 적으면 연도·반기가
   * 거기서 유도된다(같은 값을 두 자리에 두지 않는다). 저장 표기는 기존 그대로:
   * 시작일이 있으면 「2026년 8월 22일」, 없으면 「2026년 하반기」.
   */
  const seed = prefill.startDate
    ? startKey({ startDate: prefill.startDate, bizYear: prefill.bizYear ?? 0 }).split('-').map(Number)
    : null;
  const opened = new Date();
  const [year, setYear] = useState(prefill.bizYear ?? opened.getFullYear());
  const [half, setHalf] = useState<'상' | '하'>(
    seed ? (seed[1] >= 7 ? '하' : '상') : opened.getMonth() + 1 >= 7 ? '하' : '상'
  );
  const [startDay, setStartDay] = useState(
    seed && seed[1] > 0 && seed[2] > 0
      ? `${seed[0]}-${String(seed[1]).padStart(2, '0')}-${String(seed[2]).padStart(2, '0')}`
      : ''
  );
  function pickStartDay(v: string) {
    setStartDay(v);
    if (v) {
      const [y, m] = v.split('-').map(Number);
      setYear(y);
      setHalf(m >= 7 ? '하' : '상');
    }
  }

  const [receiveUnit, setReceiveUnit] = useState(
    money((prefill.salesUnit ?? 0) + (prefill.consUnit ?? 0) + (prefill.margin ?? 0))
  );
  const [margin, setMargin] = useState(money(prefill.margin));
  const [salesUnit, setSalesUnit] = useState(money(prefill.salesUnit));
  const [consUnit, setConsUnit] = useState(money(prefill.consUnit));
  const [steps, setSteps] = useState<StepDraft[]>(
    (prefill.steps ?? []).map((s) =>
      s.basis.kind === '고정' ? { trigger: s.trigger, kind: '고정', value: String(s.basis.unit) }
        : s.basis.kind === '비율' ? { trigger: s.trigger, kind: '비율', value: String(Math.round(s.basis.ratio * 100)) }
          : { trigger: s.trigger, kind: '잔액', value: '' }
    )
  );
  /*
   * 정책 조건 — 케이스가 「얼마인가」 말고 「어떤 조건인가」를 담는 칸들.
   * 프로모션만 구간 배열이다(6개월 149원 → 6개월 220원처럼 이어진다). 나머지는 한 칸이다.
   * 비어 있는 것은 지우지 않고 null 로 보낸다 — 「0원·없음」과 「아직 안 적음」은 다른 말이다.
   */
  const [supplyItems, setSupplyItems] = useState(prefill.supplyItems ?? '');
  const [promo, setPromo] = useState<{ months: string; rate: string }[]>(
    (prefill.promo ?? []).map((x) => ({ months: String(x.months), rate: String(x.rate) }))
  );
  const [promoExtend, setPromoExtend] = useState<{ months: string; rate: string; deduct: string }[]>(
    (prefill.promoExtend ?? []).map((x) => ({
      months: String(x.months), rate: String(x.rate), deduct: money(x.deduct),
    }))
  );
  const [chargeRate, setChargeRate] = useState(money(prefill.chargeRate ?? undefined));
  const [installTerms, setInstallTerms] = useState(prefill.installTerms ?? '');
  const [otherSupport, setOtherSupport] = useState(prefill.otherSupport ?? '');
  const [coexistTerms, setCoexistTerms] = useState(prefill.coexistTerms ?? '');
  const [miscTerms, setMiscTerms] = useState(prefill.miscTerms ?? '');
  const [note, setNote] = useState(prefill.note ?? '');
  /*
   * 요금·프로모션과 지원·조건은 운영사(와 계약연수)가 정하는 공통 적용사항이라 개정
   * (단가 갱신)에서 거의 안 바뀐다 — 펼쳐 두면 개정마다 「고쳐야 하는 것」처럼 보인다
   * (한백 지적 2026-08-23). 개정은 접어 두고 원 케이스 값을 그대로 싣는다.
   * 그 값들까지 바뀌는 개정(정책 전면 개정)만 사람이 펼쳐서 고친다.
   */
  const [showRates, setShowRates] = useState(!prefill.after);
  const [showTerms, setShowTerms] = useState(!prefill.after);

  /*
   * 목록의 수정·개정, 그리드 칸에서 열리면 폼이 화면 밖(맨 위)에 있다 — 눌렀는데 아무 일도
   * 안 생긴 것처럼 보인다. 열릴 때마다 폼으로 스크롤한다(프리필이 바뀌면 key 로 다시 마운트된다).
   */
  const boxRef = useRef<HTMLElement>(null);
  useEffect(() => {
    boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /* 사업구분은 고르게 두지 않는다 — 교체유형이 정한다(bizTypeOfRepl). 두 값을 따로 고르면 어긋난다 */
  const bizType = bizTypeOfRepl(replType);

  const startDate = startDay ? koDate(startDay) : `${year}년 ${half}반기`;

  /*
   * caseName 은 사람이 짓지 않는다 — 시기·축에서 유도되는 표시용 라벨이고, 현장 상세의
   * 단가 후보 셀렉트가 문자열이 필요해 쓴다. 화면에서 케이스의 정체는 운영사·시기·축 태그다.
   * 시기를 라벨에 박는 이유: 같은 축의 개정 케이스가 반기마다 생기는데, 시기가 없으면
   * 셀렉트에 똑같은 라벨이 나란히 떠서 금액만 다르다.
   */
  const bldgLabel = bldgs.length === 2 ? '전체' : (bldgs[0] ?? '');
  const caseName =
    `${cpo} (${startDate}) | ${bldgLabel} | ${terms.join('·')}년 ${replType} | ${powerType}${channel === '턴키' ? '' : ` | ${channel}`}`;

  const num = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^0-9]/g, '')) || 0));

  /*
   * 돈은 흐름 순서로 들어온다 — 받는 단가에서 마진을 떼면 지급 단가이고, 그것을
   * 영업비·시공비로 나눈다. 한쪽만 맡는 채널은 나눌 것이 없어 그쪽이 전액이다.
   * 저장 구조는 그대로 영업비·시공비·마진 세 값이다(받는 단가 = 셋의 합).
   */
  const receive = num(receiveUnit);
  const mg = num(margin);
  const payout = receive - mg;
  const sales = channel === '영업' ? Math.max(payout, 0) : channel === '시공' ? 0 : num(salesUnit);
  const cons = channel === '시공' ? Math.max(payout, 0) : channel === '영업' ? 0 : num(consUnit);
  const splitOk = channel !== '턴키' || sales + cons === payout;

  const stepRules: SettlementStepRule[] = steps.map((s) =>
    s.kind === '고정' ? { trigger: s.trigger, basis: { kind: '고정', unit: num(s.value) } }
      : s.kind === '비율' ? { trigger: s.trigger, basis: { kind: '비율', ratio: num(s.value) / 100 } }
        : { trigger: s.trigger, basis: { kind: '잔액' } }
  );
  /*
   * 프로모션 구간 — 화면은 글자로 받고 저장은 숫자다. 구간이 하나도 없으면 null(미지정)이고,
   * 넣었는데 비어 있으면 0 이 되어 검증(checkPricingRule)이 막는다 — 여기서 미리 이유를 적는다.
   */
  const promoSteps: PromoStep[] | null =
    promo.length === 0 ? null : promo.map((x) => ({ months: num(x.months), rate: num(x.rate) }));
  const promoBad = promoSteps?.some((x) => x.months <= 0)
    ? '프로모션 구간의 기간을 적어주세요'
    : null;

  /*
   * 기성은 운영사마다 정해진 규칙 몇 가지를 돌려쓴다 — 차수를 매번 수기로 짜는 것은
   * 과했다(한백 지적 2026-08-23). 규칙 셀렉트에서 고르면 단계가 통째로 채워지고,
   * 손으로 고친 단계가 어느 규칙과 같은 모양이면 셀렉트가 그 규칙을 가리킨다
   * (같은 모양 판정은 저장소와 같은 잣대 — settlementStepsKeyOf).
   */
  const liveRules = settlementRules.filter((r) => r.active);
  const stepsKey = settlementStepsKeyOf(stepRules);
  const matchedRuleId = liveRules.find((r) => settlementStepsKeyOf(r.steps) === stepsKey)?.id ?? '';
  function loadRule(id: string) {
    const rule = liveRules.find((r) => r.id === id);
    if (!rule) return;
    setSteps(rule.steps.map((x) =>
      x.basis.kind === '고정' ? { trigger: x.trigger, kind: '고정' as const, value: String(x.basis.unit) }
        : x.basis.kind === '비율' ? { trigger: x.trigger, kind: '비율' as const, value: String(Math.round(x.basis.ratio * 100)) }
          : { trigger: x.trigger, kind: '잔액' as const, value: '' }
    ));
  }

  const stepBad = checkSettlementSteps(stepRules, receive);
  const stepAmount = receive > 0 ? stepUnits(stepRules, receive) : [];

  const blocked =
    terms.length === 0 ? '계약연수 미선택'
      : bldgs.length === 0 ? '건축물유형 미선택'
        : receive === 0 ? '받는 단가 미입력'
          : mg > receive ? '마진이 받는 단가보다 큼'
            : !splitOk ? '영업·시공 합이 지급 단가와 다름'
              : promoBad ? promoBad
              : stepBad.length > 0 ? '기성 단계 확인 필요'
                : year < 2020 || year > 2100 ? '연도 확인 필요'
                  // 개정이 원 케이스보다 이르거나 같으면 매트릭스가 옛 것을 최신으로 집는다
                  : prefill.after && startKey({ startDate, bizYear: year }) <= prefill.after
                    ? '개정 시기가 기존 적용 시작보다 늦어야 함'
                    : null;

  async function save() {
    const ok = await run({
      url: '/api/pricing',
      method: editId ? 'PUT' : 'POST',
      body: {
        ...(editId ? { id: editId } : {}),
        caseName, cpo, bizType, powerType, termYears: terms, bldgTypes: bldgs, replType, channel,
        bizYear: year, startDate,
        salesUnit: sales, consUnit: cons, margin: mg,
        settlementSteps: stepRules,
        supervisionBearer: null, safetyFeeBearer: null,
        /*
         * 빈 칸은 null 로 보낸다 — 빈 문자열·0 으로 보내면 「없음」이 되어 아직 안 적은 것과
         * 구별이 안 된다(화면 규칙 10번). 프로모션은 구간이 하나도 없으면 null 이다.
         */
        supplyItems: supplyItems.trim() || null,
        promo: promoSteps,
        /* 프로모션 구간과 같은 규칙 — 한 줄도 안 넣었으면 「미지정」(null)이다 */
        promoExtend: promoExtend.length === 0
          ? null
          : promoExtend.map((x) => ({ months: num(x.months), rate: num(x.rate), deduct: num(x.deduct) })),
        chargeRate: chargeRate.trim() === '' ? null : num(chargeRate),
        installTerms: installTerms.trim() || null,
        otherSupport: otherSupport.trim() || null,
        coexistTerms: coexistTerms.trim() || null,
        miscTerms: miscTerms.trim() || null,
        note: note.trim() || null,
      },
      fail: editId ? '고치지 못했습니다.' : '넣지 못했습니다.',
    });
    if (ok) onDone();
  }

  function setStep(i: number, patch: Partial<StepDraft>) {
    setSteps((p) => p.map((s, x) => (x === i ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps((p) => {
      // 첫 차수는 준공마감·잔액 — 혼자서도 합이 맞는다. 다음부터는 그 앞에 선다(잔액은 늘 마지막).
      if (p.length === 0) return [{ trigger: '준공마감', kind: '잔액', value: '' }];
      const draft: StepDraft = { trigger: '환경부 승인', kind: '고정', value: '' };
      const last = p[p.length - 1];
      return last.kind === '잔액' ? [...p.slice(0, -1), draft, last] : [...p, draft];
    });
  }

  /*
   * 폼이 무엇을 하는 중인가 — 여는 자리가 넷이라 제목이 이것을 말해야 한다.
   * 수정 = 참조 없는 케이스를 자리에서 고침(PUT) · 개정 = 케이스를 눌러 열었고 새 적용
   * 시작으로 새 케이스를 만듦(after 가 실려 온다) · 새 = 빈 폼 또는 빈 칸에서 축만 받음.
   * 셋 다 「새 케이스」로 떠서 케이스를 눌렀는데 왜 새 케이스냐는 혼란이 실제로 있었다
   * (2026-08-23 한백 지적).
   */
  const mode: '수정' | '개정' | '새 케이스' = editId ? '수정' : prefill.after ? '개정' : '새 케이스';

  return (
    <section ref={boxRef} className={`${PANEL} scroll-mt-4 p-5 sm:p-6`}>
      <h2 className="mb-4 flex flex-wrap items-baseline gap-2 text-h3 font-black text-slate-900">
        {mode === '수정' ? '케이스 수정' : mode === '개정' ? '케이스 개정' : '새 케이스'}
        {editId && <code className="text-micro font-normal text-slate-400">{editId}</code>}
        {mode === '개정' && (
          <span className="text-tiny font-semibold text-slate-500">
            새 적용 시작으로 저장 — 옛 케이스는 그 시기까지의 단가로 그대로 남는다
          </span>
        )}
      </h2>

      {/* ① 어느 계약의 단가인가 — 접수된 라인이 이 여섯 축으로 케이스를 찾는다 */}
      <FormSection first title="계약 축" hint="접수된 라인이 이 축으로 케이스를 찾는다">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="운영사">
            <select value={cpo} onChange={(e) => setCpo(e.target.value as CpoName)} className={FIELD}>
              {CPO_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="교체유형" hint={`사업구분 ${bizType}`}>
            <select
              value={replType}
              onChange={(e) => setReplType(e.target.value as ReplType)}
              className={FIELD}
            >
              {REPL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="수전방식">
            <select
              value={powerType}
              onChange={(e) => setPowerType(e.target.value as (typeof POWER_TYPES)[number])}
              className={FIELD}
            >
              {POWER_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="계약연수" hint="겸용 케이스는 여럿 고른다">
            <Chips
              options={TERMS.map((t) => [t, `${t}년`])}
              picked={terms}
              onToggle={(v) =>
                // sort() 기본은 문자열 비교라 [7,10] 이 [10,7] 이 된다 — 숫자로 비교한다
                setTerms((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v].sort((a, b) => a - b)))
              }
            />
          </Field>
          <Field label="건축물유형">
            <Chips
              options={BUILDING_TYPES.map((b) => [b, b])}
              picked={bldgs}
              onToggle={(v) => setBldgs((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))}
            />
          </Field>
          <Field label="채널" hint="한백이 맡는 범위 — 한쪽만 맡으면 그쪽 단가만 산다">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              className={FIELD}
            >
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </FormSection>

      {/* ② 언제부터의 단가인가 — 매트릭스의 시기 탭이 이 값으로 갈린다 */}
      <FormSection title="적용 시작" hint="이 날부터 이 단가다 — 날짜를 모르면 반기까지만">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="시작일" hint="아는 날짜가 있으면 — 개정은 이 날짜부터다">
            <input
              type="date"
              value={startDay}
              onChange={(e) => pickStartDay(e.target.value)}
              className={FIELD}
            />
          </Field>
          <Field label="연도" hint={startDay ? '시작일이 정한다' : undefined}>
            <input
              value={year}
              disabled={Boolean(startDay)}
              onChange={(e) => setYear(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
              className={`${FIELD} tabular-nums disabled:bg-slate-50 disabled:text-slate-400`}
            />
          </Field>
          <Field label="반기" hint={startDay ? '시작일이 정한다' : undefined}>
            <div className={`flex flex-wrap gap-1.5 ${startDay ? 'pointer-events-none opacity-50' : ''}`}>
              {(['상', '하'] as const).map((h) => (
                <Choice key={h} on={half === h} onClick={() => setHalf(h)}>{h}반기</Choice>
              ))}
            </div>
          </Field>
        </div>
      </FormSection>

      {/* ③ 돈 — 흐름 순서: 받는 단가 → 마진 → 지급 단가 → 영업·시공 나눔. 전부 대당이다 */}
      <FormSection title="돈" hint="대당 — 받는 단가에서 마진을 떼면 지급 단가, 그것을 영업·시공으로 나눈다">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="받는 단가" hint="운영사가 대당 주는 총액">
            <Money value={receiveUnit} onChange={setReceiveUnit} />
          </Field>
          <Field label="마진" hint="한백 몫">
            <Money value={margin} onChange={setMargin} />
          </Field>
          <Field label="지급 단가" hint="받는 단가 − 마진">
            <p className={`py-2 font-black tabular-nums ${mg > receive ? 'text-red-600' : 'text-slate-900'}`}>
              {mg > receive ? `−${won(mg - receive)}` : won(payout)}원
            </p>
          </Field>
          {channel === '턴키' ? (
            <>
              <Field label="영업비">
                <Money value={salesUnit} onChange={setSalesUnit} />
              </Field>
              <Field label="시공비">
                <Money value={consUnit} onChange={setConsUnit} />
              </Field>
            </>
          ) : (
            <Field label={channel === '영업' ? '영업비' : '시공비'} hint="지급 단가 전액">
              <p className="py-2 font-bold tabular-nums text-slate-800">{won(Math.max(payout, 0))}원</p>
            </Field>
          )}
        </div>
        {channel === '턴키' && receive > 0 && !splitOk && (
          <p className="mt-2 text-tiny font-semibold text-red-600">
            영업 {won(sales)} + 시공 {won(cons)} = {won(sales + cons)} — 지급 단가
            {' '}{won(Math.max(payout, 0))}와 {won(Math.abs(payout - sales - cons))} 차이
          </p>
        )}
      </FormSection>

      {/* ④ 기성 단계 — 받는 단가를 운영사에게 받는 차수. 현장 기성 탭·운영사 기성관리에 이대로 선다 */}
      <FormSection title="기성 단계" hint="받는 단가를 어느 시점에 얼마씩 받는가 — 합이 받는 단가와 같아야 한다">
        <div className="mb-3 max-w-md">
          <Field label="규칙에서 불러오기" hint="운영사마다 돌려쓰는 규칙 — 고르면 아래 차수가 채워진다">
            <select
              value={matchedRuleId}
              onChange={(e) => loadRule(e.target.value)}
              className={FIELD}
            >
              <option value="">직접 정의…</option>
              {liveRules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        </div>
        {steps.length === 0 ? (
          <Tag tone="warn">기성 미정 — 이 케이스로 지정된 현장은 기성이 계산되지 않음</Tag>
        ) : (
          <div className="flex max-w-2xl flex-col gap-2">
            {steps.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-8 shrink-0 text-tiny font-bold text-slate-400">{i + 1}차</span>
                <select
                  value={s.trigger}
                  onChange={(e) => setStep(i, { trigger: e.target.value as Trigger })}
                  className={FIELD_CELL}
                >
                  {RECEIVE_TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  value={s.kind}
                  onChange={(e) => setStep(i, { kind: e.target.value as StepDraft['kind'] })}
                  className={FIELD_CELL}
                >
                  <option value="고정">고정액</option>
                  <option value="비율">비율</option>
                  <option value="잔액">잔액</option>
                </select>
                {s.kind !== '잔액' && (
                  <span className="flex items-baseline gap-1">
                    <input
                      value={s.value}
                      onChange={(e) => setStep(i, { value: e.target.value })}
                      inputMode="numeric"
                      placeholder="0"
                      className={`${FIELD_CELL} w-28 text-right tabular-nums`}
                    />
                    <span className="shrink-0 text-micro text-slate-400">{s.kind === '고정' ? '원' : '%'}</span>
                  </span>
                )}
                <span className="ml-auto text-tiny tabular-nums text-slate-500">
                  {receive > 0 ? `대당 ${won(stepAmount[i] ?? 0)}원` : '—'}
                </span>
                <Btn size="sm" kind="quiet" onClick={() => setSteps((p) => p.filter((_, x) => x !== i))}>
                  빼기
                </Btn>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {steps.length < 3 && <Btn size="sm" kind="side" onClick={addStep}>차수 추가</Btn>}
          {steps.length > 0 && receive > 0 && stepBad.length > 0 && (
            <span className="text-tiny font-semibold text-red-600">{stepBad[0]}</span>
          )}
        </div>
      </FormSection>

      {/* 접힌 구역의 단추가 상태를 말한다 — 값은 사라지는 게 아니라 원 케이스 그대로 실린다 */}
      {(!showRates || !showTerms) && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {!showRates && (
            <Btn size="sm" kind="quiet" onClick={() => setShowRates(true)}>
              요금·프로모션 고치기 — 지금은 원 케이스 값 그대로
            </Btn>
          )}
          {!showTerms && (
            <Btn size="sm" kind="quiet" onClick={() => setShowTerms(true)}>
              지원·조건 고치기 — 지금은 원 케이스 값 그대로
            </Btn>
          )}
        </div>
      )}

      {/* ⑤ 요금 — 정상 요금이 먼저, 그 요금을 깎는 프로모션과 연장이 그 아래로 */}
      {showRates && (
      <FormSection title="요금·프로모션" hint="현장에 안내되는 충전요금 조건 — 비워 두면 「미지정」">
        <div className="flex flex-col gap-4">
          <div className="w-44">
            <Field label="충전요금" hint="원/kWh · 프로모션이 끝난 뒤의 정상 요금">
              <input
                value={chargeRate}
                onChange={(e) => setChargeRate(e.target.value)}
                inputMode="numeric"
                placeholder="292"
                className={`${FIELD} text-right tabular-nums`}
              />
            </Field>
          </div>

          {/*
            프로모션은 구간이 이어진다 — 「6개월 149원 → 6개월 220원」. 한 쌍만 두면
            뒤 구간이 비고 문장으로 새어나간다. 기성 단계와 같은 모양으로 늘린다.
          */}
          <div className="flex flex-col gap-1.5">
            <span className="flex items-baseline gap-2">
              <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">프로모션</span>
              <span className="text-micro text-slate-400">할인 구간이 순서대로 이어진다 · 없으면 「미지정」</span>
            </span>
            {promo.length > 0 && (
              <div className="flex flex-col gap-2">
                {promo.map((x, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <span className="w-8 shrink-0 text-tiny font-bold text-slate-400">{i + 1}구간</span>
                    <input
                      value={x.months}
                      onChange={(e) => setPromo((p) => p.map((v, k) => (k === i ? { ...v, months: e.target.value } : v)))}
                      inputMode="numeric"
                      placeholder="6"
                      className={`${FIELD_CELL} w-20 text-right tabular-nums`}
                    />
                    <span className="shrink-0 text-micro text-slate-400">개월</span>
                    <input
                      value={x.rate}
                      onChange={(e) => setPromo((p) => p.map((v, k) => (k === i ? { ...v, rate: e.target.value } : v)))}
                      inputMode="numeric"
                      placeholder="149"
                      className={`${FIELD_CELL} w-24 text-right tabular-nums`}
                    />
                    <span className="shrink-0 text-micro text-slate-400">원/kWh</span>
                    <Btn
                      size="sm"
                      kind="quiet"
                      className="ml-auto"
                      onClick={() => setPromo((p) => p.filter((_, k) => k !== i))}
                    >
                      빼기
                    </Btn>
                  </div>
                ))}
              </div>
            )}
            {promo.length < 4 && (
              <div className="mt-1">
                <Btn size="sm" kind="side" onClick={() => setPromo((p) => [...p, { months: '', rate: '' }])}>
                  구간 추가
                </Btn>
              </div>
            )}
          </div>

          {/*
            프로모션 연장 — 프로모션 구간과 같은 모양의 반복 행이다. 늘리는 요금마다
            차감액이 갈려서(플러그링크: 6개월 149원 20만 · 6개월 249원 10만) 숫자 한 칸으로는
            적을 자리가 없다 — 프로모션 구간을 배열로 둔 것과 같은 이유다.
          */}
          <div className="flex flex-col gap-1.5">
            <span className="flex items-baseline gap-2">
              <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">프로모션 연장</span>
              <span className="text-micro text-slate-400">고를 수 있는 연장을 다 적는다 · 차감은 영업비에서</span>
            </span>
            {promoExtend.length > 0 && (
              <div className="flex flex-col gap-2">
                {promoExtend.map((x, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      value={x.months}
                      onChange={(e) => setPromoExtend((p) => p.map((v, k) => (k === i ? { ...v, months: e.target.value } : v)))}
                      inputMode="numeric"
                      placeholder="6"
                      className={`${FIELD_CELL} w-20 text-right tabular-nums`}
                    />
                    <span className="shrink-0 text-micro text-slate-400">개월</span>
                    <input
                      value={x.rate}
                      onChange={(e) => setPromoExtend((p) => p.map((v, k) => (k === i ? { ...v, rate: e.target.value } : v)))}
                      inputMode="numeric"
                      placeholder="149"
                      className={`${FIELD_CELL} w-24 text-right tabular-nums`}
                    />
                    <span className="shrink-0 text-micro text-slate-400">원/kWh 연장 시</span>
                    <input
                      value={x.deduct}
                      onChange={(e) => setPromoExtend((p) => p.map((v, k) => (k === i ? { ...v, deduct: e.target.value } : v)))}
                      inputMode="numeric"
                      placeholder="200,000"
                      className={`${FIELD_CELL} w-28 text-right tabular-nums`}
                    />
                    <span className="shrink-0 text-micro text-slate-400">원 차감</span>
                    <Btn
                      size="sm"
                      kind="quiet"
                      className="ml-auto"
                      onClick={() => setPromoExtend((p) => p.filter((_, k) => k !== i))}
                    >
                      빼기
                    </Btn>
                  </div>
                ))}
              </div>
            )}
            {promoExtend.length < 4 && (
              <div className="mt-1">
                <Btn
                  size="sm"
                  kind="side"
                  onClick={() => setPromoExtend((p) => [...p, { months: '', rate: '', deduct: '' }])}
                >
                  연장 추가
                </Btn>
              </div>
            )}
          </div>
        </div>
      </FormSection>
      )}

      {/* ⑥ 지원·조건 — 매트릭스의 지급자재·설치조건·병행·기타지원·기타 행이 이 값 그대로다 */}
      {showTerms && (
      <FormSection title="지원·조건" hint="매트릭스의 조건 행에 이 값이 그대로 선다 — 비워 두면 「미지정」">
        <div className="flex flex-col gap-4">
          <Field label="지급자재" hint="운영사가 대주는 품목 · 미지급품목도 같이">
            <input
              value={supplyItems}
              onChange={(e) => setSupplyItems(e.target.value)}
              placeholder="충전기 / 열화상카메라(POE허브 포함) / 스탠드폴 / 가림막"
              className={FIELD}
            />
          </Field>

          <Field label="설치조건" hint="할 수 있는가를 정하는 것 — 주차면 비율 · 내구연한 · 기수 산정">
            <textarea
              value={installTerms}
              onChange={(e) => setInstallTerms(e.target.value)}
              rows={2}
              className={FIELD}
            />
          </Field>

          <Field label="병행" hint="다른 운영사와 같은 현장에 함께 설 수 있는가">
            <input
              value={coexistTerms}
              onChange={(e) => setCoexistTerms(e.target.value)}
              className={FIELD}
            />
          </Field>

          <Field label="기타지원" hint="운영사가 대주는 것 — 한전불입금 · 안전점검 수수료 등">
            <textarea
              value={otherSupport}
              onChange={(e) => setOtherSupport(e.target.value)}
              rows={2}
              className={FIELD}
            />
          </Field>

          <Field label="기타" hint="위 어디에도 안 드는 조건 — 항목마다 「· 」로 줄을 가른다">
            <textarea
              value={miscTerms}
              onChange={(e) => setMiscTerms(e.target.value)}
              rows={2}
              className={FIELD}
            />
          </Field>

          <Field label="부기" hint="매트릭스 단가 칸 밑에 붙는 한 줄 — 그 금액과 같이 봐야 하는 조건">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="한전불입금 지원은 10기 이내"
              className={`${FIELD} max-w-xl`}
            />
          </Field>
        </div>
      </FormSection>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* 막는 것을 단추 이름에 적는다 — 흐린 단추만으로는 왜 안 되는지 알 수 없다 */}
          <Btn
            disabled={Boolean(blocked)}
            busy={busy}
            busyLabel={mode === '수정' ? '고치는 중…' : '넣는 중…'}
            onClick={() => void save()}
          >
            {blocked
              ? `${blocked} — ${mode === '수정' ? '고칠' : '넣을'} 수 없음`
              : mode === '수정' ? '케이스 고치기' : mode === '개정' ? '개정으로 넣기' : '케이스 넣기'}
          </Btn>
          <Btn kind="quiet" disabled={busy} onClick={onDone}>취소</Btn>
          <Err>{error}</Err>
        </div>
      </div>
    </section>
  );
}

/** 날짜칸의 ISO 값을 저장 표기로 — 「2026-08-22」 → 「2026년 8월 22일」 */
function koDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

/** 폼의 구획 — 계약 축 → 적용 시작 → 돈 → 기성 → 요금 → 지원·조건 순서가 읽히게 약한 선 한 겹으로 가른다 */
function FormSection({
  title, hint, first, children,
}: { title: string; hint?: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div className={first ? undefined : 'mt-5 border-t border-slate-100 pt-4'}>
      <p className="mb-3 flex items-baseline gap-2">
        <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">{title}</span>
        {hint && <span className="text-micro text-slate-400">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">{label}</span>
        {hint && <span className="text-micro text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** 여럿 고르는 칸 — 고른 상태의 모양은 Choice 부품이 정한다 */
function Chips<T extends string | number>({
  options, picked, onToggle,
}: {
  options: Array<[T, string]>;
  picked: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <Choice key={String(v)} on={picked.includes(v)} onClick={() => onToggle(v)}>
          {label}
        </Choice>
      ))}
    </div>
  );
}

function Money({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = Number(value.replace(/[^0-9]/g, '')) || 0;
  return (
    <span className="flex items-baseline gap-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="0"
        className={`${FIELD} tabular-nums`}
      />
      <span className="shrink-0 text-micro text-slate-400">{n > 0 ? `${won(n)}원` : '원'}</span>
    </span>
  );
}

'use client';

import {
  useEffect, useRef, useState, type ReactNode,
} from 'react';
import { BUILDING_TYPES, bizTypeOfRepl, CHANNELS, CPO_NAMES, powerTypesOfRepl, replTypesOf, type BuildingType, type Channel, type CpoName, type ReplType, type BizType, type PromoStep, type SettlementRule, type SettlementStepRule } from '@/types/project';
import { replLabel } from '@/types/project';
import { won } from '@/lib/format';
import { useAction } from '@/lib/use-action';

import {
  startKey,
} from '@/lib/pricing-match';
import { checkSettlementSteps, stepUnits } from '@/lib/settlement';
import { Btn, Choice, Err, FIELD, PANEL, Tag } from '@/components/ui';
import {
  POWER_TYPES, TERMS, type Prefill,
} from './shared';
import { Chips, Field, FormSection, Money, koDate } from './form-parts';
import { PromoSection, StepsSection, TermsSection, type StepDraft } from './form-sections';

/* ── 케이스 폼 — 새 케이스·수정·개정이 같은 폼이다 ───────────────────────── */

export function CaseForm({
  prefill, editId, stepShapeOf, onDone,
}: {
  prefill: Prefill;
  /** 있으면 이 케이스를 자리에서 고친다(PUT) — 참조 없는 케이스만. 없으면 새 케이스(POST)다 */
  editId?: string;
  /** 운영사(+사업구분)의 기성 모양 — 케이스별 설정이 아니라 여기서 온다 */
  stepShapeOf: (cpo: CpoName, bizType: BizType) => SettlementRule | null;
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
  /*
   * ★개정 모드는 걷어냈다★ (한백 지시 2026-09-04 「개정이 아니라 기존에 있던 걸 수정하는
   * 게 맞는 거야. 개정이란 없어 — 내가 새 표를 주지 않는 이상」). 새 정책표가 오면 새
   * 케이스를 세우고(파이프라인·새 케이스), 그 밖의 손질은 전부 기존 케이스의 ★수정★이다.
   * 「다음 반기」 기본값이 2027 케이스를 만들던 사고(9/3)도 이 모드의 것이었다.
   */
  const [year, setYear] = useState(prefill.bizYear ?? opened.getFullYear());
  const [half, setHalf] = useState<'상' | '하'>(
    seed ? (seed[1] >= 7 ? '하' : '상') : opened.getMonth() + 1 >= 7 ? '하' : '상'
  );
  const [startDay, setStartDay] = useState(
    seed && seed[1] > 0 && seed[2] > 0
      ? `${seed[0]}-${String(seed[1]).padStart(2, '0')}-${String(seed[2]).padStart(2, '0')}`
      : ''
  );
  /*
   * ★적용 시작을 적는 방법은 둘이고, 둘은 서로를 배제한다★ (한백 2026-08-29 「MECE 하게」).
   * 그전에는 시작일·연도·반기 세 칸이 같이 서 있고 시작일을 적으면 나머지 둘이 흐려졌다 —
   * 무엇을 적어야 하는지 화면이 말하지 않았다. 아는 것에 따라 한쪽을 고른다:
   *   날짜로  계약서에 적힌 날을 안다 → 「2026년 7월 21일」로 저장
   *   반기로  반기까지만 안다        → 「2026년 하반기」로 저장
   * 고른 쪽 칸만 선다. 연도·반기는 날짜에서 유도되므로 날짜 모드에서는 아예 없다.
   */
  const [dayMode, setDayMode] = useState(Boolean(startDay));

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
  const [extendCap, setExtendCap] = useState(prefill.promoExtend?.find((x) => x.cap)?.cap ?? '');
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
  /*
   * 폼이 무엇을 하는 중인가 — 여는 자리가 넷이라 제목이 이것을 말해야 한다.
   * 수정 = 참조 없는 케이스를 자리에서 고침(PUT) · 개정 = 케이스를 눌러 열었고 새 적용
   * 시작으로 새 케이스를 만듦(after 가 실려 온다) · 새 = 빈 폼 또는 빈 칸에서 축만 받음.
   * 셋 다 「새 케이스」로 떠서 케이스를 눌렀는데 왜 새 케이스냐는 혼란이 실제로 있었다
   * (2026-08-23 한백 지적).
   */
  const mode: '수정' | '새 케이스' = editId ? '수정' : '새 케이스';
  const [showRates, setShowRates] = useState(true);
  const [showTerms, setShowTerms] = useState(true);
  /*
   * ★개정은 축이 바뀌는 일이 아니다★ (2026-08-29) — 같은 축의 다음 시기 단가다. 그런데 축 여섯
   * 칸이 폼 맨 위를 차지해서, 개정에서 실제로 적는 것(시작일·금액)은 한 화면 아래에 있었다.
   * 개정은 축을 접어 머리의 꼬리표로만 보이고, 축까지 바꿔야 하면 펼친다.
   */
  const [showAxis, setShowAxis] = useState(true);
  /*
   * ★기성 모양은 케이스별 설정이 아니다★ (한백 확인 2026-08-23) — 한 운영사의 기성은
   * 트리거 모양이 동일하고, 차수 금액만 케이스마다 다르다. 그래서 모양(트리거·방식·
   * 차수 수)은 잠가 두고 고정액 칸만 연다. 운영사·교체유형을 바꾸면 그 운영사의 모양을
   * 다시 얹는다. 모양 자체가 새로운 경우(새 운영사·정책 구조 변경)만 「단계 직접 정의」로 푼다.
   */
  const [stepsLocked, setStepsLocked] = useState(true);

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

  /*
   * 운영사·사업구분이 바뀌면 그쪽의 기성 모양을 얹는다. 프리필에 차수가 실려 온 폼
   * (수정·개정)만 첫 렌더를 건너뛴다 — 원 케이스의 차수 금액을 덮으면 안 된다.
   * ★차수 없이 축만 온 폼(매트릭스 빈 칸·막힌 라인)은 건너뛰면 안 된다★ — 운영사가
   * 프리필에 있어서 「바뀐 게 없다」로 걸리고, 그 운영사에 모양이 있는데도 기성이
   * 빈 채로 열렸다(2026-08-23 실사고: 빈 칸에서 연 폼만 옛 화면처럼 보였다).
   */
  const shapeSeen = useRef(
    prefill.steps?.length
      ? `${prefill.cpo ?? ''}|${prefill.replType ? bizTypeOfRepl(prefill.replType) : ''}`
      : ''
  );
  useEffect(() => {
    const now = `${cpo}|${bizType}`;
    if (shapeSeen.current === now) return;
    shapeSeen.current = now;
    if (!stepsLocked) return;
    const shape = stepShapeOf(cpo, bizType);
    setSteps(!shape ? [] : shape.steps.map((x) =>
      x.basis.kind === '고정' ? { trigger: x.trigger, kind: '고정' as const, value: '' }
        : x.basis.kind === '비율' ? { trigger: x.trigger, kind: '비율' as const, value: String(Math.round(x.basis.ratio * 100)) }
          : { trigger: x.trigger, kind: '잔액' as const, value: '' }
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpo, bizType, stepsLocked]);

  const startDate = dayMode && startDay ? koDate(startDay) : `${year}년 ${half}반기`;

  /*
   * caseName 은 사람이 짓지 않는다 — 시기·축에서 유도되는 표시용 라벨이고, 현장 상세의
   * 단가 후보 셀렉트가 문자열이 필요해 쓴다. 화면에서 케이스의 정체는 운영사·시기·축 태그다.
   * 시기를 라벨에 박는 이유: 같은 축의 개정 케이스가 반기마다 생기는데, 시기가 없으면
   * 셀렉트에 똑같은 라벨이 나란히 떠서 금액만 다르다.
   */
  const bldgLabel = bldgs.length === 2 ? '전체' : (bldgs[0] ?? '');
  const caseName =
    `${cpo} (${startDate}) | ${bldgLabel} | ${terms.join('·')}년 ${replLabel(cpo, replType)} | ${powerType}${channel === '턴키' ? '' : ` | ${channel}`}`;

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

  const stepBad = checkSettlementSteps(stepRules, receive);
  const stepAmount = receive > 0 ? stepUnits(stepRules, receive) : [];

  const blocked =
    terms.length === 0 ? '계약연수 미선택'
      : bldgs.length === 0 ? '건축물유형 미선택'
        : receive === 0 ? '받는 단가 미입력'
          : dayMode && !startDay ? '적용 시작일 미입력'
          : mg > receive ? '마진이 받는 단가보다 큼'
            : !splitOk ? '영업·시공 합이 지급 단가와 다름'
              : promoBad ? promoBad
              : stepBad.length > 0 ? '기성 단계 확인 필요'
                : year < 2020 || year > 2100 ? '연도 확인 필요'
                  // 개정이 원 케이스보다 이르거나 같으면 매트릭스가 옛 것을 최신으로 집는다
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
          : promoExtend.map((x) => ({
            months: num(x.months), rate: num(x.rate), deduct: num(x.deduct),
            // 상한은 케이스의 값 — 옵션마다 같은 글자를 싣는다(PromoExtendOption.cap 주석)
            ...(extendCap.trim() ? { cap: extendCap.trim() } : {}),
          })),
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

  /* 접힌 구획이 보이는 「지금 값」 — 값이 없으면 미지정이라고 적는다(빈 값도 자리를 지킨다) */
  const ratesSummary = [
    chargeRate.trim() ? `충전요금 ${won(num(chargeRate))}원` : '충전요금 미지정',
    promo.length > 0
      ? `프로모션 ${promo.map((x) => `${x.months || '?'}개월 ${x.rate || '?'}원`).join(' + ')}`
      : '프로모션 미지정',
    promoExtend.length > 0 ? `연장 ${promoExtend.length}가지${extendCap ? ` · ${extendCap}` : ''}` : '연장 미지정',
  ].join(' · ');
  const filledTerms = ([
    ['설치조건', installTerms], ['지급자재', supplyItems], ['병행주차', coexistTerms],
    ['기타지원', otherSupport], ['기타', miscTerms], ['부기', note],
  ] as const).filter(([, v]) => v.trim()).map(([k]) => k);
  const termsSummary = filledTerms.length === 0 ? '전부 미지정' : `적힌 것 — ${filledTerms.join(' · ')}`;

  const axisTags = (
    <>
      <Tag>{cpo}</Tag>
      <Tag>{bldgLabel || '건축물 미선택'}</Tag>
      <Tag>{terms.length ? `${terms.join('·')}년` : '연수 미선택'} {replLabel(cpo, replType)}</Tag>
      <Tag>{powerType}</Tag>
      {channel !== '턴키' && <Tag tone="stage">{channel}</Tag>}
    </>
  );

  /* 개정의 기존 값 — 표의 「기존」 열. 축만 온 폼(새 케이스)에는 없다 */
  const prevReceive = prefill.salesUnit === undefined
    ? undefined
    : (prefill.salesUnit ?? 0) + (prefill.consUnit ?? 0) + (prefill.margin ?? 0);
  const prevPayout = prefill.salesUnit === undefined
    ? undefined
    : (prefill.salesUnit ?? 0) + (prefill.consUnit ?? 0);

  return (
    <section ref={boxRef} className={`${PANEL} scroll-mt-4 p-5 sm:p-6`}>
      {/*
        머리 — 무엇을 하는 폼인지(제목), 어느 축인지(꼬리표), 개정이면 어디서 어디로(시기).
        그전에는 제목 옆에 케이스 id 와 「새 적용 시작으로 저장 — 옛 케이스는 …」 문장이
        붙어 있었다. id 는 사람에게 뜻이 없고(title 로 남긴다), 문장은 동작이 말한다(화면 규칙 2).
      */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h3 font-black text-slate-900" title={editId}>
            {mode === '수정' ? '케이스 수정' : '새 케이스'}
          </h2>
          {/*
            머리는 ★어느 케이스인가★만 말한다 — 축과 기존 적용 시작. 새 시작은 아래
            적용 시작 구역이 말한다(같은 값을 한 화면에 두 번 두지 않는다).
          */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {axisTags}
          </div>
        </div>
        <Btn kind="quiet" size="sm" disabled={busy} onClick={onDone}>← 단가표로</Btn>
      </div>

      {/* ① 어느 계약의 단가인가 — 접수된 라인이 이 여섯 축으로 케이스를 찾는다. 개정은 접혀서 머리의 꼬리표가 대신 말한다 */}
      <FormSection
        first
        title="계약 축"
        collapsed={!showAxis}
        onToggle={undefined}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="운영사">
            <select
              value={cpo}
              onChange={(e) => {
                const next = e.target.value as CpoName;
                setCpo(next);
                // 운영사를 바꾸면 그쪽에 없는 축이 남을 수 있다 — 에버온의 신규위치가 플러그링크로 따라온다
                if (!replTypesOf(next).includes(replType)) setReplType('자체투자 (제자리교체)');
              }}
              className={FIELD}
            >
              {CPO_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="교체유형" hint={`사업구분 ${bizType}`}>
            <select
              value={replType}
              onChange={(e) => {
                const next = e.target.value as ReplType;
                setReplType(next);
                // 연동으로 바꾸면 한전불입이 설 자리가 없다 — 값이 남으면 검증에서야 걸린다
                if (!powerTypesOfRepl(next).includes(powerType)) setPowerType(powerTypesOfRepl(next)[0]);
              }}
              className={FIELD}
            >
              {/* 안 가르는 운영사는 자체투자가 하나뿐이다 — 이름도 괄호 없이 적는다 */}
              {replTypesOf(cpo).map((t) => <option key={t} value={t}>{replLabel(cpo, t)}</option>)}
            </select>
          </Field>
          <Field label="수전방식">
            <select
              value={powerType}
              onChange={(e) => setPowerType(e.target.value as (typeof POWER_TYPES)[number])}
              className={FIELD}
            >
              {powerTypesOfRepl(replType).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="계약연수">
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
          <Field label="채널">
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
      <FormSection title="적용 시작">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          {/* 아는 것에 따라 한쪽 — 고른 쪽 칸만 선다 */}
          <Field label="적는 방법">
            <div className="flex flex-wrap gap-1.5">
              <Choice on={dayMode} onClick={() => setDayMode(true)}>날짜로</Choice>
              <Choice on={!dayMode} onClick={() => setDayMode(false)}>반기로</Choice>
            </div>
          </Field>
          {dayMode ? (
            <div className="w-44">
              <Field label="시작일" hint="계약서 날짜 기준">
                <input
                  type="date"
                  value={startDay}
                  onChange={(e) => setStartDay(e.target.value)}
                  className={FIELD}
                />
              </Field>
            </div>
          ) : (
            <>
              <div className="w-24">
                <Field label="연도">
                  <input
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                    className={`${FIELD} tabular-nums`}
                  />
                </Field>
              </div>
              <Field label="반기">
                <div className="flex flex-wrap gap-1.5">
                  {(['상', '하'] as const).map((h) => (
                    <Choice key={h} on={half === h} onClick={() => setHalf(h)}>{h}반기</Choice>
                  ))}
                </div>
              </Field>
            </>
          )}
          {/* 저장될 표기 — 매트릭스·현장 셀렉트에 이 글자가 선다 */}
          <span className="pb-2 text-small font-bold text-slate-700">
            {dayMode && !startDay
              ? <span className="text-slate-400">날짜를 고르면 여기 적힙니다</span>
              : <>→ {startDate}부터</>}
          </span>
        </div>
      </FormSection>

      {/*
        ③ 대당 단가 — ★위에서 아래로 내려가는 표★ (한백 2026-08-29). 그전에는 받는 단가 − 마진 =
        지급 단가 = 영업비 + 시공비를 한 줄 식으로 옆으로 세웠는데, 폼은 위에서 아래로 채우는
        것이라 옆으로 흐르는 식은 눈이 되돌아와야 했다. 표는 줄마다 이름·값 한 쌍이고,
        셈한 값(지급 단가·합)은 입력칸이 아니라 굵은 글자다(화면 규칙 4).
        개정이면 왼쪽에 ★기존 값★을 연하게 세운다 — 무엇에서 무엇으로 바꾸는지 그 줄에서 보인다.
      */}
      <FormSection title="대당 단가">
        <MoneyTable
          revising={false}
          rows={([
            { label: '받는 단가', prev: prevReceive, input: <Money value={receiveUnit} onChange={setReceiveUnit} /> },
            { label: '마진', op: '−', prev: prefill.margin, input: <Money value={margin} onChange={setMargin} /> },
            {
              label: '지급 단가', op: '=', prev: prevPayout, derived: true,
              value: mg > receive ? `−${won(mg - receive)}원` : `${won(payout)}원`,
              bad: mg > receive,
            },
            ...(channel === '턴키'
              ? [
                { label: '영업비', prev: prefill.salesUnit, input: <Money value={salesUnit} onChange={setSalesUnit} /> },
                { label: '시공비', op: '+', prev: prefill.consUnit, input: <Money value={consUnit} onChange={setConsUnit} /> },
                {
                  label: '합', op: '=', derived: true, value: `${won(sales + cons)}원`, bad: receive > 0 && !splitOk,
                  /* 합이 맞는지는 그 자리에서 — 어긋난 액수를 적는다(화면 규칙 3·9) */
                  side: receive > 0
                    ? (splitOk ? <Tag tone="ok">지급 단가와 같음</Tag> : <Tag tone="stop">{won(Math.abs(payout - sales - cons))}원 차이</Tag>)
                    : null,
                },
              ]
              : [
                {
                  label: channel === '영업' ? '영업비' : '시공비', op: '=', derived: true,
                  value: `${won(Math.max(payout, 0))}원`, side: <Tag>지급 단가 전액</Tag>,
                },
              ]),
          ] as MoneyRow[])}
        />
      </FormSection>

      {/* ④ 기성 단계 — 받는 단가를 운영사에게 받는 차수. 현장 기성 탭·운영사 기성관리에 이대로 선다 */}
      <StepsSection
        steps={steps}
        stepsLocked={stepsLocked}
        receive={receive}
        stepAmount={stepAmount}
        stepBad={stepBad}
        setStep={setStep}
        setSteps={setSteps}
        setStepsLocked={setStepsLocked}
        addStep={addStep}
      />

      {/*
        ⑤·⑥ 요금·프로모션과 지원·조건은 운영사(와 계약연수)가 정하는 공통 적용사항이라 개정에서
        거의 안 바뀐다 — 개정은 접어 두고 원 케이스 값을 그대로 싣는다(한백 지적 2026-08-23).
        접힌 채로 지금 값의 요약이 보이고, 그 자리 칩으로 펼친다.
      */}
      <PromoSection
        chargeRate={chargeRate}
        setChargeRate={setChargeRate}
        promo={promo}
        setPromo={setPromo}
        promoExtend={promoExtend}
        setPromoExtend={setPromoExtend}
        extendCap={extendCap}
        setExtendCap={setExtendCap}
        collapsed={!showRates}
        summary={ratesSummary}
        onToggle={() => setShowRates((v) => !v)}
      />
      <TermsSection
        supplyItems={supplyItems} setSupplyItems={setSupplyItems}
        installTerms={installTerms} setInstallTerms={setInstallTerms}
        otherSupport={otherSupport} setOtherSupport={setOtherSupport}
        coexistTerms={coexistTerms} setCoexistTerms={setCoexistTerms}
        miscTerms={miscTerms} setMiscTerms={setMiscTerms}
        note={note} setNote={setNote}
        collapsed={!showTerms}
        summary={termsSummary}
        onToggle={() => setShowTerms((v) => !v)}
      />

      {/*
        저장 줄은 화면 아래에 붙는다 — 폼이 길어 단추가 화면 밖에 있으면 다 채우고도 어디서
        넣는지 찾아야 한다. 막는 것을 단추 이름에 적는다 — 흐린 단추만으로는 왜 안 되는지 알 수 없다.
      */}
      <div className="sticky bottom-0 -mx-5 mt-6 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Btn
            disabled={Boolean(blocked)}
            busy={busy}
            busyLabel={mode === '수정' ? '고치는 중…' : '넣는 중…'}
            onClick={() => void save()}
          >
            {blocked
              ? `${blocked} — ${mode === '수정' ? '고칠' : '넣을'} 수 없음`
              : mode === '수정' ? '케이스 고치기' : '케이스 넣기'}
          </Btn>
          <Btn kind="quiet" disabled={busy} onClick={onDone}>취소</Btn>
          <Err>{error}</Err>
        </div>
      </div>
    </section>
  );
}

/* ── 대당 단가 표 ────────────────────────────────────────────────────────
 * 줄 = 이름 · (기존) · 값. 연산자는 이름 앞에 작게 서서 위 줄과의 관계를 말한다(− = +).
 * 셈한 줄(derived)은 입력칸 없이 굵은 글자다. 기존 열은 개정에만 선다.
 */
interface MoneyRow {
  label: string;
  op?: '−' | '=' | '+';
  /** 개정의 기존 값 — 없으면 빈 칸 */
  prev?: number;
  input?: ReactNode;
  derived?: boolean;
  value?: string;
  bad?: boolean;
  /** 값 옆에 붙는 상태 — 합이 맞는지 등 */
  side?: ReactNode;
}

function MoneyTable({ rows, revising }: { rows: MoneyRow[]; revising: boolean }) {
  return (
    <table className="text-center w-max text-base">
      {revising && (
        <thead>
          <tr className="text-tiny font-bold tracking-[0.04em] text-slate-400">
            <th className="whitespace-nowrap" />
            <th className="whitespace-nowrap pb-1.5 text-right font-bold">기존</th>
            <th className="whitespace-nowrap pb-1.5 pl-4 text-right font-bold">새 값</th>
            <th className="whitespace-nowrap" />
          </tr>
        </thead>
      )}
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => (
          <tr key={r.label} className={r.derived ? 'bg-slate-50/70' : ''}>
            <th scope="row" className="whitespace-nowrap py-2 pr-4 font-bold text-slate-700">
              <span className="mr-1.5 inline-block w-3 text-center font-black text-slate-300" aria-hidden>{r.op ?? ''}</span>
              {r.label}
            </th>
            {revising && (
              <td className="w-28 py-2 text-right text-small tabular-nums text-slate-400">
                {r.prev === undefined ? '' : `${won(r.prev)}원`}
              </td>
            )}
            {/* 「기존」과 자릿수를 맞춘다 — 나란히 견주라고 둔 두 칸이다(화면 규칙 13) */}
            <td className="w-44 py-2 pl-4 text-right">
              {r.derived ? (
                <span className={`text-lead font-black tabular-nums ${r.bad ? 'text-red-600' : 'text-slate-900'}`}>{r.value}</span>
              ) : r.input}
            </td>
            <td className="py-2 pl-3">{r.side ?? null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

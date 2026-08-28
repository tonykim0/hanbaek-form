'use client';

import {
  useEffect, useRef, useState,
} from 'react';
import { BUILDING_TYPES, bizTypeOfRepl, CHANNELS, CPO_NAMES, powerTypesOfRepl, replTypesOf, type BuildingType, type Channel, type CpoName, type ReplType, type BizType, type PromoStep, type SettlementRule, type SettlementStepRule } from '@/types/project';
import { replLabel } from '@/types/project';
import { won } from '@/lib/format';
import { useAction } from '@/lib/use-action';

import {
  startKey,
} from '@/lib/pricing-match';
import { checkSettlementSteps, stepUnits } from '@/lib/settlement';
import { Btn, Choice, Err, FIELD, PANEL } from '@/components/ui';
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

  const startDate = startDay ? koDate(startDay) : `${year}년 ${half}반기`;

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
          <Field label="수전방식" hint={powerTypesOfRepl(replType).length === 1 ? `${replType}은 모자분리 전제` : undefined}>
            <select
              value={powerType}
              onChange={(e) => setPowerType(e.target.value as (typeof POWER_TYPES)[number])}
              className={FIELD}
            >
              {powerTypesOfRepl(replType).map((p) => <option key={p} value={p}>{p}</option>)}
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
        <PromoSection
          chargeRate={chargeRate}
          setChargeRate={setChargeRate}
          promo={promo}
          setPromo={setPromo}
          promoExtend={promoExtend}
          setPromoExtend={setPromoExtend}
        />
      )}

      {/* ⑥ 지원·조건 — 매트릭스의 지급자재·설치조건·병행·기타지원·기타 행이 이 값 그대로다 */}
      {showTerms && (
        <TermsSection
          supplyItems={supplyItems} setSupplyItems={setSupplyItems}
          installTerms={installTerms} setInstallTerms={setInstallTerms}
          otherSupport={otherSupport} setOtherSupport={setOtherSupport}
          coexistTerms={coexistTerms} setCoexistTerms={setCoexistTerms}
          miscTerms={miscTerms} setMiscTerms={setMiscTerms}
          note={note} setNote={setNote}
        />
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


'use client';

/**
 * 케이스 폼의 구역 셋 — 기성 단계 · 요금·프로모션 · 지원·조건.
 *
 * 폼 본체가 상태를 쥐고, 여기는 그 값과 바꾸는 길만 받아 그린다. 한 폼에 다 두었더니
 * 한 구역을 고치려고 800줄을 지나야 했다 — 구역마다 보는 값이 겹치지 않아 이렇게 갈린다.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { Trigger } from '@/types/project';
import { RECEIVE_TRIGGERS } from '@/lib/settlement';
import { won } from '@/lib/format';
import { Btn, FIELD, FIELD_CELL, Tag } from '@/components/ui';
import { Field, FormSection } from './form-parts';

/** 기성 단계 한 줄의 입력 상태 — 값 칸은 고정이면 원, 비율이면 % 다 */
export interface StepDraft {
  trigger: Trigger;
  kind: '고정' | '비율' | '잔액';
  value: string;
}

export function StepsSection({
  steps, stepsLocked, receive, stepAmount, stepBad, setStep, setSteps, setStepsLocked, addStep,
}: {
  steps: StepDraft[];
  stepsLocked: boolean;
  receive: number;
  /** 차수마다 실제 금액 — 받는 단가에서 나눠 떨어진 값 */
  stepAmount: number[];
  /** 기성 단계가 어긋난 이유들 — 있으면 그 자리에 적는다 */
  stepBad: string[];
  setStep: (i: number, patch: Partial<StepDraft>) => void;
  setSteps: Dispatch<SetStateAction<StepDraft[]>>;
  setStepsLocked: (v: boolean) => void;
  addStep: () => void;
}) {
  return (
      <FormSection
      title="기성 단계"
      hint={stepsLocked
        ? '단계는 운영사가 정한다 — 케이스마다 다른 것은 차수 금액뿐'
        : '받는 단가를 어느 시점에 얼마씩 받는가 — 합이 받는 단가와 같아야 한다'}
    >
      {steps.length === 0 ? (
        <Tag tone="warn">
          {stepsLocked
            ? '이 운영사·사업구분의 기성 모양이 아직 없음 — 첫 케이스면 단계를 직접 정의'
            : '기성 미정 — 이 케이스로 지정된 현장은 기성이 계산되지 않음'}
        </Tag>
      ) : (
        <div className="flex max-w-2xl flex-col gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-8 shrink-0 text-tiny font-bold text-slate-400">{i + 1}차</span>
              {stepsLocked ? (
                /* 모양은 운영사 것 — 트리거·방식은 글자로 굳히고 고정액만 연다 (화면 규칙 4번) */
                <span className="font-bold text-slate-700">
                  {s.trigger}
                  <span className="ml-1.5 text-tiny font-semibold text-slate-400">
                    {s.kind === '고정' ? '고정액' : s.kind === '비율' ? `${s.value}%` : '잔액'}
                  </span>
                </span>
              ) : (
                <>
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
                </>
              )}
              {s.kind === '고정' && (
                <span className="flex items-baseline gap-1">
                  <input
                    value={s.value}
                    onChange={(e) => setStep(i, { value: e.target.value })}
                    inputMode="numeric"
                    placeholder="0"
                    className={`${FIELD_CELL} w-28 text-right tabular-nums`}
                  />
                  <span className="shrink-0 text-micro text-slate-400">원</span>
                </span>
              )}
              {!stepsLocked && s.kind === '비율' && (
                <span className="flex items-baseline gap-1">
                  <input
                    value={s.value}
                    onChange={(e) => setStep(i, { value: e.target.value })}
                    inputMode="numeric"
                    placeholder="0"
                    className={`${FIELD_CELL} w-20 text-right tabular-nums`}
                  />
                  <span className="shrink-0 text-micro text-slate-400">%</span>
                </span>
              )}
              <span className="ml-auto text-tiny tabular-nums text-slate-500">
                {receive > 0 ? `대당 ${won(stepAmount[i] ?? 0)}원` : '—'}
              </span>
              {!stepsLocked && (
                <Btn size="sm" kind="quiet" onClick={() => setSteps((p) => p.filter((_, x) => x !== i))}>
                  빼기
                </Btn>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {stepsLocked ? (
          <Btn size="sm" kind="quiet" onClick={() => setStepsLocked(false)}>
            단계 직접 정의 — 운영사 모양이 바뀌었을 때만
          </Btn>
        ) : (
          steps.length < 3 && <Btn size="sm" kind="side" onClick={addStep}>차수 추가</Btn>
        )}
        {steps.length > 0 && receive > 0 && stepBad.length > 0 && (
          <span className="text-tiny font-semibold text-red-600">{stepBad[0]}</span>
        )}
      </div>
    </FormSection>
  );
}

/** 프로모션 한 줄의 입력 상태 — 저장할 때 숫자로 바뀐다(폼 본체가 한다) */
export interface PromoDraft { months: string; rate: string }
export interface PromoExtendDraft { months: string; rate: string; deduct: string }

export function PromoSection({
  chargeRate, setChargeRate, promo, setPromo, promoExtend, setPromoExtend,
}: {
  chargeRate: string;
  setChargeRate: (v: string) => void;
  promo: PromoDraft[];
  setPromo: Dispatch<SetStateAction<PromoDraft[]>>;
  promoExtend: PromoExtendDraft[];
  setPromoExtend: Dispatch<SetStateAction<PromoExtendDraft[]>>;
}) {
  return (
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
  );
}

export function TermsSection({
  supplyItems, setSupplyItems, installTerms, setInstallTerms, otherSupport, setOtherSupport,
  coexistTerms, setCoexistTerms, miscTerms, setMiscTerms, note, setNote,
}: {
  supplyItems: string; setSupplyItems: (v: string) => void;
  installTerms: string; setInstallTerms: (v: string) => void;
  otherSupport: string; setOtherSupport: (v: string) => void;
  coexistTerms: string; setCoexistTerms: (v: string) => void;
  miscTerms: string; setMiscTerms: (v: string) => void;
  note: string; setNote: (v: string) => void;
}) {
  return (
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
  );
}

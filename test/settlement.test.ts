/**
 * 돈 계산 — 기성(운영사에게 받는 것)과 지급 회차(협력사에게 주는 것).
 *
 * ★여기가 틀리면 조용히 틀린다★ — 화면은 숫자를 그대로 보여줄 뿐이고, 잘못된 금액도
 * 그럴듯해 보인다. 분배·끝수·잔액처럼 반올림이 끼는 자리를 못 박아 둔다.
 */
import { describe, expect, it } from 'vitest';
import {
  checkSettlementSteps, payInstallments, payoutStepsOf, stepAmounts, stepUnits,
  settlementRuleNameOf, settlementStepsKeyOf, turnkeyUnit,
} from '@/lib/settlement';
import type { SettlementRule, SettlementStepRule } from '@/types/project';

const env4060: SettlementStepRule[] = [
  { trigger: '환경부 승인', basis: { kind: '비율', ratio: 0.4 } },
  { trigger: '준공마감', basis: { kind: '잔액' } },
];
const sk2step: SettlementStepRule[] = [
  { trigger: '착공', basis: { kind: '고정', unit: 800_000 } },
  { trigger: '준공마감', basis: { kind: '잔액' } },
];

describe('stepUnits — 단계별 대당 금액', () => {
  it('비율 뒤 잔액이면 합이 받는 단가와 정확히 같다 (에버온 40/60, 220만)', () => {
    const units = stepUnits(env4060, 2_200_000);
    expect(units).toEqual([880_000, 1_320_000]);
    expect(units[0] + units[1]).toBe(2_200_000);
  });

  it('★반올림이 생겨도 잔액이 흡수한다★ — 나누어떨어지지 않는 단가', () => {
    const units = stepUnits(env4060, 2_100_001);
    expect(units[0] + units[1]).toBe(2_100_001);
  });

  it('고정 뒤 잔액 (SK 착공 80만)', () => {
    expect(stepUnits(sk2step, 1_500_000)).toEqual([800_000, 700_000]);
  });

  it('고정이 단가를 넘으면 잔액은 음수가 아니라 0이다', () => {
    expect(stepUnits(sk2step, 500_000)).toEqual([800_000, 0]);
  });
});

describe('stepAmounts — 대수를 곱한다', () => {
  it('대당 금액 × 대수', () => {
    const rule = { steps: env4060 } as SettlementRule;
    expect(stepAmounts(rule, 2_200_000, 5)).toEqual([4_400_000, 6_600_000]);
  });
});

describe('checkSettlementSteps — 저장 전 검산', () => {
  it('합이 받는 단가와 같으면 통과', () => {
    expect(checkSettlementSteps(env4060, 2_200_000)).toEqual([]);
  });

  it('★합이 안 맞으면 막는다★ — 비율만 둘이면 잔액이 없다', () => {
    const bad: SettlementStepRule[] = [
      { trigger: '환경부 승인', basis: { kind: '비율', ratio: 0.4 } },
      { trigger: '준공마감', basis: { kind: '비율', ratio: 0.5 } },
    ];
    expect(checkSettlementSteps(bad, 2_200_000).join()).toMatch(/합.*다릅니다/);
  });

  it('잔액은 마지막 차수에만 둘 수 있다', () => {
    const bad: SettlementStepRule[] = [
      { trigger: '착공', basis: { kind: '잔액' } },
      { trigger: '준공마감', basis: { kind: '고정', unit: 100 } },
    ];
    expect(checkSettlementSteps(bad, 1_000).join()).toMatch(/마지막 차수/);
  });

  it('기성이 미정(빈 배열)인 것은 오류가 아니다 — 자체투자가 그렇다', () => {
    expect(checkSettlementSteps([], 1_400_000)).toEqual([]);
  });

  it('트리거는 받는 것 셋뿐이다 — 지급 트리거를 넣으면 막는다', () => {
    const bad = [{ trigger: '개통완료', basis: { kind: '잔액' } }] as unknown as SettlementStepRule[];
    expect(checkSettlementSteps(bad, 1_000).join()).toMatch(/트리거/);
  });
});

describe('payInstallments · payoutStepsOf — 협력사 지급 회차 (70/30)', () => {
  it('끝수는 1차가 가져간다', () => {
    expect(payInstallments(1_000_001)).toEqual([700_001, 300_000]);
  });

  it('아무것도 안 준 상태면 1차가 열린다', () => {
    const s = payoutStepsOf(1_000_000, 0, 0);
    expect(s.due).toBe(1_000_000);
    expect(s.parts).toEqual([700_000, 300_000]);
    expect(s.open).toEqual({ no: 1, amount: 700_000 });
    expect(s.step1Done).toBe(false);
  });

  it('1차를 다 주면 2차가 열린다', () => {
    const s = payoutStepsOf(1_000_000, 0, 700_000);
    expect(s.step1Done).toBe(true);
    expect(s.open).toEqual({ no: 2, amount: 300_000 });
  });

  it('★원장에 선금·차액으로 나뉘어 있어도 문턱으로 센다★ — 이중 지급이 안 생긴다', () => {
    const s = payoutStepsOf(1_000_000, 0, 1_000_000);
    expect(s.step2Done).toBe(true);
    expect(s.open).toBeNull();
  });

  it('조정(감액)이 총액을 0 이하로 만들면 열리는 회차가 없다', () => {
    expect(payoutStepsOf(1_000_000, -1_000_000, 0).open).toBeNull();
  });
});

describe('규칙 이름·키 — 같은 모양이면 같은 규칙이다', () => {
  it('이름은 단계에서 유도한다', () => {
    expect(settlementRuleNameOf(env4060)).toBe('환경부 승인 40% → 준공마감 잔액');
  });

  it('트리거·방식·금액이 같으면 키가 같다', () => {
    expect(settlementStepsKeyOf(env4060)).toBe(settlementStepsKeyOf([...env4060]));
  });

  it('금액이 다르면 키가 다르다', () => {
    const other: SettlementStepRule[] = [
      { trigger: '착공', basis: { kind: '고정', unit: 900_000 } },
      { trigger: '준공마감', basis: { kind: '잔액' } },
    ];
    expect(settlementStepsKeyOf(sk2step)).not.toBe(settlementStepsKeyOf(other));
  });
});

describe('turnkeyUnit — 받는 단가 = 영업 + 시공 + 마진', () => {
  it('셋을 더한다', () => {
    expect(turnkeyUnit({ salesUnit: 1_000_000, consUnit: 1_000_000, margin: 200_000 })).toBe(2_200_000);
  });
});

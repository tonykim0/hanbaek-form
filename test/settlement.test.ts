/**
 * 돈 계산 — 기성(운영사에게 받는 것)과 지급 회차(협력사에게 주는 것).
 *
 * ★여기가 틀리면 조용히 틀린다★ — 화면은 숫자를 그대로 보여줄 뿐이고, 잘못된 금액도
 * 그럴듯해 보인다. 분배·끝수·잔액처럼 반올림이 끼는 자리를 못 박아 둔다.
 */
import { describe, expect, it } from 'vitest';
import {
  adjustEntriesOf, checkPayoutEntry, payoutPrerequisiteBlockersOf,
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

  /**
   * 원장 요약 만들기 — 회차를 안 정한 조정(adj0)만 주면 옛 호출과 같은 뜻이다.
   * 이 도우미가 곧 「무엇이 안 바뀌었나」의 선이다.
   */
  const side = (
    adjust: number,
    paid: number,
    opts: { by?: [number, number, number]; ledger?: [number | null, number | null] } = {}
  ) => ({
    adjust,
    adjustBy: opts.by ?? ([adjust, 0, 0] as [number, number, number]),
    paid,
    ledger: opts.ledger ?? ([null, null] as [number | null, number | null]),
  });

  it('아무것도 안 준 상태면 1차가 열린다', () => {
    const s = payoutStepsOf(1_000_000, side(0, 0));
    expect(s.due).toBe(1_000_000);
    expect(s.parts).toEqual([700_000, 300_000]);
    expect(s.open).toEqual({ no: 1, amount: 700_000 });
    expect(s.step1Done).toBe(false);
  });

  it('1차를 다 주면 2차가 열린다', () => {
    const s = payoutStepsOf(1_000_000, side(0, 700_000));
    expect(s.step1Done).toBe(true);
    expect(s.open).toEqual({ no: 2, amount: 300_000 });
  });

  it('★원장에 선금·차액으로 나뉘어 있어도 문턱으로 센다★ — 이중 지급이 안 생긴다', () => {
    const s = payoutStepsOf(1_000_000, side(0, 1_000_000));
    expect(s.step2Done).toBe(true);
    expect(s.open).toBeNull();
  });

  it('조정(감액)이 총액을 0 이하로 만들면 열리는 회차가 없다', () => {
    expect(payoutStepsOf(1_000_000, side(-1_000_000, 0)).open).toBeNull();
  });

  /*
   * ★회차별 조정★ (한백 지시 2026-09-04 「영업비 1,2차 시공비 1차,2차 각각 영역에서 차감」).
   * 회차를 안 고르면 옛 식과 한 자리도 다르지 않아야 한다 — 그것이 이관의 안전선이다.
   */
  it('회차를 안 고른 조정은 예전처럼 70/30 으로 갈라진다', () => {
    const s = payoutStepsOf(10_000_000, side(-1_260_000, 0));
    expect(s.due).toBe(8_740_000);
    expect(s.parts).toEqual([6_118_000, 2_622_000]);
    expect(s.open).toEqual({ no: 1, amount: 6_118_000 });
  });

  it('★1차분 차감은 1차에서만 빠진다★ — 2차 기준액이 안 흔들린다', () => {
    const s = payoutStepsOf(10_000_000, side(-1_260_000, 0, { by: [0, -1_260_000, 0] }));
    expect(s.due).toBe(8_740_000);
    expect(s.parts).toEqual([5_740_000, 3_000_000]);
    expect(s.open).toEqual({ no: 1, amount: 5_740_000 });
  });

  it('2차분 차감은 1차를 그대로 두고 2차에서만 빠진다', () => {
    const s = payoutStepsOf(10_000_000, side(-1_260_000, 0, { by: [0, 0, -1_260_000] }));
    expect(s.parts).toEqual([7_000_000, 1_740_000]);
    expect(s.open).toEqual({ no: 1, amount: 7_000_000 });
  });

  it('회차 기준액의 합은 언제나 총액이다 — 1차분 차감이 1차보다 커도', () => {
    const s = payoutStepsOf(10_000_000, side(-8_000_000, 0, { by: [0, -8_000_000, 0] }));
    expect(s.parts).toEqual([0, 2_000_000]);
    expect(s.parts[0] + s.parts[1]).toBe(s.due);
  });

  it('★나간 회차는 원장이 정본이다★ — 증액 조정에 1차가 되열리지 않는다', () => {
    const s = payoutStepsOf(10_000_000, side(2_000_000, 7_000_000, {
      by: [0, 2_000_000, 0], ledger: [7_000_000, null],
    }));
    expect(s.step1Done).toBe(true);
    expect(s.open).toEqual({ no: 2, amount: 5_000_000 });
    // 확정 뒤에 붙은 몫은 2차 잔액에 그대로 들어간다 — 계획 30% 300만이 아니라 500만이다
    expect(s.parts).toEqual([9_000_000, 3_000_000]);
  });

  it('1차가 나간 뒤의 1차분 차감은 2차에서 상계된다 — 금액은 총액이 정한다', () => {
    const s = payoutStepsOf(10_000_000, side(-1_260_000, 7_000_000, {
      by: [0, -1_260_000, 0], ledger: [7_000_000, null],
    }));
    expect(s.open).toEqual({ no: 2, amount: 1_740_000 });
    // 1차 기준액은 574만으로 내려갔지만 원장 700만은 그대로다 — 차액은 2차에서 상계된다
    expect(s.parts).toEqual([5_740_000, 3_000_000]);
  });

  it('★지급 전에 깎으면 그 금액이 그대로 1차로 나간다★ — 화면이 「부족」이라 할 일이 없다', () => {
    const before = payoutStepsOf(7_500_000, side(-600_000, 0, { by: [0, -600_000, 0] }));
    expect(before.open).toEqual({ no: 1, amount: 4_650_000 });
    // 그 금액으로 확정하면 원장 = 기준액이라 어긋남이 없다
    const after = payoutStepsOf(7_500_000, side(-600_000, 4_650_000, {
      by: [0, -600_000, 0], ledger: [4_650_000, null],
    }));
    expect(after.parts[0]).toBe(4_650_000);
    expect(after.open).toEqual({ no: 2, amount: 2_250_000 });
  });

  it('1차분 차감이 1차를 다 먹으면 전액이 2차로 밀린다', () => {
    const s = payoutStepsOf(10_000_000, side(-7_000_000, 0, { by: [0, -7_000_000, 0] }));
    expect(s.parts).toEqual([0, 3_000_000]);
    expect(s.step1Done).toBe(true);
    expect(s.open).toEqual({ no: 2, amount: 3_000_000 });
  });

  it('열린 회차 금액은 언제나 양수다 — 음수 지급이 확정될 길이 없다', () => {
    for (const [adjust, paid] of [[-9_000_000, 0], [-5_000_000, 7_000_000], [0, 999_999]] as const) {
      const s = payoutStepsOf(10_000_000, side(adjust, paid));
      if (s.open) expect(s.open.amount).toBeGreaterThan(0);
    }
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

describe('adjustEntriesOf — 조정 한 건이 원장에 남기는 줄', () => {
  const base = { amount: 300_000, at: '2026-08-29', note: '전기 인입 추가' } as const;

  it('차감은 한 줄, 음수 — 사람은 양수만 적는다', () => {
    expect(adjustEntriesOf({ ...base, category: '차감', kind: '영업비' })).toEqual([
      { kind: '영업비', category: '차감', amount: -300_000, at: '2026-08-29', note: '전기 인입 추가', step: null },
    ]);
  });

  it('자재비는 나가는 돈이라 양수다', () => {
    const [e] = adjustEntriesOf({ ...base, category: '자재비', kind: '시공비' });
    expect(e.amount).toBe(300_000);
  });

  it('★추가공사비는 영업비에서 빼서 시공비로 넘긴다★ — 한 사실이 두 줄', () => {
    const rows = adjustEntriesOf({ ...base, category: '추가공사비', kind: '영업비' });
    expect(rows).toEqual([
      { kind: '영업비', category: '차감', amount: -300_000, at: '2026-08-29', note: '추가공사비 · 전기 인입 추가', step: null },
      { kind: '시공비', category: '추가공사비', amount: 300_000, at: '2026-08-29', note: '전기 인입 추가', step: null },
    ]);
  });

  it('두 줄의 합은 0 — 한백의 마진은 그대로다', () => {
    const rows = adjustEntriesOf({ ...base, category: '추가공사비', kind: '영업비' });
    expect(rows.reduce((n, e) => n + e.amount, 0)).toBe(0);
  });

  it('사유가 없어도 빼는 줄은 까닭을 적는다 — 명목이 「차감」이라 안 적으면 알 수 없다', () => {
    const [minus] = adjustEntriesOf({ ...base, note: null, category: '추가공사비', kind: '영업비' });
    expect(minus.note).toBe('추가공사비');
  });

  it('한백이 안으면 빼는 줄이 없다 — 시공비 한 줄(마진이 그만큼 줄어든다)', () => {
    expect(adjustEntriesOf({ ...base, category: '추가공사비', kind: '영업비', hanbaekBears: true }))
      .toEqual([
        { kind: '시공비', category: '추가공사비', amount: 300_000, at: '2026-08-29', note: '전기 인입 추가', step: null },
      ]);
  });

  it('★고른 회차는 갈라진 두 줄에 같이 실린다★ — 한 사실이라 서로 다른 회차일 수 없다', () => {
    const rows = adjustEntriesOf({ ...base, category: '추가공사비', kind: '영업비', step: 2 });
    expect(rows.map((e) => e.step)).toEqual([2, 2]);
  });

  it('회차를 안 고르면 null 이다 — 예전처럼 총액에 붙는다', () => {
    const [e] = adjustEntriesOf({ ...base, category: '차감', kind: '영업비' });
    expect(e.step).toBeNull();
  });

  it('시공비에서 빼서 시공비로 줄 수는 없다 — 한백이 안는 것과 같다', () => {
    expect(adjustEntriesOf({ ...base, category: '추가공사비', kind: '시공비' })).toHaveLength(1);
  });

  it('재정산만 방향을 받는다', () => {
    const [down] = adjustEntriesOf({ ...base, category: '재정산', kind: '영업비', minus: true });
    const [up] = adjustEntriesOf({ ...base, category: '재정산', kind: '영업비', minus: false });
    expect(down.amount).toBe(-300_000);
    expect(up.amount).toBe(300_000);
  });

  it('★나온 줄은 서버 검사를 통과한다★ — 부호 규칙이 둘로 갈리면 저장에서 막힌다', () => {
    for (const category of ['차감', '자재비', '추가공사비', '프로모션 비용 차감', '재정산'] as const) {
      for (const rows of [
        adjustEntriesOf({ ...base, category, kind: '영업비' }),
        adjustEntriesOf({ ...base, category, kind: '시공비' }),
      ]) {
        for (const row of rows) {
          expect(checkPayoutEntry(row, { manualOnly: true })).toBeNull();
        }
      }
    }
  });
});

describe('payoutPrerequisiteBlockersOf — 지급조건은 「모든 필수 서류」다 (2026-08-31)', () => {
  const base = { kind: '영업비' as const, org: '엘앤에스', unpriced: 0, payoutDocsMissing: [] as string[] };

  it('★건수를 앞에 적고 이름은 세 개까지★ — 표의 한 칸에 들어가야 한다', () => {
    const b = payoutPrerequisiteBlockersOf({
      ...base,
      payoutDocsMissing: ['계약서', '회의록', '실사보고서 (사진대지)', '건축물대장', '사업자등록증'],
    });
    expect(b).toEqual(['지급조건 서류 5건 미제출: 계약서 · 회의록 · 실사보고서 (사진대지) 외 2건']);
  });

  it('세 개 이하면 「외 N건」을 붙이지 않는다', () => {
    expect(payoutPrerequisiteBlockersOf({ ...base, payoutDocsMissing: ['계약서'] }))
      .toEqual(['지급조건 서류 1건 미제출: 계약서']);
  });

  it('이관 현장은 빈 배열로 와서 안 막는다 — 계약 확인이 이미 면제한다', () => {
    expect(payoutPrerequisiteBlockersOf(base)).toEqual([]);
  });

  it('시공비에는 아직 묻지 않는다', () => {
    expect(payoutPrerequisiteBlockersOf({ ...base, kind: '시공비', payoutDocsMissing: ['계약서'] }))
      .toEqual([]);
  });

  it('단가·송금 대상은 그대로 본다', () => {
    expect(payoutPrerequisiteBlockersOf({ ...base, org: null, unpriced: 2 })).toEqual([
      '단가 미지정 2건 — 지급 금액 확정 불가',
      '송금 대상 미지정',
    ]);
  });
});

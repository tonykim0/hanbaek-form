/**
 * 플러그링크 하반기(2026년 7월 1일 접수분) 기성 단계 — 정의 파일을 그물 안에 들인다.
 *
 * ★왜 이 시험이 있나★ 케이스 정의는 그동안 시험 밖이었다. 단계를 잘못 적어도 아무것도
 * 안 잡는다: 마지막 차수가 「잔액」이라 합 검사(checkSettlementSteps)는 2차 금액이 무엇이든
 * 통과한다 — 「(턴키−20만)의 절반」이 아니게 되어도 초록이다. 여기서 그 절반을 다시 계산해
 * 못 박는다. 값은 migrations/0053 이 프로덕션에 넣은 것과 같아야 한다(한백 지시 2026-09-04).
 */
import { describe, expect, it } from 'vitest';
import { linkRules } from '@/lib/pricing-policy-link-h2';
import { PL_INV_STEPS, PL_KEEP, PL_RESTORE, plNewRules, plSubSteps } from '@/lib/pricing-policy-plhec-h2';
import { checkPricingRule } from '@/lib/pricing-match';
import { checkSettlementSteps, settlementStepsKeyOf, stepUnits, turnkeyUnit } from '@/lib/settlement';
import type { NewPricingRule } from '@/types/project';

const 턴키 = (r: NewPricingRule) => turnkeyUnit(r) as number;

/** 하반기 케이스 전부 — 정의 파일 넷 묶음 중 값이 여기 있는 셋 (PL_KEEP 은 id·턴키만 든다) */
const 하반기 = [...PL_RESTORE, ...plNewRules(), ...linkRules().filter((r) => r.cpo === '플러그링크')];

describe('케이스가 저장 전 검증을 통과한다', () => {
  for (const r of 하반기) {
    it(r.caseName, () => {
      expect(checkPricingRule(r)).toEqual([]);
    });
  }
});

describe('보조금 3단계 — 20만 + 공사비 선금 50% + 잔금', () => {
  /* 문서: 영업비 20만 계약 승인 후 · 공사비 선금 50% · 잔금 50% (비율 미확정) */
  const 보조 = [
    ...PL_KEEP.map((k) => ({ 이름: k.id, turnkey: k.turnkey, steps: plSubSteps(k.turnkey) })),
    ...PL_RESTORE.map((r) => ({ 이름: r.id, turnkey: 턴키(r), steps: r.settlementSteps })),
  ];

  it('다섯 케이스 전부다 — 유지 3 + 복원 2', () => {
    expect(보조.map((b) => b.turnkey)).toEqual([2_400_000, 2_600_000, 2_400_000, 2_000_000, 2_200_000]);
  });

  for (const b of 보조) {
    it(`${b.이름} — 20만 / (턴키−20만)÷2 / 잔액`, () => {
      const 절반 = (b.turnkey - 200_000) / 2;
      expect(stepUnits(b.steps, b.turnkey)).toEqual([200_000, 절반, 절반]);
      /* 합이 턴키와 맞는지는 잔액이 늘 맞춰 주지만, 그 잔액이 앞 차수와 같은 값이어야 「50%」다 */
      expect(checkSettlementSteps(b.steps, b.turnkey)).toEqual([]);
    });
  }

  it('트리거는 환경부 승인 → 착공 → 준공마감 순이다', () => {
    for (const b of 보조) {
      expect(b.steps.map((s) => s.trigger)).toEqual(['환경부 승인', '착공', '준공마감']);
    }
  });

  it('20만을 뺀 나머지가 반으로 안 갈리는 턴키는 거절한다 — 원 단위가 조용히 깎이지 않게', () => {
    expect(() => plSubSteps(2_300_001)).toThrow(/반으로 안 갈립니다/);
  });
});

describe('자체투자·연동 2단계 — 20만 먼저, 나머지는 준공 이후', () => {
  /* 「연동도 자투에 포함돼」 (한백 지시 2026-09-04) — 다섯 케이스가 규칙 한 행을 같이 쓴다 */
  const 자투연동 = [...plNewRules(), ...linkRules().filter((r) => r.cpo === '플러그링크')];

  /* 자투 상업 10년(120만)은 걷었다 (한백 2026-09-05) — 영업비 0 인데 1차가 영업비 20만이었다 */
  it('네 케이스다 — 자투 2 + 연동 2', () => {
    expect(자투연동.map((r) => 턴키(r))).toEqual([2_200_000, 2_400_000, 550_000, 750_000]);
  });

  it('단계 정의가 넷 다 같다 — 규칙 표에 한 행으로 모인다', () => {
    const keys = new Set(자투연동.map((r) => settlementStepsKeyOf(r.settlementSteps)));
    expect(keys).toEqual(new Set([settlementStepsKeyOf(PL_INV_STEPS)]));
  });

  it('첫 차수는 착공이다 — 자투·연동에는 환경부 승인이 없다', () => {
    expect(PL_INV_STEPS.map((s) => s.trigger)).toEqual(['착공', '준공마감']);
  });

  for (const r of 자투연동) {
    it(`${r.caseName} — 20만 + 잔액`, () => {
      const t = 턴키(r);
      expect(stepUnits(r.settlementSteps, t)).toEqual([200_000, t - 200_000]);
      expect(checkSettlementSteps(r.settlementSteps, t)).toEqual([]);
    });
  }

  it('연동 55만도 20만을 먼저 받고 35만이 남는다 — 잔액이 0 으로 깎이지 않는다', () => {
    expect(stepUnits(PL_INV_STEPS, 550_000)).toEqual([200_000, 350_000]);
  });
});

describe('기성은 3차까지다 — 이번 변경이 그 상한을 처음 쓴다', () => {
  it('4차를 넣으면 막는다', () => {
    const 네차 = [
      ...plSubSteps(2_400_000).slice(0, 2),
      { trigger: '착공' as const, basis: { kind: '고정' as const, unit: 100_000 } },
      { trigger: '준공마감' as const, basis: { kind: '잔액' as const } },
    ];
    expect(checkSettlementSteps(네차, 2_400_000).join(' ')).toMatch(/3차까지/);
  });
});

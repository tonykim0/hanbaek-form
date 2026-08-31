/**
 * 기성 할 일 — 운영사에게서 받을 돈이 지금 어디서 걸려 있나.
 *
 * ★여기가 틀리면 배지가 거짓말을 한다★ — 할 일은 저장하는 알림함이 아니라 유도값이라,
 * 조건이 헐거우면 처리할 수 없는 카드가 영영 남고 빡빡하면 받을 돈이 안 보인다.
 * 세 조건(수금 · 준공마감일 · 규칙)의 경계를 못 박아 둔다.
 */
import { describe, expect, it } from 'vitest';
import { receivableTodos } from '@/lib/todo-receivables';
import type { ProcessStatus, SettlementStep, SettlementSummary } from '@/types/project';

const 오늘 = new Date('2026-08-28T10:00:00+09:00');

function step(over: Partial<SettlementStep> & { no: 1 | 2 | 3 }): SettlementStep {
  return {
    trigger: '환경부 승인',
    basisLabel: '고정',
    planAmount: 300_000,
    state: 'waiting',
    openedAt: null,
    collectedAt: null,
    collectedAmount: null,
    ...over,
  };
}

/** 기성에 쓰이는 값만 채운다 — 협력사 지급 쪽(반대 방향)은 이 조립이 안 본다 */
function row(over: Partial<SettlementSummary> = {}): SettlementSummary {
  return {
    id: 'p1', name: '테스트아파트', cpo: '에버온', qty: 3,
    stage: 'construction', status: '착공' as ProcessStatus,
    ruleName: '환경부 승인 300,000원 → 준공마감 잔액',
    steps: [step({ no: 1 }), step({ no: 2 }), step({ no: 3 })],
    planTotal: 900_000, collectedTotal: 0, cpoCloseDate: null,
    salesOrg: null, gcOrg: null,
    payoutMilestones: { contractCompletedAt: null, installCompletedAt: null, completedAt: null },
    salesPayoutDocsMissing: [], salesTotal: 0, consTotal: 0, marginTotal: 0, unpricedLines: 0,
    salesAdjust: 0, salesPaid: 0, salesLastPaidAt: null,
    consAdjust: 0, consPaid: 0, consLastPaidAt: null,
    salesStep1At: null, salesStep2At: null, consStep1At: null, consStep2At: null,
    payNote: null,
    ...over,
  };
}

describe('기성 수금 — 조건이 찬 차수', () => {
  it('조건 대기만 있으면 할 일이 아니다 — 기다리는 것은 우리 차례가 아니다', () => {
    expect(receivableTodos([row()], 오늘)).toHaveLength(0);
  });

  it('열린 차수 하나 → 카드 하나. 금액과 무엇이 찼는지를 적는다', () => {
    const [t] = receivableTodos([row({
      steps: [step({ no: 1, state: 'open', openedAt: '2026-08-18' }), step({ no: 2 }), step({ no: 3 })],
    })], 오늘);
    expect(t.kind).toBe('기성 수금');
    expect(t.group).toBe('기성');
    expect(t.what).toBe('1차 기성 300,000원 · 환경부 승인 충족');
    expect(t.href).toBe('/projects/p1?tab=receivable');
  });

  it('★한 현장에 두 차수가 열려도 카드는 하나★ — 한 번에 청구하고, 갈 자리도 하나다', () => {
    const items = receivableTodos([row({
      steps: [
        step({ no: 1, state: 'open', openedAt: '2026-08-18' }),
        step({ no: 2, state: 'open', openedAt: '2026-08-26', trigger: '착공', planAmount: 500_000 }),
        step({ no: 3 }),
      ],
    })], 오늘);
    expect(items).toHaveLength(1);
    expect(items[0].what).toBe('1·2차 기성 800,000원 · 환경부 승인·착공 충족');
  });

  it('급함은 ★가장 오래 열린 차수★로 잰다 — 하루 = 1 (정체일과 같은 자)', () => {
    const [t] = receivableTodos([row({
      steps: [
        step({ no: 1, state: 'open', openedAt: '2026-08-18' }),
        step({ no: 2, state: 'open', openedAt: '2026-08-26' }),
        step({ no: 3 }),
      ],
    })], 오늘);
    expect(t.urgency).toBe(10);
    expect(t.urgencyLabel).toBe('받을 수 있게 된 지 10일');
  });

  it('오늘 열린 것은 밀린 것이 아니다', () => {
    const [t] = receivableTodos([row({
      steps: [step({ no: 1, state: 'open', openedAt: '2026-08-28' }), step({ no: 2 }), step({ no: 3 })],
    })], 오늘);
    expect(t.urgency).toBe(0);
    expect(t.urgencyLabel).toBe('오늘부터 받을 수 있음');
  });

  it('수금한 차수는 빠진다 — 받은 돈은 할 일이 아니다', () => {
    expect(receivableTodos([row({
      steps: [
        step({ no: 1, state: 'collected', openedAt: '2026-07-01', collectedAt: '2026-07-20' }),
        step({ no: 2 }), step({ no: 3 }),
      ],
    })], 오늘)).toHaveLength(0);
  });

  it('금액이 안 잡힌 차수는 0원이라 하지 않는다 — 「금액 미정」', () => {
    const [t] = receivableTodos([row({
      steps: [step({ no: 1, state: 'open', openedAt: '2026-08-20', planAmount: null }), step({ no: 2 }), step({ no: 3 })],
    })], 오늘);
    expect(t.what).toBe('1차 기성 금액 미정 · 환경부 승인 충족');
  });
});

describe('준공마감일 지정 — 마지막 기성이 열리지 않는 자리', () => {
  const 잔액대기 = [
    step({ no: 1, state: 'collected', openedAt: '2026-05-01', collectedAt: '2026-05-20' }),
    step({ no: 2, state: 'collected', openedAt: '2026-06-01', collectedAt: '2026-06-20', trigger: '착공' }),
    step({ no: 3, trigger: '준공마감', basisLabel: '잔액', planAmount: 660_000 }),
  ];

  it('준공했는데 준공마감일이 없다 → 한백이 넣을 차례다', () => {
    const [t] = receivableTodos([row({ status: '준공완료', steps: 잔액대기 })], 오늘);
    expect(t.kind).toBe('준공마감일 지정');
    expect(t.what).toBe('3차 기성 660,000원 · 준공마감일 없음');
    expect(t.urgency).toBe(30);
  });

  it('★준공 전에는 안 세운다★ — 통보가 올 때가 아니고, 띄우면 준공까지 내내 걸려 있다', () => {
    expect(receivableTodos([row({ status: '설치완료', steps: 잔액대기 })], 오늘)).toHaveLength(0);
  });

  it('준공마감일이 들어오면 그 차수는 열린다 — 그때는 수금 카드다', () => {
    const [t] = receivableTodos([row({
      status: '준공완료', cpoCloseDate: '2026-08-10',
      steps: [
        잔액대기[0], 잔액대기[1],
        step({ no: 3, trigger: '준공마감', basisLabel: '잔액', planAmount: 660_000, state: 'open', openedAt: '2026-08-10' }),
      ],
    })], 오늘);
    expect(t.kind).toBe('기성 수금');
    expect(t.what).toBe('3차 기성 660,000원 · 준공마감 충족');
  });
});

describe('정산 규칙 미지정 — 기성이 계산조차 안 되는 자리', () => {
  it('시공 국면에 규칙이 없으면 할 일이다', () => {
    const [t] = receivableTodos([row({ ruleName: null, steps: [] })], 오늘);
    expect(t.kind).toBe('정산 규칙 미지정');
    expect(t.what).toBe('3대 · 기성 계산 안 됨');
    /* 날짜로 잴 근거가 없다 — 밀림 문턱에 놓되 날수로 잰 것들 위로는 안 올라선다 */
    expect(t.urgency).toBe(7);
    expect(t.urgencyLabel).toBeNull();
  });

  it('★계약 국면에는 안 세운다★ — 그때는 걸 때가 아니고, 계약 쪽 할 일이 이미 서 있다', () => {
    expect(receivableTodos([row({
      ruleName: null, steps: [], stage: 'intake', status: '계약완료',
    })], 오늘)).toHaveLength(0);
  });

  it('계약완료·운영사 제출은 시공 stage 라도 ★계약 국면★이다 (보드와 같은 판정)', () => {
    expect(receivableTodos([row({
      ruleName: null, steps: [], stage: 'construction', status: '운영사 계약서 제출',
    })], 오늘)).toHaveLength(0);
  });

  it('대수가 0이면 받을 것이 없다 — 세우지 않는다', () => {
    expect(receivableTodos([row({ ruleName: null, steps: [], qty: 0 })], 오늘)).toHaveLength(0);
  });
});

describe('한 현장에 두 가지가 겹칠 때', () => {
  it('열린 차수와 준공마감일 대기는 다른 일이다 — 카드도 둘', () => {
    const items = receivableTodos([row({
      status: '준공완료',
      steps: [
        step({ no: 1, state: 'open', openedAt: '2026-08-01' }),
        step({ no: 2, state: 'collected', openedAt: '2026-06-01', collectedAt: '2026-06-20', trigger: '착공' }),
        step({ no: 3, trigger: '준공마감', basisLabel: '잔액', planAmount: 660_000 }),
      ],
    })], 오늘);
    expect(items.map((t) => t.kind)).toEqual(['기성 수금', '준공마감일 지정']);
    /* 열쇠가 겹치면 화면에서 한 장이 사라진다 */
    expect(new Set(items.map((t) => t.id)).size).toBe(2);
  });
});

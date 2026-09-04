/**
 * 배치와 지급일 — 세금계산서 한 장, 거래명세서 한 장의 단위.
 *
 * ★상태 판정이 어긋나면 협력사가 옛 지급마다 계산서를 다시 발행하려 든다★ —
 * 「가확정」은 지급일 전에만 뜻이 있는 신호다.
 */
import { describe, expect, it } from 'vitest';
import {
  batchKey, batchStateOf, canAttachInvoice, isPayoutSubject, payDateChoices, workGroupOf, workOf,
  type PayoutRowInput,
} from '@/lib/payout-board';

describe('batchKey — 지급처 × 구분 × 지급일', () => {
  it('세 축이 같으면 같은 배치다', () => {
    expect(batchKey('2026-09-10', '대광이브이', '시공비'))
      .toBe(batchKey('2026-09-10', '대광이브이', '시공비'));
  });

  it('★영업비와 시공비는 계산서를 따로 끊는다★ — 구분이 다르면 다른 배치', () => {
    expect(batchKey('2026-09-10', '에코일렉', '영업비'))
      .not.toBe(batchKey('2026-09-10', '에코일렉', '시공비'));
  });

  it('지급처가 없는 줄도 열쇠가 만들어진다 (빈 문자열로)', () => {
    expect(batchKey('2026-09-10', null, '영업비')).toBe('2026-09-10||영업비');
  });
});

describe('batchStateOf — 확정 여부 × 지급일, 네 자리', () => {
  const 먼미래 = '2999-01-01';
  const 먼과거 = '2000-01-01';

  it('지급일 전 · 미확정 → 가확정 (협력사에게 계산서 발행 신호)', () => {
    expect(batchStateOf({ paidAt: 먼미래, finalized: false })).toBe('가확정');
  });

  it('지급일 전 · 확정 → 확정', () => {
    expect(batchStateOf({ paidAt: 먼미래, finalized: true })).toBe('확정');
  });

  it('지급일 지남 · 확정 → 지급완료', () => {
    expect(batchStateOf({ paidAt: 먼과거, finalized: true })).toBe('지급완료');
  });

  it('★지급일 지남 · 미확정 → 확정 누락★ — 절차를 건너뛴 배치를 찾을 수 있어야 한다', () => {
    expect(batchStateOf({ paidAt: 먼과거, finalized: false })).toBe('확정 누락');
  });
});

describe('payDateChoices — 익월 10일·25일', () => {
  it('이달 조건 충족분은 다음 달 두 날이 후보다', () => {
    expect(payDateChoices('2026-08-14')).toEqual(['2026-09-10', '2026-09-25']);
  });

  it('★12월은 해를 넘긴다★', () => {
    expect(payDateChoices('2026-12-31')).toEqual(['2027-01-10', '2027-01-25']);
  });

  it('월은 두 자리로 적는다 — 문자열 비교로 정렬하므로', () => {
    expect(payDateChoices('2026-08-01')[0]).toBe('2026-09-10');
    expect(payDateChoices('2026-01-05')[0]).toBe('2026-02-10');
  });
});

describe('canAttachInvoice — 계산서를 누가 어느 배치에 붙이나', () => {
  const 에코 = { role: 'sales' as const, org: '에코일렉' };

  it('협력사는 자기 지급처의 확정 전 배치에 붙인다', () => {
    expect(canAttachInvoice({ ...에코, batchOrg: '에코일렉', finalized: false })).toBe(true);
  });

  it('★남의 지급처에는 못 붙인다★ — 배치 열쇠를 손으로 적어 보낼 수 있다', () => {
    expect(canAttachInvoice({ ...에코, batchOrg: '대광이브이', finalized: false })).toBe(false);
  });

  it('★확정되면 잠긴다★ — 한백이 보고 잠근 것과 붙어 있는 것이 달라지면 안 된다', () => {
    expect(canAttachInvoice({ ...에코, batchOrg: '에코일렉', finalized: true })).toBe(false);
  });

  it('한백은 확정 뒤에도 바꾼다 — 첨부는 보관이라 잠금과 무관하다', () => {
    expect(canAttachInvoice({ role: 'admin', org: null, batchOrg: '에코일렉', finalized: true })).toBe(true);
  });

  it('열람 전용은 못 한다', () => {
    expect(canAttachInvoice({ role: 'viewer', org: null, batchOrg: '에코일렉', finalized: false })).toBe(false);
  });

  it('소속이 없는 협력사 계정은 못 한다 — 빈 값끼리 맞아떨어지면 안 된다', () => {
    expect(canAttachInvoice({ role: 'sales', org: null, batchOrg: null, finalized: false })).toBe(false);
    expect(canAttachInvoice({ role: 'sales', org: '에코일렉', batchOrg: null, finalized: false })).toBe(false);
  });

  it('공백 차이는 같은 회사로 본다 (normalizeOrg)', () => {
    expect(canAttachInvoice({
      role: 'sales', org: ' 에코일렉  ', batchOrg: '에코일렉', finalized: false,
    })).toBe(true);
  });

  it('★상호 표기가 다르면 다른 회사다★ — 「주식회사」를 떼지 않는다', () => {
    /*
     * 현장 접근(canAccessProject)과 같은 잣대다 — 여기서만 느슨하게 보면, 소속 표기가
     * 어긋난 계정이 남의 배치에 붙일 수 있게 된다. 표기가 다르면 계정 쪽을 고칠 일이다.
     */
    expect(canAttachInvoice({
      role: 'sales', org: '주식회사 에코일렉', batchOrg: '에코일렉', finalized: false,
    })).toBe(false);
  });
});

describe('workGroupOf — 「조건 대기」를 둘로 가른다', () => {
  it('★사람이 채울 수 있는 것은 따로 센다★ — 서류·단가는 지금 할 일이다', () => {
    expect(workGroupOf({ state: '조건 대기', blockers: ['지급조건 서류 미달: 실사보고서 (사진대지)'] }))
      .toBe('보완 필요');
    expect(workGroupOf({ state: '조건 대기', blockers: ['단가 미지정 1건 — 지급 금액 확정 불가'] }))
      .toBe('보완 필요');
    // 지급처를 넣으면 풀리는 줄이다 — 기다릴 것이 없으니 공정 대기에 두면 안 본다
    expect(workGroupOf({ state: '조건 대기', blockers: ['송금 대상 미지정'] }))
      .toBe('보완 필요');
  });

  it('★막는 사유 넷이 전부 갈림에 걸린다★ — 하나라도 새면 그 줄이 안 보이는 칸에 앉는다', () => {
    // payoutPrerequisiteBlockersOf 가 내는 사유 셋 + 트리거 대기
    const fillable = ['단가 미지정 2건 — 지급 금액 확정 불가', '송금 대상 미지정', '지급조건 서류 미달: 실사보고서'];
    for (const b of fillable) {
      expect(workGroupOf({ state: '조건 대기', blockers: [b] })).toBe('보완 필요');
    }
  });

  it('공정 마일스톤은 기다리는 것이다 — 사람이 당길 수 없다', () => {
    for (const b of ['설치완료 대기', '준공완료 대기', '계약서류 확인 완료 대기']) {
      expect(workGroupOf({ state: '조건 대기', blockers: [b] })).toBe('공정 대기');
    }
  });

  it('둘이 섞이면 ★채울 것★이 이긴다 — 할 일이 있는 줄을 놓치지 않는다', () => {
    expect(workGroupOf({
      state: '조건 대기',
      blockers: ['설치완료 대기', '지급조건 서류 미달: 사전현장컨설팅 결과서'],
    })).toBe('보완 필요');
  });

  it('사유가 없는 조건 대기는 공정 대기다', () => {
    expect(workGroupOf({ state: '조건 대기', blockers: [] })).toBe('공정 대기');
  });

  it('나머지 상태는 그대로 간다', () => {
    expect(workGroupOf({ state: '지급 가능', blockers: [] })).toBe('지급 가능');
    expect(workGroupOf({ state: '지급 완료', blockers: [] })).toBe('지급 완료');
  });
});

describe('isPayoutSubject — 「낼 것이 없다」와 「다 냈다」를 가른다', () => {
  it('★계획도 0, 나간 돈도 0이면 지급이라는 것이 없다★ — 완료 칸에 세우면 안 된다', () => {
    // 자체투자 현장의 영업비가 그 자리다(프로덕션 실측: 인천 서구 불로삼보해피하임)
    expect(isPayoutSubject({ due: 0, confirmed: 0, unpriced: 0 })).toBe(false);
  });

  it('계획이 0이어도 돈이 나갔으면 남긴다 — 초과 지급이라 오히려 봐야 한다', () => {
    expect(isPayoutSubject({ due: 0, confirmed: 500_000, unpriced: 0 })).toBe(true);
  });

  it('★단가 미지정은 0이 아니라 「모른다」★ — 지정해야 하는 줄이 사라지면 안 된다', () => {
    expect(isPayoutSubject({ due: 0, confirmed: 0, unpriced: 2 })).toBe(true);
  });

  it('낼 돈이 있으면 당연히 대상이다', () => {
    expect(isPayoutSubject({ due: 1_500_000, confirmed: 0, unpriced: 0 })).toBe(true);
    expect(isPayoutSubject({ due: 1_500_000, confirmed: 1_785_000, unpriced: 0 })).toBe(true);
  });
});

describe('초과 지급은 완료가 아니다 — 되받거나 잔금에서 뺄 일이 남았다', () => {
  it('★1차 초과분이 2차를 덮어도 「지급 완료」로 부르지 않는다★', () => {
    // 반달마을푸르지오 영업비 (프로덕션 실측): 계획 150만 · 나감 178.5만 · 초과 28.5만.
    // 2차는 원장에 줄 하나 없다 — 프로덕션에서 2차가 실제로 나간 줄은 0건이었다.
    expect(workGroupOf({ state: '초과', blockers: ['초과 지급 285,000원 — 회수·차감 필요'] }))
      .toBe('보완 필요');
  });

  it('딱 맞게 다 나간 줄만 지급 완료다', () => {
    expect(workGroupOf({ state: '지급 완료', blockers: [] })).toBe('지급 완료');
  });
});

/*
 * ★멈춘 계약에는 돈이 나가지 않는다★ (한백 지시 2026-09-04, 감사 H3).
 *
 * 지급 판정이 보던 것은 단가·서류·트리거 셋뿐이라 「이 계약이 살아 있나」를 아무도
 * 안 봤다 — 계약파기로 중단한 현장(인천 에코메트로 타워 A동)의 영업비 1차가
 * 「지급 가능」으로 서 있었고, 체크해 가확정하면 서버도 안 막았다. 프로덕션에서
 * 그렇게 나간 280만원이 회수 대상이 됐다.
 */
describe('workOf — 계약중단 현장은 지급하지 않는다', () => {
  const row = (over: Partial<PayoutRowInput> = {}): PayoutRowInput => ({
    key: 'p|영업비', projectId: 'p', projectName: '시험현장', cpo: '플러그링크',
    kind: '영업비', org: '엘앤에스', plan: 4_000_000, adjust: 0, adjustBy: [0, 0, 0], confirmed: 0,
    ledger: [null, null], unpriced: 0, holdState: null,
    milestones: { contractCompletedAt: '2026-07-01', installCompletedAt: null, completedAt: null },
    payoutDocsMissing: [],
    step1At: null, step2At: null, step1EntryId: null, step2EntryId: null,
    ...over,
  });

  it('조건이 다 찬 줄은 지급 가능이다 — 비교 기준', () => {
    expect(workOf(row()).state).toBe('지급 가능');
  });

  it('★계약중단이면 조건이 다 차도 막힌다★', () => {
    const w = workOf(row({ holdState: '계약중단' }));
    expect(w.state).toBe('조건 대기');
    expect(w.open).toBeNull();
    expect(w.blockers).toEqual(['계약중단 — 지급 불가']);
  });

  it('막는 이유를 그 자리에 적는다 — 단가·서류가 아니라 중단이라고 말한다', () => {
    const w = workOf(row({ holdState: '계약중단', unpriced: 2 }));
    expect(w.blockers).toEqual(['계약중단 — 지급 불가']);
  });

  it('이미 나간 지급은 그대로 둔다 — 원장은 사실의 기록이고, 되받는 것은 「회수」다', () => {
    const w = workOf(row({ holdState: '계약중단', confirmed: 2_800_000 }));
    expect(w.confirmed).toBe(2_800_000);
    expect(w.state).toBe('조건 대기');
  });
});

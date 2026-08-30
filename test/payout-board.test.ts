/**
 * 배치와 지급일 — 세금계산서 한 장, 거래명세서 한 장의 단위.
 *
 * ★상태 판정이 어긋나면 협력사가 옛 지급마다 계산서를 다시 발행하려 든다★ —
 * 「가확정」은 지급일 전에만 뜻이 있는 신호다.
 */
import { describe, expect, it } from 'vitest';
import { batchKey, batchStateOf, canAttachInvoice, payDateChoices, workGroupOf } from '@/lib/payout-board';

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
      .toBe('채울 것 있음');
    expect(workGroupOf({ state: '조건 대기', blockers: ['단가 미지정 1건 — 지급 금액 확정 불가'] }))
      .toBe('채울 것 있음');
  });

  it('공정 마일스톤은 기다리는 것이다 — 사람이 당길 수 없다', () => {
    for (const b of ['설치완료 대기', '개통완료 대기', '계약완료 대기']) {
      expect(workGroupOf({ state: '조건 대기', blockers: [b] })).toBe('공정 대기');
    }
  });

  it('둘이 섞이면 ★채울 것★이 이긴다 — 할 일이 있는 줄을 놓치지 않는다', () => {
    expect(workGroupOf({
      state: '조건 대기',
      blockers: ['설치완료 대기', '지급조건 서류 미달: 사전현장컨설팅 결과서'],
    })).toBe('채울 것 있음');
  });

  it('사유가 없는 조건 대기는 공정 대기다', () => {
    expect(workGroupOf({ state: '조건 대기', blockers: [] })).toBe('공정 대기');
  });

  it('나머지 상태는 그대로 간다', () => {
    expect(workGroupOf({ state: '지급 가능', blockers: [] })).toBe('지급 가능');
    expect(workGroupOf({ state: '확정 완료', blockers: [] })).toBe('확정 완료');
  });
});

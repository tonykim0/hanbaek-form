/**
 * 배치와 지급일 — 세금계산서 한 장, 거래명세서 한 장의 단위.
 *
 * ★상태 판정이 어긋나면 협력사가 옛 지급마다 계산서를 다시 발행하려 든다★ —
 * 「가확정」은 지급일 전에만 뜻이 있는 신호다.
 */
import { describe, expect, it } from 'vitest';
import { batchKey, batchStateOf, payDateChoices } from '@/lib/payout-board';

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

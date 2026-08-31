/**
 * 누구의 차례를 할 일에 세우는가 — ★권한 성격의 표라 여기서 못 박는다.★
 *
 * 화면 테스트는 넣지 않지만 이 표는 다르다: 한 줄이 바뀌면 어떤 계정이 무엇을 보는지가
 * 통째로 달라지고, 그 사실은 화면을 열어 보기 전에는 드러나지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { COURTS_OF_ROLE } from '@/lib/todo-types';

describe('할 일의 차례 — 계정 구분마다', () => {
  it('한백은 관리자와 열람 전용이 같이 본다 (한백 지시 2026-08-31)', () => {
    expect(COURTS_OF_ROLE.admin).toEqual(['한백']);
    /*
     * ★finance 계정이 여기다.★ 비워 두었던 이유는 「누를 수 없으니 차례가 아니다」였는데,
     * 이 화면은 누르는 자리가 아니라 무엇이 밀려 있나를 보는 자리다 — 재무는 지급 전에
     * 현장이 어디까지 왔는지 알아야 한다. 눈은 관리자와 같다(isHanbaek).
     */
    expect(COURTS_OF_ROLE.viewer).toEqual(['한백']);
  });

  it('협력사는 제 몫만 — 턴키업체는 양쪽 다', () => {
    expect(COURTS_OF_ROLE.sales).toEqual(['영업사']);
    expect(COURTS_OF_ROLE.cons).toEqual(['시공사']);
    expect(COURTS_OF_ROLE.salesCons).toEqual(['영업사', '시공사']);
  });

  /* 운영사는 계정이 없다 — 그 차례는 「기다리는 것」이라 아무의 할 일도 아니다 */
  it('운영사 차례를 제 할 일로 가진 계정은 없다', () => {
    for (const courts of Object.values(COURTS_OF_ROLE)) {
      expect(courts).not.toContain('운영사');
    }
  });
});

/**
 * 보드 칸 — 현장이 어느 자리에 서고, 그 자리가 누구 차례인가.
 *
 * ★차례를 저장값에서 떼어낸 자리다★ (2026-09-04). 담당(projects.court)이 여기저기서
 * 따로 찍혀 칸과 어긋났고, 그 어긋남이 할 일 개수로 드러났다(29건 중 10건).
 */
import { describe, expect, it } from 'vitest';
import { courtOfColumn } from '@/lib/board';
describe('courtOfColumn — 차례는 칸이 정한다 (2026-09-04)', () => {
  it('★한백의 계약 할 일은 둘뿐이다★ — 검토와 완료', () => {
    expect(courtOfColumn('계약검토')).toBe('한백');
    expect(courtOfColumn('계약완료')).toBe('한백');
  });

  it('모으는 중·고치는 중은 협력사 차례다', () => {
    expect(courtOfColumn('계약접수')).toBe('영업사');
    expect(courtOfColumn('계약보완')).toBe('영업사');
  });

  it('★운영사 계약서 제출은 기다리는 자리다★ — 서류를 올렸다고 한백 차례가 되지 않는다', () => {
    /*
     * 프로덕션에서 6건이 그랬다(2026-09-04): 계약이 끝난 뒤 견적서·실사보고서를 올리자
     * uploadDocument 가 담당을 한백으로 넘겨, 기다리는 현장이 할 일에 섰다.
     */
    expect(courtOfColumn('운영사 계약서 제출')).toBe('운영사');
  });

  it('공정 칸은 COURT_AFTER_STATUS 를 따른다 — 두 벌로 적지 않는다', () => {
    expect(courtOfColumn('착공')).toBe('시공사');
    expect(courtOfColumn('충전기 발주')).toBe('한백');
    expect(courtOfColumn('준공서류 접수/검토')).toBe('한백');
  });
});

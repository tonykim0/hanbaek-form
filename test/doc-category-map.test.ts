/**
 * 서류 분류의 ★결정적인 부분★ — 파일명으로 정하는 자리.
 *
 * AI 판독은 비결정적이라 테스트로 못 묶는다. 그래서 이름이 분명한 서류는 이름으로 못
 * 박고(categoryFromFileName), 그 규칙만 여기서 지킨다 — 판독이 흔들려도 이 자리는 안 흔들린다.
 */
import { describe, expect, it } from 'vitest';
import { categoryFromFileName, excelCategory, kindOfCategory } from '@/lib/doc-category-map';

describe('전기차 등록대수 확인 공문 — 기설치 설치이력 칸에 앉던 서류 (한백 2026-08-28)', () => {
  /*
   * 현대엔지니어링 접수에서 자꾸 「기설치 충전기 설치이력」으로 들어갔다. 그 칸은 환경부
   * 필수라 남의 서류가 앉으면 진짜 설치이력이 밀려난다(같은 칸이면 하나만 남는다).
   */
  const 공문 = [
    '전기차 등록대수 확인 공문.pdf',
    '전기차등록대수확인공문.pdf',
    '전기차 등록대수 확인 공문_260828.pdf',
    '[현대엔지니어링] 전기차 등록대수 확인 공문.pdf',
    '등록대수 확인 공문.pdf',
    '전기차 수량 공문.pdf',
  ];
  for (const name of 공문) {
    it(`「${name}」 → 기타`, () => {
      expect(categoryFromFileName(name)).toBe('기타');
    });
  }

  it('기타는 기타 칸으로 간다 — 매핑이 빠지면 서류가 조용히 사라진다', () => {
    expect(kindOfCategory('기타')).toBe('etc');
  });

  it('엑셀로 와도 이름이 먼저다 — 확장자 규칙(실사보고서)에 걸리지 않는다', () => {
    // 이름 규칙이 없으면 excelCategory 가 기본값으로 실사보고서를 준다
    expect(excelCategory('전기차 등록대수 확인 공문.xlsx')).toBe('실사보고서');
    expect(categoryFromFileName('전기차 등록대수 확인 공문.xlsx')).toBe('기타');
  });
});

describe('이름 규칙이 남의 서류를 삼키지 않는다', () => {
  const 남 = [
    '기설치 충전기 설치이력.xlsx',
    '기설치 현황.pdf',
    '계약서.pdf',
    '별지2 사전체크리스트.pdf',
    '실사보고서.xlsx',
    'SK 자체투자 견적서.xlsx',
    // 충전기 대수를 말하는 서류 — 「등록대수」가 아니다
    '충전기 설치대수 확인.pdf',
  ];
  for (const name of 남) {
    it(`「${name}」 는 이름 규칙에 안 걸린다`, () => {
      expect(categoryFromFileName(name)).toBeNull();
    });
  }
});

describe('엑셀 세 종 가르기 — 같이 올려도 하나가 사라지지 않게', () => {
  it('견적서를 먼저 본다', () => {
    expect(excelCategory('SK일렉링크 견적서.xlsx')).toBe('견적서');
  });
  it('설치이력', () => {
    expect(excelCategory('기설치 충전기 설치이력.xlsx')).toBe('기설치 충전기 설치이력');
  });
  it('애매하면 실사보고서 — 칸이 비면 접수가 영구히 막힌다', () => {
    expect(excelCategory('무제.xlsx')).toBe('실사보고서');
  });
});

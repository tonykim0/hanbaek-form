/**
 * 서류 분류의 ★결정적인 부분★ — 파일명으로 정하는 자리.
 *
 * AI 판독은 비결정적이라 테스트로 못 묶는다. 그래서 이름이 분명한 서류는 이름으로 못
 * 박고(categoryFromFileName), 그 규칙만 여기서 지킨다 — 판독이 흔들려도 이 자리는 안 흔들린다.
 */
import { describe, expect, it } from 'vitest';
import { categoryFromFileName, excelCategory, kindOfCategory } from '@/lib/doc-category-map';
import { buildStandardName } from '@/lib/files';

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

/*
 * 「기타」로 떨어진 서류가 무엇인지는 ★이름이 유일하게 말하는 자리다★ (한백 2026-08-31).
 * 스무 카테고리는 이름이 곧 내용이지만 기타는 「그 스무 개가 아니다」는 말뿐이라,
 * {현장명}_기타.pdf 로만 남으면 열어 보기 전에는 알 수 없다.
 */
describe('표준 파일명 — 기타에만 제목을 싣는다', () => {
  it('기타는 제목을 뒤에 붙인다', () => {
    expect(buildStandardName('전남 무안 전남개발공사', '기타', 'pdf', '전기차 등록대수 확인 공문'))
      .toBe('전남 무안 전남개발공사_기타_전기차 등록대수 확인 공문.pdf');
  });

  it('제목이 없으면 그냥 기타다 — 없는 것을 지어내지 않는다', () => {
    expect(buildStandardName('율현마을', '기타')).toBe('율현마을_기타.pdf');
    expect(buildStandardName('율현마을', '기타', 'pdf', '   ')).toBe('율현마을_기타.pdf');
  });

  /* 나머지 스무 개는 이름이 곧 내용이라 제목이 붙으면 오히려 길어지기만 한다 */
  it('기타가 아니면 제목을 붙이지 않는다', () => {
    expect(buildStandardName('율현마을', '계약서', 'pdf', '전기차 충전시설 설치·운영 계약서'))
      .toBe('율현마을_계약서.pdf');
  });

  it('파일명에 못 쓰는 글자와 줄바꿈은 걷고, 긴 제목은 자른다', () => {
    expect(buildStandardName('율현마을', '기타', 'pdf', '협조\n요청/공문'))
      .toBe('율현마을_기타_협조 요청_공문.pdf');
    const long = '가'.repeat(60);
    expect(buildStandardName('율현마을', '기타', 'pdf', long))
      .toBe(`율현마을_기타_${'가'.repeat(40)}.pdf`);
  });
});

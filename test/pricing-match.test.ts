/**
 * 단가 케이스 — 축으로 후보를 좁히고, 저장 전에 앞뒤를 본다.
 *
 * ★케이스는 라인이 참조하면 불변이고 삭제도 안 된다★ — 잘못 만든 케이스는 중지 말고는
 * 치울 길이 없다. 그래서 저장 전 검증이 유일한 방어다.
 */
import { describe, expect, it } from 'vitest';
import { checkPricingRule, matchingRules, pricingRuleId, startKey } from '@/lib/pricing-match';
import { powerTypesOfRepl, replLabel, SPLITS_SELF_REPL } from '@/types/project';
import type { NewPricingRule, PricingRule } from '@/types/project';

const 케이스 = (o: Partial<PricingRule>): PricingRule => ({
  id: 'x', caseName: 'x', cpo: '에버온', bizType: '환경부', powerType: '모자분리',
  termYears: [5], bldgTypes: ['공동주택'], replType: '환경부 신규', channel: '턴키',
  bizYear: 2026, startDate: '2026년 7월 1일', salesUnit: 1_000_000, consUnit: 1_000_000,
  margin: 200_000, active: true, ...o,
}) as PricingRule;

const 새케이스 = (o: Partial<NewPricingRule>): NewPricingRule => ({
  caseName: '시험', cpo: '에버온', bizType: '환경부', powerType: '모자분리',
  termYears: [5], bldgTypes: ['공동주택'], replType: '환경부 신규', channel: '턴키',
  bizYear: 2026, startDate: '2026년 7월 1일', salesUnit: 1_000_000, consUnit: 1_000_000,
  margin: 200_000, supervisionBearer: null, safetyFeeBearer: null, supplyItems: null,
  promo: null, promoExtend: null, chargeRate: null, installTerms: null, otherSupport: null,
  coexistTerms: null, miscTerms: null, note: null, settlementSteps: [], ...o,
}) as NewPricingRule;

describe('matchingRules — 축으로 좁힌다', () => {
  const all = [
    케이스({ id: 'a', powerType: '모자분리' }),
    케이스({ id: 'b', powerType: '한전불입' }),
    케이스({ id: 'c', cpo: '나이스인프라' }),
    케이스({ id: 'd', active: false }),
  ];
  const 현장 = { cpo: '에버온' as const, bizType: '환경부' as const, replType: null, bldgType: '공동주택' as const };

  it('운영사가 다르면 후보에도 안 든다', () => {
    const { exact, others } = matchingRules(현장, { termYears: 5, powerType: '모자분리', replType: '환경부 신규' }, all);
    expect(exact.map((r) => r.id)).toEqual(['a']);
    expect(others.map((r) => r.id)).not.toContain('c');
  });

  it('★중지된 케이스는 새로 못 붙는다★', () => {
    const { exact, others } = matchingRules(현장, { termYears: 5, powerType: '모자분리', replType: '환경부 신규' }, all);
    expect([...exact, ...others].map((r) => r.id)).not.toContain('d');
  });

  it('수전방식이 비면 그 축을 건너뛴다 — 혼용 현장이 그렇다', () => {
    const { exact, usedAxes } = matchingRules(현장, { termYears: 5, powerType: null, replType: '환경부 신규' }, all);
    expect(exact.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(usedAxes).not.toContain('수전방식');
  });

  it('무엇으로 좁혔는지 알려준다 — 사람이 판단할 수 있게', () => {
    const { usedAxes } = matchingRules(현장, { termYears: 5, powerType: '모자분리', replType: '환경부 신규' }, all);
    expect(usedAxes).toEqual(['운영사', '계약연수', '사업구분', '수전방식', '교체유형', '건축물유형']);
  });
});

describe('pricingRuleId — 축에서 만든다', () => {
  it('같은 축이면 같은 id 를 노린다 — 겹치면 번호가 붙는다', () => {
    const r = 새케이스({});
    const first = pricingRuleId(r, new Set());
    expect(pricingRuleId(r, new Set([first]))).toBe(`${first}-2`);
  });

  it('수전방식·교체유형이 id 에 드러난다', () => {
    expect(pricingRuleId(새케이스({ powerType: '한전불입' }), new Set())).toContain('kepco');
    expect(pricingRuleId(새케이스({}), new Set())).toContain('mother');
  });
});

describe('checkPricingRule — 저장 전 검산', () => {
  it('제대로 된 케이스는 통과', () => {
    expect(checkPricingRule(새케이스({}))).toEqual([]);
  });

  it('★받는 단가가 0원인 케이스는 만들 수 없다★', () => {
    expect(checkPricingRule(새케이스({ salesUnit: 0, consUnit: 0, margin: 0 })).join())
      .toMatch(/0 ?원/);
  });

  it('교체유형과 사업구분이 어긋나면 막는다 — 어느 현장에도 안 맞는 케이스가 된다', () => {
    expect(checkPricingRule(새케이스({ replType: '자체투자 (제자리교체)', bizType: '환경부' })).join())
      .toMatch(/사업구분/);
  });

  it('연동은 모자분리 전제다 — 한전불입 연동은 설 자리가 없다', () => {
    expect(checkPricingRule(새케이스({ replType: '연동', bizType: '연동', powerType: '한전불입' })).join())
      .toMatch(/모자분리/);
  });

  /* 한전불입금은 보조사업에서 운영사가 대주는 돈이다 — 제 돈으로 까는 투자사업에는
     그 자리가 없고, 해주는 운영사도 없다(한백 2026-08-30) */
  it.each(['자체투자 (제자리교체)', '자체투자 (신규위치)'] as const)(
    '%s 도 모자분리만이다 — 한전불입을 해주는 운영사가 없다',
    (replType) => {
      expect(checkPricingRule(새케이스({ replType, bizType: '자체투자', powerType: '한전불입' })).join())
        .toMatch(/모자분리/);
      expect(checkPricingRule(새케이스({ replType, bizType: '자체투자', powerType: '모자분리' })))
        .toEqual([]);
    }
  );

  it('한전불입이 붙는 것은 환경부 신규뿐이다', () => {
    expect(powerTypesOfRepl('환경부 신규')).toContain('한전불입');
    for (const r of ['자체투자 (제자리교체)', '자체투자 (신규위치)', '연동'] as const) {
      expect(powerTypesOfRepl(r)).toEqual(['모자분리']);
    }
  });

  it('기성 단계 합이 받는 단가와 다르면 막는다', () => {
    const bad = 새케이스({
      settlementSteps: [{ trigger: '착공', basis: { kind: '고정', unit: 100 } }],
    });
    expect(checkPricingRule(bad).join()).toMatch(/기성 단계 합/);
  });

  it('운영사 이름에 오타(뒤 공백)가 있으면 막는다 — 문자열 완전 일치라 어느 라인에도 안 맞는다', () => {
    expect(checkPricingRule(새케이스({ cpo: '에버온 ' as never })).join()).toMatch(/운영사/);
  });
});

describe('replLabel — 교체유형을 안 가르는 운영사', () => {
  it('에버온·SK 만 제자리교체·신규위치를 가른다', () => {
    expect(SPLITS_SELF_REPL.has('에버온')).toBe(true);
    expect(SPLITS_SELF_REPL.has('SK일렉링크')).toBe(true);
    expect(SPLITS_SELF_REPL.has('나이스인프라')).toBe(false);
  });

  it('★안 가르는 운영사는 「자체투자」 한 마디다★', () => {
    expect(replLabel('나이스인프라', '자체투자 (제자리교체)')).toBe('자체투자');
    expect(replLabel('현대엔지니어링', '자체투자 (신규위치)')).toBe('자체투자');
  });

  it('가르는 운영사는 괄호를 그대로 둔다', () => {
    expect(replLabel('에버온', '자체투자 (제자리교체)')).toBe('자체투자 (제자리교체)');
  });

  it('환경부 신규는 어느 운영사든 그대로다', () => {
    expect(replLabel('나이스인프라', '환경부 신규')).toBe('환경부 신규');
  });
});

describe('startKey — 적용 시작을 견줄 수 있는 값으로', () => {
  /*
   * 플러그링크 하반기는 「2026년 7월 1일 ~ 8월 31일」처럼 끝까지 적는다(한백 2026-09-06).
   * 정렬·시기 탭·중복 판정이 전부 이 키를 보므로, 범위 표기가 앞 날짜로 읽히지 않으면
   * 케이스가 상반기 탭으로 옮겨 가거나 매트릭스에서 사라진다.
   */
  it('범위 표기는 앞 날짜로 읽는다 — 시기 목록·정렬이 그 값으로 선다', () => {
    expect(startKey({ startDate: '2026년 7월 1일 ~ 8월 31일', bizYear: 2026 })).toBe('2026-07-01');
  });
  it('연도가 빠진 표기는 못 읽는다 — 그래서 연도를 뺀 「7월 1일 ~ 8월 31일」로는 저장하지 않는다', () => {
    expect(startKey({ startDate: '7월 1일 ~ 8월 31일', bizYear: 2026 })).toBe('2026-00-00');
  });
  it('시기 목록은 이 키로 정렬된다 — 상반기가 위, 하반기가 아래', () => {
    const dates = ['2026년 7월 1일 ~ 8월 31일', '2026년 1월 20일'];
    const sorted = [...dates].sort((a, b) =>
      startKey({ startDate: a, bizYear: 0 }).localeCompare(startKey({ startDate: b, bizYear: 0 })));
    expect(sorted).toEqual(['2026년 1월 20일', '2026년 7월 1일 ~ 8월 31일']);
  });
  it('날짜·반기·ISO 표기가 같은 축에서 견줘진다', () => {
    expect(startKey({ startDate: '2026년 1월 20일', bizYear: 2026 })).toBe('2026-01-20');
    expect(startKey({ startDate: '2026년 하반기', bizYear: 2026 })).toBe('2026-07-00');
    expect(startKey({ startDate: '2026-08-22', bizYear: 2026 })).toBe('2026-08-22');
  });
});

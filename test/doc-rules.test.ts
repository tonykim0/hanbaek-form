/**
 * 서류 규칙 — 무엇을 받고, 그 현장에 그것이 필요한가.
 *
 * ★「없음」과 「해당없음」은 다른 값이다★ — 빠뜨린 것과 원래 안 내는 것을 같은 칸에 두면
 * 독촉할 곳을 못 찾는다(화면 규칙 10).
 */
import { describe, expect, it } from 'vitest';
import { evaluateDocs, PROCESS_DOCS, processDocsFor, type DocContext } from '@/lib/doc-rules';
import { ALL_DOC_KEYS, isKnownDocKind } from '@/lib/data/assemble';

const 준공서류 = ['completeConfirm', 'costSurvey', 'safety', 'safetyMgr', 'useInspect', 'asBuilt'] as const;

describe('processDocsFor — 조건부 서류', () => {
  it('★전기안전관리자 선임신고증명서는 한전불입 현장만★', () => {
    const names = (power: string | null) =>
      processDocsFor(준공서류, { powerType: power as never, bizType: '환경부' }).map((d) => d.name);

    expect(names('한전불입')).toContain('전기안전관리자 선임신고증명서');
    expect(names('모자분리')).not.toContain('전기안전관리자 선임신고증명서');
  });

  it('혼용도 한전불입을 쓰므로 낸다', () => {
    const names = processDocsFor(준공서류, { powerType: '한전불입+모자분리', bizType: '환경부' })
      .map((d) => d.name);
    expect(names).toContain('전기안전관리자 선임신고증명서');
  });

  it('수전방식을 모르면 조건부 서류를 내밀지 않는다 — 안 낼 서류를 내라고 하지 않는다', () => {
    expect(processDocsFor(준공서류, { powerType: null, bizType: null })).toHaveLength(5);
  });

  it('조건이 없는 서류는 늘 받는다', () => {
    const names = processDocsFor(['photoDone', 'installReport'], { powerType: null, bizType: null })
      .map((d) => d.name);
    expect(names).toEqual(['설치완료사진', '설치완료보고서']);
  });

  it('적은 순서대로 나온다 — 화면이 그 순서로 그린다', () => {
    const keys = processDocsFor(['asBuilt', 'completeConfirm'], { powerType: null, bizType: null })
      .map((d) => d.key);
    expect(keys).toEqual(['asBuilt', 'completeConfirm']);
  });
});

describe('PROCESS_DOCS — 종류 목록', () => {
  it('키가 겹치지 않는다 — 겹치면 한 칸에 두 서류가 앉는다', () => {
    const keys = PROCESS_DOCS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('이름이 비어 있는 종류가 없다', () => {
    for (const d of PROCESS_DOCS) expect(d.name.trim(), d.key).not.toBe('');
  });
});

describe('견적서 (SK) — SK일렉링크 전체 필수 (한백 지시 2026-09-03)', () => {
  const ctx = (over: Partial<DocContext>): DocContext => ({
    cpo: null, contractParty: null, bldgType: null,
    hasMotherSeparation: false, preInstall: '없음', bizType: null,
    ...over,
  });
  const quoteReq = (c: DocContext) => evaluateDocs(c).find((d) => d.key === 'quote')!.req;

  it('SK 는 사업구분과 무관하게 필수다 — 자체투자만이던 것을 넓혔다', () => {
    expect(quoteReq(ctx({ cpo: 'SK일렉링크', bizType: '자체투자' }))).toBe('m');
    expect(quoteReq(ctx({ cpo: 'SK일렉링크', bizType: '환경부' }))).toBe('m');
    expect(quoteReq(ctx({ cpo: 'SK일렉링크', bizType: null }))).toBe('m');
  });

  it('다른 운영사·미지정은 선택 — 모르는 운영사에게 SK 서류를 요구하지 않는다', () => {
    expect(quoteReq(ctx({ cpo: '플러그링크' }))).toBe('o');
    expect(quoteReq(ctx({ cpo: null, bizType: '자체투자' }))).toBe('o');
  });
});

/*
 * ★서류 종류 목록은 한 벌이다★ (감사 2026-09-04 H6).
 *
 * 같은 목록이 두 곳에 있었다 — 정의(SPECS)와 lib/data/assemble 의 손으로 적은 ALL_DOC_KEYS.
 * 「SPECS 와 맞춰 둔다」는 주석이 달려 있었지만 실제로는 안 맞았다: 설치승낙서를 정의에
 * 더했을 때 그쪽이 안 따라왔고, 그 서류는 ★칸은 서는데 올릴 수가 없었다★ — 올리기·빼기가
 * 전부 「서류 종류가 올바르지 않습니다」로 막혔다(isKnownDocKind). 프로덕션에 그 종류의
 * 행이 0개였던 이유다. 이제 뽑아 쓰지만, 누가 다시 손으로 적으면 여기서 걸린다.
 */
describe('서류 종류 목록 — 정의와 저장소가 같은 것을 본다', () => {
  const ctx: DocContext = {
    cpo: null, contractParty: null, bldgType: null,
    hasMotherSeparation: false, preInstall: '없음', bizType: null,
  };

  it('★화면에 서는 칸은 전부 올릴 수 있다★', () => {
    for (const d of evaluateDocs(ctx)) {
      expect(isKnownDocKind(d.key), `${d.key} 를 올릴 수 없다`).toBe(true);
    }
  });

  it('설치승낙서가 그 목록에 있다 — 빠져 있던 자리다', () => {
    expect(ALL_DOC_KEYS).toContain('installConsent');
    expect(isKnownDocKind('installConsent')).toBe(true);
  });

  it('공정 서류도 아는 이름이다 — 두 표가 갈려 있어도 문은 하나다', () => {
    for (const d of PROCESS_DOCS) {
      expect(isKnownDocKind(d.key), d.key).toBe(true);
    }
  });

  it('모르는 이름은 막는다 — 경로 조작을 여기서 거른다', () => {
    expect(isKnownDocKind('../../etc/passwd')).toBe(false);
    expect(isKnownDocKind('')).toBe(false);
  });

  it('목록에 빈 이름이나 중복이 없다', () => {
    expect(ALL_DOC_KEYS.filter((k) => !k.trim())).toEqual([]);
    expect(new Set(ALL_DOC_KEYS).size).toBe(ALL_DOC_KEYS.length);
  });
});

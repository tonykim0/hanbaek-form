/**
 * 서류 규칙 — 무엇을 받고, 그 현장에 그것이 필요한가.
 *
 * ★「없음」과 「해당없음」은 다른 값이다★ — 빠뜨린 것과 원래 안 내는 것을 같은 칸에 두면
 * 독촉할 곳을 못 찾는다(화면 규칙 10).
 */
import { describe, expect, it } from 'vitest';
import { PROCESS_DOCS, processDocsFor } from '@/lib/doc-rules';

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

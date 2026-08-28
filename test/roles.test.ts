/**
 * 권한 — 눈(무엇을 보나)과 손(무엇을 바꾸나)이 따로다.
 *
 * ★여기가 틀리면 원가·마진이 협력사 브라우저로 나간다★ — 화면에서 가리는 것으로는 부족해서
 * 저장소가 이 판정으로 지운다(redactForViewer). 조합마다 못 박아 둔다.
 */
import { describe, expect, it } from 'vitest';
import {
  canAccessProject, canWrite, effectiveVisibility, isHanbaek, normalizeOrg, visibilityOf,
} from '@/lib/roles';

const 현장 = { salesOrg: '에코일렉', gcOrg: '대광이브이' };

describe('isHanbaek — 전 현장·원가를 보는 눈', () => {
  it('관리자와 열람 전용만 한백의 눈이다', () => {
    expect(isHanbaek('admin')).toBe(true);
    expect(isHanbaek('viewer')).toBe(true);
    expect(isHanbaek('salesCons')).toBe(false);
    expect(isHanbaek('cons')).toBe(false);
    expect(isHanbaek('sales')).toBe(false);
  });
});

describe('canWrite — 손', () => {
  it('열람 전용만 못 쓴다', () => {
    expect(canWrite('viewer')).toBe(false);
    expect(canWrite('admin')).toBe(true);
    expect(canWrite('sales')).toBe(true);
  });
});

describe('visibilityOf — 구분이 보는 것', () => {
  it('원가·마진은 한백만 본다', () => {
    expect(visibilityOf('admin').cost).toBe(true);
    expect(visibilityOf('viewer').cost).toBe(true);
    expect(visibilityOf('salesCons').cost).toBe(false);
    expect(visibilityOf('cons').cost).toBe(false);
    expect(visibilityOf('sales').cost).toBe(false);
  });

  it('영업사는 영업비만, 시공사는 시공비만', () => {
    expect(visibilityOf('sales')).toMatchObject({ sales: true, cons: false });
    expect(visibilityOf('cons')).toMatchObject({ sales: false, cons: true });
    expect(visibilityOf('salesCons')).toMatchObject({ sales: true, cons: true });
  });
});

describe('effectiveVisibility — 구분 × 그 현장의 소속', () => {
  it('한백은 소속과 무관하게 전부 본다', () => {
    expect(effectiveVisibility('admin', null, 현장)).toMatchObject({ sales: true, cons: true, cost: true });
  });

  it('★남의 현장은 아무것도 안 보인다★ — 소속이 안 맞으면 둘 다 false', () => {
    expect(effectiveVisibility('salesCons', '차저스랩', 현장)).toMatchObject({ sales: false, cons: false });
  });

  it('영업사는 자기가 영업한 현장의 영업비만 본다', () => {
    expect(effectiveVisibility('sales', '에코일렉', 현장)).toMatchObject({ sales: true, cons: false });
  });

  it('시공사는 자기가 시공하는 현장의 시공비만 본다', () => {
    expect(effectiveVisibility('cons', '대광이브이', 현장)).toMatchObject({ sales: false, cons: true });
  });

  it('턴키업체가 한쪽만 맡았으면 그쪽만 보인다', () => {
    expect(effectiveVisibility('salesCons', '에코일렉', 현장)).toMatchObject({ sales: true, cons: false });
  });

  it('소속이 없으면(열람 전용이 아닌 협력사) 아무것도 안 보인다', () => {
    expect(effectiveVisibility('sales', null, 현장)).toMatchObject({ sales: false, cons: false });
  });
});

describe('canAccessProject — 이 현장이 내 현장인가', () => {
  it('영업사·시공사 어느 쪽으로든 걸리면 본다', () => {
    expect(canAccessProject('sales', '에코일렉', 현장)).toBe(true);
    expect(canAccessProject('cons', '대광이브이', 현장)).toBe(true);
  });

  it('★소속이 없으면 한 건도 못 본다★ (열람 전용은 예외 — 위에서 걸러진다)', () => {
    expect(canAccessProject('sales', null, 현장)).toBe(false);
  });

  it('열람 전용은 소속이 없어도 전부 본다', () => {
    expect(canAccessProject('viewer', null, 현장)).toBe(true);
  });
});

describe('normalizeOrg — 소속 문자열이 접근 키다', () => {
  it('앞뒤 공백을 지운다', () => {
    expect(normalizeOrg('  에코일렉 ')).toBe('에코일렉');
  });

  it('★눈에 안 보이는 문자를 걷는다★ — 메일·엑셀에서 붙여 넣으면 섞여 온다', () => {
    expect(normalizeOrg('에코일렉 ')).toBe('에코일렉');
    expect(normalizeOrg('에코​일렉')).toBe('에코일렉');
  });

  it('빈 값은 null 이다 — 빈 문자열이 소속으로 남으면 남의 현장에 걸린다', () => {
    expect(normalizeOrg('   ')).toBeNull();
    expect(normalizeOrg(null)).toBeNull();
  });
});

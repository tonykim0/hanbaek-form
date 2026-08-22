/**
 * 역할·권한 — SYSTEM_ARCHITECTURE §5.
 *
 * 권한은 화면을 따로 만드는 방식이 아니라, 같은 화면에서 열이 사라지는 방식으로 건다.
 * 원가·마진·기성은 모든 협력사에게 숨긴다. 한백만 본다.
 *
 * ★축이 둘이다 — 「무엇을 보는가」와 「바꿀 수 있는가」.★
 * 예전에는 축이 하나였다: admin 이면 다 보고 다 바꿨고, 아니면 협력사였다. 그래서
 * `role === 'admin'` 한 줄이 두 가지 뜻으로 쓰였다 — 어떤 자리에서는 「전 현장·원가를
 * 보는 눈」이고, 어떤 자리에서는 「이 값을 쓸 수 있는 손」이었다. 열람 전용이 생기면서
 * 둘이 갈린다. 그 자리가 눈인지 손인지에 따라 아래 둘 중 하나를 쓴다:
 *
 *   isHanbaek(role)  눈  — 전 현장·원가·마진·기성을 본다 (관리자 · 열람 전용)
 *   canWrite(role)   손  — 무엇이든 바꾼다 (열람 전용만 못 한다)
 *
 * 「admin 인가」를 그대로 묻는 자리는 남는다 — 한백만 하는 쓰기(검수·계약 확인·지급 확정)다.
 * 그건 눈이 아니라 손이라서 열람 전용에게 열리면 안 된다.
 */
export type Role = 'admin' | 'viewer' | 'salesCons' | 'cons' | 'sales';

export const ROLE_LABEL: Record<Role, string> = {
  admin: '한백 관리자',
  // 한백의 눈이지만 손이 없다 — 전부 보되 아무것도 바꾸지 못한다
  viewer: '열람 전용',
  // 한백이 부르는 이름이 「턴키업체」다 — 화면 용어를 실무 용어에 맞춘다
  salesCons: '턴키업체',
  cons: '시공사',
  sales: '영업사',
};

/**
 * 한백의 눈인가 — 전 현장을 보고 원가·마진·기성까지 본다.
 *
 * 소속(org)으로 현장을 가르지 않는 쪽이다. 열람 전용은 소속이 없다(null) — 소속이 없는
 * 협력사 계정은 볼 현장이 하나도 없지만, 열람 전용은 반대로 전부 본다. 그래서 소속을
 * 보기 전에 이것부터 묻는 순서를 지킨다.
 */
export function isHanbaek(role: Role): boolean {
  return role === 'admin' || role === 'viewer';
}

/**
 * 바꿀 수 있는가 — 열람 전용만 못 한다.
 *
 * 판정의 정본은 서버다(lib/api/write-route 가 모든 쓰기 앞에서 막는다). 화면은 이걸로
 * 「눌리지 않게」만 한다 — 못 하는 일이 눌리는 채로 있으면 눌러 보고 실패로 배운다.
 */
export function canWrite(role: Role): boolean {
  return role !== 'viewer';
}

export interface Visibility {
  /** 영업비 */
  sales: boolean;
  /** 시공비 */
  cons: boolean;
  /** 원가·마진·턴키·기성 — 한백 전용 */
  cost: boolean;
}

export function visibilityOf(role: Role): Visibility {
  switch (role) {
    case 'admin':
    // 열람 전용은 관리자와 같은 것을 본다 — 다른 것은 쓰기뿐이다
    case 'viewer':
      return { sales: true, cons: true, cost: true };
    case 'salesCons':
      return { sales: true, cons: true, cost: false };
    case 'cons':
      return { sales: false, cons: true, cost: false };
    case 'sales':
      return { sales: true, cons: false, cost: false };
  }
}

/**
 * 실제 화면에 적용되는 가시성.
 *
 * 계정 역할만으로 정하지 않는다. 겸업사라도 그 현장에서 시공만 맡았으면 영업비는 안 보인다.
 * 즉 「계정이 가진 권한」과 「그 현장에서의 실제 참여」의 교집합이다.
 */
export function effectiveVisibility(
  role: Role,
  org: string | null,
  project: { salesOrg: string | null; gcOrg: string | null }
): Visibility {
  const base = visibilityOf(role);
  if (isHanbaek(role)) return base;
  return {
    sales: base.sales && org !== null && org === project.salesOrg,
    cons: base.cons && org !== null && org === project.gcOrg,
    cost: false,
  };
}

/** 이 현장이 이 협력사의 현장인가 */
export function canAccessProject(
  role: Role,
  org: string | null,
  project: { salesOrg: string | null; gcOrg: string | null }
): boolean {
  if (isHanbaek(role)) return true;
  if (!org) return false;
  return org === project.salesOrg || org === project.gcOrg;
}

/**
 * 소속 이름 다듬기.
 *
 * 이 문자열은 접근 키다 — 협력사가 자기 현장을 보는 판정이 문자열 일치다(canAccessProject).
 * 메일이나 엑셀에서 복사해 붙이면 눈에 안 보이는 문자가 섞여 들어온다:
 *   NBSP(U+00A0) · 전각 공백(U+3000) · 제로폭 문자 · 조합형/완성형 차이(NFC)
 * 그대로 저장하면 화면에는 「에코일렉」으로 똑같이 보이는데 그 계정에는 안 보인다.
 *
 * 안쪽 공백은 지우지 않고 하나로만 줄인다 — 「한백 이엔지」처럼 진짜 띄어쓰기가 있다.
 */
export function normalizeOrg(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const cleaned = v
    .normalize('NFC')
    .replace(/[​-‍﻿]/g, '')      // 제로폭
    .replace(/[ 　\s]+/g, ' ')          // NBSP·전각공백·연속공백 → 한 칸
    .trim();
  return cleaned === '' ? null : cleaned;
}

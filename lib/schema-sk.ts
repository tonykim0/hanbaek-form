/**
 * SK (SK일렉링크) schema — form data, SDT maps, and text replacements.
 * Reuses the same 67 SDT IDs from HEC (별지5호 + 개인정보 + 별지7호).
 */

import {
  HecFormData,
  buildHecSdtMaps,
  SdtMaps,
} from './schema-hec';

export type SkFormData = Omit<
  HecFormData,
  'siteManager' | 'parkingSlotsSlow' | 'evCount'
>;

export function buildSkSdtMaps(form: SkFormData): SdtMaps {
  return buildHecSdtMaps(form as HecFormData);
}

export interface TextReplacement {
  find: string;
  replace: string;
}

export function buildSkTextReplacements(form: SkFormData): TextReplacement[] {
  const dateStr = `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`;

  const term10 = form.contractTerm === '10' ? '■' : '□';
  const term7 = form.contractTerm === '7' ? '■' : '□';

  return [
    // 계약기간 toggle
    {
      find: '충전기 서비스 시작일로부터 □ 10년, □ 7년',
      replace: `충전기 서비스 시작일로부터 ${term10} 10년, ${term7} 7년`,
    },
    // 충전기 종류 — BAS1007.D1.1 항상 체크
    {
      find: '□ BAS1007.D1.1(스마트완속충전기),',
      replace: '■ BAS1007.D1.1(스마트완속충전기),',
    },
    // 계약일
    {
      find: '계약일\u00a0 2026년\u00a0\u00a0\u00a0\u00a0 월\u00a0\u00a0\u00a0\u00a0 일',
      replace: `계약일\u00a0 ${dateStr}`,
    },
    // 별지 7호 "실외,3" → "실외,지상"
    {
      find: '☐실외,3',
      replace: '☐실외,지상',
    },
  ];
}

/** Header table labels (Table 0 서비스이용자 block). */
export function buildSkHeaderTableMap(form: SkFormData): Record<string, string> {
  return {
    '상 호': form.custName,
    '사업자등록번호': form.custBizId,
    '전화번호': form.custTel,
    '이메일': form.custEmail,
    '주 소': form.custAddr,
    '수 량': form.installQty,
  };
}

/**
 * Labels used in the 직인 동의서 table (Table 3) — label cells at index 0,
 * value cells at index 1 (empty).
 */
export function buildSkSealConsentMap(form: SkFormData): Record<string, string> {
  return {
    '신청자(건물)명': form.custName,
    '주소': form.custAddr,
    '대표자': form.custRepresentative,
  };
}

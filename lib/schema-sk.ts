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

// 계약서 본문 SDT (SK 템플릿에 주입) — 텍스트 치환 대체
const SK_CONTRACT_TERM_ID = '900000051'; // 계약기간 '□ 10년, □ 7년' 토글
const SK_CONTRACT_DATE_ID = '900000052'; // 계약일 날짜

export function buildSkSdtMaps(form: SkFormData): SdtMaps {
  const maps = buildHecSdtMaps(form as HecFormData);
  const term10 = form.contractTerm === '10' ? '■' : '□';
  const term7 = form.contractTerm === '7' ? '■' : '□';
  maps.text[SK_CONTRACT_TERM_ID] = `${term10} 10년, ${term7} 7년`;
  maps.text[SK_CONTRACT_DATE_ID] =
    `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`;
  return maps;
}

export interface TextReplacement {
  find: string;
  replace: string;
}

export function buildSkTextReplacements(_form: SkFormData): TextReplacement[] {
  // 계약기간·계약일은 SDT(900000051/900000052)로 전환됨.
  // BAS1007.D1.1(항상 체크)은 템플릿에서 ■로 영구 수정됨.
  return [];
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

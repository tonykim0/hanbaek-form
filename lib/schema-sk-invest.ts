/**
 * SK일렉링크 자체투자 schema.
 * 계약서 + 사전현장컨설팅 결과서만 포함 (설치신청서 없음).
 * 폼 데이터 타입과 SDT 맵은 기존 SK와 동일하게 재사용.
 */

import {
  SkFormData,
  buildSkSdtMaps,
  buildSkHeaderTableMap,
  buildSkTextReplacements,
  TextReplacement,
} from './schema-sk';

export type { SkFormData as SkInvestFormData };
export { buildSkSdtMaps as buildSkInvestSdtMaps };
export { buildSkHeaderTableMap as buildSkInvestHeaderTableMap };

/**
 * 계약기간·계약일은 SDT(900000051/900000052)로 전환됨.
 * BAS1007.D1.1(항상 체크)은 템플릿에서 ■로 영구 수정됨.
 * (기존에는 멀티-run 분리로 인한 부분매칭 치환이 필요했으나 SDT로 대체)
 */
export function buildSkInvestTextReplacements(form: SkFormData): TextReplacement[] {
  return buildSkTextReplacements(form);
}

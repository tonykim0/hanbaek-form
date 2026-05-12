/**
 * SK일렉링크 자체투자 schema.
 * 계약서 + 사전현장컨설팅 결과서만 포함 (설치신청서 없음).
 * 폼 데이터 타입과 SDT 맵은 기존 SK와 동일하게 재사용.
 */

export type {
  SkFormData as SkInvestFormData,
} from './schema-sk';

export {
  buildSkSdtMaps as buildSkInvestSdtMaps,
  buildSkHeaderTableMap as buildSkInvestHeaderTableMap,
  buildSkTextReplacements as buildSkInvestTextReplacements,
} from './schema-sk';

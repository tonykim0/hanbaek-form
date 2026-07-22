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
 * 자투 템플릿은 BAS1007.D1.1 텍스트가 멀티-run으로 분리됨:
 *   "□ BAS1007.D1.1(" | "스마트완속충전기" | "),"
 * 첫 번째 노드만 단독으로 매칭해 □→■ 치환.
 */
export function buildSkInvestTextReplacements(form: SkFormData): TextReplacement[] {
  return [
    ...buildSkTextReplacements(form),
    {
      find: '□ BAS1007.D1.1(',
      replace: '■ BAS1007.D1.1(',
    },
  ];
}

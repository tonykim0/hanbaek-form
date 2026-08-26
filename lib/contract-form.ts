export const YEAR_OPTIONS = ['2025', '2026', '2027'] as const;
export const DEFAULT_YEAR = '2026';

/**
 * 운영사별 모집대행사 — 계약서 작성 화면의 기본값이자 서류 재발행에서 결과서의
 * 조사자 칸에 들어가는 값이다 (한백 지시 2026-08-26).
 *
 * ★한 곳에 모아 둔다★ — 네 페이지에 각각 적혀 있어서 재발행이 그 값을 알 길이 없었고,
 * 그래서 재발행 결과서는 협력사 원본 스캔에 적힌 조사자를 그대로 옮겨 적고 있었다.
 * 조사자는 늘 한백 쪽 사람이라 원본에서 따올 값이 아니다. 여기만 고치면 화면 기본값과
 * 재발행이 같이 바뀐다.
 */
export const SALES_DEFAULT: Record<
  'hec' | 'nice' | 'sk' | 'pluglink',
  { company: string; name: string; tel: string }
> = {
  hec: { company: '(주) 우원', name: '정용주', tel: '010-3124-0341' },
  nice: { company: '한백', name: '김정우', tel: '010-5343-9983' },
  sk: { company: '한백이엔씨', name: '류승종', tel: '010-8696-0898' },
  pluglink: { company: '한비', name: '김종혁', tel: '010-3627-7047' },
};
/**
 * 전화번호 입력 시 자동으로 하이픈(-)을 삽입한다.
 * - 15xx/16xx/18xx 대표번호: XXXX-XXXX
 * - 서울(02): 02-XXX(X)-XXXX
 * - 그 외(010/031/070 등): XXX-XXX(X)-XXXX
 * 숫자만 남기고 자리수에 따라 하이픈을 붙이므로 형식이 저절로 맞춰진다.
 */
export function formatKoreanPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  // 15xx/16xx/18xx 8자리 대표번호
  if (/^1[5-9]/.test(d)) {
    return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4, 8)}`;
  }
  // 서울 지역번호 02
  if (d.startsWith('02')) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, d.length - 4)}-${d.slice(d.length - 4)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  // 휴대폰 010 — 3-4-4
  if (d.startsWith('010')) {
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
  }
  // 그 외 (031, 070, 011 ...) — 마지막 4자리를 뒷블록으로
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(d.length - 4)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

interface BasicGenerationResult {
  filledTextCount: number;
  toggledCheckboxCount: number;
}

interface AdvancedGenerationResult {
  filledSdtText: number;
  filledSdtCheckbox: number;
  filledTextReplace: number;
  filledHeaderCells: number;
}

export function buildContractFilename(
  contractYear: string,
  documentLabel: string,
  customerName: string
): string {
  return `${contractYear}년_${documentLabel}_${sanitizeFilenamePart(customerName)}.docx`;
}

export function formatBasicSuccessMessage(
  result: BasicGenerationResult,
  filename: string
): string {
  return `생성 완료: 텍스트 ${result.filledTextCount}개 + 체크박스 ${result.toggledCheckboxCount}개 → ${filename}`;
}

export function formatAdvancedSuccessMessage(
  result: AdvancedGenerationResult,
  filename: string
): string {
  return `생성 완료: SDT ${result.filledSdtText + result.filledSdtCheckbox}개 + 텍스트 ${result.filledTextReplace}개 + 헤더 ${result.filledHeaderCells}개 → ${filename}`;
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^\w가-힣]+/g, '_');
}

export const YEAR_OPTIONS = ['2025', '2026', '2027'] as const;
export const DEFAULT_YEAR = '2026';
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

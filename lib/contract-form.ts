export const YEAR_OPTIONS = ['2025', '2026', '2027'] as const;
export const DEFAULT_YEAR = '2026';
export const PHONE_RE = /^(0\d{1,2}-\d{3,4}-\d{4}|1[5-9]\d{2}-\d{4})$/;

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

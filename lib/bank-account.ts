/**
 * 사업자등록번호·정산 계좌의 형식 — 화면과 저장소가 같은 규칙을 쓴다.
 *
 * 계좌번호는 자릿수 범위만 본다. 은행마다 세대별 형식이 여러 개라(같은 은행도
 * 10~14자리가 섞여 있다) 은행별 자릿수 검증은 맞는 계좌를 거절하는 일이 더 많다.
 * 실계좌·예금주 확인은 통장사본 대조가 정본이고, 기계 검증은 오픈뱅킹류 유료 API 의 일이다.
 */

/** 저장은 숫자 10자리, 표기는 000-00-00000 (국세청 표기) */
export function formatBizRegNo(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/**
 * 사업자등록번호 검증 — 마지막 자리가 검증 숫자다(국세청 가중치 1,3,7,1,3,7,1,5).
 * 오타(자리 바뀜·한 자리 틀림)를 접수 시점에 잡는다.
 */
export function isValidBizRegNo(digits: string): boolean {
  if (!/^\d{10}$/.test(digits)) return false;
  const key = [1, 3, 7, 1, 3, 7, 1, 5];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(digits[i]) * key[i];
  sum += Math.floor((Number(digits[8]) * 5) / 10);
  sum += (Number(digits[8]) * 5) % 10;
  return (10 - (sum % 10)) % 10 === Number(digits[9]);
}

/** 정산 계좌를 받는 은행 — 드롭다운 선택지. 없는 곳이 나타나면 여기 추가한다. */
export const BANKS = [
  'KB국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  'NH농협은행',
  'IBK기업은행',
  'SC제일은행',
  '한국씨티은행',
  '카카오뱅크',
  '케이뱅크',
  '토스뱅크',
  'KDB산업은행',
  '부산은행',
  'iM뱅크(대구)',
  '광주은행',
  '전북은행',
  '경남은행',
  '제주은행',
  '수협은행',
  '신협',
  '새마을금고',
  '우체국',
] as const;

export const ACCOUNT_DIGITS_MIN = 8;
export const ACCOUNT_DIGITS_MAX = 16;

/** 계좌번호는 숫자만 저장한다 — 하이픈 위치는 은행마다 달라 저장할 정보가 아니다 */
export function normalizeAccountNo(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidAccountNo(digits: string): boolean {
  return new RegExp(`^\\d{${ACCOUNT_DIGITS_MIN},${ACCOUNT_DIGITS_MAX}}$`).test(digits);
}

/**
 * 한국 사업자등록번호(10자리) 체크섬 검증.
 * 표준 가중치 알고리즘 — 마지막 자리가 검증 숫자.
 * 형식(3-2-5)만으로는 못 잡는 오타를 감지하기 위한 용도(경고).
 */
export function isValidKoreanBizId(raw: string): boolean {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length !== 10) return false;
  const key = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i], 10) * key[i];
  sum += Math.floor((parseInt(d[8], 10) * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(d[9], 10);
}

/** 10자리(숫자만)가 모두 입력됐는지 — 체크섬 경고를 언제 띄울지 판단용. */
export function isBizIdComplete(raw: string): boolean {
  return (raw || '').replace(/\D/g, '').length === 10;
}

/**
 * 문서 출력용 사업자등록번호 형식(3-2-5).
 * 입력값에 하이픈이 있거나 없어도 숫자 10자리를 기준으로 정규화한다.
 */
export function formatKoreanBizId(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** 입력 중 숫자 10자리까지만 받아 3-2-5 형식으로 점진적으로 표시한다. */
export function formatKoreanBizIdInput(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

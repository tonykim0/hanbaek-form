/**
 * 화면에 숫자를 적는 방식.
 *
 * 돈 표기가 네 벌 있었다(현장 상세·기성·지급·지급 명세). 천 단위 쉼표는 어디서나 같아야
 * 한다 — 한 화면에서 「12,300,000」이고 옆 화면에서 「12300000」이면 같은 값인지 매번
 * 다시 읽어야 한다.
 */

/** 천 단위 쉼표. 단위(원)는 붙이지 않는다 — 표에서는 머리글에 한 번만 적는다. */
export const won = (n: number) => n.toLocaleString('ko-KR');

/**
 * 좁은 자리(그래프 눈금·막대 위 숫자)용 압축 표기 — 1.2억 · 428만 · 5,000.
 * 표 안에서는 쓰지 않는다. 표는 자릿수를 맞춰 훑는 자리라 won() 이다.
 */
export function wonCompact(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 100_000_000) {
    const v = Math.round(abs / 10_000_000) / 10;
    return `${sign}${Number.isInteger(v) ? v.toFixed(0) : v}억`;
  }
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString('ko-KR')}만`;
  return `${sign}${abs.toLocaleString('ko-KR')}`;
}

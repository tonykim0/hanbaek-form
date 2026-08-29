/**
 * 우리 스토어의 주소인가 — 붙이기 단계의 첫 문.
 *
 * ★클라이언트가 본문에 주소를 적어 보낸다.★ 그래서 이 판정이 헐거우면 남의 서버 주소가
 * 우리 기록에 남고(한백 화면의 링크가 된다), 지울 때 그 주소가 그대로 del() 로 나간다.
 * 2026-08-30 검토에서 세금계산서 쪽이 문자열 포함 검사 하나뿐인 것이 드러나, 서류 붙이기가
 * 하던 검사를 한 곳으로 올리고 둘이 같이 쓰게 했다.
 */
import { describe, expect, it } from 'vitest';
import { ourBlobPathname } from '@/lib/intake-stage';

const OURS = 'https://abc123.public.blob.vercel-storage.com';

describe('ourBlobPathname — 우리 주소만 통과시킨다', () => {
  it('우리 호스트면 경로를 준다', () => {
    expect(ourBlobPathname(`${OURS}/tax-invoices/a.pdf`)).toBe('tax-invoices/a.pdf');
  });

  it('★남의 호스트는 막는다★ — 이것이 뚫리면 남의 서버 파일이 우리 기록의 링크가 된다', () => {
    expect(ourBlobPathname('https://evil.example/tax-invoices/a.pdf')).toBeNull();
    expect(ourBlobPathname('https://blob.vercel-storage.com.evil.example/tax-invoices/a.pdf')).toBeNull();
  });

  it('https 가 아니면 막는다', () => {
    expect(ourBlobPathname(`http://abc.public.blob.vercel-storage.com/tax-invoices/a.pdf`)).toBeNull();
  });

  it('★쿼리로 경로를 흉내 낼 수 없다★ — 경로만 보고 판정한다', () => {
    /* 「materials 파일인데 뒤에 ?x=/tax-invoices/ 를 붙여 통과」를 막는 자리다 */
    expect(ourBlobPathname(`${OURS}/materials/sk/sales/a.pdf?x=/tax-invoices/`))
      .toBe('materials/sk/sales/a.pdf');
  });

  it('한글·공백이 든 경로를 풀어 준다 — 자료실 파일 이름이 그렇다', () => {
    expect(ourBlobPathname(`${OURS}/materials/sk/sales/${encodeURIComponent('제안서 v1.9.pdf')}`))
      .toBe('materials/sk/sales/제안서 v1.9.pdf');
  });

  it('주소가 아니면 null — 던지지 않는다', () => {
    expect(ourBlobPathname('그냥 글자')).toBeNull();
    expect(ourBlobPathname('')).toBeNull();
  });
});

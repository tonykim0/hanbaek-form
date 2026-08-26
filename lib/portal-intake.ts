/**
 * 포털 접수는 닫혔다 (한백 지시 2026-08-26) — 접수는 콘솔에서만 받는다.
 *
 * ★왜 한 곳에 두는가★ 닫은 자리가 넷이다: 안내 화면·POST /api/intake·업로드 토큰
 * (/api/upload 의 intake ZIP)·포털 입구 링크. 이유와 갈 곳을 각자 적으면 한 곳만 고쳐지고,
 * 「화면은 콘솔로 보내는데 API 는 열려 있다」가 된다.
 *
 * 접수 흐름의 정본은 콘솔의 /projects/new 다 — 로그인한 소속으로 들어와 콘솔 DB 에 바로
 * 남는다. 포털 접수는 노션에 썼기 때문에(dual-write 금지) 컷오버의 관문이었고, 그 문을
 * 여기서 닫는다.
 */

/** 접수하러 갈 곳 — 배포 주소가 둘이라 환경변수로 덮을 수 있게 둔다(middleware 의 호스트 목록과 같은 방식) */
export const CONSOLE_URL = (process.env.NEXT_PUBLIC_CONSOLE_URL ?? 'https://hanbaek-ev.vercel.app')
  .replace(/\/+$/, '');

/** 닫힌 문에서 돌려주는 말 — 화면·API 가 같은 문장을 쓴다 */
export const INTAKE_CLOSED =
  '포털 접수는 닫혔습니다 — 계약 서류는 콘솔에 로그인해서 접수해주세요.';

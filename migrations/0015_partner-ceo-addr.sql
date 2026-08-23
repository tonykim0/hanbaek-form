-- 협력사의 대표자·사업장 주소 (2026-08-24)
--
-- 거래명세서에 공급자(협력사)·공급받는자(한백) 사업자 정보를 적기로 했다. 한백 쪽은
-- 코드 상수(lib/hanbaek.ts)로 두면 되지만 협력사 쪽은 업체마다 달라서 저장할 칸이
-- 필요하다 — 지금 partner_details 에는 사업자등록번호와 계좌뿐이다.
--
-- 업태·종목은 두지 않는다 (한백 확인 2026-08-24) — 이 명세서에 안 적는다.
--
-- 비워 둘 수 있다. 이 칸이 생기기 전에 적어 둔 협력사가 이미 있고, 그것들은 「아직 안 적음」이
-- 맞다. notNull + 빈 문자열 기본값으로 채우면 적은 것과 안 적은 것이 같아 보인다(화면 규칙 10번).

alter table partner_details
  add column if not exists ceo  text,
  add column if not exists addr text;

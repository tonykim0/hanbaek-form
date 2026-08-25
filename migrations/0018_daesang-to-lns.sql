-- 대상전력 → 엘앤에스(lnselec) 개명 (한백 지시 2026-08-25)
--
-- 합병으로 하나의 회사가 된다. ★개명이지 계정 합치기가 아니다★ — 엘앤에스가 될 계정은
-- 대상전력 하나뿐이다(한백 확인). 「소속당 계정이 하나」라는 전제가 그대로 유지된다.
-- 그 전제가 깨지면 거래명세서가 공급자를 못 가린다 — 배치의 org 로 계정을 찾기 때문이다
-- (app/(console)/payments/statement/page.tsx 의 partnerId).
--
-- ★org 는 외래키가 아니라 네 표에 흩어진 문자열이고, 접근 판정이 정확한 문자열 일치다★
-- (pg-store accessWhere: projects.sales_org = viewer.org). 그래서 /admin/accounts 에서
-- users.org 만 바꾸면 이 계정이 과거 현장을 전부 잃고, 확정된 배치가 미확정으로 되돌아
-- 보이고, 세금계산서 첨부가 고아가 된다. 네 표를 같이 옮겨야 한다 — 러너가 파일 하나를
-- 한 트랜잭션으로 돌리므로 여기 적힌 것은 전부 되거나 전부 안 된다.
--
-- 안 건드리는 것: audit_log.actor · documents.uploaded_by · process_documents.uploaded_by.
-- 「대상전력 박지훈(daesang)」은 그때 실제로 그 이름의 계정이 한 일이다 — 과거 기록은
-- 고치지 않는다. 접근 판정에 쓰이지 않으므로 남겨 두어도 아무것도 깨지지 않는다.
--
-- 멱등: 전부 옛 값만 WHERE 로 겨냥한다. 두 번째 실행은 0행이다.

-- ── 1. 로그인 id ───────────────────────────────────────────────
-- 현장·지급·정산은 id 를 참조하지 않는다(전부 org 문자열로 붙는다). users 와
-- partner_details 두 곳뿐이다. 비밀번호 해시는 그대로 있으니 새 id 로 같은 비밀번호로
-- 들어간다. 옛 id 의 세션은 끊긴다 — 다시 로그인해야 한다.
-- lnselec 이 이미 있으면 건드리지 않는다: PK 충돌로 배포를 깨뜨리지 않는다.
update users
set id = 'lnselec'
where id = 'daesang'
  and not exists (select 1 from users u2 where u2.id = 'lnselec');

update partner_details
set user_id = 'lnselec'
where user_id = 'daesang'
  and not exists (select 1 from partner_details p2 where p2.user_id = 'lnselec');

-- ── 2. 소속 이름 — 네 표를 같이 ────────────────────────────────
update users
set org = '엘앤에스'
where org = '대상전력';

-- 계정 이름에 업체명이 함께 적혀 있으면(「대상전력 박지훈」) 그 부분만 바꾼다.
-- 담당자 이름은 건드리지 않는다.
update users
set name = replace(name, '대상전력', '엘앤에스')
where name like '%대상전력%';

-- 이 둘이 접근 판정이다 — 빠지면 과거 현장이 안 보인다
update projects
set sales_org = '엘앤에스'
where sales_org = '대상전력';

update projects
set gc_org = '엘앤에스'
where gc_org = '대상전력';

-- 배치 키(org × 지급일 × 구분) — 빠지면 첨부가 고아가 되고 확정이 풀려 보인다
update tax_invoices
set org = '엘앤에스'
where org = '대상전력';

update batch_finals
set org = '엘앤에스'
where org = '대상전력';

-- ── 3. 지급처 정보 — 새 법인이라 비운다 ────────────────────────
-- 합병으로 사업자등록번호·대표자·계좌가 모두 바뀐다(한백 확인 2026-08-25). 옛 값을
-- 남겨 두면 지급 화면과 거래명세서가 죽은 계좌를 그대로 보여 준다 — 조용히 틀린 값보다
-- 「미지정」(노랑)이 낫다. 채워야 할 값임이 눈에 띈다(화면 규칙 6·10).
--
-- ★새 값은 여기 적지 않는다★ — /admin/partners 에서 새 사업자등록증·통장사본을 올리면
-- 판독이 칸을 채우고, 눈으로 보고 저장한다. 돈이 되는 숫자를 SQL 에 굳혀 두지 않는다.
--
-- 사업장 주소(addr)도 비운다 — 한백이 새 서류를 올린다(2026-08-25). 판독이 새
-- 사업자등록증에서 주소까지 채운다. 옛 주소만 남으면 「확인된 값」처럼 읽힌다.
--
-- 파일 URL(biz_cert_url·bankbook_url)은 건드리지 않는다 — 화면의 「교체」로 올려야
-- 옛 Blob 이 같이 지워진다. 여기서 URL 만 비우면 옛 서류 파일이 떠돌아 남는다.
update partner_details
set biz_reg_no = null,
    ceo = null,
    addr = null,
    bank_name = null,
    bank_account_no = null,
    bank_holder = null,
    updated_at = now()
where user_id = 'lnselec'
  and (biz_reg_no is not null
       or ceo is not null
       or addr is not null
       or bank_name is not null
       or bank_account_no is not null
       or bank_holder is not null);

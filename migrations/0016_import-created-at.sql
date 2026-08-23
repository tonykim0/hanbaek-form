-- 이관 현장의 접수일을 계약서수령일로 (한백 지시 2026-08-24)
--
-- 노션 이관(scripts/import-notion-2026.ts)이 created_at 을 노션 페이지 생성일로
-- 넣었는데, 콘솔의 접수일(대시보드 월별 수주·상세 표시)은 계약서수령일이어야 한다.
-- 수령일은 contract_confirmed_at 에 이미 들어 있다(이관이 같은 값을 썼다).
--
-- 겨냥: mgmt_no 가 숫자인 행 = 노션 이관분만 (콘솔 접수분은 mgmt_no 가 HB-* 라 안 걸린다).
-- 멱등: 같은 값이면 두 번 돌아도 결과가 같다.
update projects
set created_at = (contract_confirmed_at || ' 00:00:00+09')::timestamptz
where mgmt_no ~ '^[0-9]+$'
  and contract_confirmed_at is not null
  and created_at is distinct from (contract_confirmed_at || ' 00:00:00+09')::timestamptz;

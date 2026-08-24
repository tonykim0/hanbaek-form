-- 계약서 접수 선언 — 협력사가 「계약서 접수하기」를 누른 날 (한백 지시 2026-08-24)
--
-- 예전에는 필수 서류 칸이 다 차는 순간 저절로 계약검토로 넘어갔다. 그러면 협력사가
-- 아직 고치는 중인데 한백의 검토 칸에 올라와 있고, 협력사에게 「다 냈다」고 말할 자리가
-- 없었다. 확인일(contract_confirmed_at)이 「한백이 봤다」는 사실인 것과 같은 짝이다.
--
-- 이관 현장 백필: 계약서수령일을 접수 선언일로 둔다 — 노션에서 계약완료로 확정된
-- 현장들이라 이미 접수를 마친 것이고, 나중에 계약 확인을 취소해도 계약접수(처음
-- 모으는 자리)가 아니라 계약검토로 돌아가야 맞다.
alter table projects add column if not exists contract_submitted_at text;

update projects
set contract_submitted_at = contract_confirmed_at
where mgmt_no ~ '^[0-9]+$'
  and contract_confirmed_at is not null
  and contract_submitted_at is null;

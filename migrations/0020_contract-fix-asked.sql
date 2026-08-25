-- 보완요청 이력 — 한백이 이 계약에 처음 보완요청(서류 반려)을 한 날 (한백 지시 2026-08-25)
--
-- ★왜 저장하는가★ 반려된 서류를 다시 올리면 반려가 풀린다(pg-store uploadDocument:
-- status='uploaded', reject_reason=null). 그래서 보완이 끝난 순간 「반려됐던 적이 있다」는
-- 흔적이 어디에도 없고, 그 현장은 계약접수 — 처음 서류를 모으는 자리 — 로 떨어졌다.
-- 계약완료였다가 보완요청을 받은 현장이 처음 접수하는 현장과 같은 칸에 서는 것이
-- 실제와 어긋난다(한백 지적): 그 협력사가 할 일은 접수가 아니라 재검토 요청이다.
--
-- 이 값이 있으면 접수 선언이 없어도 계약검토에 선다(lib/board.ts boardColumnOf) —
-- 칸을 새로 만들지 않는다(한백 지시): 보완이 풀린 계약을 볼 사람은 한백이고,
-- 한백이 보는 자리는 계약검토다.
--
-- 한 번 서면 지우지 않는다 — 「이 계약은 한 번 되돌려진 적이 있다」는 사실이고,
-- 보완을 몇 번 돌아도 그 사실은 같다. 그래서 날짜는 첫 보완요청일이다.
--
-- 백필 둘. 순서가 있다 — 로그가 먼저다(날짜가 진짜다), 그다음이 지금 반려 중인 것.
alter table projects add column if not exists contract_fix_asked_at text;

-- 1) 감사 로그에 남은 첫 반려일 (pg-store reviewDocument: action='서류 반려')
--    at 은 timestamptz 다 — 저장 날짜는 한국 달력이므로(lib/date) 서울로 옮겨 자른다.
update projects p
set contract_fix_asked_at = to_char(a.first_at at time zone 'Asia/Seoul', 'YYYY-MM-DD')
from (
  select project_id, min(at) as first_at
  from audit_log
  where action = '서류 반려' and project_id is not null
  group by project_id
) a
where a.project_id = p.id
  and p.contract_fix_asked_at is null;

-- 2) 지금 반려가 남아 있는데 로그가 없는 현장 — 로그가 생기기 전에 반려된 것.
--    날짜를 모르니 마지막 진척일로 둔다(그 반려가 마지막 진척이었을 것이다).
update projects p
set contract_fix_asked_at = p.last_progress_at
where p.contract_fix_asked_at is null
  and exists (
    select 1 from documents d
    where d.project_id = p.id and d.status = 'rejected'
  );

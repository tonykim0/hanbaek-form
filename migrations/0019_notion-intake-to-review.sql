-- 이관 현장을 계약검토로 내린다 (한백 지시 2026-08-25)
--
-- 노션에서 온 140건이 계약완료 칸에 서 있다. 한백이 「계약 확인 완료」를 누른 적이 없는데도
-- 그렇다 — 이관이 contract_confirmed_at 에 계약서수령일을 넣었고(import-notion-2026.ts),
-- 유도는 그 값이 있으면 계약이 끝난 것으로 본다(lib/stage.ts deriveStage).
--
-- 수령일이 있다는 것은 「협력사가 계약서를 냈다」는 사실이고, 「한백이 확인했다」는 아니다.
-- 그 둘을 한 칸에 담아서 생긴 일이다. 수령일을 contract_submitted_at 으로 옮기고 확인일을
-- 비우면 계약검토에 선다 — 협력사는 냈고 한백이 볼 차례다(lib/board.ts boardColumnOf).
--
-- ★영업비 1차 지급 트리거가 같이 풀린다.★ 트리거가 contract_confirmed_at 이다
-- (lib/data/assemble.ts contractCompletedAt → lib/settlement.ts payoutReleaseOf). 이 현장들은
-- 「지급 가능」에서 빠지고, 한백이 계약을 확인하는 순간 다시 뜬다. 아직 확인하지 않은 계약의
-- 영업비 1차가 지급 대상이 아닌 것은 규칙과 어긋나지 않는다 — 다만 지급관리 목록이 이 배포로
-- 줄어드는 것은 알고 있어야 한다. 이미 나간 돈(payout_entries)은 건드리지 않는다.
--
-- 겨냥: mgmt_no 가 숫자인 행 = 노션 이관분만 (콘솔 접수분은 mgmt_no 가 HB-* 라 안 걸린다.
-- 0016 과 같은 겨냥이다).
--
-- ★사람이 실제로 확인한 것은 건드리지 않는다.★ 이관(8/24) 뒤에 한백이 콘솔에서 확인한
-- 현장이 있으면 그 기록이 audit_log 에 남아 있다(pg-store confirmContract). 그 현장의 확인을
-- 지우면 사람이 한 일을 되돌리는 것이다.
--
-- 멱등: 확인일이 있는 행만 겨냥한다. 두 번째 실행은 0행이다.

update projects
set
  -- 협력사가 냈다는 사실은 남긴다 — 이미 값이 있으면 그것이 먼저다
  contract_submitted_at = coalesce(contract_submitted_at, contract_confirmed_at),
  contract_confirmed_at = null
where mgmt_no ~ '^[0-9]+$'
  and contract_confirmed_at is not null
  and not exists (
    select 1
    from audit_log a
    where a.project_id = projects.id
      and a.field = 'contractConfirmedAt'
  );

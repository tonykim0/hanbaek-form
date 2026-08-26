-- 승인일을 한 칸으로 — 환경부 승인일과 운영사 시공승인일을 같은 날로 본다 (한백 2026-08-27)
-- 정의: types/project.ts 의 ProcessInfo.cpoApprovalDate 주석 · lib/process.ts 「충전기 발주」
--
-- 두 칸이면 같은 날을 두 번 적어야 하고(화면 규칙 5), 한 쪽만 적힌 현장은 「승인이 났나」가
-- 두 답을 갖는다. 실제로 프로덕션 76건 중 둘 다 적힌 것은 2건뿐이고 그 2건은 날짜가
-- 같았다 — 어긋난 건은 하나도 없어서 합치면서 잃는 값이 없다.
--
-- 남는 칸은 env_approval_date 다: 기성 「환경부 승인」 트리거의 근거이고(settlement_rules 에
-- 트리거 이름이 글자로 저장돼 있어 그쪽을 건드릴 수 없다) 한백 전용 칸이다
-- (HANBAEK_ONLY_PROCESS_FIELDS — 지급을 여는 날짜라 시공사가 적을 자리가 아니다).
-- 「충전기 발주」 조건도 이제 이 날짜를 본다.
--
-- 시공승인일만 적힌 현장의 값을 옮긴다. 프로덕션에는 자체투자 1건이다 — 자체투자는
-- 환경부 승인이 없어서 그 칸이 비어 있었고, 그 현장의 승인일은 운영사 통보일이 맞다.
-- 두 칸이 다 있으면 손대지 않는다(같은 날짜다).
--
-- ★cpo_approval_date 칸은 지우지 않는다.★ 마이그레이션은 배포보다 먼저 돌아서, 지우면
-- 아직 바뀌기 전 배포가 그 칸을 찾다 터진다(promo_extend_deduct 와 같은 이유, 0011).
-- 적는 길은 라우트에서 닫았다. 새 코드가 다 나간 뒤 따로 지운다.

update processes
set env_approval_date = cpo_approval_date
where env_approval_date is null
  and cpo_approval_date is not null;

-- 지급조건 확정(잠금) — 확정하면 단가 케이스·정산 규칙을 못 바꾼다 (한백 지시 2026-08-28).
--
-- ★왜★ 지금은 지급이 다 나간 뒤에도 단가 케이스를 자유롭게 갈아 끼울 수 있고, 바꾸는
-- 순간 그 현장의 계획·잔액·기성·마진이 통째로 다시 계산된다. 중간에 누가 손대면 지급과
-- 기성 구조가 같이 깨진다.
--
-- 값은 「확정한 날」이다. null 이면 아직 고칠 수 있다.
alter table projects add column if not exists payout_terms_confirmed_at text;

-- ★이미 지급이 나간 현장은 소급해서 잠근다★ (한백 지시) — 확정일은 첫 지급일로 둔다.
-- 그날 이미 조건이 정해져 있었으므로 그것이 사실에 가깝다.
update projects p
   set payout_terms_confirmed_at = (
     select min(e.at) from payout_entries e where e.project_id = p.id
   )
 where p.payout_terms_confirmed_at is null
   and exists (select 1 from payout_entries e where e.project_id = p.id);

-- 기성 수금 「실수금액」 — 받은 금액을 그대로 적는 자리 (한백 지시 2026-08-28).
--
-- 지금까지는 수금일(collected_N_at)만 있어서 계획액(턴키단가 × 대수)이 곧 수금액이었다.
-- 그런데 협의로 턴키단가와 다르게 받는 현장이 있다 — 익산 예다음아르띠에는 케이스가
-- 150만/기인데 SK 에서 190만/기를 받는다(22대 = 880만 차이). 그 한 건 때문에 협의용
-- 단가 케이스를 만들면 단가표가 정책표가 아니게 되므로, 받은 금액을 여기 적는다.
--
-- null 이면 「계획액대로 받았다」는 뜻이다 — 옛 기록을 뒤에서 고칠 필요가 없다.
alter table settlements add column if not exists collected_1_amount integer;
alter table settlements add column if not exists collected_2_amount integer;
alter table settlements add column if not exists collected_3_amount integer;

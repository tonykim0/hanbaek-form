-- 원장 줄에 회차를 단다 — 「영업비 1,2차 시공비 1차,2차 각각 영역에서 차감」(한백 지시 2026-09-04)
--
-- 조정이 총액(due)에만 붙어 70/30 으로 갈라지는 바람에, 「1차에서만 N 빼기」라는 말이
-- 계산에 존재할 자리가 없었다. 회차 칸이 그 자리다.
--
-- ★기본값을 박지 않는다★ — 프로덕션에 이미 있는 조정 2줄(영업비 차감 -5,460,000)은
-- 어느 차수 몫인지 사실이 원장에 없다. null 로 두면 계산이 예전 식과 완전히 같아
-- 회귀가 0 이고, 사람이 화면에서 고르면 그때 값이 붙는다.
alter table payout_entries add column if not exists step smallint;

-- 지급 줄은 명목이 이미 회차를 말한다 — 그 사실을 칸으로 옮긴다(금액은 안 건드린다).
-- 실측 2026-09-04: 영업비 1차 99줄 · 시공비 1차 1줄 · 2차 0줄 · 선금/차액/회수 0줄.
update payout_entries set step = 1 where step is null and category = '1차';
update payout_entries set step = 2 where step is null and category = '2차';

-- 한 현장의 한 구분에 같은 회차 지급 줄이 둘일 수 없다.
-- 지금은 앱 SELECT 로만 막고 있었다(lib/data/store/payouts.ts) — DB 로 내린다.
-- 프로덕션 중복 0건을 확인하고 넣는다(확인 2026-09-04). 조정 줄은 대상이 아니다 —
-- 한 회차에 차감을 여러 번 적을 수 있어야 한다.
--
-- ★열쇠는 step 이 아니라 category 다.★ 회차의 정본은 명목이고(코드가 판정에 쓰는 것도
-- 전부 category 다 — ledgerOf · stepEntry · assertBatchOpen), step 은 그것을 옮겨 적은
-- 파생 칸이다. 게다가 유니크 인덱스에서 NULL 은 서로 다른 값이라, step 이 빈 지급 줄이
-- 한 번이라도 들어오면 인덱스가 통째로 무력해진다. category 는 NOT NULL 이라 그 구멍이 없다.
create unique index if not exists payout_entries_step_idx
  on payout_entries (project_id, kind, category)
  where category in ('1차', '2차');

-- 지급 줄에는 회차가 반드시 있어야 한다 — 파생 칸이 조용히 비는 것을 DB 가 막는다.
-- 조정 줄은 그대로 NULL 을 허용한다(위에서 기본값을 안 박은 까닭이 여기서도 산다).
alter table payout_entries drop constraint if exists payout_entries_step_pair;
alter table payout_entries add constraint payout_entries_step_pair
  check (category not in ('1차', '2차') or step is not null);

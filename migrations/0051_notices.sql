-- 공지 (한백 지시 2026-09-03)
--
-- 한백이 협력사 전체에 알리는 글. 정적 HTML(public/notices/)로 한 장씩 만들던 것을
-- 표로 받는다 — 파일로 두면 쓸 때마다 배포가 필요하고, 「읽었는가」를 셀 수 없다.
--
-- 읽음 표시는 사람마다 시각 하나다(users.notices_read_at) — 공지 화면을 연 시각.
-- 그보다 뒤에 만들어진 공지가 「안 읽은 것」이고, 상단바 배지가 그 수를 단다.
-- 공지×사람 표를 만들지 않는 이유: 배지에 필요한 것은 「몇 건이 새것인가」뿐이다.

CREATE TABLE IF NOT EXISTS notices (
  id text PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 고친 시각 — 배지는 이것을 보지 않는다(오타 수정이 전원을 다시 부르면 안 된다)
  updated_at timestamptz
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS notices_read_at timestamptz;

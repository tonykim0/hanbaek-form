-- 「보류」를 걷는다 — 멈춤은 계약중단 하나다 (한백 2026-08-31 「보류는 없애고 계약중단만 냅둬」)
--
-- 보류(사정이 풀리면 재개)와 계약중단을 같이 두었는데, 둘의 차이는 「돌아올 것 같은가」라는
-- 짐작뿐이고 화면이 하는 일은 똑같았다: 흐름에서 빼고, 할 일에서 지우고, 보드 끝 칸에 세운다.
-- 갈래가 둘이면 세울 때마다 어느 쪽인지 고민하게 되고 보드 칸도 하나 더 먹는다. 다시 할
-- 현장은 재개하면 그만이라 「보류」라는 이름이 따로 필요하지 않다.
--
-- ★남은 보류 현장은 계약중단이 아니라 진행 중으로 되돌린다.★ 보류는 「계약이 무산됐다」는
-- 뜻이 아니었으므로 계약중단으로 옮기면 없던 사실이 기록된다. 흐름으로 돌려놓고, 사유는
-- 지우지 않고 현장메모로 옮겨 왜 멈췄었는지가 사라지지 않게 한다.
--
-- 프로덕션에는 보류가 0건이다(2026-08-31 확인 — 계약중단 1건뿐). 그래도 적는 이유는
-- 개발 DB 와 앞으로의 복원본에도 같은 규칙이 걸려야 하기 때문이다.

insert into project_notes (id, project_id, body, author, at)
select
  'note-hold-' || p.id,
  p.id,
  '보류 해제 (2026-08-31 · 보류 상태를 없앴습니다)' ||
    case when coalesce(p.hold_note, '') = '' then '' else ' — 사유: ' || p.hold_note end,
  '한백',
  now()
from projects p
where p.hold_state = '보류'
on conflict (id) do nothing;

update projects set hold_state = null, hold_note = null where hold_state = '보류';

-- 옛 이름 'DROP' 도 이참에 제 이름으로 적는다. 저장소가 읽을 때 바꿔 주고 있었는데
-- (lib/data/store/shared.ts), 값이 두 꼴이면 SQL 로 세는 사람이 한쪽을 놓친다.
update projects set hold_state = '계약중단' where hold_state = 'DROP';

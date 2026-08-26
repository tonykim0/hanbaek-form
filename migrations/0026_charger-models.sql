-- 충전기 모델 — 등록해 두고 현장에서 고른다 (한백 지시 2026-08-26)
--
-- 노션에서는 「모델명(충전기)」 multi_select 였다. 목록을 표로 두는 이유는 오타로 같은
-- 모델이 여러 이름을 갖는 것을 막기 위해서다 — 현장은 이름을 적지 않고 목록에서 고른다.
-- 쓰지 않게 된 모델은 지우지 않고 active=false 로 내린다(옛 현장이 참조하고 있다).
create table if not exists charger_models (
  id text primary key,
  name text not null,
  maker text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists charger_models_name_idx on charger_models (name);

-- 현장이 고른 모델 — 시공(공정)의 값이다. 충전기 수령 구간에서 고른다.
alter table processes add column if not exists charger_model_id text references charger_models(id);

-- 노션 「모델명(충전기)」에 등록돼 있던 8개를 초기값으로 (2026-08-26 기준)
insert into charger_models (id, name) values
  ('cm-bas1007-d1-1',        'BAS1007.D1.1'),
  ('cm-e01as007k10kr0101',   'E01AS007K10KR0101'),
  ('cm-jy-070-w4',           'JY-070-W4'),
  ('cm-cp700p',              'CP700P'),
  ('cm-ez-mc007-prr41-pmd',  'EZ-MC007-PRR41-PMD'),
  ('cm-hlab-fpss',           'HLAB-FPSS'),
  ('cm-gk-smc03-7l',         'GK-SMC03-7L')
on conflict (id) do nothing;

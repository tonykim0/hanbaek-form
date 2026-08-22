-- 기 구축 충전기 연동 케이스 — SK(부속합의서 150만) · PL(55/75만, 한백 확인 2026-08-23)
-- lib/pricing-policy-link-h2.ts 에서 생성 — 손으로 고치지 마세요

-- SK일렉링크 (2026년 7월 20일) | 전체 | 7·10년 연동 | 모자분리 (총 150만)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'sk-y7-10-mother-link-both-2026', 'SK일렉링크 (2026년 7월 20일) | 전체 | 7·10년 연동 | 모자분리', 'SK일렉링크', '연동', '모자분리',
  '[7,10]'::jsonb, '["공동주택","상업시설"]'::jsonb, '연동', '턴키',
  2026, '2026년 7월 20일', 1300000, 0, 200000,
  'lump-100',
  null, null, null, true,
  null, null, null, null,
  '모자분리 조건 · 7년 계약 이상 · 지역: 수도권 · 6개 광역시 · 시 단위의 상면', null, null, '· 급속충전기 연동에 대한 수수료는 제외
· 대금: 완료·개통 준공 후 — 세금계산서 확인 후 익월 25일 현금 지급'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 하반기) | 공동주택 | 7년 연동 | 모자분리 (총 55만)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y7-mother-link-apt-2026', '플러그링크 (2026년 하반기) | 공동주택 | 7년 연동 | 모자분리', '플러그링크', '연동', '모자분리',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '연동', '턴키',
  2026, '2026년 하반기', 350000, 0, 200000,
  null,
  null, null, null, true,
  null, null, null, null,
  null, null, null, '· 연동 대상 기기·세부 조건은 운영사 확인 필요(코스텔·PNE 한정으로 안내된 바 있음)
· 정산 방식이 확정 문서에 없어 기성 미정 — 확인되면 채운다'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 하반기) | 공동주택 | 10년 연동 | 모자분리 (총 75만)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y10-mother-link-apt-2026', '플러그링크 (2026년 하반기) | 공동주택 | 10년 연동 | 모자분리', '플러그링크', '연동', '모자분리',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '연동', '턴키',
  2026, '2026년 하반기', 550000, 0, 200000,
  null,
  null, null, null, true,
  null, null, null, null,
  null, null, null, '· 연동 대상 기기·세부 조건은 운영사 확인 필요(코스텔·PNE 한정으로 안내된 바 있음)
· 정산 방식이 확정 문서에 없어 기성 미정 — 확인되면 채운다'
) on conflict (id) do nothing;

-- 검산: 연동 3건 — sk 150만(준공 100%) · pl 55/75만(기성 미정)

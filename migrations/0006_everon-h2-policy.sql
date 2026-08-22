-- 에버온 26년 영업 정책 2차 (26-07-30까지 · 3차 미발행이라 최신)
-- lib/pricing-policy-everon-h2.ts 에서 생성 — 손으로 고치지 마세요

-- 에버온 (2026년 7월 1일) | 공동주택 | 5년 자체투자 (제자리교체) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'everon-y5-mother-inplace-apt-2026', '에버온 (2026년 7월 1일) | 공동주택 | 5년 자체투자 (제자리교체) | 모자분리', '에버온', '자체투자', '모자분리',
  '[5]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 7월 1일', 200000, 1000000, 200000, null,
  null, null, null, true,
  '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링', '[{"months":6,"rate":149}]'::jsonb, null, 296,
  '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지 · 추가 공사비 영업자 부담(전면도색 포함)', null, null, '· 타CPO 의 교체·이전은 최소 5년 경과 & 계약 종료(건설사 설치분 제외) — 교체는 가능 · 이전 설치의 철거는 공단 지침 전까지 불허(철거 유보 + 신규 설치)
· 3kW→7kW 제자리 교체는 170/180/190만(5/7/10년) — 이 케이스(7kW→7kW)와 축이 같아 미등록, 현장 갈리면 등록
· 전체 500기 이상 달성 시 에버온 투자분 도색 지원(26-07-30 기준)
· 정산 방식이 정책서에 없어 기성 미정 — 확인되면 채운다'
) on conflict (id) do nothing;

-- 에버온 (2026년 7월 1일) | 공동주택 | 7년 자체투자 (제자리교체) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'everon-y7-mother-inplace-apt-2026', '에버온 (2026년 7월 1일) | 공동주택 | 7년 자체투자 (제자리교체) | 모자분리', '에버온', '자체투자', '모자분리',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 7월 1일', 300000, 1000000, 200000, null,
  null, null, null, true,
  '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링', '[{"months":6,"rate":149}]'::jsonb, null, 296,
  '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지 · 추가 공사비 영업자 부담(전면도색 포함)', null, null, '· 타CPO 의 교체·이전은 최소 5년 경과 & 계약 종료(건설사 설치분 제외) — 교체는 가능 · 이전 설치의 철거는 공단 지침 전까지 불허(철거 유보 + 신규 설치)
· 3kW→7kW 제자리 교체는 170/180/190만(5/7/10년) — 이 케이스(7kW→7kW)와 축이 같아 미등록, 현장 갈리면 등록
· 전체 500기 이상 달성 시 에버온 투자분 도색 지원(26-07-30 기준)
· 정산 방식이 정책서에 없어 기성 미정 — 확인되면 채운다'
) on conflict (id) do nothing;

-- 에버온 (2026년 7월 1일) | 공동주택 | 10년 자체투자 (제자리교체) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'everon-y10-mother-inplace-apt-2026', '에버온 (2026년 7월 1일) | 공동주택 | 10년 자체투자 (제자리교체) | 모자분리', '에버온', '자체투자', '모자분리',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 7월 1일', 400000, 1000000, 200000, null,
  null, null, null, true,
  '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링', '[{"months":6,"rate":149},{"months":6,"rate":220}]'::jsonb, null, 296,
  '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지 · 추가 공사비 영업자 부담(전면도색 포함)', null, null, '· 타CPO 의 교체·이전은 최소 5년 경과 & 계약 종료(건설사 설치분 제외) — 교체는 가능 · 이전 설치의 철거는 공단 지침 전까지 불허(철거 유보 + 신규 설치)
· 3kW→7kW 제자리 교체는 170/180/190만(5/7/10년) — 이 케이스(7kW→7kW)와 축이 같아 미등록, 현장 갈리면 등록
· 전체 500기 이상 달성 시 에버온 투자분 도색 지원(26-07-30 기준)
· 정산 방식이 정책서에 없어 기성 미정 — 확인되면 채운다'
) on conflict (id) do nothing;

-- 에버온 (2026년 7월 1일) | 공동주택 | 5년 자체투자 (신규위치) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'everon-y5-mother-move-apt-2026', '에버온 (2026년 7월 1일) | 공동주택 | 5년 자체투자 (신규위치) | 모자분리', '에버온', '자체투자', '모자분리',
  '[5]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (신규위치)', '턴키',
  2026, '2026년 7월 1일', 500000, 1000000, 200000, null,
  null, null, null, true,
  '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링', '[{"months":6,"rate":149}]'::jsonb, null, 296,
  '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지 · 추가 공사비 영업자 부담(전면도색 포함)', null, null, '· 타CPO 의 교체·이전은 최소 5년 경과 & 계약 종료(건설사 설치분 제외) — 교체는 가능 · 이전 설치의 철거는 공단 지침 전까지 불허(철거 유보 + 신규 설치)
· 3kW→7kW 제자리 교체는 170/180/190만(5/7/10년) — 이 케이스(7kW→7kW)와 축이 같아 미등록, 현장 갈리면 등록
· 전체 500기 이상 달성 시 에버온 투자분 도색 지원(26-07-30 기준)
· 정산 방식이 정책서에 없어 기성 미정 — 확인되면 채운다'
) on conflict (id) do nothing;

-- 에버온 (2026년 7월 1일) | 공동주택 | 7년 자체투자 (신규위치) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'everon-y7-mother-move-apt-2026', '에버온 (2026년 7월 1일) | 공동주택 | 7년 자체투자 (신규위치) | 모자분리', '에버온', '자체투자', '모자분리',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (신규위치)', '턴키',
  2026, '2026년 7월 1일', 600000, 1000000, 200000, null,
  null, null, null, true,
  '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링', '[{"months":6,"rate":149}]'::jsonb, null, 296,
  '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지 · 추가 공사비 영업자 부담(전면도색 포함)', null, null, '· 타CPO 의 교체·이전은 최소 5년 경과 & 계약 종료(건설사 설치분 제외) — 교체는 가능 · 이전 설치의 철거는 공단 지침 전까지 불허(철거 유보 + 신규 설치)
· 3kW→7kW 제자리 교체는 170/180/190만(5/7/10년) — 이 케이스(7kW→7kW)와 축이 같아 미등록, 현장 갈리면 등록
· 전체 500기 이상 달성 시 에버온 투자분 도색 지원(26-07-30 기준)
· 정산 방식이 정책서에 없어 기성 미정 — 확인되면 채운다'
) on conflict (id) do nothing;

-- 에버온 (2026년 7월 1일) | 공동주택 | 10년 자체투자 (신규위치) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'everon-y10-mother-move-apt-2026', '에버온 (2026년 7월 1일) | 공동주택 | 10년 자체투자 (신규위치) | 모자분리', '에버온', '자체투자', '모자분리',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (신규위치)', '턴키',
  2026, '2026년 7월 1일', 700000, 1000000, 200000, null,
  null, null, null, true,
  '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링', '[{"months":6,"rate":149},{"months":6,"rate":220}]'::jsonb, null, 296,
  '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지 · 추가 공사비 영업자 부담(전면도색 포함)', null, null, '· 타CPO 의 교체·이전은 최소 5년 경과 & 계약 종료(건설사 설치분 제외) — 교체는 가능 · 이전 설치의 철거는 공단 지침 전까지 불허(철거 유보 + 신규 설치)
· 3kW→7kW 제자리 교체는 170/180/190만(5/7/10년) — 이 케이스(7kW→7kW)와 축이 같아 미등록, 현장 갈리면 등록
· 전체 500기 이상 달성 시 에버온 투자분 도색 지원(26-07-30 기준)
· 정산 방식이 정책서에 없어 기성 미정 — 확인되면 채운다'
) on conflict (id) do nothing;

-- 기존 유지 + 조건 갱신(금액·기성 40/60 이미 일치): everon-y5-mother-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":149}]'::jsonb, charge_rate = 296,
  supply_items = '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링', install_terms = '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지 · 추가 공사비 영업자 부담(전면도색 포함)',
  other_support = '한전불입금 지원 — 7년 5회선 이내 · 10년 10회선 이내 · 한전인입지역 할인 220원 6개월(혼용은 모자분리 적용)', misc_terms = '· 알뜰충전 요금 276원/kWh
· 모든 계약서류는 환경부 지원 기준 서류로 접수 — 공단지침 의거 변경 가능한 수주건은 공단 지원 신청으로 변경 예정(수수료도 공단 기준 자동 변경)
· 정산: 환경부 승인·기성 수령 후 7일 이내 40% · 준공기성 수령 후 7일 이내 60%'
where id = 'everon-y5-mother-new-apt';

-- 기존 유지 + 조건 갱신(금액·기성 40/60 이미 일치): everon-y7-mother-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":149}]'::jsonb, charge_rate = 296,
  supply_items = '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링', install_terms = '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지 · 추가 공사비 영업자 부담(전면도색 포함)',
  other_support = '한전불입금 지원 — 7년 5회선 이내 · 10년 10회선 이내 · 한전인입지역 할인 220원 6개월(혼용은 모자분리 적용)', misc_terms = '· 알뜰충전 요금 276원/kWh
· 모든 계약서류는 환경부 지원 기준 서류로 접수 — 공단지침 의거 변경 가능한 수주건은 공단 지원 신청으로 변경 예정(수수료도 공단 기준 자동 변경)
· 정산: 환경부 승인·기성 수령 후 7일 이내 40% · 준공기성 수령 후 7일 이내 60%'
where id = 'everon-y7-mother-new-apt';

-- 기존 유지 + 조건 갱신(금액·기성 40/60 이미 일치): everon-y10-mother-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":149},{"months":6,"rate":220}]'::jsonb, charge_rate = 296,
  supply_items = '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링', install_terms = '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지 · 추가 공사비 영업자 부담(전면도색 포함)',
  other_support = '한전불입금 지원 — 7년 5회선 이내 · 10년 10회선 이내 · 한전인입지역 할인 220원 6개월(혼용은 모자분리 적용)', misc_terms = '· 알뜰충전 요금 276원/kWh
· 모든 계약서류는 환경부 지원 기준 서류로 접수 — 공단지침 의거 변경 가능한 수주건은 공단 지원 신청으로 변경 예정(수수료도 공단 기준 자동 변경)
· 정산: 환경부 승인·기성 수령 후 7일 이내 40% · 준공기성 수령 후 7일 이내 60%'
where id = 'everon-y10-mother-new-apt';

-- 기존 유지 + 조건 갱신(금액·기성 40/60 이미 일치): everon-y7-kepco-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":220}]'::jsonb, charge_rate = 296,
  supply_items = '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링', install_terms = '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지 · 추가 공사비 영업자 부담(전면도색 포함)',
  other_support = '한전불입금 지원 — 7년 5회선 이내 · 10년 10회선 이내 · 한전인입지역 할인 220원 6개월(혼용은 모자분리 적용)', misc_terms = '· 알뜰충전 요금 276원/kWh
· 모든 계약서류는 환경부 지원 기준 서류로 접수 — 공단지침 의거 변경 가능한 수주건은 공단 지원 신청으로 변경 예정(수수료도 공단 기준 자동 변경)
· 정산: 환경부 승인·기성 수령 후 7일 이내 40% · 준공기성 수령 후 7일 이내 60%'
where id = 'everon-y7-kepco-new-apt';

-- 기존 유지 + 조건 갱신(금액·기성 40/60 이미 일치): everon-y10-kepco-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":220}]'::jsonb, charge_rate = 296,
  supply_items = '비가림막 / 스탠드 · 바닥 「EV 전기차」 레터링', install_terms = '영업 대상: 아파트 · 주거형 오피스텔 · 지식산업센터(300면 이상 신설) · 주차면 5%까지 · 추가 공사비 영업자 부담(전면도색 포함)',
  other_support = '한전불입금 지원 — 7년 5회선 이내 · 10년 10회선 이내 · 한전인입지역 할인 220원 6개월(혼용은 모자분리 적용)', misc_terms = '· 알뜰충전 요금 276원/kWh
· 모든 계약서류는 환경부 지원 기준 서류로 접수 — 공단지침 의거 변경 가능한 수주건은 공단 지원 신청으로 변경 예정(수수료도 공단 기준 자동 변경)
· 정산: 환경부 승인·기성 수령 후 7일 이내 40% · 준공기성 수령 후 7일 이내 60%'
where id = 'everon-y10-kepco-new-apt';

-- 신정책에 없는 한전불입 5년 — 참조 없을 때만 삭제: everon-y5-kepco-new-apt
delete from pricing_rules
where id = 'everon-y5-kepco-new-apt'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

-- 검산: 에버온 자투 6건 신설 · 보조 5건 조건 채움 · 한전 5년 0건

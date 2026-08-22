-- 플러그링크를 배포본 260629 기준으로 정정한다 — v1.1 은 한백 적용 문서가 아니다(한백 확인 2026-08-23)
-- lib/pricing-policy-plhec-h2.ts 에서 생성 — 손으로 고치지 마세요

delete from pricing_rules
where id = 'pl-y7-kepco-new-apt-2026'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

delete from pricing_rules
where id = 'pl-y10-kepco-new-apt-2026'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

delete from pricing_rules
where id = 'pl-y7-mother-inplace-apt-2026'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

delete from pricing_rules
where id = 'pl-y10-mother-inplace-apt-2026'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

delete from pricing_rules
where id = 'pl-y7-mother-move-apt-2026'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

delete from pricing_rules
where id = 'pl-y10-mother-move-apt-2026'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

-- 복원: 플러그링크 (하반기) | 공동주택 | 7년 신규 | 한전불입 (총 200만)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-h2-y7-kepco-new-apt', '플러그링크 (하반기) | 공동주택 | 7년 신규 | 한전불입', '플러그링크', '환경부', '한전불입',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 하반기', 900000, 900000, 200000,
  'pl-2step',
  '영업비 차감', '한백 부담', null, true,
  null, '[{"months":6,"rate":149}]'::jsonb, null, null,
  '총 주차면의 5%까지 지원 · 충전기 최소 2% 전용 구역 도색 필수 · 1개 단지 최대 130대(7년)/120대(10년) · 상업시설은 주차면 2%만(7년 계약·한전불입 불가 — 대상지: 공영주차장·관공서·주민센터·지식산업센터·4성 이상 호텔/리조트·사옥·골프장·병원)', null, null, '· 기본요금 294.3원/kWh
· 프로모션 연장은 영업비 차감으로 가능 — 7년 최대 1년 · 10년 최대 2년(차감 단가 미정)
· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)
· 지원 초과분·보조금 신청 후 취소 건은 비보조금 사업으로 진행 — 취소 수수료: 공동 신규 7년 100만/10년 120만 · 상업 10년 100만(케이스 미등록)
· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)
· 등록된 외주모집대행사 직원만 영업 가능 · 현금성 리베이트 등 비정상 영업 금지(적발 시 사업 취소·손해배상)
· 대금: 영업비 20만 계약 승인 후 익월 말일 · 공사비 선금 50%(보조금 선금 수령 익월 — 비율 미확정) · 잔금 50%(준공 승인 후 익월 말일)'
) on conflict (id) do nothing;

-- 복원: 플러그링크 (하반기) | 공동주택 | 10년 신규 | 한전불입 (총 220만)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-h2-y10-kepco-new-apt', '플러그링크 (하반기) | 공동주택 | 10년 신규 | 한전불입', '플러그링크', '환경부', '한전불입',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 하반기', 1000000, 1000000, 200000,
  'pl-2step',
  '영업비 차감', '한백 부담', null, true,
  null, '[{"months":6,"rate":149},{"months":6,"rate":249}]'::jsonb, null, null,
  '총 주차면의 5%까지 지원 · 충전기 최소 2% 전용 구역 도색 필수 · 1개 단지 최대 130대(7년)/120대(10년) · 상업시설은 주차면 2%만(7년 계약·한전불입 불가 — 대상지: 공영주차장·관공서·주민센터·지식산업센터·4성 이상 호텔/리조트·사옥·골프장·병원)', null, null, '· 기본요금 294.3원/kWh
· 프로모션 연장은 영업비 차감으로 가능 — 7년 최대 1년 · 10년 최대 2년(차감 단가 미정)
· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)
· 지원 초과분·보조금 신청 후 취소 건은 비보조금 사업으로 진행 — 취소 수수료: 공동 신규 7년 100만/10년 120만 · 상업 10년 100만(케이스 미등록)
· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)
· 등록된 외주모집대행사 직원만 영업 가능 · 현금성 리베이트 등 비정상 영업 금지(적발 시 사업 취소·손해배상)
· 대금: 영업비 20만 계약 승인 후 익월 말일 · 공사비 선금 50%(보조금 선금 수령 익월 — 비율 미확정) · 잔금 50%(준공 승인 후 익월 말일)'
) on conflict (id) do nothing;

-- 260629 기준 조건 + 기성 pl-2step 복원: pl-h2-y7-mother-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":149}]'::jsonb, promo_extend_deduct = null, charge_rate = null,
  supply_items = null, install_terms = '총 주차면의 5%까지 지원 · 충전기 최소 2% 전용 구역 도색 필수 · 1개 단지 최대 130대(7년)/120대(10년) · 상업시설은 주차면 2%만(7년 계약·한전불입 불가 — 대상지: 공영주차장·관공서·주민센터·지식산업센터·4성 이상 호텔/리조트·사옥·골프장·병원)', coexist_terms = null,
  other_support = null, misc_terms = '· 기본요금 294.3원/kWh
· 프로모션 연장은 영업비 차감으로 가능 — 7년 최대 1년 · 10년 최대 2년(차감 단가 미정)
· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)
· 지원 초과분·보조금 신청 후 취소 건은 비보조금 사업으로 진행 — 취소 수수료: 공동 신규 7년 100만/10년 120만 · 상업 10년 100만(케이스 미등록)
· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)
· 등록된 외주모집대행사 직원만 영업 가능 · 현금성 리베이트 등 비정상 영업 금지(적발 시 사업 취소·손해배상)
· 대금: 영업비 20만 계약 승인 후 익월 말일 · 공사비 선금 50%(보조금 선금 수령 익월 — 비율 미확정) · 잔금 50%(준공 승인 후 익월 말일)',
  default_settlement_rule_id = 'pl-2step'
where id = 'pl-h2-y7-mother-new-apt';

-- 260629 기준 조건 + 기성 pl-2step 복원: pl-h2-y10-mother-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":149},{"months":6,"rate":249}]'::jsonb, promo_extend_deduct = null, charge_rate = null,
  supply_items = null, install_terms = '총 주차면의 5%까지 지원 · 충전기 최소 2% 전용 구역 도색 필수 · 1개 단지 최대 130대(7년)/120대(10년) · 상업시설은 주차면 2%만(7년 계약·한전불입 불가 — 대상지: 공영주차장·관공서·주민센터·지식산업센터·4성 이상 호텔/리조트·사옥·골프장·병원)', coexist_terms = null,
  other_support = null, misc_terms = '· 기본요금 294.3원/kWh
· 프로모션 연장은 영업비 차감으로 가능 — 7년 최대 1년 · 10년 최대 2년(차감 단가 미정)
· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)
· 지원 초과분·보조금 신청 후 취소 건은 비보조금 사업으로 진행 — 취소 수수료: 공동 신규 7년 100만/10년 120만 · 상업 10년 100만(케이스 미등록)
· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)
· 등록된 외주모집대행사 직원만 영업 가능 · 현금성 리베이트 등 비정상 영업 금지(적발 시 사업 취소·손해배상)
· 대금: 영업비 20만 계약 승인 후 익월 말일 · 공사비 선금 50%(보조금 선금 수령 익월 — 비율 미확정) · 잔금 50%(준공 승인 후 익월 말일)',
  default_settlement_rule_id = 'pl-2step'
where id = 'pl-h2-y10-mother-new-apt';

-- 260629 기준 조건 + 기성 pl-2step 복원: pl-y10-mother-new-biz-2026
update pricing_rules set
  promo = '[{"months":6,"rate":149},{"months":6,"rate":249}]'::jsonb, promo_extend_deduct = null, charge_rate = null,
  supply_items = null, install_terms = '총 주차면의 5%까지 지원 · 충전기 최소 2% 전용 구역 도색 필수 · 1개 단지 최대 130대(7년)/120대(10년) · 상업시설은 주차면 2%만(7년 계약·한전불입 불가 — 대상지: 공영주차장·관공서·주민센터·지식산업센터·4성 이상 호텔/리조트·사옥·골프장·병원)', coexist_terms = null,
  other_support = null, misc_terms = '· 기본요금 294.3원/kWh
· 프로모션 연장은 영업비 차감으로 가능 — 7년 최대 1년 · 10년 최대 2년(차감 단가 미정)
· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)
· 지원 초과분·보조금 신청 후 취소 건은 비보조금 사업으로 진행 — 취소 수수료: 공동 신규 7년 100만/10년 120만 · 상업 10년 100만(케이스 미등록)
· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)
· 등록된 외주모집대행사 직원만 영업 가능 · 현금성 리베이트 등 비정상 영업 금지(적발 시 사업 취소·손해배상)
· 대금: 영업비 20만 계약 승인 후 익월 말일 · 공사비 선금 50%(보조금 선금 수령 익월 — 비율 미확정) · 잔금 50%(준공 승인 후 익월 말일)',
  default_settlement_rule_id = 'pl-2step',
  start_date = '2026년 하반기'
where id = 'pl-y10-mother-new-biz-2026';

-- 신설: 플러그링크 (2026년 하반기) | 공동주택 | 7년 자체투자 (제자리교체) | 모자분리 (총 220만)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y7-mother-inplace-apt-2026', '플러그링크 (2026년 하반기) | 공동주택 | 7년 자체투자 (제자리교체) | 모자분리', '플러그링크', '자체투자', '모자분리',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 하반기', 1000000, 1000000, 200000,
  null,
  null, null, null, true,
  null, null, null, null,
  '총 주차면의 5%까지 지원 · 충전기 최소 2% 전용 구역 도색 필수 · 1개 단지 최대 130대(7년)/120대(10년) · 상업시설은 주차면 2%만(7년 계약·한전불입 불가 — 대상지: 공영주차장·관공서·주민센터·지식산업센터·4성 이상 호텔/리조트·사옥·골프장·병원)', null, null, '· 기본요금 294.3원/kWh · 프로모션은 문서에 명시 없음
· 대금 조항이 보조금 흐름 기준뿐이라 기성 미정 — 확인되면 채운다'
) on conflict (id) do nothing;

-- 신설: 플러그링크 (2026년 하반기) | 공동주택 | 10년 자체투자 (제자리교체) | 모자분리 (총 240만)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y10-mother-inplace-apt-2026', '플러그링크 (2026년 하반기) | 공동주택 | 10년 자체투자 (제자리교체) | 모자분리', '플러그링크', '자체투자', '모자분리',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 하반기', 1200000, 1000000, 200000,
  null,
  null, null, null, true,
  null, null, null, null,
  '총 주차면의 5%까지 지원 · 충전기 최소 2% 전용 구역 도색 필수 · 1개 단지 최대 130대(7년)/120대(10년) · 상업시설은 주차면 2%만(7년 계약·한전불입 불가 — 대상지: 공영주차장·관공서·주민센터·지식산업센터·4성 이상 호텔/리조트·사옥·골프장·병원)', null, null, '· 기본요금 294.3원/kWh · 프로모션은 문서에 명시 없음
· 대금 조항이 보조금 흐름 기준뿐이라 기성 미정 — 확인되면 채운다'
) on conflict (id) do nothing;

-- 신설: 플러그링크 (2026년 하반기) | 상업시설 | 10년 자체투자 (제자리교체) | 모자분리 (총 120만)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y10-mother-inplace-biz-2026', '플러그링크 (2026년 하반기) | 상업시설 | 10년 자체투자 (제자리교체) | 모자분리', '플러그링크', '자체투자', '모자분리',
  '[10]'::jsonb, '["상업시설"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 하반기', 0, 1000000, 200000,
  null,
  null, null, null, true,
  null, null, null, null,
  '총 주차면의 5%까지 지원 · 충전기 최소 2% 전용 구역 도색 필수 · 1개 단지 최대 130대(7년)/120대(10년) · 상업시설은 주차면 2%만(7년 계약·한전불입 불가 — 대상지: 공영주차장·관공서·주민센터·지식산업센터·4성 이상 호텔/리조트·사옥·골프장·병원)', null, null, '· 기본요금 294.3원/kWh · 프로모션은 문서에 명시 없음
· 대금 조항이 보조금 흐름 기준뿐이라 기성 미정 — 확인되면 채운다'
) on conflict (id) do nothing;

-- HEC rev4 조건 (0005 와 동일 — 멱등): hec-h2-y7_10-mother-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":150}]'::jsonb, charge_rate = 292,
  supply_items = '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등',
  install_terms = '주차면 5% 이하(주용도 무관) · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토) · 착공 지시 후 90일 내 준공(패널티)', coexist_terms = '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차 · 안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)',
  other_support = '한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비(준공 시 정산) · 전기안전관리자 선임 · 완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)', misc_terms = '· 감리배치비 미제공
· 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션(27년 신차 5%·재구매 7.5%) 4분기 예정
· 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)'
where id = 'hec-h2-y7_10-mother-new-apt';

-- HEC rev4 조건 (0005 와 동일 — 멱등): hec-h2-y7_10-kepco-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":150}]'::jsonb, charge_rate = 292,
  supply_items = '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등',
  install_terms = '주차면 5% 이하(주용도 무관) · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토) · 착공 지시 후 90일 내 준공(패널티)', coexist_terms = '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차 · 안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)',
  other_support = '한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비(준공 시 정산) · 전기안전관리자 선임 · 완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)', misc_terms = '· 감리배치비 미제공
· 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션(27년 신차 5%·재구매 7.5%) 4분기 예정
· 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)'
where id = 'hec-h2-y7_10-kepco-new-apt';

-- HEC rev4 조건 (0005 와 동일 — 멱등): hec-h2-y7_10-mother-new-com
update pricing_rules set
  promo = '[{"months":6,"rate":150}]'::jsonb, charge_rate = 292,
  supply_items = '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등',
  install_terms = '주차면 5% 이하(주용도 무관) · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토) · 착공 지시 후 90일 내 준공(패널티)', coexist_terms = '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차 · 안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)',
  other_support = '한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비(준공 시 정산) · 전기안전관리자 선임 · 완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)', misc_terms = '· 감리배치비 미제공
· 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션(27년 신차 5%·재구매 7.5%) 4분기 예정
· 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)'
where id = 'hec-h2-y7_10-mother-new-com';

-- HEC rev4 조건 (0005 와 동일 — 멱등): hec-h2-y7_10-kepco-new-com
update pricing_rules set
  promo = '[{"months":6,"rate":150}]'::jsonb, charge_rate = 292,
  supply_items = '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등',
  install_terms = '주차면 5% 이하(주용도 무관) · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토) · 착공 지시 후 90일 내 준공(패널티)', coexist_terms = '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차 · 안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)',
  other_support = '한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비(준공 시 정산) · 전기안전관리자 선임 · 완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)', misc_terms = '· 감리배치비 미제공
· 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션(27년 신차 5%·재구매 7.5%) 4분기 예정
· 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)'
where id = 'hec-h2-y7_10-kepco-new-com';

-- 검산: pl 하반기 = 모자 2(240/260) + 한전 2(200/220) + 상업 1(240) + 자투 3(220/240/120)

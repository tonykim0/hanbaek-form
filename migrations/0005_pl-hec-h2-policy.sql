-- 플러그링크(2026-07-28 v1.1, 7/1 접수분~)·현대엔지니어링(rev4, 7/21) 하반기 정책
-- lib/pricing-policy-plhec-h2.ts 에서 생성 — 손으로 고치지 마세요

insert into settlement_rules (id, name, steps, note, active)
values ('st-7dba2p', '환경부 승인 300,000원 → 준공마감 잔액', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":300000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

insert into settlement_rules (id, name, steps, note, active)
values ('st-1qwe6v1', '착공 300,000원 → 준공마감 잔액', '[{"trigger":"착공","basis":{"kind":"고정","unit":300000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

insert into settlement_rules (id, name, steps, note, active)
values ('st-m68j1d', '착공 700,000원 → 준공마감 잔액', '[{"trigger":"착공","basis":{"kind":"고정","unit":700000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- 플러그링크 (2026년 7월 1일) | 공동주택 | 7년 환경부 신규 | 한전불입
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y7-kepco-new-apt-2026', '플러그링크 (2026년 7월 1일) | 공동주택 | 7년 환경부 신규 | 한전불입', '플러그링크', '환경부', '한전불입',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 7월 1일', 400000, 1000000, 200000,
  'st-7dba2p',
  '영업비 차감(10기 이상)', null, null, true,
  null, '[{"months":6,"rate":149}]'::jsonb, null, 292,
  '주차면 5% 이내(기존 철거·운영 수량 포함) · 상업시설은 2%만(본사 협의 시 5% 이내) · 교체는 제조일 8년 경과 노후기 제자리만', '한전불입 가공·지중 모두 지원 · 안전관리선임 지원 · 주차면 기본 「EV 전기자동차」 문구 도색 무상', '기존 플러그링크 충전기만: 사전 협의 후 일부 혼용 주차면 가능 · 타사 혼합: 신규 설치 주차면 최소 2% 전용 구역 도색 필수', '· 영업 수량 120기 미만은 1기당 10만원 차감(121기부터 120기분 소급 지급)
· 모자분리 지상 설치 1기당 35만원 차감 · 제자리 교체 지상 10만원 차감
· 10기 이상이면 감리비용을 영업 수수료에서 차감
· 보조금 취소 시 자체투자 전환 불가 — 영업 수수료 전액 차감 + 추가 지불(신규·교체 35만 · 한전불입 7년 180만/10년 200만)
· 프로모션 연장은 영업비 차감 — 7년 최대 12개월(6개월당 1기 10만) · 10년 최대 24개월(6개월 10만·12개월 20만)
· 주차면 도색 요청 13만/면 차감 · 페인트 라인 5만/면 차감 · 안내표시판 개당 8,000원 차감
· 노후기 보조 교체(영업수수료 100/120/90만)·아파트 연동 사업(55/75만)은 케이스 미등록 — 현장 생기면 등록'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 7월 1일) | 공동주택 | 10년 환경부 신규 | 한전불입
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y10-kepco-new-apt-2026', '플러그링크 (2026년 7월 1일) | 공동주택 | 10년 환경부 신규 | 한전불입', '플러그링크', '환경부', '한전불입',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 7월 1일', 600000, 1000000, 200000,
  'st-7dba2p',
  '영업비 차감(10기 이상)', null, null, true,
  null, '[{"months":6,"rate":149},{"months":6,"rate":249}]'::jsonb, null, 292,
  '주차면 5% 이내(기존 철거·운영 수량 포함) · 상업시설은 2%만(본사 협의 시 5% 이내) · 교체는 제조일 8년 경과 노후기 제자리만', '한전불입 가공·지중 모두 지원 · 안전관리선임 지원 · 주차면 기본 「EV 전기자동차」 문구 도색 무상', '기존 플러그링크 충전기만: 사전 협의 후 일부 혼용 주차면 가능 · 타사 혼합: 신규 설치 주차면 최소 2% 전용 구역 도색 필수', '· 영업 수량 120기 미만은 1기당 10만원 차감(121기부터 120기분 소급 지급)
· 모자분리 지상 설치 1기당 35만원 차감 · 제자리 교체 지상 10만원 차감
· 10기 이상이면 감리비용을 영업 수수료에서 차감
· 보조금 취소 시 자체투자 전환 불가 — 영업 수수료 전액 차감 + 추가 지불(신규·교체 35만 · 한전불입 7년 180만/10년 200만)
· 프로모션 연장은 영업비 차감 — 7년 최대 12개월(6개월당 1기 10만) · 10년 최대 24개월(6개월 10만·12개월 20만)
· 주차면 도색 요청 13만/면 차감 · 페인트 라인 5만/면 차감 · 안내표시판 개당 8,000원 차감
· 노후기 보조 교체(영업수수료 100/120/90만)·아파트 연동 사업(55/75만)은 케이스 미등록 — 현장 생기면 등록'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 7월 1일) | 상업시설 | 10년 환경부 신규 | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y10-mother-new-biz-2026', '플러그링크 (2026년 7월 1일) | 상업시설 | 10년 환경부 신규 | 모자분리', '플러그링크', '환경부', '모자분리',
  '[10]'::jsonb, '["상업시설"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 7월 1일', 1200000, 1000000, 200000,
  'st-7dba2p',
  '영업비 차감(10기 이상)', null, null, true,
  null, '[{"months":6,"rate":149},{"months":6,"rate":249}]'::jsonb, null, 292,
  '주차면 5% 이내(기존 철거·운영 수량 포함) · 상업시설은 2%만(본사 협의 시 5% 이내) · 교체는 제조일 8년 경과 노후기 제자리만', '한전불입 가공·지중 모두 지원 · 안전관리선임 지원 · 주차면 기본 「EV 전기자동차」 문구 도색 무상', '기존 플러그링크 충전기만: 사전 협의 후 일부 혼용 주차면 가능 · 타사 혼합: 신규 설치 주차면 최소 2% 전용 구역 도색 필수', '· 영업 수량 120기 미만은 1기당 10만원 차감(121기부터 120기분 소급 지급)
· 모자분리 지상 설치 1기당 35만원 차감 · 제자리 교체 지상 10만원 차감
· 10기 이상이면 감리비용을 영업 수수료에서 차감
· 보조금 취소 시 자체투자 전환 불가 — 영업 수수료 전액 차감 + 추가 지불(신규·교체 35만 · 한전불입 7년 180만/10년 200만)
· 프로모션 연장은 영업비 차감 — 7년 최대 12개월(6개월당 1기 10만) · 10년 최대 24개월(6개월 10만·12개월 20만)
· 주차면 도색 요청 13만/면 차감 · 페인트 라인 5만/면 차감 · 안내표시판 개당 8,000원 차감
· 노후기 보조 교체(영업수수료 100/120/90만)·아파트 연동 사업(55/75만)은 케이스 미등록 — 현장 생기면 등록'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 7월 1일) | 공동주택 | 7년 자체투자 (제자리교체) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y7-mother-inplace-apt-2026', '플러그링크 (2026년 7월 1일) | 공동주택 | 7년 자체투자 (제자리교체) | 모자분리', '플러그링크', '자체투자', '모자분리',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 7월 1일', 1400000, 1000000, 200000,
  'st-1qwe6v1',
  '영업비 차감(10기 이상)', null, null, true,
  null, '[]'::jsonb, null, 292,
  '주차면 5% 이내(기존 운영 수량 포함) · 상업시설은 2%만(본사 협의 시 5% 이내)', '한전불입 가공·지중 모두 지원 · 안전관리선임 지원 · 주차면 기본 「EV 전기자동차」 문구 도색 무상', '기존 플러그링크 충전기만: 사전 협의 후 일부 혼용 주차면 가능 · 타사 혼합: 신규 설치 주차면 최소 2% 전용 구역 도색 필수', '· 프로모션 기본 없음 — 영업비 차감으로 가능(7년 최대 12개월: 6개월 10만/12개월 20만 · 10년 최대 24개월: 12개월 20만/24개월 40만)
· 영업 수량 120기 미만은 1기당 10만원 차감(121기부터 소급) · 모자분리 지상 35만 차감 · 제자리 교체 지상 10만 차감
· 기존 충전기 철거 완료 후 비용 지급 · 선급 30만의 실제 트리거는 플러그링크 승인 시(시스템은 착공으로 둠)
· 상업시설 자투(신규·이전 10만/제자리 60만)·자투 한전불입(신규·이전 35만/제자리 100만)은 분해 미확정 — 케이스 미등록'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 7월 1일) | 공동주택 | 10년 자체투자 (제자리교체) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y10-mother-inplace-apt-2026', '플러그링크 (2026년 7월 1일) | 공동주택 | 10년 자체투자 (제자리교체) | 모자분리', '플러그링크', '자체투자', '모자분리',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 7월 1일', 1600000, 1000000, 200000,
  'st-1qwe6v1',
  '영업비 차감(10기 이상)', null, null, true,
  null, '[]'::jsonb, null, 292,
  '주차면 5% 이내(기존 운영 수량 포함) · 상업시설은 2%만(본사 협의 시 5% 이내)', '한전불입 가공·지중 모두 지원 · 안전관리선임 지원 · 주차면 기본 「EV 전기자동차」 문구 도색 무상', '기존 플러그링크 충전기만: 사전 협의 후 일부 혼용 주차면 가능 · 타사 혼합: 신규 설치 주차면 최소 2% 전용 구역 도색 필수', '· 프로모션 기본 없음 — 영업비 차감으로 가능(7년 최대 12개월: 6개월 10만/12개월 20만 · 10년 최대 24개월: 12개월 20만/24개월 40만)
· 영업 수량 120기 미만은 1기당 10만원 차감(121기부터 소급) · 모자분리 지상 35만 차감 · 제자리 교체 지상 10만 차감
· 기존 충전기 철거 완료 후 비용 지급 · 선급 30만의 실제 트리거는 플러그링크 승인 시(시스템은 착공으로 둠)
· 상업시설 자투(신규·이전 10만/제자리 60만)·자투 한전불입(신규·이전 35만/제자리 100만)은 분해 미확정 — 케이스 미등록'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 7월 1일) | 공동주택 | 7년 자체투자 (신규위치) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y7-mother-move-apt-2026', '플러그링크 (2026년 7월 1일) | 공동주택 | 7년 자체투자 (신규위치) | 모자분리', '플러그링크', '자체투자', '모자분리',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (신규위치)', '턴키',
  2026, '2026년 7월 1일', 850000, 1000000, 200000,
  'st-1qwe6v1',
  '영업비 차감(10기 이상)', null, null, true,
  null, '[]'::jsonb, null, 292,
  '주차면 5% 이내(기존 운영 수량 포함) · 상업시설은 2%만(본사 협의 시 5% 이내)', '한전불입 가공·지중 모두 지원 · 안전관리선임 지원 · 주차면 기본 「EV 전기자동차」 문구 도색 무상', '기존 플러그링크 충전기만: 사전 협의 후 일부 혼용 주차면 가능 · 타사 혼합: 신규 설치 주차면 최소 2% 전용 구역 도색 필수', '· 프로모션 기본 없음 — 영업비 차감으로 가능(7년 최대 12개월: 6개월 10만/12개월 20만 · 10년 최대 24개월: 12개월 20만/24개월 40만)
· 영업 수량 120기 미만은 1기당 10만원 차감(121기부터 소급) · 모자분리 지상 35만 차감 · 제자리 교체 지상 10만 차감
· 기존 충전기 철거 완료 후 비용 지급 · 선급 30만의 실제 트리거는 플러그링크 승인 시(시스템은 착공으로 둠)
· 상업시설 자투(신규·이전 10만/제자리 60만)·자투 한전불입(신규·이전 35만/제자리 100만)은 분해 미확정 — 케이스 미등록'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 7월 1일) | 공동주택 | 10년 자체투자 (신규위치) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-y10-mother-move-apt-2026', '플러그링크 (2026년 7월 1일) | 공동주택 | 10년 자체투자 (신규위치) | 모자분리', '플러그링크', '자체투자', '모자분리',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (신규위치)', '턴키',
  2026, '2026년 7월 1일', 1050000, 1000000, 200000,
  'st-1qwe6v1',
  '영업비 차감(10기 이상)', null, null, true,
  null, '[]'::jsonb, null, 292,
  '주차면 5% 이내(기존 운영 수량 포함) · 상업시설은 2%만(본사 협의 시 5% 이내)', '한전불입 가공·지중 모두 지원 · 안전관리선임 지원 · 주차면 기본 「EV 전기자동차」 문구 도색 무상', '기존 플러그링크 충전기만: 사전 협의 후 일부 혼용 주차면 가능 · 타사 혼합: 신규 설치 주차면 최소 2% 전용 구역 도색 필수', '· 프로모션 기본 없음 — 영업비 차감으로 가능(7년 최대 12개월: 6개월 10만/12개월 20만 · 10년 최대 24개월: 12개월 20만/24개월 40만)
· 영업 수량 120기 미만은 1기당 10만원 차감(121기부터 소급) · 모자분리 지상 35만 차감 · 제자리 교체 지상 10만 차감
· 기존 충전기 철거 완료 후 비용 지급 · 선급 30만의 실제 트리거는 플러그링크 승인 시(시스템은 착공으로 둠)
· 상업시설 자투(신규·이전 10만/제자리 60만)·자투 한전불입(신규·이전 35만/제자리 100만)은 분해 미확정 — 케이스 미등록'
) on conflict (id) do nothing;

-- 현대엔지니어링 (2026년 7월 21일) | 전체 | 7·10년 자체투자 (제자리교체) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'hec-y7-10-mother-inplace-both-2026', '현대엔지니어링 (2026년 7월 21일) | 전체 | 7·10년 자체투자 (제자리교체) | 모자분리', '현대엔지니어링', '자체투자', '모자분리',
  '[7,10]'::jsonb, '["공동주택","상업시설"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 7월 21일', 600000, 1000000, 200000,
  'st-m68j1d',
  '영업자 부담(감리배치비 미제공)', null, null, true,
  '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등', '[{"months":6,"rate":150}]'::jsonb, null, 292,
  '주차면 5% 이하(주용도 무관) · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토) · 착공 지시 후 90일 내 준공(패널티)', '한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비(준공 시 정산) · 전기안전관리자 선임 · 완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)', '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차 · 안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)', '· 감리배치비 미제공
· 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션(27년 신차 5%·재구매 7.5%) 4분기 예정
· 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)
· 선급 70만의 실제 트리거는 계약서류 접수 시, 준공금 110만은 시운전 완료 시(시스템은 착공·준공마감으로 둠)'
) on conflict (id) do nothing;

-- 현대엔지니어링 (2026년 7월 21일) | 전체 | 7·10년 자체투자 (신규위치) | 모자분리
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'hec-y7-10-mother-move-both-2026', '현대엔지니어링 (2026년 7월 21일) | 전체 | 7·10년 자체투자 (신규위치) | 모자분리', '현대엔지니어링', '자체투자', '모자분리',
  '[7,10]'::jsonb, '["공동주택","상업시설"]'::jsonb, '자체투자 (신규위치)', '턴키',
  2026, '2026년 7월 21일', 600000, 1000000, 200000,
  'st-m68j1d',
  '영업자 부담(감리배치비 미제공)', null, null, true,
  '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등', '[{"months":6,"rate":150}]'::jsonb, null, 292,
  '주차면 5% 이하(주용도 무관) · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토) · 착공 지시 후 90일 내 준공(패널티)', '한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비(준공 시 정산) · 전기안전관리자 선임 · 완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)', '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차 · 안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)', '· 감리배치비 미제공
· 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션(27년 신차 5%·재구매 7.5%) 4분기 예정
· 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)
· 선급 70만의 실제 트리거는 계약서류 접수 시, 준공금 110만은 시운전 완료 시(시스템은 착공·준공마감으로 둠)'
) on conflict (id) do nothing;

-- 기존 유지 + 조건·기성(승인 30만) 갱신: pl-h2-y7-mother-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":149}]'::jsonb, charge_rate = 292,
  install_terms = '주차면 5% 이내(기존 철거·운영 수량 포함) · 상업시설은 2%만(본사 협의 시 5% 이내) · 교체는 제조일 8년 경과 노후기 제자리만', coexist_terms = '기존 플러그링크 충전기만: 사전 협의 후 일부 혼용 주차면 가능 · 타사 혼합: 신규 설치 주차면 최소 2% 전용 구역 도색 필수',
  other_support = '한전불입 가공·지중 모두 지원 · 안전관리선임 지원 · 주차면 기본 「EV 전기자동차」 문구 도색 무상', misc_terms = '· 영업 수량 120기 미만은 1기당 10만원 차감(121기부터 120기분 소급 지급)
· 모자분리 지상 설치 1기당 35만원 차감 · 제자리 교체 지상 10만원 차감
· 10기 이상이면 감리비용을 영업 수수료에서 차감
· 보조금 취소 시 자체투자 전환 불가 — 영업 수수료 전액 차감 + 추가 지불(신규·교체 35만 · 한전불입 7년 180만/10년 200만)
· 프로모션 연장은 영업비 차감 — 7년 최대 12개월(6개월당 1기 10만) · 10년 최대 24개월(6개월 10만·12개월 20만)
· 주차면 도색 요청 13만/면 차감 · 페인트 라인 5만/면 차감 · 안내표시판 개당 8,000원 차감
· 노후기 보조 교체(영업수수료 100/120/90만)·아파트 연동 사업(55/75만)은 케이스 미등록 — 현장 생기면 등록',
  default_settlement_rule_id = 'st-7dba2p'
where id = 'pl-h2-y7-mother-new-apt';

-- 기존 유지 + 조건·기성(승인 30만) 갱신: pl-h2-y10-mother-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":149},{"months":6,"rate":249}]'::jsonb, charge_rate = 292,
  install_terms = '주차면 5% 이내(기존 철거·운영 수량 포함) · 상업시설은 2%만(본사 협의 시 5% 이내) · 교체는 제조일 8년 경과 노후기 제자리만', coexist_terms = '기존 플러그링크 충전기만: 사전 협의 후 일부 혼용 주차면 가능 · 타사 혼합: 신규 설치 주차면 최소 2% 전용 구역 도색 필수',
  other_support = '한전불입 가공·지중 모두 지원 · 안전관리선임 지원 · 주차면 기본 「EV 전기자동차」 문구 도색 무상', misc_terms = '· 영업 수량 120기 미만은 1기당 10만원 차감(121기부터 120기분 소급 지급)
· 모자분리 지상 설치 1기당 35만원 차감 · 제자리 교체 지상 10만원 차감
· 10기 이상이면 감리비용을 영업 수수료에서 차감
· 보조금 취소 시 자체투자 전환 불가 — 영업 수수료 전액 차감 + 추가 지불(신규·교체 35만 · 한전불입 7년 180만/10년 200만)
· 프로모션 연장은 영업비 차감 — 7년 최대 12개월(6개월당 1기 10만) · 10년 최대 24개월(6개월 10만·12개월 20만)
· 주차면 도색 요청 13만/면 차감 · 페인트 라인 5만/면 차감 · 안내표시판 개당 8,000원 차감
· 노후기 보조 교체(영업수수료 100/120/90만)·아파트 연동 사업(55/75만)은 케이스 미등록 — 현장 생기면 등록',
  default_settlement_rule_id = 'st-7dba2p'
where id = 'pl-h2-y10-mother-new-apt';

-- 기존 유지 + 조건 갱신(rev4 와 금액·기성 이미 일치): hec-h2-y7_10-mother-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":150}]'::jsonb, charge_rate = 292,
  supply_items = '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등',
  install_terms = '주차면 5% 이하(주용도 무관) · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토) · 착공 지시 후 90일 내 준공(패널티)', coexist_terms = '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차 · 안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)',
  other_support = '한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비(준공 시 정산) · 전기안전관리자 선임 · 완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)', misc_terms = '· 감리배치비 미제공
· 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션(27년 신차 5%·재구매 7.5%) 4분기 예정
· 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)'
where id = 'hec-h2-y7_10-mother-new-apt';

-- 기존 유지 + 조건 갱신(rev4 와 금액·기성 이미 일치): hec-h2-y7_10-kepco-new-apt
update pricing_rules set
  promo = '[{"months":6,"rate":150}]'::jsonb, charge_rate = 292,
  supply_items = '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등',
  install_terms = '주차면 5% 이하(주용도 무관) · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토) · 착공 지시 후 90일 내 준공(패널티)', coexist_terms = '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차 · 안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)',
  other_support = '한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비(준공 시 정산) · 전기안전관리자 선임 · 완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)', misc_terms = '· 감리배치비 미제공
· 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션(27년 신차 5%·재구매 7.5%) 4분기 예정
· 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)'
where id = 'hec-h2-y7_10-kepco-new-apt';

-- 기존 유지 + 조건 갱신(rev4 와 금액·기성 이미 일치): hec-h2-y7_10-mother-new-com
update pricing_rules set
  promo = '[{"months":6,"rate":150}]'::jsonb, charge_rate = 292,
  supply_items = '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등',
  install_terms = '주차면 5% 이하(주용도 무관) · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토) · 착공 지시 후 90일 내 준공(패널티)', coexist_terms = '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차 · 안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)',
  other_support = '한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비(준공 시 정산) · 전기안전관리자 선임 · 완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)', misc_terms = '· 감리배치비 미제공
· 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션(27년 신차 5%·재구매 7.5%) 4분기 예정
· 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)'
where id = 'hec-h2-y7_10-mother-new-com';

-- 기존 유지 + 조건 갱신(rev4 와 금액·기성 이미 일치): hec-h2-y7_10-kepco-new-com
update pricing_rules set
  promo = '[{"months":6,"rate":150}]'::jsonb, charge_rate = 292,
  supply_items = '충전기 / 캐노피 / 폴대 · 미지급(책임 을): 소화기 · 질식소화포 · 주수관창 · CCTV/열화상카메라 · 연기감지기 등',
  install_terms = '주차면 5% 이하(주용도 무관) · 차충비 1 이상(증빙 필요) · 계약기간 7년 이상(지중인입 10년 · 5년은 별도 검토) · 착공 지시 후 90일 내 준공(패널티)', coexist_terms = '병행주차 가능 — 2% 이하 전용주차 · 2% 초과 병행주차 · 안내문·도색 비용 영업자 부담(전용 전환 시 비용 포함)',
  other_support = '한전불입금(한전 세금계산서 수령 후 30일 내 정산) · 안전공사 검사·점검비(준공 시 정산) · 전기안전관리자 선임 · 완속 30기 이상 설치 시 급속 1기 지원(현장당 · 재고 소진 시 중단)', misc_terms = '· 감리배치비 미제공
· 프로모션 연장 차감 단가 미정 · 4분기 기본단가 290원 예정 · 장기 프로모션(27년 신차 5%·재구매 7.5%) 4분기 예정
· 의무영업 1,000기 이상(갑 승인 기준 · 미달 시 차년도 계약 페널티)'
where id = 'hec-h2-y7_10-kepco-new-com';

-- 신정책과 금액이 다른 옛 케이스 — 참조 없을 때만 삭제: pl-h2-y7-kepco-new-apt
delete from pricing_rules
where id = 'pl-h2-y7-kepco-new-apt'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

-- 신정책과 금액이 다른 옛 케이스 — 참조 없을 때만 삭제: pl-h2-y10-kepco-new-apt
delete from pricing_rules
where id = 'pl-h2-y10-kepco-new-apt'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

-- 검산: 플러그링크 7/1 케이스 7건 + 현대 자부담 2건, 옛 pl 한전불입 하반기 0건

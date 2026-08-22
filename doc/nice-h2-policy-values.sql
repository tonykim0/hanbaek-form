-- 나이스인프라 26년 하반기 정책 값 (2026-08-05 배포본)
-- lib/pricing-policy-nice-h2.ts 에서 생성 — 손으로 고치지 마세요

begin;

-- 나이스인프라 (2026년 8월 1일) | 공동주택 | 7년 환경부 신규 | 모자분리
update pricing_rules set
  supply_items        = '스탠드폴 + 가림막 제공 (운송비 제외)',
  promo               = '[{"months":6,"rate":149}]'::jsonb,
  promo_extend_deduct = null,
  charge_rate         = 295,
  install_terms       = '공동주택 주차면 5% · 공동주택 외 주차면 2% · 나이스 단독은 일부 병행 가능(사전 협의) · 타사 혼합은 병행 불가 · 감리비 미지원',
  other_support       = '열화상 3면당 1대 무상 (옥내·지하 한정)',
  note                = null
where id = 'nice-y7-mother-new-apt-2026';

-- 나이스인프라 (2026년 8월 1일) | 공동주택 | 10년 환경부 신규 | 모자분리
update pricing_rules set
  supply_items        = '스탠드폴 + 가림막 제공 (운송비 제외)',
  promo               = '[{"months":6,"rate":149},{"months":6,"rate":220}]'::jsonb,
  promo_extend_deduct = null,
  charge_rate         = 295,
  install_terms       = '공동주택 주차면 5% · 공동주택 외 주차면 2% · 나이스 단독은 일부 병행 가능(사전 협의) · 타사 혼합은 병행 불가 · 감리비 미지원',
  other_support       = '열화상 3면당 1대 무상 (옥내·지하 한정)',
  note                = null
where id = 'nice-y10-mother-new-apt-2026';

-- 나이스인프라 (2026년 8월 1일) | 공동주택 | 10년 환경부 신규 | 한전불입
update pricing_rules set
  supply_items        = '스탠드폴 + 가림막 제공 (운송비 제외)',
  promo               = '[{"months":6,"rate":149},{"months":6,"rate":220}]'::jsonb,
  promo_extend_deduct = null,
  charge_rate         = 295,
  install_terms       = '공동주택 주차면 5% · 공동주택 외 주차면 2% · 나이스 단독은 일부 병행 가능(사전 협의) · 타사 혼합은 병행 불가 · 감리비 미지원',
  other_support       = '열화상 3면당 1대 무상 (옥내·지하 한정)',
  note                = null
where id = 'nice-y10-kepco-new-apt-2026';

-- 나이스인프라 (2026년 8월 1일) | 공동주택 | 7년 자체투자 (제자리교체) | 모자분리
update pricing_rules set
  supply_items        = '스탠드폴 + 가림막 제공 (운송비 제외)',
  promo               = '[{"months":6,"rate":149}]'::jsonb,
  promo_extend_deduct = null,
  charge_rate         = 295,
  install_terms       = '공동주택 주차면 5% · 공동주택 외 주차면 2% · 나이스 단독은 일부 병행 가능(사전 협의) · 타사 혼합은 병행 불가 · 감리비 미지원 · 교체공사는 노후설비에 따른 일부 재시공 필수 — 분전함~충전기 케이블·배관 신설, 차단기·튜브 교체, 도색(레터링). 배관이 후강전선관·덕트면 재사용 가능',
  other_support       = '열화상 3면당 1대 무상 (옥내·지하 한정)',
  note                = null
where id = 'nice-y7-mother-inplace-apt-2026';

-- 나이스인프라 (2026년 8월 1일) | 공동주택 | 10년 자체투자 (제자리교체) | 모자분리
update pricing_rules set
  supply_items        = '스탠드폴 + 가림막 제공 (운송비 제외)',
  promo               = '[{"months":6,"rate":149},{"months":6,"rate":220}]'::jsonb,
  promo_extend_deduct = null,
  charge_rate         = 295,
  install_terms       = '공동주택 주차면 5% · 공동주택 외 주차면 2% · 나이스 단독은 일부 병행 가능(사전 협의) · 타사 혼합은 병행 불가 · 감리비 미지원 · 교체공사는 노후설비에 따른 일부 재시공 필수 — 분전함~충전기 케이블·배관 신설, 차단기·튜브 교체, 도색(레터링). 배관이 후강전선관·덕트면 재사용 가능',
  other_support       = '열화상 3면당 1대 무상 (옥내·지하 한정)',
  note                = null
where id = 'nice-y10-mother-inplace-apt-2026';

-- 나이스인프라 (2026년 8월 1일) | 공동주택 | 7년 자체투자 (신규위치) | 모자분리
update pricing_rules set
  supply_items        = '스탠드폴 + 가림막 제공 (운송비 제외)',
  promo               = '[{"months":6,"rate":149}]'::jsonb,
  promo_extend_deduct = null,
  charge_rate         = 295,
  install_terms       = '공동주택 주차면 5% · 공동주택 외 주차면 2% · 나이스 단독은 일부 병행 가능(사전 협의) · 타사 혼합은 병행 불가 · 감리비 미지원 · 교체 전 입주민 의향조사 필요(민원 사전 차단). 타CPO 교체는 계약종료 확인 필수 — 해지 내용증명·소유권, 보조금 의무운영 5년 경과',
  other_support       = '열화상 3면당 1대 무상 (옥내·지하 한정)',
  note                = null
where id = 'nice-y7-mother-move-apt-2026';

-- 나이스인프라 (2026년 8월 1일) | 공동주택 | 10년 자체투자 (신규위치) | 모자분리
update pricing_rules set
  supply_items        = '스탠드폴 + 가림막 제공 (운송비 제외)',
  promo               = '[{"months":6,"rate":149},{"months":6,"rate":220}]'::jsonb,
  promo_extend_deduct = null,
  charge_rate         = 295,
  install_terms       = '공동주택 주차면 5% · 공동주택 외 주차면 2% · 나이스 단독은 일부 병행 가능(사전 협의) · 타사 혼합은 병행 불가 · 감리비 미지원 · 교체 전 입주민 의향조사 필요(민원 사전 차단). 타CPO 교체는 계약종료 확인 필수 — 해지 내용증명·소유권, 보조금 의무운영 5년 경과',
  other_support       = '열화상 3면당 1대 무상 (옥내·지하 한정)',
  note                = null
where id = 'nice-y10-mother-move-apt-2026';

commit;

-- 확인: 7 이 나와야 합니다
select count(*) from pricing_rules
where cpo = '나이스인프라' and start_date = '2026년 8월 1일' and charge_rate = 295;

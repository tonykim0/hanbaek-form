-- 프로모션 연장 상한을 연장 값에 실는다 — 기타 칸에서 옮겨 온 나머지 반쪽 (한백 2026-08-29)
-- 정의: lib/pricing-policy-plhec-h2.ts 의 plPromoExtend() · types/project.ts 의 PromoExtendOption.cap
--
-- 기타 칸에 「프로모션 연장은 영업비 차감으로 가능 — 7년 최대 1년 · 10년 최대 2년」이 있었다.
-- 앞 반쪽은 단가표 행의 이름이 되었고(「프로모션 연장 (영업비 차감)」, 0037),
-- 뒤 반쪽(연수별 상한)이 갈 곳이 없어 남아 있었다 — 연장 행을 보는 사람은 그 말을 못 봤다.
--
-- ★칸을 새로 만들지 않는다★ (한백 2026-08-29). promo_extend 는 jsonb 라 옵션에 한 칸을
-- 더 실을 수 있다. 상한은 옵션의 값이 아니라 케이스의 값이라 두 옵션에 같은 글자가 들어간다 —
-- 화면이 중복을 걷어 한 번만 적는다.
--
-- 값은 케이스의 계약연수가 정한다: 7년 최대 1년 · 10년 최대 2년.
-- 프로모션이 없는 케이스(자체투자·연동)는 연장도 없어 손대지 않는다.

update pricing_rules
set promo_extend = '[{"months":6,"rate":149,"deduct":200000,"cap":"최대 1년"},
                    {"months":6,"rate":249,"deduct":100000,"cap":"최대 1년"}]'::jsonb
where cpo = '플러그링크' and start_date = '2026년 7월 1일'
  and biz_type = '환경부' and term_years::text = '[7]'
  and promo_extend is not null;

update pricing_rules
set promo_extend = '[{"months":6,"rate":149,"deduct":200000,"cap":"최대 2년"},
                    {"months":6,"rate":249,"deduct":100000,"cap":"최대 2년"}]'::jsonb
where cpo = '플러그링크' and start_date = '2026년 7월 1일'
  and biz_type = '환경부' and term_years::text = '[10]'
  and promo_extend is not null;

-- 플러그링크 자체투자 상업시설 10년 케이스를 걷는다 (한백 2026-09-05)
-- 정의: lib/pricing-policy-plhec-h2.ts 의 PL_INV_ROWS 에서 같이 뺐다
--
-- ★왜★ 「플러그링크 자투 상업은 그냥 없는 걸로 하자」(한백). 260629 문서에 금액 120만은
-- 있었지만 분해가 서지 않는다: 시공 95 + 마진 20 을 빼면 영업비가 0 이고(0046 이 남는 5만을
-- 마진으로 옮겨 0 / 95 / 25 가 됐다), 0053 이 붙인 기성 1차 20만은 문서상 「영업비」다 —
-- 영업비가 없는 현장의 영업비 선금이 된다. 값이 앞뒤 안 맞는 케이스를 목록에 두면 언젠가
-- 그것으로 계약이 들어온다. 라인이 0건인 지금 걷는다.
--
-- 참조가 있으면 지우지 않고 중지한다 — 케이스는 라인이 참조하면 불변이다(CLAUDE.md).
-- 지금 프로덕션은 라인 0건이라 delete 로 간다. 멱등: 두 번째 실행은 둘 다 0행이다.

update pricing_rules
   set active = false
 where id = 'pl-y10-mother-inplace-biz-2026'
   and active
   and exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

delete from pricing_rules
 where id = 'pl-y10-mother-inplace-biz-2026'
   and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

-- 검산 — 「걷었다」가 사실인가. 남아 있는데 사용중이면 고른 사람이 그 케이스로 계약을 만든다.
do $$
declare still int;
begin
  select count(*) into still from pricing_rules
   where id = 'pl-y10-mother-inplace-biz-2026' and active;
  if still > 0 then
    raise exception '자투 상업 케이스가 아직 사용중입니다 — 참조가 생겨 중지도 안 됐습니다';
  end if;
end $$;

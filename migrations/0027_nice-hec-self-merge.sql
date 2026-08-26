-- 나이스·현대엔지니어링의 자체투자를 한 칸으로 합친다 — 교체유형이 금액을 가르지 않는다
-- 정의: lib/pricing-policy-nice-h2.ts(NICE_DROP_IDS) · lib/pricing-policy-plhec-h2.ts(HEC_DROP_IDS)
--
-- 왜: 두 운영사는 제자리교체와 신규위치의 금액이 같다. 나이스는 공사 2,000/2,100 이 양쪽
-- 같고, 현대엔지니어링은 같은 케이스를 repl_type 만 바꿔 두 벌 만들고 있었다(한 글자도
-- 다르지 않다). 케이스가 둘이면 접수 화면의 자체투자 대수 표가 두 행으로 펴져 한 현장이
-- 두 라인으로 갈린다 — 강원 강릉 일송아파트 11기가 「10대 + 1대」로 갈린 것이 그것이다
-- (한백 2026-08-26). 플러그링크와 같은 방식으로 제자리교체 한 칸에 담는다.
-- 에버온·SK일렉링크는 단가가 실제로 달라 그대로 둔다.
--
-- 참조가 생긴 케이스는 남는다(가드). 남으면 그 라인을 제자리교체 케이스로 옮긴 뒤
-- 다시 지운다 — 케이스는 참조되면 불변이라 지우는 것도 참조가 없을 때만 한다.

delete from pricing_rules
where id = 'nice-y7-mother-move-apt-2026'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

delete from pricing_rules
where id = 'nice-y10-mother-move-apt-2026'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

delete from pricing_rules
where id = 'hec-y7-10-mother-move-both-2026'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);

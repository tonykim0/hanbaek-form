-- 플러그링크 하반기(2026년 7월 1일 접수분) 기성 — 문서의 대금 조항을 단계로 담는다 (한백 지시 2026-09-04)
-- lib/pricing-policy-plhec-h2.ts · lib/pricing-policy-link-h2.ts 에서 생성 — 손으로 고치지 마세요
--
-- ★왜★ 배포본 260629 의 대금 조항(영업비 20만 계약 승인 후 · 공사비 선금 50% 보조금 선금
-- 수령 후 · 잔금 50% 준공 승인 후)은 비율이 문서에 확정돼 있지 않아 그동안 단계로 담지
-- 않았다. 그 결과 ★자체투자 케이스는 기성이 아예 없었고, 그런 현장은 지급조건 확정 자체가
-- 막혔다★ (「정산 규칙이 없어 확정할 수 없습니다」 — 율량동 현대아파트에서 드러났다).
-- 한백이 조항을 그대로 담기로 정했다(2026-09-04): 보조금은 3단계, ★자체투자와 연동은
-- 2단계 — 20만 먼저, 나머지는 준공 이후★.
--
-- 트리거는 콘솔이 가진 셋(환경부 승인·착공·준공마감)에 얹는다. 문서의 「계약 승인」과
-- 「보조금 선금 수령」은 콘솔에 없는 시점이라, 0005 가 「선급의 실제 트리거는 PL 승인 ·
-- 시스템은 착공으로 둠」이라 적어 둔 것과 같은 방식으로 각각 환경부 승인·착공에 실었다.
-- 자투·연동은 환경부 승인일이 안 찍히는 사업이라 첫 차수를 착공에 물린다(한백 지시) —
-- 실착공일은 시공사가 넣으면 스스로 열린다(연동도 「개통 및 통신확인」으로 넘어가려면
-- 착공일이 필수다 — lib/process.ts).
--
-- ★연동을 자투와 같이 묶은 것은 0045 의 기록과 어긋난다★ — 그 파일은 「착공 선금은 공사가
-- 있어야 있는 것이라 연동에는 없다」며 SK 연동을 준공 일시금(lump-100)으로 뒀다. 이번은
-- 한백이 「연동도 자투에 포함돼」라고 정했다(2026-09-04). SK 연동은 부속합의서가 따로
-- 있어 그대로 lump-100 이다 — 이 파일은 플러그링크만 건드린다.
--
-- 비율 50% 는 문서가 확정하지 않은 값이다 — 정해지면 새 마이그레이션으로 고친다.
-- 상반기(2026년 1월 20일) 케이스는 다른 문서라 손대지 않는다.
--
-- 멱등: 규칙 insert 는 on conflict do nothing, 나머지는 값이 이미 같으면 0행이다.

-- ── 1. 정산 규칙 — 단계가 정체다. 같은 모양이면 한 행을 같이 쓴다 ──
-- 환경부 승인|고정|200000→착공|고정|1100000→준공마감|잔액
insert into settlement_rules (id, name, steps, note, active)
values ('st-7lnv4d', '환경부 승인 200,000원 → 착공 1,100,000원 → 준공마감 잔액', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1100000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- 환경부 승인|고정|200000→착공|고정|1200000→준공마감|잔액
insert into settlement_rules (id, name, steps, note, active)
values ('st-ym8906', '환경부 승인 200,000원 → 착공 1,200,000원 → 준공마감 잔액', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1200000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- 환경부 승인|고정|200000→착공|고정|900000→준공마감|잔액
insert into settlement_rules (id, name, steps, note, active)
values ('st-4bugpk', '환경부 승인 200,000원 → 착공 900,000원 → 준공마감 잔액', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":900000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- 환경부 승인|고정|200000→착공|고정|1000000→준공마감|잔액
insert into settlement_rules (id, name, steps, note, active)
values ('st-1cekkaw', '환경부 승인 200,000원 → 착공 1,000,000원 → 준공마감 잔액', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1000000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- 착공|고정|200000→준공마감|잔액
insert into settlement_rules (id, name, steps, note, active)
values ('st-1p2t3w8', '착공 200,000원 → 준공마감 잔액', '[{"trigger":"착공","basis":{"kind":"고정","unit":200000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- ── 2. 케이스가 그 규칙을 제안값으로 든다 ──
-- 케이스의 제안값은 라인에 단가를 붙일 때 현장으로 옮겨간다(lib/data/store/payouts.ts
-- applySuggestedSettlement) — 이미 붙어 있는 현장은 3번이 맞춘다.

-- 보조 7년 공동주택 턴키 240만: 환경부 승인 200,000원 → 착공 1,100,000원 → 준공마감 잔액
update pricing_rules set default_settlement_rule_id = 'st-7lnv4d'
where id = 'pl-h2-y7-mother-new-apt' and default_settlement_rule_id is distinct from 'st-7lnv4d';

-- 보조 10년 공동주택 턴키 260만: 환경부 승인 200,000원 → 착공 1,200,000원 → 준공마감 잔액
update pricing_rules set default_settlement_rule_id = 'st-ym8906'
where id = 'pl-h2-y10-mother-new-apt' and default_settlement_rule_id is distinct from 'st-ym8906';

-- 보조 10년 상업시설 턴키 240만: 환경부 승인 200,000원 → 착공 1,100,000원 → 준공마감 잔액
update pricing_rules set default_settlement_rule_id = 'st-7lnv4d'
where id = 'pl-y10-mother-new-biz-2026' and default_settlement_rule_id is distinct from 'st-7lnv4d';

-- 보조 한전 턴키 200만: 환경부 승인 200,000원 → 착공 900,000원 → 준공마감 잔액
update pricing_rules set default_settlement_rule_id = 'st-4bugpk'
where id = 'pl-h2-y7-kepco-new-apt' and default_settlement_rule_id is distinct from 'st-4bugpk';

-- 보조 한전 턴키 220만: 환경부 승인 200,000원 → 착공 1,000,000원 → 준공마감 잔액
update pricing_rules set default_settlement_rule_id = 'st-1cekkaw'
where id = 'pl-h2-y10-kepco-new-apt' and default_settlement_rule_id is distinct from 'st-1cekkaw';

-- 자투 턴키 220만: 착공 200,000원 → 준공마감 잔액
update pricing_rules set default_settlement_rule_id = 'st-1p2t3w8'
where id = 'pl-y7-mother-inplace-apt-2026' and default_settlement_rule_id is distinct from 'st-1p2t3w8';

-- 자투 턴키 240만: 착공 200,000원 → 준공마감 잔액
update pricing_rules set default_settlement_rule_id = 'st-1p2t3w8'
where id = 'pl-y10-mother-inplace-apt-2026' and default_settlement_rule_id is distinct from 'st-1p2t3w8';

-- 자투 턴키 120만: 착공 200,000원 → 준공마감 잔액
update pricing_rules set default_settlement_rule_id = 'st-1p2t3w8'
where id = 'pl-y10-mother-inplace-biz-2026' and default_settlement_rule_id is distinct from 'st-1p2t3w8';

-- 연동 턴키 55만: 착공 200,000원 → 준공마감 잔액
update pricing_rules set default_settlement_rule_id = 'st-1p2t3w8'
where id = 'pl-y7-mother-link-apt-2026' and default_settlement_rule_id is distinct from 'st-1p2t3w8';

-- 연동 턴키 75만: 착공 200,000원 → 준공마감 잔액
update pricing_rules set default_settlement_rule_id = 'st-1p2t3w8'
where id = 'pl-y10-mother-link-apt-2026' and default_settlement_rule_id is distinct from 'st-1p2t3w8';

-- ── 3. 그 케이스를 쓰는 현장의 정산 규칙을 맞춘다 (한백 지시 2026-09-04) ──
--
-- 셋이다(2026-09-04 프로덕션): 율량동 현대아파트(자투 — 규칙이 아예 없어 확정이 막혀
-- 있었다) · 무등파크봉선3차1단지 · 하엘에스페이스(둘 다 옛 2단계 pl-2step).
-- ★확정된 현장도 바꾼다★ — 하엘은 2026-09-04 에 확정됐지만 셋 다 트리거가 하나도
-- 안 열렸고 수금 기록도 없어, 지금이 실적을 건드리지 않고 바꿀 수 있는 때다(한백 지시).
-- 확정(payout_terms_confirmed_at)은 그대로 둔다 — 잠금을 푸는 것이 아니라 조건을 고치는 것이다.
-- 저장소를 지나지 않으므로 audit_log 는 남지 않는다 — 이 파일이 기록이다.
--
-- 라인이 여럿이고 케이스가 서로 다른 규칙을 제안하면 건드리지 않는다(kinds = 1) —
-- 어느 쪽이 현장의 규칙인지 사람이 정할 일이다. 3단계는 고정액이 턴키에 묶여 있어
-- 턴키가 다른 라인이 섞이면 규칙 하나로는 배분이 정책과 어긋난다.
update projects j
   set settlement_rule_id = s.rule,
       settlement_applied_at = '2026-09-04'
  from (
    select cl.project_id,
           min(p.default_settlement_rule_id) as rule,
           count(distinct p.default_settlement_rule_id) as kinds
      from contract_lines cl
      join pricing_rules p on p.id = cl.pricing_rule_id
     where p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일'
     group by cl.project_id
  ) s
 where s.project_id = j.id
   and s.kinds = 1
   and s.rule is not null
   and j.settlement_rule_id is distinct from s.rule;

-- ── 4. 검산 — 조용한 실패를 막는다 ──
--
-- ★현장 쪽을 「규칙이 null 인가」로 검사하지 않는다★ — 섞인 현장(kinds > 1)은 일부러
-- 손대지 않으므로, null 을 예외로 삼으면 무고한 상태가 프로덕션 배포를 통째로 막는다
-- (러너는 실패하면 빌드를 죽인다). 검사하는 것은 3번이 세운 불변식 자체다:
-- 제안값이 하나로 정해지는 현장은 그 값을 갖고 있다.
do $$
declare no_settle int; mismatched int; mixed int;
begin
  select count(*) into no_settle from pricing_rules
   where cpo = '플러그링크' and start_date = '2026년 7월 1일' and default_settlement_rule_id is null;
  if no_settle > 0 then
    raise exception '플러그링크 하반기 케이스 %건에 기성이 안 붙었습니다', no_settle;
  end if;

  select count(*) into mismatched
    from (
    select cl.project_id,
           min(p.default_settlement_rule_id) as rule,
           count(distinct p.default_settlement_rule_id) as kinds
      from contract_lines cl
      join pricing_rules p on p.id = cl.pricing_rule_id
     where p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일'
     group by cl.project_id
    ) s
    join projects j on j.id = s.project_id
   where s.kinds = 1 and s.rule is not null and j.settlement_rule_id is distinct from s.rule;
  if mismatched > 0 then
    raise exception '하반기 케이스를 쓰는 현장 %건이 케이스 제안값과 다른 정산 규칙을 갖고 있습니다', mismatched;
  end if;

  -- 섞인 현장은 남는다 — 조용히 두지 않고 빌드 로그에 남긴다(NOTICE 는 러너가 삼킨다)
  select count(*) into mixed from (
    select cl.project_id,
           min(p.default_settlement_rule_id) as rule,
           count(distinct p.default_settlement_rule_id) as kinds
      from contract_lines cl
      join pricing_rules p on p.id = cl.pricing_rule_id
     where p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일'
     group by cl.project_id
  ) s where s.kinds > 1;
  if mixed > 0 then
    raise warning '하반기 케이스가 섞인 현장 %건은 정산 규칙을 사람이 골라야 합니다 — 현장 상세 기성 탭', mixed;
  end if;
end $$;

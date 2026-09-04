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
-- ★겨냥을 조건에 적는다 — 「규칙이 없거나 옛 2단계인 현장」★. 한백 지시의 내용이 그것이고,
-- 그렇게 적으면 원장 없는 DB 에 이 파일이 다시 돌아도(러너 주석의 그 상황) 그 사이 사람이
-- 화면에서 고른 값을 조용히 되돌리지 않는다. 앱 쪽(applySuggestedSettlement)도 규칙이
-- 비었을 때만 채운다 — 값이 있으면 사람이 정한 것으로 본다.
update projects j
   set settlement_rule_id = s.rule,
       settlement_applied_at = '2026-09-04'
  from (
    select cl.project_id,
           count(*) filter (where p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일') as h2,
           count(*) filter (where not (p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일')) as other,
           min(p.default_settlement_rule_id) filter (where p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일') as rule,
           count(distinct p.default_settlement_rule_id) filter (where p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일') as kinds
      from contract_lines cl
      join pricing_rules p on p.id = cl.pricing_rule_id
     group by cl.project_id
  ) s
 where s.project_id = j.id
   and s.h2 > 0
   and s.other = 0
   and s.kinds = 1
   and s.rule is not null
   and (j.settlement_rule_id is null or j.settlement_rule_id = 'pl-2step')
   and j.settlement_rule_id is distinct from s.rule;

-- ── 4. 검산 — 조용한 실패를 막는다 ──
--
-- ★검사는 이 파일이 쓴 것에만 겨눈다.★ 「하반기 케이스 전부에 기성이 있는가」로 세면,
-- 뒤에 사람이 화면에서 만든 기성 미정 케이스 하나가(빈 단계는 정상이다 — 근거 없는 조항을
-- 지어내지 않기로 한 자리다) 프로덕션 배포를 통째로 막는다. 러너는 실패하면 빌드를 죽인다.
do $$
declare bad int; left_over text;
begin
  -- 4-1. 열 개가 정한 규칙을 물었나 — update 가 0행을 고치고도 성공하는 조용한 실패를 잡는다
  select count(*) into bad
    from (values
      ('pl-h2-y7-mother-new-apt', 'st-7lnv4d'),
      ('pl-h2-y10-mother-new-apt', 'st-ym8906'),
      ('pl-y10-mother-new-biz-2026', 'st-7lnv4d'),
      ('pl-h2-y7-kepco-new-apt', 'st-4bugpk'),
      ('pl-h2-y10-kepco-new-apt', 'st-1cekkaw'),
      ('pl-y7-mother-inplace-apt-2026', 'st-1p2t3w8'),
      ('pl-y10-mother-inplace-apt-2026', 'st-1p2t3w8'),
      ('pl-y10-mother-inplace-biz-2026', 'st-1p2t3w8'),
      ('pl-y7-mother-link-apt-2026', 'st-1p2t3w8'),
      ('pl-y10-mother-link-apt-2026', 'st-1p2t3w8')
    ) as want(id, rule)
    join pricing_rules p on p.id = want.id
   where p.default_settlement_rule_id is distinct from want.rule;
  if bad > 0 then
    raise exception '하반기 케이스 %건이 이 파일이 정한 기성을 물지 않았습니다', bad;
  end if;

  -- 4-2. 규칙 다섯의 단계가 넣으려던 것과 같은가.
  --      id 는 단계의 해시라 보통 같다. 겹치는 순간 insert 가 조용히 건너뛰고 남의 단계를
  --      든 규칙이 케이스에 걸리는데, 그때 틀리는 것은 화면에도 로그에도 안 나오는 돈이다.
  select count(*) into bad
    from (values
      ('st-7lnv4d', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1100000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb),
      ('st-ym8906', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1200000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb),
      ('st-4bugpk', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":900000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb),
      ('st-1cekkaw', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1000000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb),
      ('st-1p2t3w8', '[{"trigger":"착공","basis":{"kind":"고정","unit":200000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb)
    ) as want(id, steps)
    join settlement_rules r on r.id = want.id
   where r.steps <> want.steps;
  if bad > 0 then
    raise exception '정산 규칙 %건의 단계가 이 파일과 다릅니다 — 해시가 겹쳤을 수 있습니다', bad;
  end if;

  -- 4-3. 고정 차수의 합이 받는 단가를 넘으면 잔액이 0 으로 깎여 계획이 턴키를 넘는다.
  --      3단계의 가운데 금액은 정의 파일에 손으로 적은 턴키에서 나온 값이라, DB 의 금액이
  --      바뀌면 여기서 어긋난다 — 마지막이 잔액이라 합 검사는 그것을 못 잡는다.
  select count(*) into bad
    from (values
      ('pl-h2-y7-mother-new-apt'),
      ('pl-h2-y10-mother-new-apt'),
      ('pl-y10-mother-new-biz-2026'),
      ('pl-h2-y7-kepco-new-apt'),
      ('pl-h2-y10-kepco-new-apt'),
      ('pl-y7-mother-inplace-apt-2026'),
      ('pl-y10-mother-inplace-apt-2026'),
      ('pl-y10-mother-inplace-biz-2026'),
      ('pl-y7-mother-link-apt-2026'),
      ('pl-y10-mother-link-apt-2026')
    ) as want(id)
    join pricing_rules p on p.id = want.id
    join settlement_rules r on r.id = p.default_settlement_rule_id
   where (select coalesce(sum((e->'basis'->>'unit')::bigint), 0)
            from jsonb_array_elements(r.steps) e
           where e->'basis'->>'kind' = '고정')
         > p.sales_unit + p.cons_unit + p.margin;
  if bad > 0 then
    raise exception '고정 차수의 합이 받는 단가를 넘는 케이스 %건 — 금액이 바뀌었습니다', bad;
  end if;

  -- 4-4. 남은 현장은 ★id 를 찍어★ 알린다. 건수만 남기면 빌드 로그를 봐도 누구인지 못 찾는다.
  --      (NOTICE 는 러너가 삼키므로 WARNING 이다 — scripts/migrate.ts 의 onnotice)
  select string_agg(j.id || '(' || coalesce(j.settlement_rule_id, '규칙없음') || ')', ', ')
    into left_over
    from (
    select cl.project_id,
           count(*) filter (where p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일') as h2,
           count(*) filter (where not (p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일')) as other,
           min(p.default_settlement_rule_id) filter (where p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일') as rule,
           count(distinct p.default_settlement_rule_id) filter (where p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일') as kinds
      from contract_lines cl
      join pricing_rules p on p.id = cl.pricing_rule_id
     group by cl.project_id
    ) s
    join projects j on j.id = s.project_id
   where s.h2 > 0
     and (s.other > 0 or s.kinds <> 1 or j.settlement_rule_id is distinct from s.rule);
  if left_over is not null then
    raise warning '하반기 케이스를 쓰는 현장의 정산 규칙을 사람이 골라야 합니다 — %', left_over;
  end if;
end $$;

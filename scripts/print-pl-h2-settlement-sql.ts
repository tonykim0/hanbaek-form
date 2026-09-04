/**
 * 플러그링크 하반기(2026년 7월 1일 접수분) 기성 단계의 마이그레이션 SQL 을 찍는다 (0053 생성기).
 *
 *   npx tsx scripts/print-pl-h2-settlement-sql.ts > migrations/0053_pl-h2-settlement-steps.sql
 *
 * 값·근거는 lib/pricing-policy-plhec-h2.ts(보조 3단계 plSubSteps · 자투 PL_INV_STEPS)와
 * lib/pricing-policy-link-h2.ts(연동) 두 곳이다. 여기서는 SQL 모양만 만든다.
 *
 * ★케이스 id 는 프로덕션에서 읽은 값과 맞는지 검사한다★ — id 가 어긋나면 update 가
 * 0행을 고치고도 성공한다(조용한 실패). 어긋나면 SQL 을 찍지 않고 멈춘다.
 */
import { PL_INV_STEPS, PL_KEEP, PL_RESTORE, plNewRules, plSubSteps } from '../lib/pricing-policy-plhec-h2';
import { linkRules } from '../lib/pricing-policy-link-h2';
import { pricingRuleId } from '../lib/pricing-match';
import { settlementRuleIdOf, settlementRuleNameOf, settlementStepsKeyOf } from '../lib/settlement';
import type { SettlementStepRule } from '../types/project';

const APPLIED = '2026-09-04'; // 한백이 조항을 확정한 날 = 규칙 적용일
const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** 케이스 id → 기성 단계 */
const targets: { id: string; steps: SettlementStepRule[]; label: string }[] = [];

/* 1. 보조금 — 유지 케이스 셋 (조건은 이미 260629 기준, 기성만 3단계로) */
for (const k of PL_KEEP) {
  targets.push({ id: k.id, steps: plSubSteps(k.turnkey), label: `보조 ${k.term}년 ${k.bldgs.join('·')} 턴키 ${k.turnkey / 10_000}만` });
}
/* 2. 보조금 — 복원 케이스 둘 (한전불입 200·220만). 단계는 정의 파일이 든 것을 그대로 */
for (const r of PL_RESTORE) {
  targets.push({ id: r.id, steps: r.settlementSteps, label: `보조 한전 턴키 ${(r.salesUnit + r.consUnit + r.margin) / 10_000}만` });
}
/* 3. 자체투자 셋 — id 는 0007 이 만든 것과 같은 방식으로 다시 만든다 */
const invTaken = new Set<string>();
const invIds: string[] = [];
for (const r of plNewRules()) {
  const id = pricingRuleId(r, invTaken);
  invTaken.add(id);
  invIds.push(id);
  targets.push({ id, steps: r.settlementSteps, label: `자투 턴키 ${(r.salesUnit + r.consUnit + r.margin) / 10_000}만` });
}
/* 4. 연동 둘 — id 는 0010 과 같은 방식(SK 를 포함한 같은 순서로 돌려야 같은 id 가 난다) */
const linkTaken = new Set<string>();
const linkIds: string[] = [];
for (const r of linkRules()) {
  const id = pricingRuleId(r, linkTaken);
  linkTaken.add(id);
  if (r.cpo !== '플러그링크') continue;
  linkIds.push(id);
  targets.push({ id, steps: r.settlementSteps, label: `연동 턴키 ${(r.salesUnit + r.consUnit + r.margin) / 10_000}만` });
}

/* ── 검사: 프로덕션에서 읽은 케이스 id 열 개와 정확히 같아야 한다 (2026-09-04) ── */
const EXPECTED = [
  'pl-h2-y7-mother-new-apt', 'pl-h2-y10-mother-new-apt', 'pl-y10-mother-new-biz-2026',
  'pl-h2-y7-kepco-new-apt', 'pl-h2-y10-kepco-new-apt',
  'pl-y7-mother-inplace-apt-2026', 'pl-y10-mother-inplace-apt-2026', 'pl-y10-mother-inplace-biz-2026',
  'pl-y7-mother-link-apt-2026', 'pl-y10-mother-link-apt-2026',
].sort();
const got = targets.map((t) => t.id).sort();
if (JSON.stringify(got) !== JSON.stringify(EXPECTED)) {
  console.error('케이스 id 가 프로덕션과 다릅니다 — SQL 을 찍지 않습니다.');
  console.error(`  기대: ${EXPECTED.join(', ')}`);
  console.error(`  실제: ${got.join(', ')}`);
  process.exit(1);
}
/* 단계가 빈 케이스가 남아 있으면 이 마이그레이션의 뜻이 반쪽이다 */
const empty = targets.filter((t) => t.steps.length === 0);
if (empty.length > 0) {
  console.error(`단계가 비었습니다: ${empty.map((t) => t.id).join(', ')}`);
  process.exit(1);
}

/* ── 정산 규칙 — 단계가 같으면 한 규칙을 같이 쓴다 ── */
const rules = new Map<string, SettlementStepRule[]>();
for (const t of targets) rules.set(settlementRuleIdOf(t.steps), t.steps);

console.log('-- 플러그링크 하반기(2026년 7월 1일 접수분) 기성 — 문서의 대금 조항을 단계로 담는다 (한백 지시 2026-09-04)');
console.log('-- lib/pricing-policy-plhec-h2.ts · lib/pricing-policy-link-h2.ts 에서 생성 — 손으로 고치지 마세요');
console.log(`--
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
-- 멱등: 규칙 insert 는 on conflict do nothing, 나머지는 값이 이미 같으면 0행이다.`);
console.log('');

console.log('-- ── 1. 정산 규칙 — 단계가 정체다. 같은 모양이면 한 행을 같이 쓴다 ──');
for (const [id, steps] of rules) {
  console.log(`-- ${settlementStepsKeyOf(steps)}`);
  console.log(`insert into settlement_rules (id, name, steps, note, active)
values ('${id}', ${q(settlementRuleNameOf(steps))}, '${JSON.stringify(steps)}'::jsonb, null, true)
on conflict (id) do nothing;\n`);
}

console.log('-- ── 2. 케이스가 그 규칙을 제안값으로 든다 ──');
console.log('-- 케이스의 제안값은 라인에 단가를 붙일 때 현장으로 옮겨간다(lib/data/store/payouts.ts');
console.log('-- applySuggestedSettlement) — 이미 붙어 있는 현장은 3번이 맞춘다.\n');
for (const t of targets) {
  console.log(`-- ${t.label}: ${settlementRuleNameOf(t.steps)}`);
  console.log(`update pricing_rules set default_settlement_rule_id = '${settlementRuleIdOf(t.steps)}'
where id = '${t.id}' and default_settlement_rule_id is distinct from '${settlementRuleIdOf(t.steps)}';\n`);
}

/*
 * 현장 한 줄에 그 현장의 라인 사정을 모은다.
 *   h2    하반기 케이스를 쓰는 라인 수 · other 그 밖의 케이스를 쓰는 라인 수
 *   rule  하반기 케이스들이 제안하는 규칙 (kinds = 1 일 때만 뜻이 있다)
 * 3단계는 고정액이 턴키에 묶여 있어 턴키가 다른 라인이 섞이면 규칙 하나로 담을 수 없다 —
 * 그래서 「전 라인이 하반기이고 제안이 하나로 모이는 현장」만 고친다.
 */
const H2 = `p.cpo = '플러그링크' and p.start_date = '2026년 7월 1일'`;
const SUBQ = `    select cl.project_id,
           count(*) filter (where ${H2}) as h2,
           count(*) filter (where not (${H2})) as other,
           min(p.default_settlement_rule_id) filter (where ${H2}) as rule,
           count(distinct p.default_settlement_rule_id) filter (where ${H2}) as kinds
      from contract_lines cl
      join pricing_rules p on p.id = cl.pricing_rule_id
     group by cl.project_id`;

console.log(`-- ── 3. 그 케이스를 쓰는 현장의 정산 규칙을 맞춘다 (한백 지시 2026-09-04) ──
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
       settlement_applied_at = ${q(APPLIED)}
  from (
${SUBQ}
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
${targets.map((t) => `      ('${t.id}', '${settlementRuleIdOf(t.steps)}')`).join(',\n')}
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
${[...rules].map(([id, steps]) => `      ('${id}', '${JSON.stringify(steps)}'::jsonb)`).join(',\n')}
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
${targets.map((t) => `      ('${t.id}')`).join(',\n')}
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
${SUBQ}
    ) s
    join projects j on j.id = s.project_id
   where s.h2 > 0
     and (s.other > 0 or s.kinds <> 1 or j.settlement_rule_id is distinct from s.rule);
  if left_over is not null then
    raise warning '하반기 케이스를 쓰는 현장의 정산 규칙을 사람이 골라야 합니다 — %', left_over;
  end if;
end $$;`);

console.error(`검산(찍힌 SQL 밖): 케이스 ${targets.length}개 · 새 규칙 ${rules.size}개`);
console.error(`  자투 id ${invIds.join(', ')}`);
console.error(`  연동 id ${linkIds.join(', ')}`);
for (const [id, steps] of rules) console.error(`  ${id}  ${settlementRuleNameOf(steps)}`);

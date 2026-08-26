/**
 * 에버온 26년 2차 정책의 마이그레이션 SQL 을 찍는다.
 *
 *   npx tsx scripts/print-everon-h2-sql.ts > migrations/000N_<이름>.sql
 *
 * 값·근거는 lib/pricing-policy-everon-h2.ts 한 벌에서 나온다. 찍기 전에 저장소와 같은
 * 검증(checkPricingRule)을 돌리고, 틀리면 출력하지 않고 죽는다. insert 는 on conflict
 * do nothing, update 는 항상 덮는다 — 두 번 돌아도 같다.
 * 기성 미정 케이스는 default_settlement_rule_id 를 null 로 둔다.
 */
import { EV_KEEP, EV_KEEP_POLICY, EV_REVIVE, evNewRules } from '../lib/pricing-policy-everon-h2';
import { checkPricingRule, pricingRuleId } from '../lib/pricing-match';
import { settlementRuleIdOf, settlementRuleNameOf } from '../lib/settlement';
import type { SettlementStepRule } from '../types/project';

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? 'null' : String(v));
const j = (v: unknown | null) => (v === null ? 'null' : `'${JSON.stringify(v)}'::jsonb`);

const rules = evNewRules();
const bad = rules.flatMap((r) => checkPricingRule(r).map((m) => `${r.caseName}: ${m}`));
if (bad.length > 0) {
  console.error('검증 실패 — SQL 을 찍지 않습니다:\n' + bad.join('\n'));
  process.exit(1);
}

console.log('-- 에버온 26년 영업 정책 2차 (26-07-30까지 · 3차 미발행이라 최신)');
console.log('-- lib/pricing-policy-everon-h2.ts 에서 생성 — 손으로 고치지 마세요\n');

/* 정산 규칙 — 기성이 있는 케이스만. 미정([])은 규칙이 없다 */
const shapes = new Map<string, SettlementStepRule[]>();
for (const r of rules) if (r.settlementSteps.length > 0) shapes.set(settlementRuleIdOf(r.settlementSteps), r.settlementSteps);
for (const [id, steps] of shapes) {
  console.log(`insert into settlement_rules (id, name, steps, note, active)
values ('${id}', ${q(settlementRuleNameOf(steps))}, '${JSON.stringify(steps)}'::jsonb, null, true)
on conflict (id) do nothing;\n`);
}

const taken = new Set<string>();
for (const r of rules) {
  const id = pricingRuleId(r, taken);
  taken.add(id);
  const settle = r.settlementSteps.length > 0 ? `'${settlementRuleIdOf(r.settlementSteps)}'` : 'null';
  console.log(`-- ${r.caseName}`);
  console.log(`insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  '${id}', ${q(r.caseName)}, ${q(r.cpo)}, ${q(r.bizType)}, ${q(r.powerType)},
  '${JSON.stringify(r.termYears)}'::jsonb, ${j(r.bldgTypes)}, ${q(r.replType)}, ${q(r.channel)},
  ${r.bizYear}, ${q(r.startDate)}, ${r.salesUnit}, ${r.consUnit}, ${r.margin}, ${settle},
  ${q(r.supervisionBearer)}, ${q(r.safetyFeeBearer)}, ${q(r.note)}, true,
  ${q(r.supplyItems)}, ${j(r.promo)}, ${j(r.promoExtend)}, ${n(r.chargeRate)},
  ${q(r.installTerms)}, ${q(r.otherSupport)}, ${q(r.coexistTerms)}, ${q(r.miscTerms)}
) on conflict (id) do nothing;\n`);
}

/* 0006 이 지운 한전불입 5년 — 옛 id 로 되살린다. 조건 칸은 아래 EV_KEEP 루프가 채운다 */
console.log(`-- 0006 이 지운 한전불입 5년을 되살린다(정책표 빈칸 = 일반 5년과 같음 · 노션 정본도 한 칸): ${EV_REVIVE.id}`);
console.log(`insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active
) values (
  ${q(EV_REVIVE.id)}, ${q(EV_REVIVE.caseName)}, ${q(EV_REVIVE.cpo)}, ${q(EV_REVIVE.bizType)}, ${q(EV_REVIVE.powerType)},
  '${JSON.stringify(EV_REVIVE.termYears)}'::jsonb, ${j(EV_REVIVE.bldgTypes)}, ${q(EV_REVIVE.replType)}, ${q(EV_REVIVE.channel)},
  ${EV_REVIVE.bizYear}, ${q(EV_REVIVE.startDate)}, ${EV_REVIVE.salesUnit}, ${EV_REVIVE.consUnit}, ${EV_REVIVE.margin}, ${q(EV_REVIVE.settlementRuleId)},
  null, null, null, true
) on conflict (id) do nothing;
`);

/* 기존 보조 케이스 — 조건만. 프로모션은 수전방식으로 갈린다(한전인입지역은 220원 6개월) */
for (const k of EV_KEEP) {
  console.log(`-- 기존 유지 + 조건 갱신(금액·기성 40/60 이미 일치): ${k.id}`);
  console.log(`update pricing_rules set
  promo = ${j(k.promo)}, charge_rate = ${EV_KEEP_POLICY.chargeRate},
  supply_items = ${q(EV_KEEP_POLICY.supplyItems)}, install_terms = ${q(EV_KEEP_POLICY.installTerms)},
  other_support = ${q(EV_KEEP_POLICY.otherSupport)}, misc_terms = ${q(EV_KEEP_POLICY.miscTerms)}
where id = '${k.id}';\n`);
}

console.log('-- 검산: 에버온 자투 6건 신설 · 한전 5년 1건 되살림 · 보조 6건 조건 채움');

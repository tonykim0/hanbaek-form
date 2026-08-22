/**
 * 플러그링크·현대엔지니어링 26년 하반기 정책의 마이그레이션 SQL 을 찍는다.
 *
 *   npx tsx scripts/print-plhec-h2-sql.ts > migrations/000N_<이름>.sql
 *
 * 값·근거는 lib/pricing-policy-plhec-h2.ts 한 벌에서 나온다 — 손으로 옮겨 적지 않는다.
 * 찍기 전에 저장소와 같은 검증(checkPricingRule)을 돌리고, 하나라도 틀리면 출력하지
 * 않고 죽는다 — 잘못된 값이 마이그레이션으로 프로덕션에 닿는 것이 최악이다.
 *
 * id 는 pricingRuleId 가 축에서 만드는 값을 그대로 쓴다(taken 은 비워 둔다 — 새 케이스의
 * 축이 기존 id 와 겹치지 않음을 dev 에서 확인했다). insert 는 on conflict do nothing,
 * update 는 항상 덮으므로 두 번 돌아도 같은 결과다. 옛 한전불입 케이스 삭제는
 * 참조 가드가 붙는다 — 참조가 생겼으면 지우지 않고 남긴다(시작이 달라 매트릭스는
 * 신정책을 최신으로 집는다).
 */
import {
  HEC_KEEP_IDS, HEC_KEEP_POLICY, hecNewRules,
  PL_DROP_IDS, PL_KEEP_IDS, plKeepPolicy, plNewRules, PL_STEPS_SUB,
} from '../lib/pricing-policy-plhec-h2';
import { checkPricingRule, pricingRuleId } from '../lib/pricing-match';
import { settlementRuleIdOf, settlementRuleNameOf } from '../lib/settlement';
import type { NewPricingRule, SettlementStepRule } from '../types/project';

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? 'null' : String(v));
const j = (v: unknown | null) => (v === null ? 'null' : `'${JSON.stringify(v)}'::jsonb`);

const rules = [...plNewRules(), ...hecNewRules()];
const bad = rules.flatMap((r) => checkPricingRule(r).map((m) => `${r.caseName}: ${m}`));
if (bad.length > 0) {
  console.error('검증 실패 — SQL 을 찍지 않습니다:\n' + bad.join('\n'));
  process.exit(1);
}

console.log('-- 플러그링크(2026-07-28 v1.1, 7/1 접수분~)·현대엔지니어링(rev4, 7/21) 하반기 정책');
console.log('-- lib/pricing-policy-plhec-h2.ts 에서 생성 — 손으로 고치지 마세요\n');

/* 정산 규칙 — 단계에서 id·이름을 만든다. 같은 모양이 이미 있으면 do nothing 으로 재사용된다 */
const stepShapes = new Map<string, SettlementStepRule[]>();
for (const r of rules) stepShapes.set(settlementRuleIdOf(r.settlementSteps), r.settlementSteps);
stepShapes.set(settlementRuleIdOf(PL_STEPS_SUB), PL_STEPS_SUB);
for (const [id, steps] of stepShapes) {
  console.log(`insert into settlement_rules (id, name, steps, note, active)
values ('${id}', ${q(settlementRuleNameOf(steps))}, '${JSON.stringify(steps)}'::jsonb, null, true)
on conflict (id) do nothing;\n`);
}

/* 새 케이스 */
const taken = new Set<string>();
for (const r of rules) {
  const id = pricingRuleId(r, taken);
  taken.add(id);
  console.log(`-- ${r.caseName}`);
  console.log(`insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend_deduct, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  '${id}', ${q(r.caseName)}, ${q(r.cpo)}, ${q(r.bizType)}, ${q(r.powerType)},
  '${JSON.stringify(r.termYears)}'::jsonb, ${j(r.bldgTypes)}, ${q(r.replType)}, ${q(r.channel)},
  ${r.bizYear}, ${q(r.startDate)}, ${r.salesUnit}, ${r.consUnit}, ${r.margin},
  '${settlementRuleIdOf(r.settlementSteps)}',
  ${q(r.supervisionBearer)}, ${q(r.safetyFeeBearer)}, ${q(r.note)}, true,
  ${q(r.supplyItems)}, ${j(r.promo)}, ${n(r.promoExtendDeduct)}, ${n(r.chargeRate)},
  ${q(r.installTerms)}, ${q(r.otherSupport)}, ${q(r.coexistTerms)}, ${q(r.miscTerms)}
) on conflict (id) do nothing;\n`);
}

/* 기존 케이스 — 조건 칸만 채운다. 금액·축은 신정책과 같아 안 건드린다 */
const KEEP_TERM: Record<(typeof PL_KEEP_IDS)[number], number> = {
  'pl-h2-y7-mother-new-apt': 7,
  'pl-h2-y10-mother-new-apt': 10,
};
for (const id of PL_KEEP_IDS) {
  const p = plKeepPolicy(KEEP_TERM[id]);
  console.log(`-- 기존 유지 + 조건·기성(승인 30만) 갱신: ${id}`);
  console.log(`update pricing_rules set
  promo = ${j(p.promo)}, charge_rate = ${p.chargeRate},
  install_terms = ${q(p.installTerms)}, coexist_terms = ${q(p.coexistTerms)},
  other_support = ${q(p.otherSupport)}, misc_terms = ${q(p.miscTerms)},
  default_settlement_rule_id = '${settlementRuleIdOf(PL_STEPS_SUB)}'
where id = '${id}';\n`);
}
for (const id of HEC_KEEP_IDS) {
  console.log(`-- 기존 유지 + 조건 갱신(rev4 와 금액·기성 이미 일치): ${id}`);
  console.log(`update pricing_rules set
  promo = ${j(HEC_KEEP_POLICY.promo)}, charge_rate = ${HEC_KEEP_POLICY.chargeRate},
  supply_items = ${q(HEC_KEEP_POLICY.supplyItems)},
  install_terms = ${q(HEC_KEEP_POLICY.installTerms)}, coexist_terms = ${q(HEC_KEEP_POLICY.coexistTerms)},
  other_support = ${q(HEC_KEEP_POLICY.otherSupport)}, misc_terms = ${q(HEC_KEEP_POLICY.miscTerms)}
where id = '${id}';\n`);
}

/* 옛 한전불입 하반기 — 신정책(160/180만)이 대체한다. 참조가 있으면 지우지 않는다 */
for (const id of PL_DROP_IDS) {
  console.log(`-- 신정책과 금액이 다른 옛 케이스 — 참조 없을 때만 삭제: ${id}`);
  console.log(`delete from pricing_rules
where id = '${id}'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);\n`);
}

console.log('-- 검산: 플러그링크 7/1 케이스 7건 + 현대 자부담 2건, 옛 pl 한전불입 하반기 0건');

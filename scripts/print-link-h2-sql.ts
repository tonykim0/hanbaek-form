/**
 * 기 구축 충전기 연동 케이스(SK·PL)의 마이그레이션 SQL 을 찍는다.
 *
 *   npx tsx scripts/print-link-h2-sql.ts > migrations/000N_<이름>.sql
 *
 * 값·근거는 lib/pricing-policy-link-h2.ts. 찍기 전에 저장소와 같은 검증을 돌린다.
 * SK 연동 기성(준공 100%)은 기존 lump-100 규칙과 같은 모양이라 재사용된다.
 */
import { linkRules } from '../lib/pricing-policy-link-h2';
import { checkPricingRule, pricingRuleId } from '../lib/pricing-match';
import { settlementRuleIdOf, settlementRuleNameOf } from '../lib/settlement';
import type { SettlementStepRule } from '../types/project';

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? 'null' : String(v));
const j = (v: unknown | null) => (v === null ? 'null' : `'${JSON.stringify(v)}'::jsonb`);

const rules = linkRules();
const bad = rules.flatMap((r) => checkPricingRule(r).map((m) => `${r.caseName}: ${m}`));
if (bad.length > 0) {
  console.error('검증 실패 — SQL 을 찍지 않습니다:\n' + bad.join('\n'));
  process.exit(1);
}

console.log('-- 기 구축 충전기 연동 케이스 — SK(부속합의서 150만) · PL(55/75만, 한백 확인 2026-08-23)');
console.log('-- lib/pricing-policy-link-h2.ts 에서 생성 — 손으로 고치지 마세요\n');

/*
 * 정산 규칙 — 같은 모양이 이미 있으면(lump-100 = 준공마감 100%) 그 id 를 쓴다.
 * settlementRuleIdOf 는 해시 id 라 기존 손 id(lump-100)와 다르다 — 같은 모양의 규칙이
 * 두 얼굴로 쌓이지 않게, 준공 100% 는 기존 id 를 그대로 가리킨다.
 */
const LUMP: SettlementStepRule[] = [{ trigger: '준공마감', basis: { kind: '비율', ratio: 1 } }];
const lumpKey = JSON.stringify(LUMP);
function settleIdOf(steps: SettlementStepRule[]): string | null {
  if (steps.length === 0) return null;
  if (JSON.stringify(steps) === lumpKey) return 'lump-100';
  return settlementRuleIdOf(steps);
}
for (const r of rules) {
  const id = settleIdOf(r.settlementSteps);
  if (id !== null && id !== 'lump-100') {
    console.log(`insert into settlement_rules (id, name, steps, note, active)
values ('${id}', ${q(settlementRuleNameOf(r.settlementSteps))}, '${JSON.stringify(r.settlementSteps)}'::jsonb, null, true)
on conflict (id) do nothing;\n`);
  }
}

const taken = new Set<string>();
for (const r of rules) {
  const id = pricingRuleId(r, taken);
  taken.add(id);
  const settle = settleIdOf(r.settlementSteps);
  console.log(`-- ${r.caseName} (총 ${(r.salesUnit + r.consUnit + r.margin) / 10_000}만)`);
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
  ${settle === null ? 'null' : `'${settle}'`},
  ${q(r.supervisionBearer)}, ${q(r.safetyFeeBearer)}, ${q(r.note)}, true,
  ${q(r.supplyItems)}, ${j(r.promo)}, ${n(r.promoExtendDeduct)}, ${n(r.chargeRate)},
  ${q(r.installTerms)}, ${q(r.otherSupport)}, ${q(r.coexistTerms)}, ${q(r.miscTerms)}
) on conflict (id) do nothing;\n`);
}

console.log('-- 검산: 연동 3건 — sk 150만(준공 100%) · pl 55/75만(기성 미정)');

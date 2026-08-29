/**
 * 플러그링크 정정 + 자투 신설의 마이그레이션 SQL 을 찍는다 (0007 생성기).
 *
 *   npx tsx scripts/print-plhec-h2-sql.ts > migrations/000N_<이름>.sql
 *
 * 0005 는 v1.1(한백에 적용되지 않는 문서)을 근거로 만들어져 이미 dev·프로덕션에
 * 적용됐다 — 적용된 파일은 고치지 않으므로, 이 스크립트는 그것을 되돌리고 배포본
 * 260629 기준으로 다시 넣는 SQL 을 만든다. 값·근거는 lib/pricing-policy-plhec-h2.ts.
 * HEC(rev4)는 처음부터 맞는 문서 기준이라 여기서 다시 만들지 않는다.
 */
import {
  HEC_KEEP_IDS, HEC_KEEP_POLICY,
  HEC_DROP_IDS, PL_DROP_IDS, PL_KEEP, plPolicy, PL_RESTORE, plNewRules,
} from '../lib/pricing-policy-plhec-h2';
import { checkPricingRule, pricingRuleId } from '../lib/pricing-match';
import type { NewPricingRule } from '../types/project';

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? 'null' : String(v));
const j = (v: unknown | null) => (v === null ? 'null' : `'${JSON.stringify(v)}'::jsonb`);

const news = plNewRules();
const bad = [...news, ...PL_RESTORE].flatMap((r) => checkPricingRule(r).map((m) => `${r.caseName}: ${m}`));
if (bad.length > 0) {
  console.error('검증 실패 — SQL 을 찍지 않습니다:\n' + bad.join('\n'));
  process.exit(1);
}

function insertSql(r: NewPricingRule, id: string, settleId: string | null): string {
  return `insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  '${id}', ${q(r.caseName)}, ${q(r.cpo)}, ${q(r.bizType)}, ${q(r.powerType)},
  '${JSON.stringify(r.termYears)}'::jsonb, ${j(r.bldgTypes)}, ${q(r.replType)}, ${q(r.channel)},
  ${r.bizYear}, ${q(r.startDate)}, ${r.salesUnit}, ${r.consUnit}, ${r.margin},
  ${settleId === null ? 'null' : `'${settleId}'`},
  ${q(r.supervisionBearer)}, ${q(r.safetyFeeBearer)}, ${q(r.note)}, true,
  ${q(r.supplyItems)}, ${j(r.promo)}, ${j(r.promoExtend)}, ${n(r.chargeRate)},
  ${q(r.installTerms)}, ${q(r.otherSupport)}, ${q(r.coexistTerms)}, ${q(r.miscTerms)}
) on conflict (id) do nothing;\n`;
}

console.log('-- 플러그링크를 배포본 260629 기준으로 정정한다 — v1.1 은 한백 적용 문서가 아니다(한백 확인 2026-08-23)');
console.log('-- lib/pricing-policy-plhec-h2.ts 에서 생성 — 손으로 고치지 마세요\n');

/* 1. v1.1 기준으로 넣었던 케이스를 걷어낸다 — 참조가 생겼으면 남긴다 */
for (const id of PL_DROP_IDS) {
  console.log(`delete from pricing_rules
where id = '${id}'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);\n`);
}

/* 1-b. 현대엔지니어링 자체투자 신규위치 — 제자리교체와 한 글자도 다르지 않아 걷는다 */
for (const id of HEC_DROP_IDS) {
  console.log(`-- 걷어냄(제자리교체와 같은 케이스였다): ${id}`);
  console.log(`delete from pricing_rules
where id = '${id}'
  and not exists (select 1 from contract_lines cl where cl.pricing_rule_id = pricing_rules.id);\n`);
}

/* 2. v1.1 때 지웠던 한전불입 하반기를 시드 원본 값으로 복원한다 (기성은 pl-2step) */
for (const r of PL_RESTORE) {
  console.log(`-- 복원: ${r.caseName} (총 ${(r.salesUnit + r.consUnit + r.margin) / 10_000}만)`);
  console.log(insertSql(r, r.id, 'pl-2step'));
}

/* 3. 유지 케이스의 조건을 260629 기준으로 되돌린다 — 기성도 pl-2step 으로 */
for (const k of PL_KEEP) {
  const p = plPolicy(true, k.term, k.bldgs);
  console.log(`-- 260629 기준 조건 + 기성 pl-2step 복원: ${k.id}`);
  console.log(`update pricing_rules set
  promo = ${j(p.promo)}, promo_extend = ${j(p.promoExtend)}, charge_rate = ${n(p.chargeRate)},
  supply_items = null, install_terms = ${q(p.installTerms)}, coexist_terms = null,
  other_support = null, misc_terms = ${q(p.miscTerms)},
  default_settlement_rule_id = 'pl-2step'${k.id.startsWith('pl-y') ? `,\n  start_date = '2026년 하반기'` : ''}
where id = '${k.id}';\n`);
}

/* 4. 자체투자 교체 신설 — 기성 미정(default null) */
const taken = new Set<string>();
for (const r of news) {
  const id = pricingRuleId(r, taken);
  taken.add(id);
  console.log(`-- 신설: ${r.caseName} (총 ${(r.salesUnit + r.consUnit + r.margin) / 10_000}만)`);
  console.log(insertSql(r, id, null));
}

/*
 * 5. HEC — 0005 의 조건 갱신을 같은 값으로 한 번 더 적는다. rev4 는 맞는 문서였지만
 * 0005 가 dev 에만 적용된 환경(새 개발 DB)에서도 이 파일 하나로 같은 끝상태가 되게.
 */
for (const id of HEC_KEEP_IDS) {
  console.log(`-- HEC rev4 조건 (0005 와 동일 — 멱등): ${id}`);
  console.log(`update pricing_rules set
  promo = ${j(HEC_KEEP_POLICY.promo)}, promo_extend = ${j(HEC_KEEP_POLICY.promoExtend)},
  charge_rate = ${HEC_KEEP_POLICY.chargeRate},
  supply_items = ${q(HEC_KEEP_POLICY.supplyItems)},
  install_terms = ${q(HEC_KEEP_POLICY.installTerms)}, coexist_terms = ${q(HEC_KEEP_POLICY.coexistTerms)},
  other_support = ${q(HEC_KEEP_POLICY.otherSupport)}, misc_terms = ${q(HEC_KEEP_POLICY.miscTerms)}
where id = '${id}';\n`);
}

console.log('-- 검산: pl 하반기 = 모자 2(240/260) + 한전 2(200/220) + 상업 1(240) + 자투 3(220/240/120)');

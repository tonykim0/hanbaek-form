/**
 * SK 부속합의서(260723) 반영 + HEC 대상 문구 보강의 마이그레이션 SQL 을 찍는다.
 *
 *   npx tsx scripts/print-sk-h2-sql.ts > migrations/000N_<이름>.sql
 *
 * 값·근거는 lib/pricing-policy-sk-h2.ts(SK)·lib/pricing-policy-plhec-h2.ts(HEC 문구).
 * 금액·기성은 안 건드린다 — 합의서와 기존 케이스가 일치하고, 착공 선급 80만도
 * 유효함을 한백이 확인했다(2026-08-23). update 뿐이라 두 번 돌아도 같다.
 */
import { SK_KEEP, SK_START, skPolicy } from '../lib/pricing-policy-sk-h2';
import { HEC_KEEP_IDS, HEC_KEEP_POLICY, hecNewRules } from '../lib/pricing-policy-plhec-h2';
import { pricingRuleId } from '../lib/pricing-match';

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);

console.log('-- SK 부속합의서(2026-07-23 날인) 반영 · HEC 대상 문구 보강 (한백 확인 2026-08-23)');
console.log('-- lib/pricing-policy-sk-h2.ts 에서 생성 — 손으로 고치지 마세요\n');

for (const k of SK_KEEP) {
  const p = skPolicy(k.sub);
  console.log(`-- ${k.id} — 조건·시작일(7/20 통일)${k.widenBldg ? ' + 건축물유형 확장(오피스텔·지산·상업 포함)' : ''}`);
  console.log(`update pricing_rules set
  install_terms = ${q(p.installTerms)}, misc_terms = ${q(p.miscTerms)},
  start_date = '${SK_START}'${k.widenBldg ? `,\n  bldg_types = '["공동주택","상업시설"]'::jsonb` : ''}
where id = '${k.id}';\n`);
}

/* HEC — 이미 반영된 6건의 설치조건 문구만 보강한다 (하반기 4건 + 자부담 2건) */
const hecInstall = HEC_KEEP_POLICY.installTerms;
const taken = new Set<string>();
const invIds = hecNewRules().map((r) => { const id = pricingRuleId(r, taken); taken.add(id); return id; });
for (const id of [...HEC_KEEP_IDS, ...invIds]) {
  console.log(`update pricing_rules set install_terms = ${q(hecInstall)} where id = '${id}';\n`);
}

console.log('-- 검산: sk 하반기 투자 2건 bldg_types 가 ["공동주택","상업시설"], 시작일 4건 7/20');

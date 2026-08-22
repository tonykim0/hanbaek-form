/**
 * 기타 칸의 중복 문구 정리 SQL 을 찍는다 (2026-08-23 한백 지적).
 *
 *   npx tsx scripts/print-misc-dedup-sql.ts > migrations/000N_<이름>.sql
 *
 * 고치는 것은 misc_terms 한 칸뿐이다:
 *  · SK 연동 — 대금 줄이 SK 공통 기타와 같은 말이라 뺐다(연동만의 조건만 남김)
 *  · 에버온 자투 6건 — 「정산 방식이 없어 기성 미정」이 보조 정산 줄과 나란히 떠
 *    혼동돼, 자체투자 것임을 문구에 박았다
 * 값은 정의 파일(linkRules · evNewRules)에서 그대로 뽑는다 — 손으로 옮겨 적지 않는다.
 */
import { linkRules } from '../lib/pricing-policy-link-h2';
import { evNewRules } from '../lib/pricing-policy-everon-h2';
import { pricingRuleId } from '../lib/pricing-match';

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);

console.log('-- 기타 칸 중복 문구 정리 — scripts/print-misc-dedup-sql.ts 에서 생성\n');
const taken = new Set<string>();
for (const r of [...linkRules(), ...evNewRules()]) {
  const id = pricingRuleId(r, taken);
  taken.add(id);
  console.log(`update pricing_rules set misc_terms = ${q(r.miscTerms)} where id = '${id}';\n`);
}

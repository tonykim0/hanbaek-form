/**
 * 나이스 26년 하반기 정책 값을 넣는 SQL 을 찍는다 — Supabase SQL Editor 에 붙여 쓴다.
 *
 *   npx tsx scripts/print-nice-h2-sql.ts
 *
 * ★왜 SQL 인가★ 프로덕션 DATABASE_URL 이 Vercel 에서 Sensitive 라 밖에서 DB 에 붙을 수 없다
 * (CLAUDE.md 참조). 스크립트를 돌릴 수 없으니 값을 SQL 로 내어 사람이 붙인다.
 * 값은 lib/pricing-policy-nice-h2.ts 한 벌에서 나온다 — 손으로 옮겨 적지 않는다.
 *
 * 케이스 id 로 갱신한다. 8월 1일 케이스는 축에서 채번되므로 프로덕션에서도 같은 id 다
 * (같은 축 + 겹침 없음). 없는 id 는 0건 갱신으로 조용히 지나간다 — 그때는 아래
 * 확인 질의의 건수가 7보다 작게 나온다.
 */
import { niceH2Rules } from '../lib/pricing-policy-nice-h2';
import { pricingRuleId } from '../lib/pricing-match';

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? 'null' : String(v));

const taken = new Set<string>();
console.log('-- 나이스인프라 26년 하반기 정책 값 (2026-08-05 배포본)');
console.log('-- lib/pricing-policy-nice-h2.ts 에서 생성 — 손으로 고치지 마세요\n');
console.log('begin;\n');
for (const r of niceH2Rules()) {
  const id = pricingRuleId(r, taken);
  taken.add(id);
  console.log(`-- ${r.caseName}`);
  console.log(`update pricing_rules set
  supply_items        = ${q(r.supplyItems)},
  promo               = ${r.promo === null ? 'null' : `'${JSON.stringify(r.promo)}'::jsonb`},
  promo_extend_deduct = ${n(r.promoExtendDeduct)},
  charge_rate         = ${n(r.chargeRate)},
  install_terms       = ${q(r.installTerms)},
  other_support       = ${q(r.otherSupport)},
  note                = ${q(r.note)}
where id = '${id}';\n`);
}
/*
 * 옛 케이스의 비고 값 — 화면에서 비고를 걷어냈으므로(2026-08-22) 남겨 두면 아무도 못 보는
 * 자리에 글이 쌓인다. 한백 지시로 비운다. 되짚을 근거는 doc/PRICING_MATRIX.md 와
 * lib/data/seed/pricing-rules.ts 에 있다.
 */
console.log('-- 화면에서 걷어낸 칸이라 옛 케이스의 비고도 비운다 (한백 지시 2026-08-22)');
console.log('update pricing_rules set note = null where note is not null;\n');

console.log('commit;\n');
console.log(`-- 확인: 위는 7, 아래는 0 이 나와야 합니다
select count(*) from pricing_rules
where cpo = '나이스인프라' and start_date = '2026년 8월 1일' and charge_rate = 295;
select count(*) from pricing_rules where note is not null;`);

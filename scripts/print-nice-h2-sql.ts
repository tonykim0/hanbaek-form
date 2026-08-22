/**
 * 나이스 26년 하반기 정책 값의 SQL 을 찍는다 — 마이그레이션 파일의 초안 생성기.
 *
 *   npx tsx scripts/print-nice-h2-sql.ts > migrations/000N_<이름>.sql
 *
 * 값은 lib/pricing-policy-nice-h2.ts 한 벌에서 나온다 — 손으로 옮겨 적지 않는다.
 * begin/commit 은 안 찍는다 — 러너(scripts/migrate.ts)가 파일마다 트랜잭션을 건다.
 *
 * ★이미 적용된 마이그레이션 파일 위에 덮어쓰지 않는다★ — 원장에 있으면 다시 안 돈다.
 * 정책 값이 또 바뀌면 정의를 고치고 이것으로 「새 번호의」 파일을 만든다.
 *
 * 케이스 id 로 갱신한다. 8월 1일 케이스는 축에서 채번되므로 어느 DB 에서도 같은 id 다
 * (같은 축 + 겹침 없음). 없는 id 는 0건 갱신으로 조용히 지나간다.
 */
import { niceH2Rules } from '../lib/pricing-policy-nice-h2';
import { pricingRuleId } from '../lib/pricing-match';

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? 'null' : String(v));

const taken = new Set<string>();
console.log('-- 나이스인프라 26년 하반기 정책 값 (2026-08-05 배포본)');
console.log('-- lib/pricing-policy-nice-h2.ts 에서 생성 — 손으로 고치지 마세요\n');
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

console.log(`-- 검산은 러너 밖에서: 나이스 8/1 케이스 7건의 charge_rate=295, note 있는 케이스 0건`);

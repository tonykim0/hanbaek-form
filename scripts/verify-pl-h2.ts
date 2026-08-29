/**
 * 플러그링크 26년 하반기 단가 케이스 대조 — 정의 파일 vs 프로덕션. [읽기 전용]
 *
 *   npx tsx scripts/verify-pl-h2.ts
 *
 * ★왜 필요한가★ 정의 파일(lib/pricing-policy-plhec-h2.ts)이 원문 근거를 들고 있고,
 * 마이그레이션이 그것을 DB 에 옮긴다. 그런데 마이그레이션은 한 번 적용되면 다시 안 돌고,
 * 그 사이 다른 마이그레이션이 같은 행을 건드릴 수 있다 — 정의와 DB 가 갈릴 자리가 있다.
 * 눈으로 대조하면 「총액은 맞는데 분해가 다르다」 같은 것을 놓친다(실제로 놓쳤다).
 *
 * 총액이 아니라 ★칸마다★ 견준다. 협력사에게 나가는 돈은 총액이 아니라 분해다:
 * 시공비가 10만 적으면 총액은 그대로여도 시공사가 10만 덜 받는다.
 */
import postgres from 'postgres';
import { loadEnvFile } from '../lib/env-file';
import { PL_KEEP, PL_RESTORE, plNewRules } from '../lib/pricing-policy-plhec-h2';
import { pricingRuleId } from '../lib/pricing-match';
import type { NewPricingRule } from '../types/project';

loadEnvFile('.env.prod-db');
const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!url) throw new Error('DB URL 없음 — .env.prod-db 확인');
const sql = postgres(url, { max: 1, prepare: false });

const won = (n: number) => `${(n / 10000).toLocaleString('ko-KR')}만`;
/*
 * 값이 같은가 — ★키 순서는 안 본다.★ DB 의 jsonb 는 키를 제 순서로 다시 적어서
 * ({rate,months}) 정의({months,rate})와 글자로는 늘 다르다. 순서까지 견주면 멀쩡한
 * 케이스가 매번 어긋난 것으로 잡혀, 진짜 어긋난 하나가 그 속에 묻힌다.
 */
const norm = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, norm(x)])
    );
  }
  return v ?? null;
};
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

/** 정의가 말하는 것 — 신설(자투·연동)과 복원(한전불입) */
const expected = new Map<string, NewPricingRule>();
for (const r of PL_RESTORE) expected.set(r.id, r);
/* id 는 축에서 만든다 — 생성기(print-plhec-h2-sql)와 같은 순서·같은 taken 으로 뽑아야 같다 */
{
  const taken = new Set<string>(PL_RESTORE.map((r) => r.id));
  for (const r of plNewRules()) {
    const id = pricingRuleId(r, taken);
    taken.add(id);
    expected.set(id, r);
  }
}

async function main() {
  const rows = await sql`
    select id, case_name, biz_type, power_type, term_years, bldg_types, repl_type, channel,
           start_date, sales_unit, cons_unit, margin, charge_rate, promo, promo_extend, active
    from pricing_rules where cpo = '플러그링크' and start_date = '2026년 7월 1일'
    order by id`;
  const live = new Map(rows.map((r) => [r.id as string, r]));

  console.log(`정의 ${expected.size}건 · 프로덕션(하반기) ${rows.length}건\n`);

  let bad = 0;
  for (const [id, want] of expected) {
    const got = live.get(id);
    if (!got) { console.log(`✗ ${id} — 프로덕션에 없다\n`); bad += 1; continue; }
    const diffs: string[] = [];
    if (got.sales_unit !== want.salesUnit) diffs.push(`영업비 ${won(got.sales_unit)} ≠ 정의 ${won(want.salesUnit)}`);
    if (got.cons_unit !== want.consUnit) diffs.push(`시공비 ${won(got.cons_unit)} ≠ 정의 ${won(want.consUnit)}`);
    if (got.margin !== want.margin) diffs.push(`마진 ${won(got.margin)} ≠ 정의 ${won(want.margin)}`);
    if (got.charge_rate !== (want.chargeRate ?? null)) diffs.push(`충전요금 ${got.charge_rate} ≠ 정의 ${want.chargeRate}`);
    if (!same(got.promo, want.promo)) diffs.push(`프로모션 ${JSON.stringify(got.promo)} ≠ 정의 ${JSON.stringify(want.promo)}`);
    if (!same(got.promo_extend, want.promoExtend)) diffs.push(`연장 ${JSON.stringify(got.promo_extend)} ≠ 정의 ${JSON.stringify(want.promoExtend)}`);
    if (diffs.length > 0) {
      bad += 1;
      console.log(`✗ ${id}\n  ${got.case_name}`);
      for (const d of diffs) console.log(`    ${d}`);
      console.log();
    }
  }

  /* 정의에 없는데 하반기에 서 있는 것 — 유지하기로 한 것(PL_KEEP)만이 정상이다 */
  const keep = new Set(PL_KEEP.map((k) => k.id));
  const extra = rows.filter((r) => !expected.has(r.id) && !keep.has(r.id));
  if (extra.length > 0) {
    console.log('정의에도 유지 목록에도 없는 케이스:');
    for (const r of extra) console.log(`  ${r.id} — ${r.case_name}`);
    console.log();
  }

  /*
   * 하반기 프레임 검사 — 문서와 무관하게 이 저장소가 정한 규칙이다:
   * 마진 20만 고정 · ★기본공사비 95만★ 고정(턴키), 나머지가 영업비.
   * 정의 파일 자체가 그 프레임을 벗어나 있을 수 있어 DB 를 직접 본다.
   * 100만이 아니다 — 그것은 근거 없이 쓰던 자릿수였고, 실제 기준은 상반기 90 → 하반기 95다
   * (한백 2026-08-29, migrations/0042).
   */
  console.log('하반기 프레임(마진 20만 · 턴키 기본공사비 95만)에서 벗어난 케이스:');
  let off = 0;
  for (const r of rows) {
    if (r.channel !== '턴키') continue;
    const bads: string[] = [];
    if (r.margin !== 200_000) bads.push(`마진 ${won(r.margin)}`);
    // 연동은 시공이 없다(연결만 한다) — 시공 0 이 맞다
    if (r.biz_type !== '연동' && r.cons_unit !== 950_000) bads.push(`시공 ${won(r.cons_unit)}`);
    if (bads.length > 0) {
      off += 1;
      console.log(`  ✗ ${r.case_name}\n      ${bads.join(' · ')}  (받는단가 ${won(r.sales_unit + r.cons_unit + r.margin)})`);
    }
  }
  if (off === 0) console.log('  없음');

  console.log(`\n정의와 어긋난 케이스 ${bad}건 · 프레임을 벗어난 케이스 ${off}건`);
  await sql.end();
}
main();

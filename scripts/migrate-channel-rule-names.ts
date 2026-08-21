/**
 * 2026-08-21 단가 화면 개편의 데이터 이관 — 새 코드 배포 직후 한 번 돌린다.
 *   1. pricing_rules.channel '시공만' → '시공' (채널이 턴키·영업·시공 셋이 됐다)
 *   2. settlement_rules.name 을 단계에서 만든 이름으로 — 손으로 적은 운영사 이름을 걷어낸다
 *      (규칙 재사용 판정은 단계로 하므로 이름이 낡아도 동작은 안 깨진다 — 화면 표기만의 일)
 *
 * 실행: npx tsx scripts/migrate-channel-rule-names.ts   (.env.local 의 DATABASE_URL 을 쓴다)
 * 두 번 돌려도 같은 결과다.
 */
import { readFileSync } from 'fs';
import postgres from 'postgres';
import { settlementRuleNameOf } from '../lib/settlement';
import type { SettlementStepRule } from '../types/project';

/** dotenv 가 devDependencies 에 없다 — DATABASE_URL 한 줄만 .env.local 에서 직접 읽는다 */
function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const line = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('DATABASE_URL='));
    return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

async function main() {
  const url = databaseUrl();
  if (!url) throw new Error('DATABASE_URL 이 없습니다 — .env.local 을 확인하세요.');
  const sql = postgres(url, { max: 1, prepare: false });

  const ch = await sql`update pricing_rules set channel = '시공' where channel = '시공만'`;
  console.log(`channel 시공만 → 시공: ${ch.count}건`);

  const rules = await sql`select id, name, steps from settlement_rules`;
  for (const r of rules) {
    const name = settlementRuleNameOf(r.steps as SettlementStepRule[]);
    if (name !== r.name) {
      await sql`update settlement_rules set name = ${name} where id = ${r.id}`;
      console.log(`이름 갱신: ${r.id} — 「${r.name}」 → 「${name}」`);
    }
  }

  await sql.end();
  console.log('완료');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

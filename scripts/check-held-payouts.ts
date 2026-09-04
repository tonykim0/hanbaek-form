/**
 * 계약중단 현장의 지급 점검 — ★읽기만 한다★.
 *
 *   npx tsx scripts/check-held-payouts.ts --env .env.prod-db
 *
 * 지급 경로가 holdState 를 안 보고 있었다(감사 2026-09-04 H3). 앞으로는 막되,
 * ★이미 나간 것은 회수한다★(한백 지시) — 그 대상이 무엇이고 얼마인지 먼저 센다.
 * 회수는 원장의 「회수」 명목(sign -1)으로 적는 일이라, 여기서는 세기만 한다.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from '../lib/env-file';

const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '.env.local';
if (!ENV_FILE || ENV_FILE.startsWith('--')) {
  throw new Error('--env 뒤에 파일 이름이 없습니다 (예: --env .env.prod-db).');
}
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

import { sql as raw } from 'drizzle-orm';
import { getDb } from '../lib/db/client';

type Row = {
  id: string; name: string; hold_state: string; hold_note: string | null;
  sales_org: string | null; gc_org: string | null;
  kind: string | null; category: string | null; amount: number | null; at: string | null;
};

const won = (n: number) => n.toLocaleString('ko-KR');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 찍는다 */ }
  console.log(`DB ${host}  (${ENV_FILE})\n`);

  const rows = (await getDb().execute(raw`
    select p.id, p.name, p.hold_state, p.hold_note, p.sales_org, p.gc_org,
           e.kind, e.category, e.amount, e.at
      from projects p
      left join payout_entries e on e.project_id = p.id
     where p.hold_state is not null
     order by p.name, e.at
  `)) as unknown as Row[];

  const byProject = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byProject.get(r.id) ?? [];
    list.push(r);
    byProject.set(r.id, list);
  }

  console.log(`계약중단 현장 ${byProject.size}건\n`);
  let totalOut = 0;
  let needRecovery = 0;

  for (const [, list] of byProject) {
    const p = list[0]!;
    const entries = list.filter((r) => r.category !== null);
    /* 「회수」는 이미 돌려받은 것이다 — 남은 금액만 회수 대상이다 */
    const net = entries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
    const paid = entries.filter((e) => (e.amount ?? 0) > 0).reduce((s, e) => s + (e.amount ?? 0), 0);
    const back = entries.filter((e) => (e.amount ?? 0) < 0).reduce((s, e) => s + (e.amount ?? 0), 0);

    console.log(`■ ${p.name}  [${p.hold_state}]`);
    if (p.hold_note) console.log(`   사유: ${p.hold_note}`);
    console.log(`   영업사 ${p.sales_org ?? '—'} · 시공사 ${p.gc_org ?? '—'}`);
    if (entries.length === 0) {
      console.log('   지급 없음\n');
      continue;
    }
    for (const e of entries) {
      console.log(`   ${e.at}  ${e.kind} ${e.category}  ${won(e.amount ?? 0)}원`);
    }
    console.log(`   나간 것 ${won(paid)} · 돌아온 것 ${won(back)} → ★남은 것 ${won(net)}원★`);
    totalOut += paid;
    if (net > 0) needRecovery += net;
    console.log('');
  }

  console.log(`나간 지급 합계 ${won(totalOut)}원`);
  console.log(`★아직 회수 안 된 금액 ${won(needRecovery)}원★`);
  process.exit(0);
}

void main();

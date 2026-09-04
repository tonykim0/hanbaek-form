/**
 * 한 현장의 수전방식 — ★읽기만 한다★.
 *
 *   npx tsx scripts/check-power-type.ts --env .env.prod-db --name 상리우성
 *
 * 수전방식은 두 자리에 있다: 현장 대표값(projects.power_type)과 계약 라인마다
 * (contract_lines.power_type). 단가 케이스가 라인의 값으로 갈리므로(lib/pricing-match)
 * 한쪽만 고치면 화면과 단가가 어긋난다 — 고치기 전에 둘 다 본다.
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

const nameAt = process.argv.indexOf('--name');
const NAME = nameAt >= 0 ? process.argv[nameAt + 1] : null;
if (!NAME) throw new Error('--name 뒤에 현장명 일부가 필요합니다.');

import { sql as raw } from 'drizzle-orm';
import { getDb } from '../lib/db/client';

type Row = {
  id: string; name: string; power_type: string | null; biz_type: string | null;
  repl_type: string | null; cpo: string | null;
  payout_terms_confirmed_at: string | null;
  line_id: string | null; line_power: string | null; line_repl: string | null;
  qty: number | null; rule_id: string | null; case_name: string | null;
  rule_power: string | null;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 찍는다 */ }
  console.log(`DB ${host}  (${ENV_FILE})\n`);

  const rows = (await getDb().execute(raw`
    select p.id, p.name, p.power_type, p.biz_type, p.repl_type, p.cpo,
           p.payout_terms_confirmed_at,
           l.id as line_id, l.power_type as line_power, l.repl_type as line_repl, l.qty,
           l.pricing_rule_id as rule_id, r.case_name, r.power_type as rule_power
      from projects p
      left join contract_lines l on l.project_id = p.id
      left join pricing_rules r on r.id = l.pricing_rule_id
     where p.name like ${'%' + NAME + '%'}
     order by p.name, l.id
  `)) as unknown as Row[];

  if (rows.length === 0) {
    console.log(`「${NAME}」 로 찾은 현장이 없습니다.`);
    process.exit(0);
  }

  const byProject = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byProject.get(r.id) ?? [];
    list.push(r);
    byProject.set(r.id, list);
  }

  for (const [id, list] of byProject) {
    const p = list[0]!;
    console.log(`■ ${p.name}`);
    console.log(`   id ${id}`);
    console.log(`   운영사 ${p.cpo ?? '—'} · 사업구분 ${p.biz_type ?? '—'} · 교체유형 ${p.repl_type ?? '—'}`);
    console.log(`   ★현장 수전방식 ${p.power_type ?? '미지정'}★`);
    console.log(`   지급조건 확정 ${p.payout_terms_confirmed_at ?? '안 됨'}`);
    for (const l of list.filter((r) => r.line_id)) {
      console.log(
        `   · 라인 ${l.line_id}  ★${l.line_power ?? '미지정'}★ · ${l.line_repl ?? '—'} · ${l.qty ?? 0}기`
      );
      console.log(`     단가 ${l.case_name ?? '미지정'}${l.rule_power ? ` (케이스 수전 ${l.rule_power})` : ''}`);
    }
    console.log('');
  }
  process.exit(0);
}

void main();

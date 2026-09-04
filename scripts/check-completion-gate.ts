/**
 * 준공 게이트 점검 — ★읽기만 한다★.
 *
 *   npx tsx scripts/check-completion-gate.ts --env .env.prod-db
 *
 * 준공완료 진입에 준공서류 검사를 넣으면서(2026-09-04, 감사 H1) 지금 준공 근처에 서 있는
 * 현장이 그 게이트에 어떻게 걸리는지 본다. 이미 준공완료인 현장은 건드리지 않지만,
 * 서류 없이 접수/검토·준공보완에 서 있는 현장은 이제 못 넘어가므로 몇 건인지 먼저 안다.
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
/* .env.prod-db 는 DIRECT_URL 하나만 든다 — 저장소는 DATABASE_URL 을 본다 */
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

import { sql as raw } from 'drizzle-orm';
import { getDb } from '../lib/db/client';

type Row = {
  name: string; biz_type: string | null; power_type: string | null;
  status: string; complete_done_at: string | null; docs: string;
};

/** lib/process 의 COMPLETION_DOCS 와 같은 목록 — 여기서 다시 세는 것이 아니라 눈으로 볼 뿐이다 */
const NEED = ['completeConfirm', 'costSurvey', 'safety', 'useInspect', 'asBuilt'];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 찍는다 */ }
  console.log(`DB ${host}  (${ENV_FILE})\n`);

  const rows = (await getDb().execute(raw`
    select p.name, p.biz_type, p.power_type, pr.status, pr.complete_done_at,
           coalesce((select string_agg(pd.kind, ',' order by pd.kind)
                     from process_documents pd
                     where pd.project_id = p.id and pd.status in ('uploaded','approved')), '') as docs
      from projects p join processes pr on pr.project_id = p.id
     where pr.status in ('준공서류 접수/검토', '준공보완', '준공완료')
     order by pr.status, p.name
  `)) as unknown as Row[];

  console.log(`준공 근처 ${rows.length}건\n`);
  let stuck = 0;
  for (const r of rows) {
    const have = String(r.docs).split(',').filter(Boolean);
    const need = r.power_type === '한전불입' ? [...NEED, 'safetyMgr'] : NEED;
    const ok = have.includes('completion') || need.every((k) => have.includes(k));
    if (!ok && r.status !== '준공완료') stuck += 1;
    const done = r.complete_done_at ? ` 준공일 ${r.complete_done_at}` : '';
    const lack = need.filter((k) => !have.includes(k));
    console.log(`[${r.status}]${done} ${r.name} — 서류 ${have.length}종 ${ok ? '충족' : '★미충족★'}`);
    console.log(`    올라온 것: ${have.join(' · ') || '없음'}`);
    if (!ok) console.log(`    빠진 것: ${lack.join(' · ')}`);
  }
  console.log(`\n새 게이트에 걸리는(아직 준공 못 하는) 현장: ${stuck}건`);
  process.exit(0);
}

void main();

/**
 * 노션 「현재상황」 → 콘솔 진행상황 메모 동기화.
 *
 *   npx tsx scripts/sync-notion-notes.ts --snapshot <파일> --env .env.prod-db [--write]
 *
 * 컷오버 전까지 노션에 계속 메모가 쌓인다(포털 접수가 아직 노션으로 가므로). 이관 때
 * 한 번 옮긴 뒤로 새로 적힌 것만 주워 담는다 — 같은 본문이 이미 있으면 건너뛴다(멱등).
 * 콘솔에서 적은 메모는 노션으로 돌려보내지 않는다(dual-write 금지) — 한 방향이다.
 */
import { existsSync, readFileSync } from 'fs';
import { loadEnvFile } from '../lib/env-file';

const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '.env.local';
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../lib/db/client';
import { projectNotes, projects } from '../lib/db/schema';

const WRITE = process.argv.includes('--write');
const snapAt = process.argv.indexOf('--snapshot');
const SNAPSHOT = snapAt >= 0 ? process.argv[snapAt + 1] : null;
if (!SNAPSHOT || !existsSync(SNAPSHOT)) throw new Error('--snapshot <파일> 이 필요합니다.');

const txt = (p: any, k: string): string => {
  const v = p[k]; const arr = v?.[v?.type];
  const s = Array.isArray(arr) ? arr.map((x: any) => x.plain_text).join('') : '';
  return s.normalize('NFC').trim();
};

async function main() {
  console.log(`DB: ${new URL(process.env.DATABASE_URL!).host} (${WRITE ? '★쓰기★' : '드라이런'})\n`);
  const pages = JSON.parse(readFileSync(SNAPSHOT!, 'utf8')) as Array<{
    last_edited_time: string; properties: any;
  }>;

  const db = getDb();
  const projs = await db.select({ id: projects.id, mgmtNo: projects.mgmtNo })
    .from(projects).where(sql`${projects.mgmtNo} ~ '^[0-9]+$'`);
  const byNo = new Map(projs.map((p) => [p.mgmtNo!, p.id]));
  const have = new Set(
    (await db.select({ p: projectNotes.projectId, b: projectNotes.body }).from(projectNotes))
      .map((n) => `${n.p}|${n.b.normalize('NFC').trim()}`)
  );

  let added = 0, skipped = 0, noProject = 0;
  for (const page of pages) {
    const uid = page.properties['한백_현장관리번호']?.unique_id?.number;
    const body = txt(page.properties, '현재상황');
    if (uid == null || !body) continue;
    const projectId = byNo.get(String(uid));
    if (!projectId) {
      noProject += 1;
      console.log(`  [현장 없음] 노션 ${uid} — ${txt(page.properties, '현장명').slice(0, 20)} (먼저 현장을 이관하세요)`);
      continue;
    }
    if (have.has(`${projectId}|${body}`)) { skipped += 1; continue; }
    console.log(`  [추가] ${projectId} ← ${body.replace(/\n/g, ' / ').slice(0, 60)}`);
    added += 1;
    if (!WRITE) continue;
    await db.insert(projectNotes).values({
      id: crypto.randomUUID(), projectId, author: '한백', body,
      at: new Date(page.last_edited_time),
    });
  }
  console.log(`\n추가 ${added}건 · 이미 있음 ${skipped}건 · 현장 미이관 ${noProject}건`);
  if (!WRITE) console.log('드라이런 끝 — 반영하려면 --write.');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

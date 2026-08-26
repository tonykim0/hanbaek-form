/**
 * 노션 데이터베이스를 통째로 파일에 받아 둔다 (읽기 전용).
 *
 *   npx tsx scripts/snapshot-notion.ts <database_id> <저장경로.json>
 *
 * ★왜 스냅샷을 먼저 뜨는가★ 이관은 여러 번 돌려 보며 맞춰 가는 일이라, 그때마다 노션을
 * 다시 읽으면 기준이 흔들린다(사람이 그 사이에 값을 고친다). 파일 하나를 정본으로 놓고
 * 변환·리허설·실행이 모두 그것을 본다. 26년 현장 이관도 같은 방식이었다.
 *
 * 노션만 읽는다 — 콘솔 DB 는 건드리지 않는다.
 */
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { Client } from '@notionhq/client';
import { loadEnvFile } from '../lib/env-file';

loadEnvFile();

const [databaseId, outPath] = process.argv.slice(2);
if (!databaseId || !outPath) {
  throw new Error('사용법: npx tsx scripts/snapshot-notion.ts <database_id> <저장경로.json>');
}
if (!process.env.NOTION_API_KEY) throw new Error('NOTION_API_KEY 가 없습니다 (.env.local)');

async function main() {
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const rows: unknown[] = [];
  let cursor: string | undefined;

  for (;;) {
    const res = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });
    rows.push(...res.results);
    process.stdout.write(`\r받는 중 ${rows.length}건…`);
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(rows, null, 0));
  console.log(`\n${rows.length}건 → ${outPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

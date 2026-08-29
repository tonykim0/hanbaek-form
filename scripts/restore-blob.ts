/**
 * 아카이브에서 파일을 되살린다 — 아카이브 → Vercel Blob → DB 주소 갈아끼우기.
 *
 *   npx tsx scripts/restore-blob.ts \
 *     --archive "$HOME/Library/CloudStorage/OneDrive-개인/hanbaek-archive" \
 *     [--path materials/sk/sales/제안서.pdf] [--project HB-2026-058] [--gone] [--write]
 *
 * 기본은 드라이런이다 — 무엇을 올리고 어느 줄을 고칠지만 적는다. `--write` 를 붙여야 한다.
 *
 * ★왜 이 스크립트가 백업의 절반인가★
 * 파일만 도로 올리면 안 된다. Vercel Blob 은 올릴 때 이름 뒤에 임의 문자열을 붙여서,
 * 같은 파일을 다시 올려도 ★주소가 달라진다★ — 서류 1,131건 중 988건이 그런 주소다
 * (2026-08-29 실측). 그래서 되살리기는 두 걸음이다: 올리고, DB 가 들고 있던 옛 주소를
 * 새 주소로 갈아끼운다. 그 대응표가 아카이브의 manifest.json 이다.
 *
 * 되살릴 때는 임의 접미사를 끈다(addRandomSuffix: false) — 주소가 경로 그대로가 되어
 * 다음 사고 때는 갈아끼울 것이 없다.
 *
 * ★고르는 세 갈래★
 *   --path     한 건. 이름을 정확히 안다.
 *   --project  그 현장의 파일 전부. 현장을 통째로 지운 사고가 이 모양이다.
 *   --gone     원본에서 사라진 것 전부(manifest 의 goneAt). 무엇이 없어졌는지 모를 때.
 *
 * 이미 원본에 있는 파일은 건드리지 않는다 — 되살리기는 없는 것을 채우는 일이지
 * 덮어쓰는 일이 아니다.
 */
import { readFile } from 'fs/promises';
import { join } from 'path';
import { loadEnvFile } from '../lib/env-file';

const args = process.argv.slice(2);
const argOf = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const ARCHIVE = argOf('--archive');
const ONLY_PATH = argOf('--path');
const ONLY_PROJECT = argOf('--project');
const ONLY_GONE = args.includes('--gone');
const WRITE = args.includes('--write');
const ENV_BLOB = argOf('--env-blob') ?? '.env.prod-blob';
const ENV_DB = argOf('--env-db') ?? '.env.prod-db';

if (!ARCHIVE) throw new Error('--archive <아카이브 폴더> 가 필요합니다');
if (!ONLY_PATH && !ONLY_PROJECT && !ONLY_GONE) {
  throw new Error('무엇을 되살릴지 골라야 합니다 — --path · --project · --gone 중 하나');
}

loadEnvFile(ENV_BLOB);
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error(`${ENV_BLOB} 에 BLOB_READ_WRITE_TOKEN 이 없습니다 (쓰기 권한이 있어야 합니다).`);
}
loadEnvFile(ENV_DB);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}
if (!process.env.DATABASE_URL) throw new Error(`${ENV_DB} 에 DIRECT_URL 이 없습니다.`);

interface Entry {
  pathname: string;
  saved: string;
  url: string;
  size: number;
  uploadedAt: string;
  firstSeen: string;
  lastSeen: string;
  goneAt?: string;
  refs?: Array<{ table: string; projectId: string; kind: string }>;
}

async function main() {
  const manifest = JSON.parse(
    await readFile(join(ARCHIVE!, 'manifest.json'), 'utf8')
  ) as { updatedAt: string; entries: Record<string, Entry> };
  const all = Object.values(manifest.entries);
  console.log(`아카이브 ${ARCHIVE} · 매니페스트 ${all.length}건 (${manifest.updatedAt})`);

  const picked = all.filter((e) => {
    if (ONLY_PATH) return e.pathname === ONLY_PATH;
    if (ONLY_PROJECT) return (e.refs ?? []).some((r) => r.projectId === ONLY_PROJECT);
    return Boolean(e.goneAt);
  });
  if (picked.length === 0) throw new Error('되살릴 것을 못 찾았습니다 — 매니페스트를 확인하세요.');
  console.log(`고른 것 ${picked.length}건`);

  // 원본에 이미 있는 것은 뺀다 — 되살리기는 없는 것을 채우는 일이다
  const { list, put } = await import('@vercel/blob');
  const live = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await list({ limit: 1000, cursor });
    for (const b of page.blobs) live.add(b.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const todo = picked.filter((e) => !live.has(e.pathname));
  console.log(`그중 원본에 없는 것 ${todo.length}건 (있는 것 ${picked.length - todo.length}건은 건너뜁니다)`);
  if (todo.length === 0) { console.log('되살릴 것이 없습니다.'); process.exit(0); }

  const { getDb } = await import('../lib/db/client');
  const { and, eq, sql } = await import('drizzle-orm');
  const {
    documents, processDocuments, taxInvoices, partnerDetails, auditLog,
  } = await import('../lib/db/schema');
  const db = getDb();

  for (const e of todo) {
    const refs = e.refs ?? [];
    console.log(`\n${e.pathname}  ${(e.size / 1024).toFixed(0)} KB`);
    console.log(`   옛 주소  …${e.url.slice(-48)}`);
    console.log(`   DB 참조  ${refs.length === 0 ? '없음 (자료실 파일이거나 이미 지워진 줄)' : refs.map((r) => `${r.table}/${r.projectId || '-'}/${r.kind}`).join(' · ')}`);
    if (!WRITE) { console.log('   (드라이런 — 올리지 않았습니다)'); continue; }

    const body = await readFile(join(ARCHIVE!, 'blob', e.saved));
    /* 임의 접미사를 끈다 — 주소가 경로 그대로여서 다음부터는 갈아끼울 것이 없다 */
    const up = await put(e.pathname, body, { access: 'public', addRandomSuffix: false });
    console.log(`   새 주소  …${up.url.slice(-48)}`);

    for (const ref of refs) {
      if (ref.table === 'documents' || ref.table === 'process_documents') {
        const table = ref.table === 'documents' ? documents : processDocuments;
        /*
         * files 배열 안의 그 한 장만 주소를 바꾼다. 첫 장이면 사본(blob_url·filename)도
         * 같이 바꾼다 — 옛 코드와 SQL 이 그 사본을 본다(migrations/0021).
         */
        await db
          .update(table)
          .set({
            files: sql`(
              select jsonb_agg(case when x->>'url' = ${e.url}
                                    then jsonb_set(x, '{url}', to_jsonb(${up.url}::text))
                                    else x end)
                from jsonb_array_elements(${table.files}) t(x)
            )`,
            blobUrl: sql`case when ${table.blobUrl} = ${e.url} then ${up.url} else ${table.blobUrl} end`,
          })
          .where(and(eq(table.projectId, ref.projectId), eq(table.kind, ref.kind)));
      } else if (ref.table === 'tax_invoices') {
        await db.update(taxInvoices).set({ blobUrl: up.url }).where(eq(taxInvoices.blobUrl, e.url));
      } else if (ref.table === 'partner_details') {
        const col = ref.kind === 'bizCert' ? partnerDetails.bizCertUrl : partnerDetails.bankbookUrl;
        await db.update(partnerDetails).set(
          ref.kind === 'bizCert' ? { bizCertUrl: up.url } : { bankbookUrl: up.url }
        ).where(eq(col, e.url));
      }
      if (ref.projectId && ref.table !== 'partner_details') {
        await db.insert(auditLog).values({
          id: crypto.randomUUID(),
          projectId: ref.projectId,
          actor: '복구 스크립트(restore-blob)',
          action: '파일 되살림',
          field: `${ref.table}.${ref.kind}`,
          oldValue: e.url,
          newValue: up.url,
        });
      }
    }
    console.log(`   DB ${refs.length}곳 갈아끼움`);
  }

  if (!WRITE) {
    console.log('\n드라이런입니다 — 아무것도 올리거나 고치지 않았습니다. --write 를 붙이세요.');
  } else {
    console.log(`\n${todo.length}건을 되살렸습니다.`);
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });

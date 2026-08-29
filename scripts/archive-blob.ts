/**
 * 프로덕션 파일 아카이브 — Vercel Blob → 오프사이트 폴더. ★읽기만 한다.★
 *
 *   npx tsx scripts/archive-blob.ts \
 *     --out "$HOME/Library/CloudStorage/OneDrive-개인/hanbaek-archive" \
 *     [--env-blob .env.prod-blob] [--env-db .env.prod-db] [--dry] [--recheck]
 *
 * ★왜 필요한가★ (2026-08-29 점검)
 * 서류 파일 1,142개가 Vercel Blob 에만 있다. DB 는 주 1회라도 덤프를 뜨는데 파일은 한 번도
 * 뜬 적이 없다. 그리고 지우는 길이 코드에 실재한다 — 현장을 지우면 그 현장 파일을 전부
 * `del()` 한다(app/api/projects/[id]/route.ts). Blob 에는 버전 기록도 휴지통도 없다.
 *
 * ★미러가 아니라 누적 아카이브다.★
 * 원본에서 사라진 파일을 여기서 따라 지우지 않는다 — 그러면 우리가 막으려던 사고(실수로
 * 지움)에 백업이 그대로 동조한다. 없어진 것은 매니페스트에 `goneAt` 만 적고 파일은 남긴다.
 * 그래서 이 폴더는 시간이 지나도 줄지 않는다. 줄어들면 그날이 사고 난 날이다.
 *
 * ★매니페스트가 없으면 복구가 안 된다.★
 * 서류 1,131건 중 988건이 임의 접미사가 붙은 주소다(2026-08-29 실측). 같은 파일을 다시
 * 올려도 주소가 달라지므로, 되살리려면 「어느 표의 어느 행 어느 칸이 이 주소였나」를 알아야
 * DB 를 고칠 수 있다. 그 대응표를 파일 옆에 같이 둔다.
 *
 * ★보내는 곳은 폴더다★ — 지금은 OneDrive 동기화 폴더(회사가 비용을 내는 계정)를 가리키고,
 * 나중에 맥을 빼고 클라우드에서 돌리려면 이 자리만 S3 호환 저장소로 바꾸면 된다.
 * 폴더로 쓰는 동안에는 ★이 폴더 안에서 손으로 지우지 않는다★ — 동기화가 삭제를 따라간다.
 */
import { createWriteStream } from 'fs';
import { mkdir, readFile, rename, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { Readable } from 'stream';
import { pipeline as streamPipeline } from 'stream/promises';
import { loadEnvFile } from '../lib/env-file';

const args = process.argv.slice(2);
const argOf = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const OUT = argOf('--out');
const ENV_BLOB = argOf('--env-blob') ?? '.env.prod-blob';
const ENV_DB = argOf('--env-db') ?? '.env.prod-db';
/** 무엇이 오갈지만 적고 아무것도 안 받는다 */
const DRY = args.includes('--dry');
/** 이미 받은 파일도 크기를 다시 재 본다 — 평소에는 건너뛴다 */
const RECHECK = args.includes('--recheck');

if (!OUT) throw new Error('--out <폴더> 가 필요합니다 (예: OneDrive 동기화 폴더 안)');

/*
 * 토큰은 저장소의 .env.prod-blob 에서 읽는다. Vercel 에 저장된 BLOB_READ_WRITE_TOKEN 은
 * Secret 이라 되읽을 수 없다(2026-08-29 확인) — Blob 스토어 대시보드에서 따로 발급한다.
 */
loadEnvFile(ENV_BLOB);
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error(`${ENV_BLOB} 에 BLOB_READ_WRITE_TOKEN 이 없습니다 — Vercel → Storage → Blob 에서 발급하세요.`);
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * 파일 이름을 폴더에 담을 수 있게 다듬는다.
 *
 * OneDrive·윈도우가 못 받는 글자가 있다(" * : < > ? | \). Blob 경로에는 들어갈 수 있으므로
 * 여기서 바꾸고, ★바꿨다는 사실을 매니페스트에 남긴다★ — 복구할 때 원래 경로로 되돌려야 한다.
 */
function safePath(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => seg.replace(/["*:<>?|\\]/g, '_').replace(/\s+$/, '').replace(/\.$/, '_'))
    .join('/');
}

interface Entry {
  /** Blob 의 경로 — 이것이 열쇠다 */
  pathname: string;
  /** 폴더에 실제로 쓴 상대 경로 (금지 글자를 바꿨을 수 있다) */
  saved: string;
  url: string;
  size: number;
  uploadedAt: string;
  /** 처음 본 날 · 마지막으로 원본에서 본 날 */
  firstSeen: string;
  lastSeen: string;
  /** 원본에서 사라진 날 — 파일은 여기 남아 있다 */
  goneAt?: string;
  /** 이 주소를 들고 있는 DB 자리 — 복구할 때 여기를 고친다 */
  refs?: Array<{ table: string; projectId: string; kind: string }>;
}

interface Manifest {
  updatedAt: string;
  entries: Record<string, Entry>;
}

async function loadManifest(path: string): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Manifest;
  } catch {
    return { updatedAt: '', entries: {} };
  }
}

/** DB 가 들고 있는 주소 → 어느 표의 어느 행 어느 칸인가 */
async function referenceMap(): Promise<Map<string, Entry['refs']>> {
  const map = new Map<string, Entry['refs']>();
  try {
    await readFile(ENV_DB, 'utf8');
  } catch {
    console.log(`(${ENV_DB} 가 없어 DB 참조는 건너뜁니다 — 파일만 받습니다)`);
    return map;
  }
  loadEnvFile(ENV_DB);
  if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
    process.env.DATABASE_URL = process.env.DIRECT_URL;
  }
  const { getDb } = await import('../lib/db/client');
  const { sql } = await import('drizzle-orm');
  const db = getDb();
  /*
   * files 는 [{url,…}] 배열이고 blob_url 은 그 첫 장의 사본이다(migrations/0021).
   * 둘 다 펼쳐서 모은다 — 백필 전 행은 배열이 비어 있고 blob_url 만 있다.
   */
  const rows = (await db.execute(sql`
    select 'documents' as t, project_id, kind, url from documents, jsonb_array_elements(files) f(x),
           lateral (select x->>'url' as url) u where url is not null
    union all
    select 'documents', project_id, kind, blob_url from documents where blob_url is not null
    union all
    select 'process_documents', project_id, kind, url from process_documents, jsonb_array_elements(files) f(x),
           lateral (select x->>'url' as url) u where url is not null
    union all
    select 'process_documents', project_id, kind, blob_url from process_documents where blob_url is not null
    union all
    select 'tax_invoices', '', 'invoice', blob_url from tax_invoices where blob_url is not null
    union all
    -- 협력사가 올린 사업자등록증·통장사본도 Blob 에 있다 (현장이 아니라 회사에 딸린다)
    select 'partner_details', user_id, 'bizCert', biz_cert_url from partner_details where biz_cert_url is not null
    union all
    select 'partner_details', user_id, 'bankbook', bankbook_url from partner_details where bankbook_url is not null
  `)) as unknown as Array<Record<string, unknown>>;
  for (const r of rows) {
    const url = String(r.url ?? r.blob_url ?? '');
    if (!url) continue;
    const list = map.get(url) ?? [];
    const ref = { table: String(r.t), projectId: String(r.project_id ?? ''), kind: String(r.kind ?? '') };
    if (!list.some((x) => x.table === ref.table && x.projectId === ref.projectId && x.kind === ref.kind)) {
      list.push(ref);
    }
    map.set(url, list);
  }
  console.log(`DB 참조 ${map.size}개 주소`);
  return map;
}

async function main() {
  const day = new Date().toISOString().slice(0, 10);
  const filesDir = join(OUT!, 'blob');
  const manifestPath = join(OUT!, 'manifest.json');
  await mkdir(filesDir, { recursive: true });

  const manifest = await loadManifest(manifestPath);
  const before = Object.keys(manifest.entries).length;
  console.log(`아카이브 ${OUT}`);
  console.log(`매니페스트에 이미 있는 파일 ${before}건${manifest.updatedAt ? ` (마지막 ${manifest.updatedAt})` : ''}`);

  const { list } = await import('@vercel/blob');
  const seen = new Set<string>();
  let total = 0;
  let cursor: string | undefined;
  const found: Array<{ pathname: string; url: string; size: number; uploadedAt: string }> = [];
  do {
    const page = await list({ limit: 1000, cursor });
    for (const b of page.blobs) {
      found.push({
        pathname: b.pathname,
        url: b.url,
        size: b.size,
        uploadedAt: new Date(b.uploadedAt).toISOString().slice(0, 10),
      });
      total += b.size;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  console.log(`Blob 에 있는 파일 ${found.length}건 · 합계 ${mb(total)}`);

  const refs = await referenceMap();

  let got = 0;
  let bytes = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const b of found) {
    seen.add(b.pathname);
    const saved = safePath(b.pathname);
    const dest = join(filesDir, saved);
    const prev = manifest.entries[b.pathname];

    let have = false;
    if (!RECHECK && prev && prev.size === b.size) {
      have = true;
    } else {
      try {
        const st = await stat(dest);
        have = st.size === b.size;
      } catch { have = false; }
    }

    manifest.entries[b.pathname] = {
      pathname: b.pathname,
      saved,
      url: b.url,
      size: b.size,
      uploadedAt: b.uploadedAt,
      firstSeen: prev?.firstSeen ?? day,
      lastSeen: day,
      /* goneAt 은 새로 만든 줄에 안 넣는다 — 되살아나면 저절로 지워진다 */
      ...(refs.get(b.url) ? { refs: refs.get(b.url) } : prev?.refs ? { refs: prev.refs } : {}),
    };

    if (have) { skipped++; continue; }
    if (DRY) { got++; bytes += b.size; continue; }

    try {
      await mkdir(dirname(dest), { recursive: true });
      const res = await fetch(b.url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      /* 받다 만 파일이 남지 않게 임시 이름으로 받고 다 받으면 옮긴다 */
      const tmp = `${dest}.part`;
      await streamPipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
      await rename(tmp, dest);
      got++;
      bytes += b.size;
    } catch (err) {
      failed.push(`${b.pathname} — ${(err as Error).message}`);
    }
  }

  /* 원본에서 사라진 것 — ★지우지 않는다★. 언제 사라졌는지만 적는다 */
  let gone = 0;
  for (const [key, e] of Object.entries(manifest.entries)) {
    if (seen.has(key) || e.goneAt) continue;
    e.goneAt = day;
    gone++;
  }

  manifest.updatedAt = day;
  if (!DRY) await writeFile(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`, 'utf8');

  console.log('');
  console.log(`받음   ${got}건 ${mb(bytes)}${DRY ? ' (드라이런 — 실제로 받지 않음)' : ''}`);
  console.log(`건너뜀 ${skipped}건 (이미 같은 크기로 있음)`);
  console.log(`사라짐 ${gone}건 — 원본에 없지만 아카이브에는 남겨 둡니다`);
  console.log(`매니페스트 ${Object.keys(manifest.entries).length}건 · ${manifestPath}`);

  if (failed.length > 0) {
    console.error(`\n★실패 ${failed.length}건★`);
    for (const line of failed.slice(0, 20)) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log('\n읽기만 했습니다 — 원본은 그대로입니다.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });

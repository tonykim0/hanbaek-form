/**
 * 이미 붙은 「휴대폰 사진으로 보임」 표를 다시 판정한다. [기본은 미리보기]
 *
 *   npx tsx scripts/recheck-photo-flags.ts          ← 무엇이 바뀌는지만 본다
 *   npx tsx scripts/recheck-photo-flags.ts --write  ← 실제로 고친다
 *
 * ★왜 필요한가★ 표는 접수하는 순간 찍혀 저장된다(documents.files[].photo). 판정 규칙을
 * 고쳐도 이미 찍힌 것은 그대로 남는다 — 2026-08-31 에 「EXIF 에 제조사가 있으면 카메라」를
 * 「렌즈 값이 있어야 카메라」로 고쳤는데(Canon 복합기가 제 이름을 박는다), 그 전에 접수된
 * 서류에는 틀린 표가 붙은 채다.
 *
 * ★지우지 않고 다시 본다.★ 전부 걷어내면 진짜 사진이었던 것까지 같이 사라진다. 파일을
 * 실제로 받아 새 규칙으로 판정하고 그 답을 적는다 — 그래서 이 스크립트가 SQL 이 아니라
 * 프로그램이다(마이그레이션은 Blob 을 못 읽는다).
 *
 * 읽기만 하는 것이 기본이다. `--write` 를 줘야 쓴다.
 */
import postgres from 'postgres';
import { loadEnvFile } from '../lib/env-file';
import { checkImagePhoto, checkPdfPhoto } from '../lib/photo-check';

loadEnvFile('.env.prod-db');
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error('DB URL 없음 — .env.prod-db 확인');
const sql = postgres(url, { max: 1, prepare: false });
const write = process.argv.includes('--write');

interface FileEntry {
  name?: string;
  url?: string;
  photo?: string[] | null;
  [k: string]: unknown;
}

const same = (a: string[] | null | undefined, b: string[] | null) =>
  JSON.stringify(a ?? null) === JSON.stringify(b);

async function main() {
  const rows = await sql`
    select project_id, kind, files
    from documents
    where files::text like '%"photo"%'
    order by project_id, kind`;

  console.log(`표가 붙은 칸 ${rows.length}건 — ${write ? '고친다' : '미리보기'}\n`);
  let changed = 0;
  let kept = 0;
  let unreadable = 0;

  for (const row of rows) {
    const files = row.files as FileEntry[];
    const next: FileEntry[] = [];
    const lines: string[] = [];

    for (const f of files) {
      if (!f.photo?.length || !f.url) { next.push(f); continue; }
      let verdict: string[] | null = null;
      try {
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        /* 이름으로 가른다 — 저장된 것은 PDF 아니면 이미지다 */
        const check = /\.pdf$/i.test(f.name ?? '')
          ? await checkPdfPhoto(buf)
          : checkImagePhoto(buf);
        verdict = check.suspect ? check.reasons : null;
      } catch (err) {
        /* 못 받으면 손대지 않는다 — 모르는 것을 「아니다」로 적으면 안 된다 */
        unreadable += 1;
        lines.push(`      ? ${f.name} — 파일을 못 받음(${(err as Error).message}), 그대로 둔다`);
        next.push(f);
        continue;
      }
      if (same(f.photo, verdict)) {
        kept += 1;
        lines.push(`      = ${f.name} — 그대로 (${(verdict ?? []).join(' · ') || '표 없음'})`);
        next.push(f);
      } else {
        changed += 1;
        lines.push(`      ★ ${f.name}`);
        lines.push(`        전: ${f.photo.join(' · ')}`);
        lines.push(`        후: ${verdict ? verdict.join(' · ') : '표 없음(스캔본으로 본다)'}`);
        const copy = { ...f };
        if (verdict) copy.photo = verdict;
        else delete copy.photo;
        next.push(copy);
      }
    }

    if (lines.length > 0) console.log(`  [${row.kind}] ${row.project_id}\n${lines.join('\n')}`);
    if (write && next.some((f, i) => f !== files[i])) {
      await sql`update documents set files = ${sql.json(next as never)}
        where project_id = ${row.project_id} and kind = ${row.kind}`;
    }
  }

  console.log(`\n바뀜 ${changed}건 · 그대로 ${kept}건 · 못 읽음 ${unreadable}건`);
  if (!write && changed > 0) console.log('실제로 고치려면 --write 를 붙인다.');
  await sql.end();
}
main();

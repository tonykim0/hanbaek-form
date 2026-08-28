/**
 * 노션 페이지 본문의 서류 파일 → 프로덕션 Blob + 콘솔 documents. (2026-08-24 한백 승인)
 *
 *   npx tsx scripts/import-notion-files.ts --env .env.prod-db                 드라이런(기본)
 *   BLOB_TOKEN_FOR_IMPORT=<프로덕션 토큰> npx tsx ... --env .env.prod-db --write
 *
 * 분류 (드라이런 2회로 검증, 2026-08-24):
 *   1. 파일명을 NFC 정규화한다 — 맥 업로드는 자모 분리(NFD)라 안 하면 매칭이 다 빗나간다.
 *   2. 접수 파이프라인의 표준 접미사(_계약서 등) → 종류. 그 다음 키워드 매칭(변형·오타).
 *   3. 「_기타_」가 들어간 이름 → 기타. 행위신고 서류는 콘솔에 칸이 없어 건너뛰고 보고한다.
 *   4. _전체.zip 은 개별 파일과 중복이라 생략. 불명은 건너뛰고 보고 — 노션 원본은 남는다.
 *
 * 중복(현장×종류 여럿): 표준 접미사 우선, 같으면 첫 파일. 나머지는 보고.
 * 멱등: documents 에 그 (현장×종류)가 이미 있으면 건너뛴다.
 * 업로드 토큰은 BLOB_TOKEN_FOR_IMPORT 로만 받는다 — 환경 파일의 토큰을 쓰면
 * 로컬 개발 스토어(hanbaek-dev2)에 올리는 사고가 난다(스토어 분리, 2026-08-23).
 */
import { existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { loadEnvFile } from '../lib/env-file';

const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '.env.local';
if (!ENV_FILE || ENV_FILE.startsWith('--')) throw new Error('--env 뒤에 파일 이름이 없습니다.');
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}
// 노션 키는 .env.local 에만 있다 — 이미 있는 값은 덮지 않으므로 DB 연결은 안 바뀐다
loadEnvFile('.env.local');

import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../lib/db/client';
import { auditLog, documents, projects } from '../lib/db/schema';

const WRITE = process.argv.includes('--write');
const SNAPSHOT = path.join(os.homedir(), 'hanbaek-backups/20260823/notion-26-sites.json');

/* ── 분류 규칙 (드라이런으로 검증된 것) ── */
const EXACT: Record<string, string> = {
  '계약서': 'contract', '합의서': 'agreement', '직인동의서': 'sealuse', '설치신청서': 'apply',
  '개인정보동의서': 'privacy', '사전컨설팅': 'consult', '사진대지': 'survey', '회의록': 'minutes',
  '관리단회의록': 'minutes', '한전청구서': 'kepcobill', '건축물대장': 'bldgreg',
  'kapt스크린샷': 'bldgreg', '설치승인서': 'approval', '사업자등록증': 'bizreg',
  '고유번호증': 'bizreg', '실사보고서': 'survey', '기타': 'etc',
};
const KEYWORDS: Array<[string, string]> = [
  ['개인정보', 'privacy'], ['직인', 'sealuse'], ['신청서', 'apply'], ['컨설팅', 'consult'],
  ['사진대지', 'survey'], ['실사보고서', 'survey'], ['회의록', 'minutes'], ['합의서', 'agreement'],
  ['설치승인서', 'approval'], ['별지2', 'checklist2'], ['체크리스트', 'checklist2'],
  ['계약서', 'contract'], ['전기요금', 'kepcobill'], ['요금고지서', 'kepcobill'],
  ['요금청구서', 'kepcobill'], ['한전', 'kepcobill'], ['건축물대장', 'bldgreg'],
  ['전유부', 'bldgreg'], ['사업자등록증', 'bizreg'], ['고유번호증', 'bizreg'], ['기설치', 'legacylog'],
];

type How = '표준' | '키워드' | '기타패턴' | '행위신고' | '불명' | 'zip';
function classify(raw: string): { how: How; kind: string | null } {
  const name = raw.normalize('NFC');
  const base = name.replace(/\.[A-Za-z0-9]+$/, '');
  if (base.endsWith('_전체') || /\.zip$/i.test(name)) return { how: 'zip', kind: null };
  const m = /_([^_]+?)(?:_(\d+))?$/.exec(base);
  const sfx = (m?.[1] ?? '').trim();
  if (EXACT[sfx]) return { how: '표준', kind: EXACT[sfx] };
  const norm = base.replace(/\s+/g, '');
  if (norm.includes('행위신고')) return { how: '행위신고', kind: null };
  if (norm.includes('_기타_') || /_기타_/.test(base)) return { how: '기타패턴', kind: 'etc' };
  for (const [kw, kind] of KEYWORDS) if (norm.includes(kw)) return { how: '키워드', kind };
  return { how: '불명', kind: null };
}

/* ── 노션 ── */
const NOTION = 'https://api.notion.com/v1';
async function notionBlocks(pageId: string) {
  const out: any[] = [];
  let cursor: string | null = null;
  do {
    const res = await fetch(
      `${NOTION}/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`,
      { headers: { Authorization: `Bearer ${process.env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28' } }
    );
    if (!res.ok) throw new Error(`노션 블록 조회 실패 ${res.status} (${pageId})`);
    const d = (await res.json()) as { results: any[]; has_more: boolean; next_cursor: string | null };
    out.push(...d.results);
    cursor = d.has_more ? d.next_cursor : null;
    await new Promise((r) => setTimeout(r, 300));
  } while (cursor);
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 이 없습니다.');
  console.log(`DB: ${new URL(url).host}  (${WRITE ? '★쓰기★' : '드라이런'})\n`);
  if (WRITE && !process.env.BLOB_TOKEN_FOR_IMPORT) {
    throw new Error('--write 에는 BLOB_TOKEN_FOR_IMPORT(프로덕션 스토어 토큰)가 필요합니다.');
  }

  const pages = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Array<{ id: string; properties: any }>;
  const uidOf = (p: any) => String(p.properties['한백_현장관리번호'].unique_id.number);

  const db = getDb();
  const projs = await db.select({
    id: projects.id, mgmtNo: projects.mgmtNo, name: projects.name,
    receivedAt: projects.contractConfirmedAt,
  }).from(projects).where(sql`${projects.mgmtNo} ~ '^[0-9]+$'`);
  const byNo = new Map(projs.map((p) => [p.mgmtNo!, p]));
  const existing = new Set(
    (await db.select({ p: documents.projectId, k: documents.kind }).from(documents))
      .map((d) => `${d.p}|${d.k}`)
  );

  // 계획 세우기 — 파일 목록은 스냅샷 순서대로, 현장×종류마다 표준 우선 첫 파일
  interface Item { projectId: string; site: string; kind: string; name: string; pageId: string; blockIdx: number; how: How }
  const plan: Item[] = [];
  const skipped: Array<[string, string, string]> = []; // (현장, 파일, 이유)
  const stats = { 대상: 0, 이미있음: 0, zip: 0, 행위신고: 0, 불명: 0, 중복탈락: 0, 현장없음: 0 };

  // 드라이런은 스냅샷의 파일명만으로 계획한다 — 실행 때 블록을 다시 읽어 새 URL 을 받는다
  const manifest = JSON.parse(readFileSync(
    path.join(os.homedir(), 'hanbaek-backups/20260823/notion-files-manifest.json'), 'utf8'
  )) as Array<{ uid: string; site: string; files: Array<{ name: string }> }>;

  for (const m of manifest) {
    const proj = byNo.get(m.uid);
    if (!proj) { stats.현장없음 += m.files.length; continue; }
    const perKind = new Map<string, { name: string; how: How; idx: number }>();
    m.files.forEach((f, idx) => {
      const { how, kind } = classify(f.name);
      if (how === 'zip') { stats.zip += 1; return; }
      if (how === '행위신고') { stats.행위신고 += 1; skipped.push([m.site, f.name, '행위신고(칸 없음)']); return; }
      if (!kind) { stats.불명 += 1; skipped.push([m.site, f.name, '불명']); return; }
      const cur = perKind.get(kind);
      // 표준이 키워드·기타패턴을 이긴다. 같은 우선순위면 첫 파일.
      if (!cur || (how === '표준' && cur.how !== '표준')) {
        if (cur) { stats.중복탈락 += 1; skipped.push([m.site, cur.name, `중복(${kind}) → ${f.name.normalize('NFC').slice(0, 30)} 우선`]); }
        perKind.set(kind, { name: f.name, how, idx });
      } else {
        stats.중복탈락 += 1; skipped.push([m.site, f.name, `중복(${kind})`]);
      }
    });
    for (const [kind, f] of perKind) {
      if (existing.has(`${proj.id}|${kind}`)) { stats.이미있음 += 1; continue; }
      plan.push({ projectId: proj.id, site: m.site, kind, name: f.name.normalize('NFC'), pageId: '', blockIdx: f.idx, how: f.how });
      stats.대상 += 1;
    }
  }
  const pageIdByNo = new Map(pages.map((p) => [uidOf(p), p.id]));
  for (const it of plan) {
    const proj = projs.find((p) => p.id === it.projectId)!;
    it.pageId = pageIdByNo.get(proj.mgmtNo!) ?? '';
  }

  /* ── 리포트 ── */
  const kindCnt = new Map<string, number>();
  plan.forEach((i) => kindCnt.set(i.kind, (kindCnt.get(i.kind) ?? 0) + 1));
  console.log('통계:', stats);
  console.log('종류별 업로드 계획:', Object.fromEntries([...kindCnt.entries()].sort((a, b) => b[1] - a[1])));
  console.log(`\n건너뜀 ${skipped.length}건 (전부 노션 원본에 남는다):`);
  for (const [site, fname, why] of skipped) console.log(`  [${why}] ${site.slice(0, 18)} — ${fname.normalize('NFC').slice(0, 44)}`);

  if (!WRITE) { console.log('\n드라이런 끝 — 반영하려면 --write.'); process.exit(0); }

  /* ── 실행: 페이지마다 블록을 다시 읽어(새 URL) 내려받고 올린다 ── */
  const { put } = await import('@vercel/blob');
  const token = process.env.BLOB_TOKEN_FOR_IMPORT!;
  const byPage = new Map<string, Item[]>();
  for (const it of plan) {
    if (!byPage.has(it.pageId)) byPage.set(it.pageId, []);
    byPage.get(it.pageId)!.push(it);
  }

  let done = 0, bytes = 0, failed = 0;
  for (const [pageId, items] of byPage) {
    const blocks = (await notionBlocks(pageId)).filter((b) => ['file', 'pdf', 'image'].includes(b.type));
    for (const it of items) {
      const block = blocks.find((b) => ((b[b.type].name ?? '') as string).normalize('NFC') === it.name)
        ?? blocks[it.blockIdx];
      const fileUrl = block?.[block.type]?.[block[block.type].type]?.url;
      if (!fileUrl) { failed += 1; console.log(`  ★실패★ ${it.site.slice(0, 16)} ${it.name} — URL 없음`); continue; }
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`다운로드 ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        bytes += buf.length;
        const proj = projs.find((p) => p.id === it.projectId)!;
        const blob = await put(`projects/${it.projectId}/${it.kind}-${it.name}`, buf, {
          access: 'public', token, addRandomSuffix: true,
        });
        await db.insert(documents).values({
          projectId: it.projectId, kind: it.kind, filename: it.name, blobUrl: blob.url,
          status: 'uploaded', uploadedBy: '노션 이관',
          uploadedAt: proj.receivedAt ?? new Date().toISOString().slice(0, 10),
        }).onConflictDoNothing();
        done += 1;
        if (done % 100 === 0) console.log(`  …${done}/${plan.length} (${(bytes / 1048576).toFixed(0)}MB)`);
      } catch (e) {
        failed += 1;
        console.log(`  ★실패★ ${it.site.slice(0, 16)} ${it.name} — ${(e as Error).message}`);
      }
    }
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(), projectId: null, actor: '노션 이관 스크립트',
    action: '노션 본문 서류 파일 이관',
    newValue: `업로드 ${done}건 · ${(bytes / 1048576).toFixed(0)}MB · 실패 ${failed}건 · 건너뜀 ${skipped.length}건`,
  });
  console.log(`\n완료: 업로드 ${done}/${plan.length} · ${(bytes / 1048576).toFixed(0)}MB · 실패 ${failed}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

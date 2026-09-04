/**
 * 한 현장의 수전방식을 고친다 — 현장 대표값과 계약 라인을 같이.
 *
 *   npx tsx scripts/fix-power-type.ts --env .env.prod-db --id HB-2026-139 --to 한전불입 [--write]
 *
 * ★두 자리를 같이 고친다★ — 현장 대표값(projects.power_type)은 화면이 보고, 단가 판정은
 * 라인의 값으로 갈린다(lib/pricing-match). 한쪽만 고치면 화면과 단가가 어긋난다.
 *
 * 상리우성아파트(mgmt_no 247)가 노션 이관 때 모자분리로 들어왔다 — 노션 시트의 「수전방식」을
 * 이관이 그대로 옮긴다(scripts/import-notion-2026.ts 의 sel, 기본값 없음). 실제는 한전불입이다
 * (한백 확인 2026-09-04). 같은 이관분 현엔 27건 중 모자분리는 4건뿐이라 입력 시점의 오기다.
 *
 * --write 없이는 무엇이 바뀌는지만 찍는다.
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

const arg = (k: string): string | null => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
};
const ID = arg('--id');
const TO = arg('--to');
const WRITE = process.argv.includes('--write');
if (!ID) throw new Error('--id 뒤에 현장 id 가 필요합니다.');
if (TO !== '한전불입' && TO !== '모자분리' && TO !== '한전불입+모자분리') {
  throw new Error('--to 는 한전불입 · 모자분리 · 한전불입+모자분리 중 하나입니다.');
}

import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db/client';
import { contractLines, projects } from '../lib/db/schema';
import { writeAudit } from '../lib/db/audit';
import type { Actor } from '../lib/auth/types';

const ACTOR: Actor = { id: 'script', name: '수전방식 정정 (노션 이관 오기)', role: 'admin', org: null };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 찍는다 */ }
  console.log(`DB ${host}  (${ENV_FILE})  ${WRITE ? '★쓰기★' : '보기만'}\n`);

  const db = getDb();
  const [p] = await db.select().from(projects).where(eq(projects.id, ID!)).limit(1);
  if (!p) throw new Error(`현장 ${ID} 를 찾을 수 없습니다.`);
  const lines = await db.select().from(contractLines).where(eq(contractLines.projectId, ID!));

  console.log(`■ ${p.name} (${p.mgmtNo ?? 'mgmt_no 없음'})`);
  console.log(`   현장 수전방식 ${p.powerType ?? '미지정'} → ${TO}`);
  for (const l of lines) {
    console.log(`   라인 ${l.id} ${l.powerType ?? '미지정'} → ${TO}  (${l.qty}기)`);
  }
  /* 지급조건이 확정되면 저장소가 단가 변경을 거절한다 — 수전은 그 축이라 먼저 본다 */
  if (p.payoutTermsConfirmedAt) {
    console.log(`\n★지급조건이 확정된 현장입니다(${p.payoutTermsConfirmedAt}) — 해제 후에 고치세요.★`);
    process.exit(1);
  }

  if (!WRITE) {
    console.log('\n보기만 했습니다. 실제로 고치려면 --write 를 붙이세요.');
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    await tx.update(projects).set({ powerType: TO }).where(eq(projects.id, ID!));
    await writeAudit(tx, {
      projectId: ID!, actor: ACTOR, action: '수전방식 정정',
      field: 'powerType', oldValue: p.powerType, newValue: TO,
    });
    for (const l of lines) {
      await tx.update(contractLines).set({ powerType: TO }).where(eq(contractLines.id, l.id));
      await writeAudit(tx, {
        projectId: ID!, actor: ACTOR, action: '수전방식 정정',
        field: `line.${l.id}.powerType`, oldValue: l.powerType, newValue: TO,
      });
    }
  });
  console.log('\n고쳤습니다.');
  process.exit(0);
}

void main();

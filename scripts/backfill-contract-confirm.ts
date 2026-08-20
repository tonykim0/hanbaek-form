/**
 * 계약 확인 도입 전에 이미 진행 중이던 현장을 채운다.
 *
 *   npm run db:backfill-confirm            무엇이 바뀔지만 보여준다
 *   npm run db:backfill-confirm -- --write 실제로 쓴다
 *
 * ★왜 필요한가★
 * 계약 확인(projects.contract_confirmed_at)이 단계의 조건이 되면서, 이 열이 비어 있는
 * 기존 현장이 전부 「계약접수」로 내려간다. 공정이 이미 계약완료를 지난 현장은 사실상
 * 누군가 확인한 것이므로, 그 사실을 채워 넣어 원래 자리에 돌려놓는다.
 *
 * ★계약완료에 머문 현장은 건드리지 않는다.★ 그것들은 「확인을 기다리는 상태」가 맞다 —
 * 한백이 화면에서 눌러야 넘어간다. 여기서 대신 눌러주면 아무도 안 본 계약이 넘어간다.
 *
 * 멱등하다. 이미 값이 있는 현장은 지나간다.
 */
import { loadEnvFile } from '../lib/env-file';

loadEnvFile();

import { and, eq, isNull, ne } from 'drizzle-orm';
import { getDb } from '../lib/db/client';
import { processes, projects } from '../lib/db/schema';

const WRITE = process.argv.includes('--write');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 이 없습니다.');
  const db = getDb();

  // 공정이 계약완료를 지난 현장 = 이미 계약이 끝난 것으로 다뤄지고 있던 현장
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: processes.status,
      lastProgressAt: projects.lastProgressAt,
    })
    .from(projects)
    .innerJoin(processes, eq(processes.projectId, projects.id))
    .where(and(isNull(projects.contractConfirmedAt), ne(processes.status, '계약완료')));

  if (rows.length === 0) {
    console.log('채울 현장이 없습니다.');
    process.exit(0);
  }

  console.log(`${rows.length}건:`);
  for (const r of rows) {
    console.log(`  ${r.id} · ${r.name} · ${r.status} → 확인일 ${r.lastProgressAt}`);
  }

  if (!WRITE) {
    console.log('\n실제로 쓰려면 --write 를 붙이세요.');
    process.exit(0);
  }

  for (const r of rows) {
    // 확인일은 마지막 진척일로 둔다 — 언제 확인했는지 모르므로 가장 가까운 사실을 쓴다
    await db
      .update(projects)
      .set({ contractConfirmedAt: r.lastProgressAt })
      .where(eq(projects.id, r.id));
  }
  console.log(`\n${rows.length}건을 채웠습니다.`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(`\n${(err as Error).message}`);
  process.exit(1);
});

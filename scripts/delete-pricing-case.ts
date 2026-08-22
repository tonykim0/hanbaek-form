/**
 * 단가 케이스를 지운다 — 참조가 없을 때만.
 *
 *   npx tsx scripts/delete-pricing-case.ts <케이스id…>                  지울 수 있는지만 본다
 *   npx tsx scripts/delete-pricing-case.ts <케이스id…> --write           실제로 지운다
 *   npx tsx scripts/delete-pricing-case.ts <케이스id…> --env .env.prod-db --write
 *
 * ★화면에는 지우는 자리가 없다★ — 저장소에도 삭제 메서드가 없다. 참조하는 계약 라인이
 * 있으면 그 현장의 지급액·기성을 계산할 수 없게 되고, 케이스는 라인이 값을 복사하지 않고
 * 참조만 하므로 되돌릴 방법도 없다. 그래서 정규 경로는 「중지」다(새로 못 붙고, 이미 붙은
 * 것은 그대로 계산된다).
 *
 * 그런데 잘못 만든 케이스가 아무 라인도 안 붙은 채로 목록에 남는 일이 실제로 있다 —
 * 그때는 중지해도 「중지 1건」으로 계속 보인다. 참조가 0인 케이스만 지우는 길을 여기 둔다.
 * 참조가 하나라도 있으면 지우지 않고 어느 라인이 붙어 있는지 적어준다.
 *
 * 2026-08-22: 나이스 7월 1일 케이스 둘(nice-h2-y7/y10-mother-new-apt)을 이것으로 지웠다 —
 * 8월 1일 정책으로 갈렸고 7월 접수건이 없어 쓸 자리가 없었다.
 */
import { existsSync } from 'fs';
import postgres from 'postgres';
import { loadEnvFile } from '../lib/env-file';

const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '.env.local';
if (!ENV_FILE || ENV_FILE.startsWith('--')) {
  throw new Error('--env 뒤에 파일 이름이 없습니다 (예: --env .env.prod-db).');
}
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);

const WRITE = process.argv.includes('--write');
/* 옵션이 아닌 인자가 케이스 id 다 — --env 의 값은 빼야 한다 */
const IDS = process.argv.slice(2).filter(
  (a, i, all) => !a.startsWith('--') && all[i - 1] !== '--env'
);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  if (IDS.length === 0) throw new Error('지울 케이스 id 를 인자로 주세요.');

  const sql = postgres(url, { max: 1, prepare: false });
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 파싱 못 하면 비워 둔다 */ }
  console.log(`DB ${host}  (${ENV_FILE})\n`);

  let gone = 0;
  let kept = 0;
  for (const id of IDS) {
    const [row] = await sql`select id, case_name from pricing_rules where id = ${id}`;
    if (!row) {
      console.log(`${id} — 없음(이미 지워졌거나 id 가 틀렸습니다)\n`);
      kept += 1;
      continue;
    }
    const refs = await sql`select id, project_id from contract_lines where pricing_rule_id = ${id}`;
    console.log(`${id}\n  ${row.case_name}\n  참조 라인 ${refs.length}건`
      + (refs.length ? ` → ${refs.map((r) => `${r.project_id}/${r.id}`).join(', ')}` : ''));
    if (refs.length > 0) {
      console.log('  ✗ 참조가 있어 지우지 않습니다 — 지우면 그 현장의 지급액을 계산할 수 없습니다.'
        + ' 새로 못 붙게만 하려면 화면에서 중지하세요.\n');
      kept += 1;
      continue;
    }
    if (!WRITE) {
      console.log('  → 지울 수 있습니다 (--write 를 붙이면 실제로 지웁니다)\n');
      continue;
    }
    await sql`delete from pricing_rules where id = ${id}`;
    console.log('  ✓ 삭제\n');
    gone += 1;
  }

  await sql.end();
  console.log(WRITE ? `— 완료 —  삭제 ${gone}건 · 남김 ${kept}건` : '실제로 지우려면 --write 를 붙이세요.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

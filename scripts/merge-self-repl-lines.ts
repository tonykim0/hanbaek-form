/**
 * 교체유형으로 갈린 자체투자 라인을 한 줄로 합친다.
 *
 *   npx tsx scripts/merge-self-repl-lines.ts                                   무엇을 합칠지만 본다
 *   npx tsx scripts/merge-self-repl-lines.ts --env .env.prod-db                프로덕션 드라이런
 *   npx tsx scripts/merge-self-repl-lines.ts --env .env.prod-db --write        실제로 합친다
 *
 * ★왜 필요한가★ 나이스인프라·현대엔지니어링·플러그링크는 자체투자에서 제자리교체와
 * 신규위치의 단가가 같다 — 그런데 접수 화면이 운영사를 보지 않고 두 행을 펴서, 한 현장의
 * 대수가 두 라인으로 갈려 들어갔다(강원 강릉 일송아파트 11기 = 10대 + 1대, 한백 2026-08-26).
 * 화면은 고쳤고(SPLITS_SELF_REPL), 이미 갈려 들어간 데이터를 여기서 합친다.
 *
 * 합치는 규칙 — 같은 현장 · 같은 계약연수 · 같은 수전방식인 자체투자 라인끼리만 합친다.
 * 연수나 수전방식이 다르면 그것은 진짜로 갈린 라인이라 손대지 않는다. 남길 줄은
 * 「제자리교체」 라인이고(그것이 이 운영사들의 대표값이다), 대수를 더하고 나머지는 지운다.
 * 단가는 남는 줄의 것을 그대로 쓴다 — 금액이 같으니 합계가 바뀌지 않는다.
 *
 * 에버온·SK일렉링크는 대상이 아니다. 그 둘은 교체유형이 실제로 단가를 가른다.
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
// .env.prod-db 에는 DIRECT_URL 만 있다
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const WRITE = process.argv.includes('--write');
const INPLACE = '자체투자 (제자리교체)';
/** 교체유형이 단가를 가르지 않는 운영사 — 그들만 합친다 */
const CPOS = ['나이스인프라', '현대엔지니어링', '플러그링크'];

interface Row {
  id: string;
  projectId: string;
  projectName: string;
  cpo: string;
  termYears: number;
  qty: number;
  powerType: string | null;
  replType: string | null;
  pricingRuleId: string | null;
  caseName: string | null;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL/DIRECT_URL 이 없습니다 — ${ENV_FILE} 확인.`);
  console.log(`DB: ${new URL(url).host}  (${WRITE ? '★쓰기★' : '드라이런'})\n`);
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const rows = (await sql<Row[]>`
      select cl.id, cl.project_id as "projectId", p.name as "projectName", p.cpo,
             cl.term_years as "termYears", cl.qty, cl.power_type as "powerType",
             cl.repl_type as "replType", cl.pricing_rule_id as "pricingRuleId",
             pr.case_name as "caseName"
        from contract_lines cl
        join projects p on p.id = cl.project_id
        left join pricing_rules pr on pr.id = cl.pricing_rule_id
       where p.cpo = any(${CPOS}) and cl.repl_type like '자체투자%'
       order by p.name, cl.term_years, cl.power_type, cl.repl_type
    `);
    console.log(`자체투자 라인 ${rows.length}건 (${CPOS.join(' · ')})\n`);

    /* 같은 현장 · 같은 연수 · 같은 수전방식끼리만 묶는다 */
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const key = `${r.projectId}|${r.termYears}|${r.powerType ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }

    let merged = 0;
    for (const [, g] of groups) {
      if (g.length < 2) continue;
      const keep = g.find((r) => r.replType === INPLACE) ?? g[0];
      const drop = g.filter((r) => r.id !== keep.id);
      const total = g.reduce((n, r) => n + r.qty, 0);
      console.log(`${keep.projectName} (${keep.cpo}) — ${keep.termYears}년 · ${keep.powerType ?? '수전?'}`);
      for (const r of g) {
        console.log(`   ${r.id === keep.id ? '남김' : '지움'} ${r.qty}대  ${r.replType}  ${r.caseName ?? '단가 미지정'}`);
      }
      console.log(`   → ${total}대 한 줄 · ${INPLACE} · ${keep.caseName ?? '단가 미지정'}`);
      if (WRITE) {
        await sql.begin(async (tx) => {
          await tx`update contract_lines set qty = ${total}, repl_type = ${INPLACE} where id = ${keep.id}`;
          await tx`delete from contract_lines where id = any(${drop.map((r) => r.id)})`;
        });
        console.log('   ✓ 합쳤습니다');
      }
      merged += 1;
      console.log();
    }
    console.log(merged === 0 ? '합칠 것이 없습니다.' : `${merged}개 현장 ${WRITE ? '합쳤습니다' : '이 대상입니다 (--write 로 실행)'}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error('실패:', e); process.exit(1); });

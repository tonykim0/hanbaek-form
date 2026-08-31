/**
 * 필수 서류가 콘솔에 실제로 있는지 센다 — ★읽기만 한다.★
 *
 *   npx tsx scripts/check-intake-docs.ts [--env .env.prod-db] [--site 아뜨리움]
 *
 * ★왜 생겼나★ (한백 물음 2026-08-31 「속초아뜨리움 … 노션DB에서 파일을 제대로 못
 * 긁어온 듯?」)
 *
 * 서류가 「없다」는 판정은 현장 조건마다 다르다 — 기설치 증빙은 환경부 보조금에 내는
 * 것이라 자체투자에는 낼 곳이 없고(선택), 한전 요금 청구서는 모자분리에만 필수다.
 * 그래서 눈으로 칸을 세면 안 된다: 앱이 쓰는 `evaluateDocs` 를 그대로 불러
 * ★그 현장에서 필수인 칸★만 본다.
 *
 * 이 숫자는 지급과 이어진다 — 지급조건 서류(사전현장컨설팅 결과서 · 실사보고서)가
 * 비면 영업비 지급이 막힌다. 지급관리의 「보완 필요」가 왜 큰지는 여기서 답이 나온다.
 *
 * ★쓰지 않는다.★ --write 갈래가 없다.
 */
import { readFileSync } from 'fs';
import { loadEnvFile } from '../lib/env-file';

const args = process.argv.slice(2);
const argOf = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ENV_FILE = argOf('--env');
/** 이름에 이 말이 든 현장만 칸까지 다 찍는다 */
const SITE = argOf('--site');

if (ENV_FILE) readFileSync(ENV_FILE, 'utf8');
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

const REQ_LABEL: Record<string, string> = { m: '필수', o: '선택', c: '조건', x: '해당없음' };

async function main() {
  const { getRepository } = await import('../lib/data');
  const { buildDocContext, evaluateDocs } = await import('../lib/doc-rules');
  const repo = getRepository();
  const viewer = { role: 'admin' as const, org: null };

  try {
    console.log(`DB ${new URL(process.env.DATABASE_URL!).host} (${ENV_FILE ?? '.env.local'}) — 읽기만 합니다\n`);
  } catch { console.log('읽기만 합니다\n'); }

  const list = await repo.listProjects(viewer);
  const missByKind = new Map<string, string[]>();
  const labelOf = new Map<string, string>();
  let seen = 0;
  let allFilled = 0;

  for (const row of list) {
    const d = await repo.getProject((row as { id: string }).id, viewer);
    if (!d) continue;
    seen += 1;
    const specs = evaluateDocs(buildDocContext({
      cpo: d.project.cpo,
      contractParty: d.project.contractParty,
      bldgType: d.project.bldgType,
      projectPowerType: d.project.powerType,
      linePowerTypes: d.lines.map((l) => l.powerType),
      preInstall: d.project.preInstall,
      bizType: d.project.bizType,
    }));
    const byKind = new Map(d.documents.map((x) => [x.kind, x]));
    const hit = (k: string) => (byKind.get(k)?.files?.length ?? 0) > 0;

    if (SITE && d.project.name.includes(SITE)) {
      console.log(`■ ${d.project.name} [${d.project.id}] · ${d.project.bizType} · 기설치 ${d.project.preInstall}`);
      for (const l of d.lines) {
        console.log(`   라인 ${l.qty}대 ${l.termYears}년 · 수전 ${l.powerType ?? '-'} · 교체 ${l.replType ?? '-'} · 케이스 ${l.rule?.caseName ?? '★미지정★'}`);
      }
      for (const s of specs) {
        const doc = byKind.get(s.key);
        const n = doc?.files?.length ?? 0;
        const flag = s.req === 'm' && n === 0 ? '  ← ★필수인데 없음★' : '';
        console.log(`   ${(REQ_LABEL[s.req] ?? s.req).padEnd(5)} ${s.key.padEnd(11)} ${n}장 ${doc?.status ?? 'none'}  ${s.label}${flag}`);
      }
      console.log('');
    }

    const required = specs.filter((s) => s.req === 'm');
    if (required.every((s) => hit(s.key))) allFilled += 1;
    for (const s of required) {
      if (hit(s.key)) continue;
      labelOf.set(s.key, s.label);
      missByKind.set(s.key, [...(missByKind.get(s.key) ?? []), d.project.name]);
    }
  }

  console.log(`현장 ${seen}건 · 필수 서류가 다 찬 현장 ${allFilled}건\n`);
  console.log('필수인데 파일이 없는 칸:');
  for (const [kind, sites] of [...missByKind].sort((a, b) => b[1].length - a[1].length)) {
    const fee = kind === 'consult' || kind === 'survey' ? '  ← 영업비 지급조건' : '';
    console.log(`  ${kind.padEnd(11)} ${String(sites.length).padStart(3)}건  ${labelOf.get(kind) ?? ''}${fee}`);
    if (sites.length <= 6) for (const s of sites) console.log(`        ${s}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

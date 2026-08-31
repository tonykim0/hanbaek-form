/**
 * 지급관리 타일이 무엇으로 채워져 있는지 센다 — ★읽기만 한다.★
 *
 *   npx tsx scripts/check-payout-board.ts [--env .env.prod-db] [--site 반달마을]
 *
 * ★왜 생겼나★ (한백 지적 2026-08-31)
 * 「확정 완료에 왜 2건밖에 없냐, 지급완료된 게 많은데」 →
 * 「반달마을 푸르지오 시공비는 나가지도 않았어」.
 *
 * 「확정 완료」의 판정은 `!steps.open` 인데, 이것이 참이 되는 길이 둘이다:
 *   ① 나간 돈이 계획을 채웠다        — 본뜻
 *   ② ★계획액이 0 이하다★           — 한 푼도 안 나갔는데 「낼 것이 없다」
 * 화면은 둘을 같은 칸에 세운다. 어느 쪽이 몇 건인지는 세어 봐야 안다.
 *
 * 판정을 여기서 다시 적지 않는다 — 화면이 쓰는 `workOf`·`workGroupOf` 를 그대로
 * 불러야 숫자가 화면과 어긋나지 않는다.
 *
 * ★쓰지 않는다.★ --write 갈래가 없다.
 */
import { readFileSync } from 'fs';
import { loadEnvFile } from '../lib/env-file';

const args = process.argv.slice(2);
const argOf = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const ENV_FILE = argOf('--env');
/** 이름에 이 말이 든 현장은 줄마다 다 찍는다 */
const SITE = argOf('--site');

if (ENV_FILE) readFileSync(ENV_FILE, 'utf8');
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

async function main() {
  const { getRepository } = await import('../lib/data');
  const { workOf, workGroupOf } = await import('../lib/payout-board');

  try {
    console.log(`DB ${new URL(process.env.DATABASE_URL!).host} (${ENV_FILE ?? '.env.local'}) — 읽기만 합니다\n`);
  } catch { console.log(`DB (${ENV_FILE ?? '.env.local'}) — 읽기만 합니다\n`); }

  // 화면과 같은 읽기 — 한백의 눈으로 전 현장을 본다
  const viewer = { role: 'admin' as const, org: null };
  const { plans } = await getRepository().listPayoutOverview(viewer);
  const work = plans.map(workOf);

  const won = (n: number) => n.toLocaleString('ko-KR');
  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].length * 1));

  for (const kind of ['영업비', '시공비'] as const) {
    const rows = work.filter((p) => p.kind === kind);
    console.log(`── ${kind} ${rows.length}줄 ──────────────────────────────`);

    const byGroup = new Map<string, number>();
    for (const p of rows) byGroup.set(workGroupOf(p), (byGroup.get(workGroupOf(p)) ?? 0) + 1);
    for (const [g, n] of byGroup) console.log(`  ${pad(g, 10)} ${String(n).padStart(4)}건`);

    // ① 확정 완료가 무엇으로 채워졌나 — 다 나간 것인가, 계획이 0인 것인가
    const done = rows.filter((p) => p.state === '확정 완료');
    const zero = done.filter((p) => p.due <= 0);
    const paidUp = done.filter((p) => p.due > 0);
    console.log(`\n  확정 완료 ${done.length}건 =`);
    console.log(`    다 나감(계획>0)     ${paidUp.length}건 · 계획 ${won(paidUp.reduce((n, p) => n + p.due, 0))} · 나감 ${won(paidUp.reduce((n, p) => n + p.confirmed, 0))}`);
    console.log(`    ★계획액 0 이하★    ${zero.length}건 · 나감 ${won(zero.reduce((n, p) => n + p.confirmed, 0))}`);
    for (const p of zero.slice(0, 12)) {
      console.log(`        ${pad(p.projectName, 34)} 계획 ${won(p.plan)} 조정 ${won(p.adjust)} 나감 ${won(p.confirmed)}`);
    }

    // ② 돈이 이미 나간 줄은 어디에 있나 — 타일에 그 칸이 없다
    const started = rows.filter((p) => p.confirmed > 0);
    const startedBy = new Map<string, number>();
    for (const p of started) startedBy.set(workGroupOf(p), (startedBy.get(workGroupOf(p)) ?? 0) + 1);
    console.log(`\n  이미 돈이 나간 줄 ${started.length}건이 선 칸:`);
    for (const [g, n] of startedBy) console.log(`    ${pad(g, 10)} ${String(n).padStart(4)}건`);

    // ③ 무엇이 막고 있나 — 사유별(한 줄이 여럿에 걸릴 수 있다)
    const reason = new Map<string, number>();
    for (const p of rows) {
      for (const b of p.blockers) {
        const key = b.startsWith('지급조건 서류 미달') ? '지급조건 서류 미달'
          : b.startsWith('단가 미지정') ? '단가 미지정'
            : b;
        reason.set(key, (reason.get(key) ?? 0) + 1);
      }
    }
    console.log(`\n  막는 사유 (한 줄이 여럿에 걸린다):`);
    for (const [r, n] of [...reason].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${pad(r, 22)} ${String(n).padStart(4)}건`);
    }

    // ④ 단가 미지정인데 돈은 다 나간 줄 — 판정이 단가에서 먼저 끊겨 확정 완료가 못 된다
    const paidButUnpriced = rows.filter((p) => p.unpriced > 0 && p.confirmed > 0);
    console.log(`\n  ★단가 미지정인데 돈이 나간 줄★ ${paidButUnpriced.length}건 · 나감 ${won(paidButUnpriced.reduce((n, p) => n + p.confirmed, 0))}`);
    console.log('');
  }

  if (SITE) {
    console.log(`── 「${SITE}」 ──────────────────────────────`);
    for (const p of work.filter((x) => x.projectName.includes(SITE))) {
      console.log(`  ${p.kind}  ${p.projectName}`);
      console.log(`    지급처 ${p.org ?? '(없음)'} · 단가미지정 ${p.unpriced}건`);
      console.log(`    계획 ${won(p.plan)} + 조정 ${won(p.adjust)} = 낼 돈 ${won(p.due)} · 나간 돈 ${won(p.confirmed)}`);
      console.log(`    회차 [${won(p.step1Amount)} ${p.step1Done ? '완' : '미'}] [${won(p.step2Amount)} ${p.step2Done ? '완' : '미'}] · 열린 회차 ${p.open ? `${p.open.no}차 ${won(p.open.amount)}` : '없음'}`);
      console.log(`    상태 ${p.state} → 타일 ${workGroupOf(p)}${p.blockers.length ? ` · 막는 것: ${p.blockers.join(' / ')}` : ''}`);
    }
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

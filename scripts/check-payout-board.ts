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
  const { isPayoutSubject, workOf, workGroupOf } = await import('../lib/payout-board');

  try {
    console.log(`DB ${new URL(process.env.DATABASE_URL!).host} (${ENV_FILE ?? '.env.local'}) — 읽기만 합니다\n`);
  } catch { console.log(`DB (${ENV_FILE ?? '.env.local'}) — 읽기만 합니다\n`); }

  // 화면과 같은 읽기 — 한백의 눈으로 전 현장을 본다
  const viewer = { role: 'admin' as const, org: null };
  const { plans } = await getRepository().listPayoutOverview(viewer);
  const all = plans.map(workOf);
  // 화면과 같은 것을 세야 한다 — 보드는 지급 대상이 아닌 줄을 빼고 그린다
  const work = all.filter(isPayoutSubject);
  const dropped = all.filter((p) => !isPayoutSubject(p));

  const won = (n: number) => n.toLocaleString('ko-KR');
  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].length * 1));

  console.log(`지급 대상 ${work.length}줄 (계획도 0, 나간 돈도 0이라 뺀 줄 ${dropped.length}건${dropped.length ? ': ' + dropped.map((p) => `${p.projectName} ${p.kind}`).join(', ') : ''})\n`);

  for (const kind of ['영업비', '시공비'] as const) {
    const rows = work.filter((p) => p.kind === kind);
    console.log(`── ${kind} ${rows.length}줄 ──────────────────────────────`);

    const byGroup = new Map<string, number>();
    for (const p of rows) byGroup.set(workGroupOf(p), (byGroup.get(workGroupOf(p)) ?? 0) + 1);
    for (const [g, n] of byGroup) console.log(`  ${pad(g, 10)} ${String(n).padStart(4)}건`);

    // ① 확정 완료가 무엇으로 채워졌나 — 다 나간 것인가, 계획이 0인 것인가
    const done = rows.filter((p) => p.state === '지급 완료');
    const zero = done.filter((p) => p.due <= 0);
    const paidUp = done.filter((p) => p.due > 0);
    console.log(`\n  지급 완료 ${done.length}건 =`);
    console.log(`    다 나감(계획>0)     ${paidUp.length}건 · 계획 ${won(paidUp.reduce((n, p) => n + p.due, 0))} · 나감 ${won(paidUp.reduce((n, p) => n + p.confirmed, 0))}`);
    console.log(`    ★계획액 0 이하★    ${zero.length}건 · 나감 ${won(zero.reduce((n, p) => n + p.confirmed, 0))}`);
    for (const p of zero.slice(0, 12)) {
      console.log(`        ${pad(p.projectName, 34)} 계획 ${won(p.plan)} 조정 ${won(p.adjust)} 나감 ${won(p.confirmed)}`);
    }

    /*
     * ①-2 ★「완」이 원장에 근거가 있나★ (한백 지적 2026-08-31 「2차 나간 현장 아직 없어」).
     * 회차 완료는 금액 누적으로 재므로, 앞 회차에 계획보다 많이 나가면 뒤 회차가 저절로
     * 채워진다 — 원장에 2차 줄이 없는데 「완」이 된다(초과 충당).
     */
    const step2Ledger = rows.filter((p) => p.step2EntryId !== null || p.step2At !== null);
    const step2Covered = rows.filter((p) => p.step2Done && p.step2EntryId === null && p.step2At === null);
    const over = rows.filter((p) => p.confirmed > p.due && p.due > 0);
    console.log(`\n  2차가 원장에 실제로 있는 줄   ${step2Ledger.length}건`);
    console.log(`  ★2차가 초과분으로 덮인 줄★    ${step2Covered.length}건`);
    for (const p of step2Covered.slice(0, 10)) {
      console.log(`      ${pad(p.projectName, 34)} 계획 ${won(p.due)} · 나감 ${won(p.confirmed)} · 초과 ${won(p.confirmed - p.due)}`);
    }
    console.log(`  ★계획보다 더 나간 줄★        ${over.length}건 · 초과 합 ${won(over.reduce((n, p) => n + p.confirmed - p.due, 0))}`);

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

  /*
   * ★「지급조건 서류 미달」이 새 현장에서도 걸리는가★
   *
   * 두 서류(사전현장컨설팅 결과서 · 실사보고서)는 계약 접수의 ★필수★ 서류다
   * (doc-rules 의 req 'm'). 필수 서류가 비면 접수 자체가 안 된다. 그러면 콘솔로 접수한
   * 현장에서는 이 검사가 구조적으로 안 걸리고, 노션에서 이관한 현장(mgmt_no 가 있다)
   * 에서만 걸린다는 말이 된다 — 그렇다면 이 사유는 「보완 필요」가 아니라 이관 흔적이다.
   * 짐작으로 두지 않고 센다.
   */
  const { getDb } = await import('../lib/db/client');
  const { sql } = await import('drizzle-orm');
  const mgmt = new Map<string, string | null>();
  for (const r of (await getDb().execute(sql`select id, mgmt_no from projects`)) as unknown as
    Array<{ id: string; mgmt_no: string | null }>) mgmt.set(r.id, r.mgmt_no);

  const feeBlocked = work.filter((p) => p.blockers.some((b) => b.startsWith('지급조건 서류 미달')));
  const migrated = feeBlocked.filter((p) => mgmt.get(p.projectId));
  console.log(`── 「지급조건 서류 미달」 ${feeBlocked.length}건의 출신 ────────────`);
  console.log(`  이관 현장(mgmt_no 있음)  ${migrated.length}건`);
  console.log(`  콘솔 접수 현장           ${feeBlocked.length - migrated.length}건`);
  for (const p of feeBlocked.filter((x) => !mgmt.get(x.projectId)).slice(0, 10)) {
    console.log(`      ${p.projectName} · ${p.blockers.join(' / ')}`);
  }
  console.log('');

  /*
   * ★「이관 현장은 서류를 안 물으면 된다」는 갈래는 두지 않는다★ (한백 정정 2026-08-31).
   * 지급조건은 두 장이 아니라 ★모든 필수 서류★이고, 이미 지급완료된 부분(노션 시절)에만
   * 해당사항이 없다. 검사를 좁히는 시뮬레이션은 전제가 틀려서 걷어냈다.
   */

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

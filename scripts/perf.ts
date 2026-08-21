/**
 * 주요 조회의 응답 시간을 잰다 — 회귀를 숫자로 잡는다.
 *
 *   npm run perf
 *
 * ★왜 스크립트인가★
 * 2026-08-21 에 콘솔이 멈췄는데 사용자 제보로 알았다(「로딩바만 돌아가네」). 원인은
 * 저장소가 커넥션 풀보다 많은 쿼리를 던져 큐가 풀리지 않은 것이었고, 고친 뒤에도
 * 「다시 느려졌는지」를 물어볼 곳이 없었다. 그래서 재는 것을 코드로 남긴다.
 *
 * 임계를 넘으면 실패한다 — 통과/실패가 있어야 회귀를 알아챈다. 임계는 넉넉하게 잡는다
 * (지금 5건 기준 100ms 안쪽인 조회에 1초). 잡으려는 것은 「조금 느려짐」이 아니라
 * 「고착·N+1 같은 자릿수가 다른 회귀」다.
 */
import { loadEnvFile } from '../lib/env-file';

loadEnvFile();

import { getRepository } from '../lib/data';
import type { Viewer } from '../lib/auth/types';

/** 넘으면 실패 — 자릿수가 다른 회귀만 잡는다 */
const LIMIT_MS = 1000;
/** 한 조회를 몇 번 부르는가 — 두 번째부터 막히는 고착이 있었다(실사고) */
const ROUNDS = 3;

interface Case {
  name: string;
  run: (viewer: Viewer) => Promise<unknown>;
  /** 이 조회를 누가 부르는가 — 화면 이름을 적는다 */
  where: string;
}

const CASES: Case[] = [
  {
    name: 'listProjects',
    where: '계약·시공 보드 · 할 일(/api/todos)',
    run: (v) => getRepository().listProjects(v),
  },
  {
    name: 'listPayoutOverview',
    where: '협력사 지급관리(/payouts)',
    run: (v) => getRepository().listPayoutOverview(v),
  },
  {
    name: 'listSettlements',
    where: '운영사 기성관리(/receivables)',
    run: (v) => getRepository().listSettlements(v),
  },
  {
    name: 'listPayouts',
    where: '지급 내역(/payments)',
    run: (v) => getRepository().listPayouts(v),
  },
];

async function main() {
  const admin: Viewer = { role: 'admin', org: null };
  const projects = await getRepository().listProjects(admin);
  const target = projects.find((p) => p.salesOrg || p.gcOrg);
  const partner: Viewer | null = target
    ? { role: 'cons', org: (target.gcOrg ?? target.salesOrg)! }
    : null;

  console.log(`현장 ${projects.length}건 기준 · 임계 ${LIMIT_MS}ms · ${ROUNDS}회 반복\n`);

  const failed: string[] = [];

  for (const c of CASES) {
    for (const [label, viewer] of [
      ['한백', admin],
      ['협력사', partner],
    ] as const) {
      if (!viewer) continue;
      const times: number[] = [];
      for (let i = 0; i < ROUNDS; i++) {
        const started = Date.now();
        await c.run(viewer);
        times.push(Date.now() - started);
      }
      const worst = Math.max(...times);
      const mark = worst > LIMIT_MS ? '실패' : 'OK  ';
      console.log(
        `${mark} ${c.name} (${label}) — ${times.map((t) => `${t}ms`).join(' · ')}  ← ${c.where}`
      );
      if (worst > LIMIT_MS) {
        failed.push(`${c.name} (${label}) 최악 ${worst}ms > ${LIMIT_MS}ms`);
      }
    }
  }

  // 상세 한 건 — 화면 하나가 가장 무겁게 읽는 자리
  if (projects[0]) {
    const started = Date.now();
    await getRepository().getProject(projects[0].id, admin);
    const took = Date.now() - started;
    console.log(`${took > LIMIT_MS ? '실패' : 'OK  '} getProject — ${took}ms  ← 현장 상세`);
    if (took > LIMIT_MS) failed.push(`getProject ${took}ms > ${LIMIT_MS}ms`);
  }

  /*
   * 동시 호출 — 고착은 여기서 드러난다. 한 화면이 여러 조회를 겹쳐 부르는 상황이고,
   * 풀보다 많은 쿼리가 몰리면 예전에는 여기서 영구히 멈췄다.
   */
  const started = Date.now();
  await Promise.all(CASES.map((c) => c.run(admin)));
  const together = Date.now() - started;
  console.log(`${together > LIMIT_MS * 2 ? '실패' : 'OK  '} 네 조회 동시 — ${together}ms  ← 고착 감지`);
  if (together > LIMIT_MS * 2) failed.push(`동시 호출 ${together}ms`);

  if (failed.length > 0) {
    console.error(`\n실패 ${failed.length}건:`);
    for (const f of failed) console.error(`  - ${f}`);
    console.error('\n자릿수가 다른 느려짐이다 — 동시 쿼리 수(lib/data/db-slot)와 N+1 을 먼저 본다.');
    process.exit(1);
  }
  console.log('\n전부 통과');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});

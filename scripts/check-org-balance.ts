/**
 * 한 협력사가 앞으로 받을 잔액 — ★읽기만 한다★.
 *
 *   npx tsx scripts/check-org-balance.ts --env .env.prod-db --org 엘앤에스
 *
 * 회수를 다른 현장 잔금에서 차감하기로 할 때(한백 지시 2026-09-04), 뺄 자리가 어디
 * 있는지 먼저 본다 — 반달마을푸르지오 초과 지급 28.5만을 시공비 잔금에서 빼기로 한
 * 것과 같은 방식이다. 계획(단가 × 대수)에서 이미 나간 것과 조정을 뺀 것이 잔액이다.
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

const orgAt = process.argv.indexOf('--org');
const ORG = orgAt >= 0 ? process.argv[orgAt + 1] : null;
if (!ORG) throw new Error('--org 뒤에 협력사 이름이 필요합니다.');

import { pgRepository } from '../lib/data/pg-store';
import { payoutsOfDetail, workOf } from '../lib/payout-board';
import type { Viewer } from '../lib/auth/types';

const won = (n: number) => n.toLocaleString('ko-KR');
const HANBAEK: Viewer = { role: 'admin', org: null };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 찍는다 */ }
  console.log(`DB ${host}  (${ENV_FILE})\n협력사 「${ORG}」\n`);

  const all = await pgRepository.listProjects(HANBAEK);
  const mine = all.filter((p) => p.salesOrg === ORG || p.gcOrg === ORG);
  console.log(`참여 현장 ${mine.length}건\n`);

  let openTotal = 0;
  for (const s of mine) {
    const detail = await pgRepository.getProject(s.id, HANBAEK);
    if (!detail) continue;
    const rows = payoutsOfDetail(detail, { sales: true, cons: true, cost: true } as never)
      .filter((r) => r.org === ORG);
    for (const r of rows) {
      const w = workOf(r);
      const left = w.due - r.confirmed;
      const hold = detail.project.holdState ? ` [${detail.project.holdState}]` : '';
      if (left === 0 && r.confirmed === 0) continue;   // 계획도 지급도 없는 줄은 접는다
      console.log(
        `${detail.project.name}${hold}  ${r.kind}\n`
        + `   계획 ${won(w.due)} · 나감 ${won(r.confirmed)} → 남은 것 ${won(left)}  [${w.state}]`
        + (w.blockers.length ? `  ${w.blockers.join(' · ')}` : '')
      );
      if (left > 0 && !detail.project.holdState) openTotal += left;
    }
  }
  console.log(`\n★멈추지 않은 현장에서 앞으로 나갈 잔액 ${won(openTotal)}원★`);
  process.exit(0);
}

void main();

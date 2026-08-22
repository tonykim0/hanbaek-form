/**
 * 나이스인프라 26년 하반기 정책 반영 — 개발 DB 용 실행기.
 *
 *   npx tsx scripts/apply-nice-h2-pricing.ts            무엇이 들어갈지만 보여준다
 *   npx tsx scripts/apply-nice-h2-pricing.ts --write    실제로 넣는다
 *   npx tsx scripts/apply-nice-h2-pricing.ts --env .env.prod-db [--write]
 *
 * ★케이스 정의는 여기 없다.★ `lib/pricing-policy-nice-h2.ts` 한 벌이고, 정책 표를 어떻게
 * 옮겼는지의 근거도 그 파일에 있다. 이 스크립트는 그것을 개발 DB 에 돌려 보는 껍데기다 —
 * 프로덕션은 화면의 단추(`/api/pricing/apply-policy`)로 넣는다. 접속 문자열이 Vercel 에서
 * Sensitive 라 로컬에서 프로덕션 DB 에 붙을 길이 없다.
 *
 * ★어느 DB 인가★ 기본은 `.env.local`(개발)이고 `--env <파일>` 로 바꾼다. 접속 문자열을
 * 명령줄에 적지 않는다 — 셸 히스토리에 남는다. `.env.local` 을 바꿔치기하는 것도 되돌리는
 * 것을 잊으면 다음 작업이 딴 DB 를 친다. 어느 DB 에 붙었는지 첫 줄에 호스트로 찍어준다.
 *
 * ★이름을 `.env.production.local` 로 두지 않는다.★ Next 가 프로덕션 모드에서 그 파일을
 * 자동으로 읽는다 — 로컬에서 `npm run build && npm start` 하는 순간 로컬 서버가 조용히
 * 프로덕션 DB 에 붙고, 화면으로는 구별이 안 된다. Next 가 안 읽는 이름을 쓴다(`.env.prod-db`).
 */
import { existsSync } from 'fs';
import { loadEnvFile } from '../lib/env-file';

/*
 * 환경 파일을 먼저 얹는다 — 아래 저장소 모듈이 불릴 때 이미 DATABASE_URL 이 있어야 한다.
 * 없는 파일을 조용히 넘기면(loadEnvFile 의 기본 동작) 오타 하나로 딴 DB 를 치게 되므로
 * 여기서 막는다.
 */
const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '.env.local';
if (!ENV_FILE || ENV_FILE.startsWith('--')) {
  throw new Error('--env 뒤에 파일 이름이 없습니다 (예: --env .env.prod-db).');
}
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);

import { pgRepository } from '../lib/data/pg-store';
import { applyNiceH2 } from '../lib/pricing-policy-nice-h2';
import { stepUnits } from '../lib/settlement';
import type { Actor } from '../lib/auth/types';

const WRITE = process.argv.includes('--write');
const ACTOR: Actor = { id: 'script', name: '나이스 하반기 정책 반영', role: 'admin', org: null };

const won = (n: number) => n.toLocaleString('ko-KR');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  /* 비밀은 안 찍는다 — 호스트만. 어느 DB 를 치는지 모르고 --write 하는 일이 없게 */
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 파싱 못 하면 호스트를 비워 둔다 */ }
  console.log(`DB ${host}  (${ENV_FILE})\n`);

  const report = await applyNiceH2(pgRepository, ACTOR, { write: WRITE });

  for (const s of report.steps) {
    const receive = s.rule.salesUnit + s.rule.consUnit + s.rule.margin;
    const amounts = stepUnits(s.rule.settlementSteps, receive);
    console.log(s.rule.caseName);
    console.log(
      `  받는 단가 ${won(receive)}  =  영업비 ${won(s.rule.salesUnit)}` +
      ` + 시공비 ${won(s.rule.consUnit)} + 마진 ${won(s.rule.margin)}`
    );
    console.log(`  기성  착공 ${won(amounts[0])} → 준공마감 잔액 ${won(amounts[1])}`);
    console.log(`  ${s.action}${s.id ? ` ${s.id}` : ''}${s.message ? ` — ${s.message}` : ''}\n`);
  }

  if (!WRITE) {
    const todo = report.steps.filter((s) => s.action !== '지나감').length;
    console.log(`— 미리보기 —  손댈 것 ${todo}건 · 지나갈 것 ${report.skipped}건`);
    console.log('실제로 넣으려면 --write 를 붙이세요.');
    return;
  }
  console.log(
    `— 완료 —  추가 ${report.added}건 · 수정 ${report.fixed}건` +
    ` · 지나감 ${report.skipped}건 · 실패 ${report.failed}건`
  );
  if (report.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

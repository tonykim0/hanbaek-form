/**
 * 마이그레이션 러너 — migrations/ 의 SQL 파일을 순서대로, 아직 안 적용된 것만 적용한다.
 *
 *   npm run db:migrate            지금 연결된 DB(.env.local = 개발)에 적용
 *   npm run build                 빌드가 먼저 이것을 돌린다 — Vercel 프로덕션 빌드에서는
 *                                 프로덕션 DB 에 적용된 뒤에 새 코드가 나간다
 *
 * ★왜 빌드에서 도는가★
 * 프로덕션 DATABASE_URL 은 Vercel 에서 Sensitive 라 사람도 도구도 값을 되읽을 수 없다 —
 * 밖에서는 프로덕션 DB 에 붙을 길이 없다(CLAUDE.md). 그동안 스키마·데이터 변경을
 * Supabase SQL Editor 에 사람이 붙여넣어 왔는데, 코드와 DB 가 두 손으로 나뉘니 순서가
 * 어긋난다 — 컬럼 없이 코드가 먼저 나가 콘솔 전체가 500 으로 죽었다(2026-08-22 실사고,
 * pricing_rules 정책 칸 6개). 빌드는 접속 문자열이 있는 곳이고, 새 코드가 트래픽을 받기
 * 전이다 — 여기서 적용하면 「코드는 나갔는데 컬럼이 없다」가 구조적으로 안 생긴다.
 *
 * ★마이그레이션 파일 규칙★ (migrations/*.sql, 파일명 순서대로)
 *  - ★멱등하게 쓴다★ — add column IF NOT EXISTS, update ... where 처럼 두 번 돌아도
 *    같은 결과여야 한다. 원장(db_migrations)이 이중 실행을 막지만, 이미 손으로 반영된
 *    DB(프로덕션에 SQL Editor 로 넣었던 것)에 처음 돌 때는 원장이 비어 있어 전부 다시
 *    돈다 — 멱등이 아니면 그 첫 실행이 사고다.
 *  - ★한 번 적용된 파일은 고치지 않는다★ — 고쳐도 원장에 있으면 다시 안 돈다. 새 파일로.
 *  - begin/commit 을 적지 않는다 — 러너가 파일마다 트랜잭션을 건다.
 *  - 실패하면 빌드가 중단되고 구버전이 계속 돈다 — 조용히 넘어가는 것보다 낫다.
 *
 * 동시 실행(빌드 두 개가 겹치는 경우)은 advisory lock 이 줄 세운다.
 */
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import postgres from 'postgres';
import { loadEnvFile } from '../lib/env-file';

loadEnvFile();

async function main() {
  /*
   * Vercel 의 preview·development 빌드는 건너뛴다 — 그 빌드에 DATABASE_URL 이 있다면
   * 프로덕션 것일 텐데, 검토용 빌드가 프로덕션 DB 를 바꾸면 안 된다.
   */
  if (process.env.VERCEL && process.env.VERCEL_ENV !== 'production') {
    console.log(`[migrate] ${process.env.VERCEL_ENV} 빌드 — 마이그레이션을 건너뜁니다`);
    return;
  }

  const url = process.env.DATABASE_URL;
  // 조용히 건너뛰지 않는다 — 「적용됐겠지」가 코드-컬럼 어긋남 사고의 시작이다
  if (!url) throw new Error('DATABASE_URL 이 없습니다 — 마이그레이션을 적용할 DB 를 모릅니다.');

  const dir = path.join(process.cwd(), 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  const sql = postgres(url, {
    max: 1,
    prepare: false,
    /*
     * NOTICE 는 삼킨다 — 멱등 SQL(IF NOT EXISTS)은 「이미 있음」 NOTICE 를 정상 경로로
     * 내는데, 기본 동작은 그 객체를 통째로 콘솔에 찍어 실패처럼 보인다. WARNING 이상만 남긴다.
     */
    onnotice: (n) => {
      if (n.severity !== 'NOTICE') console.warn(`[migrate] ${n.severity}: ${n.message}`);
    },
  });
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트 표시용일 뿐이다 */ }
  console.log(`[migrate] DB ${host} · 파일 ${files.length}개`);

  try {
    await sql`create table if not exists db_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )`;

    const done = new Set((await sql`select id from db_migrations`).map((r) => r.id as string));
    let applied = 0;

    for (const f of files) {
      if (done.has(f)) continue;
      const body = readFileSync(path.join(dir, f), 'utf8');
      await sql.begin(async (tx) => {
        /*
         * ★세션 락(pg_advisory_lock)이 아니라 트랜잭션 락이다.★ 접속이 Transaction
         * pooler(6543)라 트랜잭션 밖 문장은 문장마다 다른 서버 백엔드로 갈 수 있다 —
         * 세션 락을 잡으면 남의 백엔드에 락이 남아 안 풀리고, 다음 실행이 그 락을
         * 기다리다 statement timeout 으로 죽는다(2026-08-23 실제로 그랬다).
         * 트랜잭션 락은 커밋·롤백과 함께 반드시 풀리고, 트랜잭션은 한 백엔드에 붙는다.
         *
         * 락을 잡은 뒤 원장을 다시 본다 — 빌드 두 개가 겹치면 늦은 쪽이 여기서 걸러진다.
         *
         * 키가 48590823 인 이유: 첫 배포가 세션 락(48590822)을 잡은 채 끝나 그 키에
         * 유령 락이 남았을 수 있다 — 프로덕션은 밖에서 정리할 수 없으니 키를 옮겨 피한다.
         * 유령 락은 아무도 그 키를 안 기다리면 무해하고, 백엔드가 재활용되며 사라진다.
         */
        await tx`select pg_advisory_xact_lock(48590823)`;
        const [again] = await tx`select 1 from db_migrations where id = ${f}`;
        if (again) return;
        await tx.unsafe(body);
        await tx`insert into db_migrations (id) values (${f})`;
        console.log(`  ✓ ${f}`);
        applied += 1;
      });
    }
    console.log(`[migrate] 적용 ${applied}건 · 이미 적용 ${files.length - applied}건`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error('[migrate] 실패 — 빌드를 중단합니다:', e);
  process.exit(1);
});

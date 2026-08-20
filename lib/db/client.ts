/**
 * Postgres 연결.
 *
 * ★Supabase Transaction pooler(6543) 는 prepared statement 를 지원하지 않는다.★
 * prepare: false 를 빼면 쿼리가 풀러를 통과하는 순간 터진다.
 *
 * 연결은 첫 쿼리까지 늦춘다(lazy). 모듈 로드 때 연결하면 DATABASE_URL 이 없는 환경에서는
 * 이 파일을 import 하는 것만으로 앱 전체가 죽는다 — 파일 저장소로 돌아갈 길이 막힌다.
 *
 * 서버리스에서는 인스턴스가 재사용되므로 커넥션을 캐싱해 요청마다 새로 만들지 않는다.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __hbSql: ReturnType<typeof postgres> | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 이 없습니다 (.env.local 확인)');

  /*
   * 서버리스에서 5432(Session pooler·직접 연결)로 붙으면 인스턴스마다 커넥션을 세션 내내
   * 물고 있어서 Supabase 의 pool_size 15 를 금방 넘긴다. 그러면 화면이 통째로 500 이 되고
   * 로그에는 (EMAXCONNSESSION) max clients reached in session mode 만 남는다 —
   * 주소 하나 잘못 넣은 것이 코드 오류처럼 보인다. 그래서 여기서 먼저 말해준다.
   */
  if (process.env.NODE_ENV === 'production' && /:5432(\/|\?|$)/.test(url)) {
    console.error(
      '[db] DATABASE_URL 이 5432 입니다. 서버리스에서는 Transaction pooler(6543)를 써야 합니다 — '
        + 'Supabase 대시보드 → Connect → Transaction pooler.'
    );
  }

  const sql =
    global.__hbSql ??
    postgres(url, {
      prepare: false,      // ← Transaction pooler 필수
      max: 5,              // 서버리스 인스턴스당 커넥션을 적게
      idle_timeout: 20,
      // 붙지 못하는 커넥션이 무한정 매달리지 않게 한다.
      // 이게 없으면 풀이 막혔을 때 요청이 몇 분씩 멈춘 뒤에야 실패한다.
      connect_timeout: 10,
    });
  // 개발 중 핫리로드로 모듈이 다시 평가될 때 커넥션이 쌓이는 것을 막는다
  if (process.env.NODE_ENV !== 'production') global.__hbSql = sql;
  return drizzle(sql, { schema });
}

let cached: ReturnType<typeof create> | null = null;

export function getDb(): ReturnType<typeof create> {
  if (!cached) cached = create();
  return cached;
}

/** Postgres 저장소를 쓸 수 있는 환경인가 */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };

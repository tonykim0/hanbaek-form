import type { Config } from 'drizzle-kit';
import { loadEnvFile } from './lib/env-file';

/**
 * 마이그레이션은 Transaction pooler(6543)로 못 돌린다 — DDL 에 prepared statement 가 쓰인다.
 * 그래서 DIRECT_URL(5432, Session pooler 또는 직접 연결)을 따로 받는다.
 */
loadEnvFile();

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DIRECT_URL 또는 DATABASE_URL 이 없습니다. .env.local 에 Supabase 접속 문자열을 넣어주세요.\n' +
      '  Supabase 대시보드 → Connect → Session pooler(5432) 문자열을 DIRECT_URL 로,\n' +
      '                              Transaction pooler(6543) 문자열을 DATABASE_URL 로'
  );
}

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
} satisfies Config;

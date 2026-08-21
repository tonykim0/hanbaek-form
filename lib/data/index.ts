/**
 * 저장소 — Postgres 한 벌이다.
 *
 * 예전에는 DATABASE_URL 이 없으면 파일 저장소(.data/projects.json)로 돌았다. 로컬에서 DB
 * 없이 화면을 보기 위한 다리였는데, 저장소 메서드 34개를 두 벌로 적는 값을 치렀다 —
 * 권한·검증 판정이 두 곳에 있으면 언젠가 갈리고, 파일 쪽 주석은 「pg-store 와 같은 판정」을
 * 반복해 적고 있었다. 개발 DB 가 분리돼(2026-08-22) 로컬도 진짜 Postgres 를 보므로
 * 그 다리를 걷어냈다.
 *
 * 화면·검증·정산 로직은 구현을 모른다 — ProjectRepository 만 본다.
 */
import type { ProjectRepository } from './repository';
import { hasDatabase } from '@/lib/db/client';
import { pgRepository } from './pg-store';

export function getRepository(): ProjectRepository {
  /*
   * 접속 문자열이 없으면 화면이 빈 목록으로 조용히 도는 것보다 여기서 멈추는 것이 낫다 —
   * 「데이터가 없다」와 「DB 를 못 본다」는 다른 일이고, 조용히 비면 원인을 찾을 수 없다.
   */
  if (!hasDatabase()) {
    throw new Error(
      'DATABASE_URL 이 없습니다 — .env.local 에 개발 DB 접속 문자열을 넣어주세요 (CLAUDE.md 참조).'
    );
  }
  return pgRepository;
}

export type { ProjectRepository } from './repository';

/**
 * 저장소 구현 선택 지점.
 *
 * DATABASE_URL 이 있으면 Postgres, 없으면 파일(.data/projects.json).
 * 환경변수 하나로 갈리므로 로컬에서 DB 없이도 화면이 돌고, 배포에서는 자동으로 DB 를 쓴다.
 *
 * 화면·검증·정산 로직은 이 선택을 모른다 — ProjectRepository 만 본다.
 */
import type { ProjectRepository } from './repository';
import { hasDatabase } from '@/lib/db/client';
import { fileRepository } from './file-store';
import { pgRepository } from './pg-store';

export function getRepository(): ProjectRepository {
  return hasDatabase() ? pgRepository : fileRepository;
}

/** 지금 무엇을 쓰고 있는가 — 화면 하단 표시·로그용 */
export function repositoryKind(): 'postgres' | 'file' {
  return hasDatabase() ? 'postgres' : 'file';
}

export type { ProjectRepository } from './repository';

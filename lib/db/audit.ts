/**
 * 누가 무엇을 바꿨는지 남긴다.
 *
 * 협력사가 직접 입력하는 시스템이라 이 기록이 필요하다. 노션에는 이 자리가 없었다 —
 * 이 앱이 새로 세우는 축이다.
 *
 * ★현장 밖의 변경도 여기 온다.★ projectId 가 null 이면 현장에 딸리지 않은 변경이다 —
 * 계정 구분·소속처럼 「그 사람이 무엇을 보는지」를 정하는 값이 그렇다. 그것도 남겨야 한다.
 */
import { auditLog } from './schema';
import { getDb } from './client';
import type { Actor } from '../auth/types';

/** 트랜잭션 안이든 밖이든 받는다 — 현장 쓰기는 tx 안에서, 계정 쓰기는 그냥 부른다 */
type Writer = Pick<ReturnType<typeof getDb>, 'insert'>;

export interface AuditEntry {
  projectId: string | null;
  actor: Actor;
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

export async function writeAudit(tx: Writer, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    id: crypto.randomUUID(),
    projectId: entry.projectId,
    // 이름만으로는 동명이인을 가릴 수 없어 로그인 ID 를 함께 남긴다
    actor: `${entry.actor.name}(${entry.actor.id})`,
    action: entry.action,
    field: entry.field ?? null,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
  });
}

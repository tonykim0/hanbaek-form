/**
 * 계약 — 접수 선언 · 확인 · 보완요청 · 기설치 조사.
 *
 * `pg-store.ts` 에서 떼어 왔다(doc/REFACTOR_PLAN_3.md 2-1). 인터페이스는 그대로고
 * 부르는 쪽도 그대로다 — pgRepository 가 이 객체를 펼쳐 담는다.
 *
 * ★단추가 저장하는 것은 「사람이 한 일」이고 칸은 그것에서 유도된다★ — 협력사가
 * 「계약서 접수하기」(contract_submitted_at), 한백이 「계약 확인 완료」(contract_confirmed_at),
 * 서류를 반려하면 보완(contract_fix_asked_at). 칸 이름을 저장하는 자리는 없다(lib/board.ts).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { documents, processes, projects } from '@/lib/db/schema';
import { today } from '@/lib/date';
import { canAccessProject, canWrite } from '@/lib/roles';
import { needsPreInstallCheck } from '@/lib/doc-rules';
import { asProcessStatus, COURT_AFTER_STATUS, statusIndex } from '@/lib/process';
import { contractStateFor, missingRequiredDocs } from '../assemble';
import type { PreInstall, Project } from '@/types/project';
import type { Actor, ProjectRepository } from '../repository';
import { assertAdmin, recordsOf } from './shared';
import type { TxLike } from './shared';

/** pgRepository 가 펼쳐 담는 조각 — 이름과 시그니처는 인터페이스가 정한다 */
export const contractStore: Pick<
  ProjectRepository,
  'submitContract' | 'confirmContract' | 'askMissingDocs' | 'setPreInstall'
> = {
  async submitContract(projectId, submitted, actor): Promise<void> {
    // 열람 전용은 무엇도 바꾸지 않는다 — 라우트 껍데기가 이미 막지만 여기서 한 번 더
    if (!canWrite(actor.role)) throw new Error('계약서 접수는 열람 전용이 할 수 없습니다.');

    const rows = await getDb().select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!rows[0]) throw new Error('현장을 찾을 수 없습니다.');
    // 내는 쪽이 누르는 자리다 — 그 현장의 협력사와 한백만
    if (!canAccessProject(actor.role, actor.org, rows[0])) {
      throw new Error('이 현장의 계약서를 접수할 수 없습니다.');
    }
    const [record] = await recordsOf(rows);
    if (!record) throw new Error('현장을 찾을 수 없습니다.');

    /*
     * 낼 것이 남았는데 「다 냈다」고 할 수는 없다 — 조건은 lib/stage.ts 가 정본이다.
     * 반려는 막지 않는다: 반려된 서류를 다시 올리면 그 순간 반려가 풀리고(attach-doc),
     * 그때 다시 누르는 것이 보완의 끝이다.
     */
    const state = contractStateFor(record);
    /*
     * ★이관 현장은 서류 조건을 면제한다★ (한백 지시 2026-08-26).
     *
     * 노션에서 온 현장은 필수 서류가 콘솔에 없다(서류는 이관하지 않았고 한백이 나중에
     * 채운다). 계약 확인은 이미 그것을 면제하는데(contractStateOf docsExempt) 여기만
     * 안 봐서, 한백이 한 칸을 반려해도 협력사가 그것을 고쳐 올린 뒤 「다 고쳤다」고
     * 말할 자리가 없었다 — 나머지 칸이 영영 비어 있기 때문이다.
     */
    if (submitted && !state.docsFilled && !state.docsExempt) {
      throw new Error('필수 서류를 다 올려야 계약서를 접수할 수 있습니다.');
    }

    const before = record.project.contractSubmittedAt;
    const after = submitted ? today() : null;
    if (Boolean(before) === Boolean(after)) return;

    const db = getDb();
    await db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({
          contractSubmittedAt: after,
          // 냈으면 볼 차례가 한백이고, 되돌리면 다시 내는 쪽 차례다
          court: submitted ? '한백' : '영업사',
          lastProgressAt: today(),
        })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: submitted ? '계약서 접수' : '계약서 접수 취소',
        field: 'contractSubmittedAt', oldValue: before, newValue: after,
      });
    });
  },

  async confirmContract(projectId, confirmed, actor): Promise<void> {
    assertAdmin(actor, '계약 확인');

    const rows = await getDb().select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!rows[0]) throw new Error('현장을 찾을 수 없습니다.');
    const [record] = await recordsOf(rows);
    if (!record) throw new Error('현장을 찾을 수 없습니다.');

    /*
     * 조건이 안 맞으면 확인해 주지 않는다.
     * 필수 서류가 비었거나 반려가 남은 계약을 확인해 버리면, 그 뒤로는 무엇이 확인된
     * 것인지 알 수 없어진다. 조건은 lib/stage.ts 가 정본이고 여기서 그것을 부른다.
     */
    if (confirmed && !contractStateFor(record).ready) {
      throw new Error('서류가 다 차고 반려가 없고 단가가 붙어야 계약을 확인할 수 있습니다.');
    }

    const before = record.project.contractConfirmedAt;
    const after = confirmed ? today() : null;
    if (Boolean(before) === Boolean(after)) return;

    const db = getDb();
    await db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({
          contractConfirmedAt: after,
          /*
           * ★담당는 그 단계가 정한다★ (한백 지시 2026-08-25).
           *
           * 여기서 '시공사' 를 적고 있었다 — 「계약이 끝났으면 다음 손은 시공사」라고 봤는데,
           * 계약완료 다음 일은 ★우리가 운영사에 계약서를 내는 것★이다(COURT_AFTER_STATUS
           * 은 처음부터 '한백' 이라고 적어 두었다). 그 바람에 협력사의 할 일 목록에
           * 「계약완료」가 떴다 — 표시만 있고 할 것이 없는 줄이다.
           *
           * 단계로 판정하면 이관 현장처럼 공정이 이미 진행된 채 확인을 누르는 경우도 맞는다.
           * 되돌리면 다시 볼 사람이 한백이다.
           */
          court: confirmed ? COURT_AFTER_STATUS[record.process.status] : '한백',
          lastProgressAt: today(),
        })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: confirmed ? '계약 확인' : '계약 확인 취소',
        field: 'contractConfirmedAt', oldValue: before, newValue: after,
      });
    });
  },

  /**
   * 누락 서류 보완요청 · 취소 — 파일이 없는 필수 칸을 한 번에 반려로 세운다.
   *
   * 서류 한 장의 반려(setDocumentStatus)는 올라온 파일에만 걸린다 — 안 낸 서류는 반려할
   * 대상이 없어서, 필수 서류가 여러 칸 빈 채로 검토에 올라온 계약을 되돌릴 길이 없었다
   * (한백 지시 2026-08-25). 그 계약을 계약보완으로 내리는 일을 여기서 한 번에 한다.
   *
   * 겨냥은 ★파일이 없는 필수 칸★뿐이다(missingRequiredDocs). 올라온 서류의 문제는 그 칸의
   * 반려가 다룬다 — 두 길이 같은 칸을 건드리면 나중 것이 앞 사유를 지운다.
   *
   * 반려 하나와 같은 일이 프로젝트에도 일어난다: 계약 확인을 지우고(반려는 그 확인을
   * 무효로 만든다) 공을 영업사로 넘기고 보완요청 이력을 남긴다.
   */
  async askMissingDocs(projectId, ask, reason, actor): Promise<{ kinds: string[] }> {
    assertAdmin(actor, '누락 서류 보완요청');

    const rows = await getDb().select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!rows[0]) throw new Error('현장을 찾을 수 없습니다.');
    const [record] = await recordsOf(rows);
    if (!record) throw new Error('현장을 찾을 수 없습니다.');

    /*
     * 보완요청은 ★검토에 올라온 계약★에만 건다 — 협력사가 접수했거나(contractSubmittedAt)
     * 이미 보완요청을 받은 적이 있는 계약이다(lib/board.ts 의 계약검토 판정과 같은 값).
     * 아직 모으는 중인 계약(계약접수)에 걸면, 협력사가 다 냈다고 말하기도 전에 「안 냈다」고
     * 반려하는 것이 된다 — 그 칸은 원래 협력사 차례다.
     */
    if (ask) {
      const inReview =
        record.project.contractSubmittedAt !== null || record.project.contractFixAskedAt !== null;
      if (!inReview) {
        throw new Error('계약검토에 올라온 계약에만 보완요청할 수 있습니다 — 접수 전에는 협력사가 모으는 중입니다.');
      }
      /*
       * ★노션 이관 현장도 거절하지 않는다★ (한백 지적 2026-08-25).
       *
       * 처음에는 막았다 — 이관분의 계약서·회의록은 노션에 있고 콘솔에는 0건이라
       * (docsOutsideConsole) 그것을 누락으로 세는 것이 「있을 수 없는 증거를 요구하는 일」로
       * 보였다. 그런데 이관 140건이 전부 계약검토에 서 있고(migrations/0019) 보완요청이
       * 필요한 것이 바로 그 현장들이다. 노션에 있는 것을 콘솔로 받아오는 것이 이관의
       * 방향이라 요구할 수 있는 증거다 — 한 현장씩 사람이 눌러서 한다.
       *
       * 계약 확인이 서류 조건을 면제받는 것(contractStateOf docsExempt)과 어긋나지 않는다:
       * 면제는 「없어도 확인할 수 있다」이고, 이것은 「받아오기로 한다」는 판단이다.
       */
    }

    const day = today();
    const why = reason?.trim() || '미제출 — 제출해주세요';

    /*
     * 겨냥하는 칸: 요청이면 「필수인데 파일 없음」, 취소면 「파일 없이 반려로 서 있는 것」.
     * 취소가 필수 여부를 다시 묻지 않는 이유는, 요청한 뒤에 조건이 바뀌어(수전방식·운영사)
     * 그 칸이 필수에서 빠질 수 있기 때문이다 — 그러면 되돌릴 수 없는 반려가 남는다.
     */
    const kinds = ask
      ? missingRequiredDocs(record).map((d) => d.kind)
      : record.documents.filter((d) => d.status === 'rejected' && !d.blobUrl).map((d) => d.kind);

    if (kinds.length === 0) {
      throw new Error(ask ? '누락된 필수 서류가 없습니다.' : '되돌릴 보완요청이 없습니다.');
    }

    const db = getDb();
    await db.transaction(async (tx) => {
      for (const kind of kinds) await markMissing(tx, projectId, kind, ask, why);
      await applyAskSideEffects(tx, projectId, ask, day);

      await writeAudit(tx, {
        projectId, actor,
        action: ask ? '누락 서류 보완요청' : '누락 서류 보완요청 취소',
        field: 'documents',
        oldValue: null,
        newValue: `${kinds.join(', ')}${ask ? ` — ${why}` : ''}`,
      });
    });

    return { kinds };
  },

  async setPreInstall(projectId, patch, actor): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: projects.id, salesOrg: projects.salesOrg, gcOrg: projects.gcOrg,
          preInstall: projects.preInstall, preNote: projects.preNote, preChecked: projects.preChecked,
          preRejectReason: projects.preRejectReason,
          bizType: projects.bizType,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');
      checkPreInstallWrite(row, patch, actor);
      const rejecting =
        typeof patch.preRejectReason === 'string' && patch.preRejectReason.trim() !== '';
      const fixing = patch.preInstall !== undefined || patch.preChecked === true;

      const next = {
        preInstall: patch.preInstall ?? (row.preInstall as PreInstall),
        preNote: 'preNote' in patch ? (patch.preNote?.trim() || null) : row.preNote,
        preChecked: rejecting ? false : (patch.preChecked ?? row.preChecked),
        preRejectReason: rejecting
          ? patch.preRejectReason!.trim()
          : patch.preRejectReason === null || fixing
            ? null
            : row.preRejectReason,
      };
      if (
        next.preInstall === row.preInstall
        && next.preNote === row.preNote
        && next.preChecked === row.preChecked
        && next.preRejectReason === row.preRejectReason
      ) return;

      await savePreInstall(tx, projectId, next, rejecting);

      await writeAudit(tx, {
        projectId, actor,
        action: rejecting ? '기설치 조사 반려' : '기설치 조사',
        field: 'preInstall',
        oldValue: `${row.preInstall}${row.preChecked ? ' (확인)' : ''}`,
        newValue: rejecting
          ? `반려 — ${next.preRejectReason}`
          : `${next.preInstall}${next.preChecked ? ' (확인)' : ''}`,
      });
    });
  },
};

/**
 * 파일 없는 칸 하나를 보완요청으로 세우거나(ask) 되돌린다.
 *
 * 파일 칸은 건드리지 않는다 — 겨냥한 것이 「파일 없는 칸」이라 비어 있지만, 덮어쓰기로
 * 남의 파일을 지우는 길을 열어두지 않는다.
 */
async function markMissing(
  tx: TxLike,
  projectId: string,
  kind: string,
  ask: boolean,
  why: string
): Promise<void> {
  const status = ask ? 'rejected' : 'none';
  const rejectReason = ask ? why : null;
  await tx
    .insert(documents)
    .values({
      projectId, kind, filename: null, blobUrl: null,
      status, rejectReason, uploadedBy: null, uploadedAt: null,
    })
    .onConflictDoUpdate({
      target: [documents.projectId, documents.kind],
      set: { status, rejectReason },
    });
}

/**
 * 보완요청의 뒷일 — 반려와 같다. 확인을 무효로 만들고 담당을 보완할 쪽으로 넘긴다.
 * 되돌리면 볼 차례는 다시 한백이다(확인은 사람이 다시 눌러야 한다).
 */
async function applyAskSideEffects(
  tx: TxLike,
  projectId: string,
  ask: boolean,
  day: string
): Promise<void> {
  await tx
    .update(projects)
    .set({
      lastProgressAt: day,
      ...(ask
        ? {
            contractConfirmedAt: null,
            contractFixAskedAt: sql`coalesce(${projects.contractFixAskedAt}, ${day})`,
            court: '영업사' as const,
          }
        : { court: '한백' as const }),
    })
    .where(eq(projects.id, projectId));
}

/**
 * 기설치 조사를 적을 수 있는가 — 아니면 던진다.
 *
 * 자체투자는 조사 자체를 하지 않는다 — 환경부 보조금이 기설치 여부로 갈리기 때문에 하는
 * 조사다. 조사는 현장에 가는 쪽(그 현장의 협력사·한백)이 하고, ★반려는 한백 관리자만★
 * 한다 — 「다시 조사해라」는 판정이라 조사하는 쪽이 스스로 걸 수 없다.
 */
function checkPreInstallWrite(
  row: { salesOrg: string | null; gcOrg: string | null; bizType: string | null },
  patch: { preRejectReason?: string | null },
  actor: Actor
): void {
  if (!needsPreInstallCheck(row.bizType as Project['bizType'])) {
    throw new Error('자체투자 현장은 기설치 조사를 하지 않습니다.');
  }
  if (!canAccessProject(actor.role, actor.org, row)) {
    throw new Error('이 현장의 기설치를 적을 권한이 없습니다.');
  }
  if (patch.preRejectReason !== undefined && actor.role !== 'admin') {
    throw new Error('기설치 조사 반려는 한백 관리자만 할 수 있습니다.');
  }
}

/**
 * 조사 결과를 저장한다. 조사는 진척이라 정체일 기준을 갱신한다.
 *
 * ★반려는 서류 반려와 같은 뒷일을 한다★ (한백 지적 2026-08-26) — 담당이 영업사로 가고,
 * 앞서 한 계약 확인을 지우고, 보완요청이 있었다는 사실을 남긴다(첫 번째 것만). 안 지우면
 * 확인일이 남아 단계가 시공으로 유도되고(lib/stage), 보드의 계약 세 칸 판정을 안 타서
 * 반려해 놓고도 현장이 제자리에 선다 — 전주태평에스케이뷰가 그랬다.
 *
 * 착공 뒤에는 확인을 지우지 않는다 — 시작된 공사를 계약 칸으로 끌어내리지 않는다.
 */
async function savePreInstall(
  tx: TxLike,
  projectId: string,
  next: {
    preInstall: PreInstall; preNote: string | null;
    preChecked: boolean; preRejectReason: string | null;
  },
  rejecting: boolean
): Promise<void> {
  const day = today();
  const [proc] = await tx
    .select({ status: processes.status })
    .from(processes)
    .where(eq(processes.projectId, projectId))
    .limit(1);
  const started = statusIndex(asProcessStatus(proc?.status)) >= statusIndex('착공');

  await tx
    .update(projects)
    .set({
      ...next,
      lastProgressAt: day,
      ...(rejecting
        ? {
            court: '영업사' as const,
            ...(started ? {} : { contractConfirmedAt: null }),
            contractFixAskedAt: sql`coalesce(${projects.contractFixAskedAt}, ${day})`,
          }
        : {}),
    })
    .where(eq(projects.id, projectId));
}

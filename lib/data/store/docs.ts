/**
 * 서류 — 올리기 · 검수 · 빼기.
 *
 * `pg-store.ts` 에서 떼어 왔다(doc/REFACTOR_PLAN_3.md 2-1). 인터페이스는 그대로고
 * 부르는 쪽도 그대로다 — pgRepository 가 이 객체를 펼쳐 담는다.
 *
 * ★한 칸에 파일이 여럿이다★ — `files` 가 정본이고 filename·blob_url 은 첫 파일의 사본이다
 * (손으로 SQL 을 볼 때를 위해 같이 맞춘다). 올리면 쌓이고, 마지막 장을 빼면 미제출로
 * 돌아간다. 계약 서류와 공정 서류가 표가 달라 두 갈래가 한 메서드 안에 있다.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { documents, processDocuments, processes, projects } from '@/lib/db/schema';
import { today } from '@/lib/date';
import { canAccessProject, canWrite } from '@/lib/roles';
import { asProcessStatus, statusIndex } from '@/lib/process';
import { isProcessDocKind } from '../assemble';
import { PROCESS_DOCS } from '@/lib/doc-rules';
import type { DocFile, DocStatus, ProjectDocument } from '@/types/project';
import type { Actor, ProjectRepository } from '../repository';
import { assertAdmin, mergeDocs, PROCESS_DOC_KEYS, recordsOf } from './shared';
import type { TxLike } from './shared';

/** pgRepository 가 펼쳐 담는 조각 — 이름과 시그니처는 인터페이스가 정한다 */
export const docStore: Pick<
  ProjectRepository,
  'setDocumentStatus' | 'deleteDocument' | 'deleteDocumentFile' | 'uploadDocument'
> = {
  async setDocumentStatus(input, actor): Promise<void> {
    assertAdmin(actor, '서류 검수');
    if (input.status === 'rejected' && !input.reason?.trim()) {
      throw new Error('반려 사유를 입력해주세요.');
    }

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.projectId, input.projectId), eq(documents.kind, input.kind)))
        .limit(1);

      if (!checkReviewable(row, input)) return; // 같은 값이면 로그를 남기지 않는다

      await tx
        .update(documents)
        .set({
          status: input.status,
          // 반려가 아니면 사유를 지운다 — 남겨두면 통과 상태인데 반려사유가 함께 뜬다
          rejectReason: input.status === 'rejected' ? input.reason!.trim() : null,
        })
        .where(and(eq(documents.projectId, input.projectId), eq(documents.kind, input.kind)));

      /*
       * 검수는 진척이다 — 정체일 계산의 기준을 갱신한다.
       *
       * 반려하면 앞서 한 계약 확인을 지운다. 반려는 「이 계약은 아직 아니다」는 판정이라
       * 그 확인을 무효로 만든다 — 보완한 뒤 한백이 다시 봐야 한다. 안 지우면 협력사가
       * 서류를 다시 올리는 순간 아무도 안 본 계약이 계약완료로 되돌아간다.
       *
       * 접수 선언(contract_submitted_at)은 지우지 않는다 — 협력사가 이미 다 냈다고 한
       * 말이고, 보완은 그 안에서 오가는 왕복이다. 대신 ★보완요청이 있었다는 사실★을
       * 남긴다 — 첫 번째 것만(coalesce). 반려는 재업로드로 풀려서 흔적이 없어지는데,
       * 그 흔적이 없으면 접수 선언이 없는 현장(노션 이관분·한백이 바로 확인한 것)이
       * 처음 서류를 모으는 자리(계약접수)로 떨어진다. 보완요청을 받은 계약은 접수 선언이
       * 없어도 계약검토에 선다(lib/board.ts) — 그것을 볼 사람은 한백이다.
       * 지우지 않는 값이다 — 몇 번을 돌아도 첫 보완요청일이다.
       *
       * 반려하면 공도 영업사로 넘어간다 — 보완할 차례다. 다시 올라오면 uploadDocument 가
       * 공을 한백으로 되돌린다. 이 한쪽이 없으면 반려한 뒤에도 공 차례가 「한백」으로 남아,
       * 협력사를 기다리는 현장이 한백이 막고 있는 것처럼 보인다.
       */
      await applyReviewSideEffects(tx, input.projectId, input.status === 'rejected');

      await writeAudit(tx, {
        projectId: input.projectId,
        actor,
        action:
          input.status === 'rejected' ? '서류 반려'
          : input.status === 'approved' ? '서류 확인'
          : '반려 해제',
        field: input.kind,
        oldValue: row.status,
        newValue: input.status === 'rejected' ? `rejected: ${input.reason!.trim()}` : input.status,
      });
    });
  },

  async deleteDocument(input, actor): Promise<{ blobUrls: string[] }> {
    assertAdmin(actor, '서류 삭제');

    const db = getDb();
    return db.transaction(async (tx) => {
      // 계약 서류와 공정 서류는 다른 표에 산다 — uploadDocument 와 같은 기준으로 가른다
      const table = isProcessDocKind(input.kind) ? processDocuments : documents;
      const where = and(eq(table.projectId, input.projectId), eq(table.kind, input.kind));

      const [row] = await tx
        .select({
          filename: table.filename, blobUrl: table.blobUrl, status: table.status, files: table.files,
        })
        .from(table)
        .where(where)
        .limit(1);
      if (!row) throw new Error('이미 없는 서류입니다.');

      await tx.delete(table).where(where);

      /*
       * 정체일 기준은 갱신하지 않는다. 서류를 지우는 것은 진척이 아니라 되돌리는 일이다 —
       * 갱신하면 「오래 멈춰 있음」 표시가 지우는 것으로 리셋된다.
       */
      await writeAudit(tx, {
        projectId: input.projectId,
        actor,
        action: '서류 삭제',
        field: isProcessDocKind(input.kind) ? `process.${input.kind}` : input.kind,
        oldValue: row.filename ?? row.status,
        newValue: null,
      });

      /*
       * 칸에 붙은 파일 전부를 돌려준다 — 한 칸에 여러 장이 있을 수 있다.
       * 첫 파일 사본(blob_url)도 넣고 중복은 걷는다: files 백필 전 행이 있을 수 있다.
       */
      const urls = ((row.files ?? []) as DocFile[]).map((f) => f?.url).filter(Boolean) as string[];
      if (row.blobUrl && !urls.includes(row.blobUrl)) urls.push(row.blobUrl);
      return { blobUrls: urls };
    });
  },

  /**
   * 그 칸의 파일 한 장을 뺀다 — 올리는 쪽(협력사)도 한다.
   *
   * 파일이 쌓이게 되면서(migrations/0021) 「다시 올려 덮는다」로 잘못 올린 것을 고칠 수
   * 없게 됐다. 그 길을 여기서 준다. 칸을 비우는 것(deleteDocument)과 다르다 — 칸의 상태·
   * 반려 사유는 건드리지 않는다.
   *
   * 마지막 한 장을 빼면 미제출로 돌린다. 파일 없는 「제출됨」을 남기면 필수 서류가 찬 것으로
   * 세어져(lib/stage) 파일 한 장 없는 계약이 확인 가능해진다.
   */
  async deleteDocumentFile(input, actor): Promise<{ blobUrl: string | null }> {
    if (!canWrite(actor.role)) throw new Error('열람 전용 계정은 파일을 지울 수 없습니다.');

    const db = getDb();
    return db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id, salesOrg: projects.salesOrg, gcOrg: projects.gcOrg })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!project) throw new Error('현장을 찾을 수 없습니다.');
      // 남의 현장 서류는 지울 수 없다 — 올리는 것과 같은 판정이다
      if (!canAccessProject(actor.role, actor.org, project)) {
        throw new Error('이 현장의 서류를 지울 권한이 없습니다.');
      }

      const table = isProcessDocKind(input.kind) ? processDocuments : documents;
      const where = and(eq(table.projectId, input.projectId), eq(table.kind, input.kind));

      const [row] = await tx
        // status 도 읽는다 — 반려된 칸은 파일을 빼도 반려로 남긴다(아래)
        .select({
          blobUrl: table.blobUrl, filename: table.filename, files: table.files, status: table.status,
        })
        .from(table)
        .where(where)
        .limit(1);
      if (!row) throw new Error('이미 없는 서류입니다.');

      const before = ((row.files ?? []) as DocFile[]).filter((f) => f?.url);
      const gone = before.find((f) => f.url === input.url)
        // files 백필 전 행 — 첫 파일 사본만 있는 경우다
        ?? (row.blobUrl === input.url
          ? { name: row.filename ?? '파일', url: row.blobUrl, uploadedBy: null, uploadedAt: null }
          : null);
      if (!gone) throw new Error('그 파일은 이 칸에 없습니다.');

      const files = before.filter((f) => f.url !== input.url);

      await tx
        .update(table)
        .set({
          files,
          filename: files[0]?.name ?? null,
          blobUrl: files[0]?.url ?? null,
          /*
           * 마지막 장을 빼면 미제출이다 — 파일 없는 「제출됨」을 남기지 않는다.
           * ★반려는 그대로 둔다★ (한백 지시 2026-08-26) — 예전에는 미제출로 바꾸면서
           * 반려까지 풀려서, 협력사가 반려된 파일을 빼는 것만으로 계약보완에서 빠져나왔다.
           * 반려는 「이 칸을 고쳐 오라」는 판정이고 파일을 빼는 것이 그 판정을 지우지 않는다 —
           * 새 파일이 올라올 때만 풀린다(uploadDocument). 사유도 남긴다.
           */
          ...(files.length === 0 && row.status !== 'rejected' ? { status: 'none' } : {}),
        })
        .where(where);

      /*
       * 정체일 기준은 갱신하지 않는다 — 파일을 빼는 것은 진척이 아니라 되돌리는 일이다
       * (deleteDocument 와 같은 이유).
       */
      await writeAudit(tx, {
        projectId: input.projectId,
        actor,
        action: '서류 파일 삭제',
        field: isProcessDocKind(input.kind) ? `process.${input.kind}` : input.kind,
        oldValue: gone.name,
        newValue: files.length === 0 ? null : `남은 ${files.length}장`,
      });

      return { blobUrl: gone.url };
    });
  },

  async uploadDocument(input, actor): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id, salesOrg: projects.salesOrg, gcOrg: projects.gcOrg })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!project) throw new Error('현장을 찾을 수 없습니다.');

      // 남의 현장에 서류를 올릴 수 없다. 라우트에서도 보지만 여기서 한 번 더 본다.
      if (!canAccessProject(actor.role, actor.org, project)) {
        throw new Error('이 현장에 서류를 올릴 권한이 없습니다.');
      }

      /*
       * 계약 서류와 공정 서류는 다른 표에 산다.
       * 종류 이름으로 가른다 — 공정 서류를 documents 에 넣으면 공정 게이트(canEnter)가
       * process_documents 만 보므로 올려도 조건이 안 차고, 원인을 찾을 단서가 없다.
       */
      if (isProcessDocKind(input.kind)) await putProcessDoc(tx, input, actor, today());
      else await putContractDoc(tx, input, actor, today());
    });
  },
};


/**
 * 올린 파일을 기존 목록 뒤에 쌓는다 — 갈아치우지 않는다 (한백 지시 2026-08-25).
 *
 * 예전에는 한 칸에 파일 하나여서 새로 올리면 앞의 것이 사라졌다(저장소에서도 지웠다).
 * 회의록이 두 장으로 스캔되거나 사진대지가 동별로 갈려 오면 올릴 자리가 없었다.
 *
 * 같은 주소는 두 번 넣지 않는다 — 두 번 눌림·접수 재시도에 같은 파일이 두 줄로 남는다.
 */
function appendedFiles(
  before: unknown,
  input: { filename: string; blobUrl: string },
  actorName: string,
  day: string
): DocFile[] {
  const files = ((before ?? []) as DocFile[]).filter((f) => f?.url);
  if (files.some((f) => f.url === input.blobUrl)) return files;
  return [...files, { name: input.filename, url: input.blobUrl, uploadedBy: actorName, uploadedAt: day }];
}

/** 공정 서류 갈래 — process_documents 표. 행위신고는 신고일도 같이 채운다. */
async function putProcessDoc(
  tx: TxLike,
  input: { projectId: string; kind: string; filename: string; blobUrl: string },
  actor: Actor,
  day: string
): Promise<void> {
      const [before] = await tx
        .select({ filename: processDocuments.filename, files: processDocuments.files })
        .from(processDocuments)
        .where(and(
          eq(processDocuments.projectId, input.projectId),
          eq(processDocuments.kind, input.kind)
        ))
        .limit(1);

      const files = appendedFiles(before?.files, input, actor.name, day);
      const row = {
        projectId: input.projectId,
        kind: input.kind,
        files,
        // 첫 파일의 사본 — 정본은 files 다(migrations/0021)
        filename: files[0].name,
        blobUrl: files[0].url,
        status: 'uploaded',
        uploadedBy: actor.name,
        uploadedAt: day,
      };
      await tx
        .insert(processDocuments)
        .values(row)
        .onConflictDoUpdate({
          target: [processDocuments.projectId, processDocuments.kind],
          set: row,
        });

      /*
       * 행위신고 파일을 올리면 행위신고일이 그 날로 들어간다 — 비어 있을 때만.
       * 대개 접수한 날 올리므로 기본값이 맞고, 다르면 시공 탭에서 고친다.
       */
      if (input.kind === 'notify') {
        const [pr] = await tx
          .select({ notifyDate: processes.notifyDate })
          .from(processes)
          .where(eq(processes.projectId, input.projectId))
          .limit(1);
        if (!pr) {
          await tx.insert(processes).values({ projectId: input.projectId, notifyDate: day });
        } else if (!pr.notifyDate) {
          await tx
            .update(processes)
            .set({ notifyDate: day })
            .where(eq(processes.projectId, input.projectId));
        }
      }

      await tx
        .update(projects)
        .set({ lastProgressAt: day })
        .where(eq(projects.id, input.projectId));
      await writeAudit(tx, {
        projectId: input.projectId, actor,
        action: '공정 서류 올림', field: `process.${input.kind}`,
        oldValue: before?.filename ?? null, newValue: input.filename,
      });
}

/**
 * 계약 서류 갈래 — documents 표. 다시 올리면 반려가 풀리고, 남은 반려가 없으면
 * 담당이 한백으로 넘어간다.
 */
async function putContractDoc(
  tx: TxLike,
  input: { projectId: string; kind: string; filename: string; blobUrl: string },
  actor: Actor,
  day: string
): Promise<void> {

    const [before] = await tx
      .select({ status: documents.status, files: documents.files })
      .from(documents)
      .where(and(eq(documents.projectId, input.projectId), eq(documents.kind, input.kind)))
      .limit(1);

    const files = appendedFiles(before?.files, input, actor.name, day);
    const row = {
      projectId: input.projectId,
      kind: input.kind,
      files,
      // 첫 파일의 사본 — 정본은 files 다(migrations/0021)
      filename: files[0].name,
      blobUrl: files[0].url,
      // 다시 올리면 반려가 풀린다 — 반려 상태로 남겨두면 고쳐도 계약이 안 넘어간다
      status: 'uploaded',
      rejectReason: null,
      uploadedBy: actor.name,
      uploadedAt: day,
    };
    await tx
      .insert(documents)
      .values(row)
      .onConflictDoUpdate({ target: [documents.projectId, documents.kind], set: row });

    /*
     * 서류가 올라오면 담당이 한백으로 넘어간다 (검수 차례).
     *
     * ★단, 아직 되돌려진 것이 남아 있으면 안 넘긴다★ (한백 지시 2026-08-26).
     * 서류를 두 칸 반려했는데 한 칸만 다시 올리면, 예전에는 그 한 장으로 담당이
     * 한백에 넘어갔다 — 한백 할 일에 「반려 N건 보완」(협력사가 할 일)이 뜨고 정작
     * 고쳐야 할 협력사 목록에서는 그 현장이 사라졌다. 기설치 조사 반려도 같다:
     * 조사를 다시 하라고 돌려보냈는데 엉뚱한 서류 한 장에 담당이 넘어왔다
     * (실제로 3건 — 학동모아엘가·이천 수림1차·신정이펜하우스3단지).
     *
     * 설치이력 파일이 곧 기설치 조사다(한백 확인) — 조사 여부를 따로 묻지 않는다.
     * 그 파일이 올라오면 조사 반려도 함께 풀린다(보완이 반려를 푸는 규칙).
     */
    const clearsPreReject = input.kind === 'legacylog';
    const [left] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(documents)
      .where(and(eq(documents.projectId, input.projectId), eq(documents.status, 'rejected')));
    const [proj] = await tx
      .select({ preRejectReason: projects.preRejectReason })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    const stillOpen = (left?.n ?? 0) > 0 || (!clearsPreReject && proj?.preRejectReason !== null);

    await tx
      .update(projects)
      .set({
        ...(stillOpen ? {} : { court: '한백' as const }),
        lastProgressAt: day,
        ...(clearsPreReject ? { preChecked: true, preRejectReason: null } : {}),
      })
      .where(eq(projects.id, input.projectId));

    await writeAudit(tx, {
      projectId: input.projectId, actor,
      action: before?.status === 'rejected' ? '서류 재업로드' : '서류 업로드',
      field: input.kind, oldValue: before?.status ?? 'none', newValue: 'uploaded',
    });
}

/**
 * 검수할 수 있는 칸인가 — 아니면 던지고, 바뀐 것이 없으면 false 를 돌려준다.
 *
 * 올라오지 않은 서류는 검수 대상이 아니다. 조회 화면은 15칸을 모두 그리지만(mergeDocs)
 * 행이 없는 칸은 「미제출」이라, 여기서 막지 않으면 없는 서류가 승인된 것으로 남는다.
 *
 * 파일 없이 반려로 서 있는 칸(누락 서류 보완요청, askMissingDocs)도 통과시킬 수 없다 —
 * 통과 상태가 되면 satisfied 가 그 칸을 세어 파일 한 장 없는 계약이 확인 가능해진다.
 * 되돌리는 길은 보완요청 취소다(askMissingDocs ask=false).
 */
function checkReviewable(
  row: { status: string; blobUrl: string | null; rejectReason: string | null } | undefined,
  input: { status: DocStatus; reason?: string | null }
): boolean {
  if (!row || row.status === 'none') {
    throw new Error('제출되지 않은 서류는 검수할 수 없습니다.');
  }
  if (input.status !== 'rejected' && !row.blobUrl) {
    throw new Error('파일이 없는 칸은 통과시킬 수 없습니다 — 제출을 기다리는 자리입니다.');
  }
  const sameReason = (row.rejectReason ?? null) === (input.reason?.trim() || null);
  return !(row.status === input.status && sameReason);
}

/**
 * 검수 뒤에 현장에 남는 것 — 정체일, 그리고 반려라면 계약 확인·보완요청·담당.
 *
 * 반려하면 앞서 한 계약 확인을 지운다. 반려는 「이 계약은 아직 아니다」는 판정이라 그
 * 확인을 무효로 만든다 — 안 지우면 협력사가 서류를 다시 올리는 순간 아무도 안 본 계약이
 * 계약완료로 되돌아간다. 접수 선언(contract_submitted_at)은 지우지 않는다 — 협력사가 이미
 * 다 냈다고 한 말이고, 보완은 그 안에서 오가는 왕복이다. 대신 ★보완요청이 있었다는 사실★을
 * 남긴다(첫 번째 것만, coalesce): 반려는 재업로드로 풀려 흔적이 없어지는데, 그 흔적이 없으면
 * 접수 선언이 없는 현장(노션 이관분)이 계약접수로 떨어진다.
 *
 * ★착공 뒤에는 계약 단계로 내려가지 않는다★ (한백 지시 2026-08-26) — 확인을 지우면 단계가
 * intake 로 유도되어(lib/stage.ts) 공사가 도는 현장이 시공 보드에서 사라지고 단계 이동이
 * 전부 막힌다. 서류의 문제는 반려로 그대로 남지만, 시작된 공사를 끌어내리지는 않는다.
 *
 * 반려하면 담당도 영업사로 넘어간다 — 보완할 차례다. 다시 올라오면 uploadDocument 가
 * 되돌린다. 한쪽이 없으면 협력사를 기다리는 현장이 한백이 막는 것처럼 보인다.
 */
async function applyReviewSideEffects(
  tx: TxLike,
  projectId: string,
  rejected: boolean
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
      lastProgressAt: day,
      ...(rejected
        ? {
            ...(started ? {} : { contractConfirmedAt: null }),
            contractFixAskedAt: sql`coalesce(${projects.contractFixAskedAt}, ${day})`,
            court: '영업사' as const,
          }
        : {}),
    })
    .where(eq(projects.id, projectId));
}

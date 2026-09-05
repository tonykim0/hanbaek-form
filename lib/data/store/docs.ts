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
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { auditLog, documents, processDocuments, processes, projects } from '@/lib/db/schema';
import { today } from '@/lib/date';
import { canAccessProject, canWrite, isHanbaek } from '@/lib/roles';
import {
  asProcessStatus, canChangeContractDocs, CONTRACT_DOCS_LOCKED_WHY, COURT_AFTER_STATUS,
  statusIndex,
} from '@/lib/process';
import { isProcessDocKind } from '../assemble';
import { PROCESS_DOCS } from '@/lib/doc-rules';
import type { DocFile, DocStatus, ProjectDocument, ReviewEvent } from '@/types/project';
import type { Actor, ProjectRepository } from '../repository';
import { assertAdmin, mergeDocs, PROCESS_DOC_KEYS, recordsOf } from './shared';

/**
 * 검수의 왕복으로 볼 행동 — 계약 서류를 두고 오간 것만.
 *
 * 지급·단가·공정 입력은 여기 넣지 않는다: 이 자리가 답할 물음은 「무엇을 돌려보냈고
 * 무엇이 다시 왔나」이고, 그 밖의 것이 섞이면 그 물음이 묻힌다.
 */
const REVIEW_ACTIONS = [
  /* 협력사가 내고 무르는 선언 */
  '계약서 접수', '계약서 접수 취소',
  /* 한백의 판정 — ★취소도 같이 넣는다★. 되돌린 것이 안 보이면 「왜 다시 검토 중인가」에 답을 못 한다 */
  '계약 확인', '계약 확인 취소',
  '누락 서류 보완요청', '누락 서류 보완요청 취소',
  /* 서류 칸의 왕복 */
  '서류 업로드', '서류 재업로드', '서류 반려', '반려 해제', '서류 확인',
  '서류 삭제', '서류 파일 삭제',
  /*
   * ★기설치 조사도 이 왕복의 일부다★ (한백 지적 2026-09-01). 반려만 넣어 두어서
   * 「돌려보냈다」는 보이는데 「다시 조사해 왔다」가 안 보였다 — 한쪽만 있는 이력은
   * 무엇이 풀렸는지 말하지 못한다. 조사 저장·반려 해제가 같은 이름으로 남는다.
   */
  '기설치 조사', '기설치 조사 반려',
] as const;
import type { TxLike } from './shared';

/** pgRepository 가 펼쳐 담는 조각 — 이름과 시그니처는 인터페이스가 정한다 */
export const docStore: Pick<
  ProjectRepository,
  'setDocumentStatus' | 'deleteDocument' | 'deleteDocumentFile' | 'uploadDocument'
  | 'listReviewHistory'
> = {
  /*
   * ★검수가 오간 자취 — 새로 적는 것이 없다.★ (한백 지적 2026-09-01)
   *
   * 반려 사유는 다시 올리는 순간 지워진다(통과 상태인데 사유가 같이 뜨는 일이 없게).
   * 그래서 협력사가 「계약 재검토 요청」을 보내오면 한백은 무엇 때문에 돌려보냈고 무엇이
   * 새로 왔는지 알 길이 없었다. 그런데 그 왕복은 audit_log 에 이미 다 남고 있었다 —
   * 없던 것은 기록이 아니라 ★읽는 길★이었다. 새 표를 만들면 두 기록이 갈린다.
   *
   * 계약의 왕복만 고른다: 서류를 올리고 돌려보내고 다시 올리고 확인한 자취.
   * 지급·단가·공정 입력은 이 자리의 이야기가 아니다(그쪽은 그쪽 화면이 말한다).
   */
  async listReviewHistory(projectId, viewer): Promise<ReviewEvent[]> {
    const db = getDb();
    const [project] = await db
      .select({ id: projects.id, salesOrg: projects.salesOrg, gcOrg: projects.gcOrg })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    /* 남의 현장 자취를 id 만 알고 볼 수 없다 — 화면에서도 보지만 여기서 한 번 더 본다 */
    if (!project || !canAccessProject(viewer.role, viewer.org, project)) return [];

    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.projectId, projectId), inArray(auditLog.action, [...REVIEW_ACTIONS])))
      .orderBy(desc(auditLog.at))
      .limit(80);

    return rows.map((r) => ({
      id: r.id,
      actor: r.actor,
      action: r.action,
      kind: r.field,
      /*
       * 반려는 「rejected: 사유」 꼴로 적힌다 — 사유만 꺼낸다. 그 밖(uploaded 등)은
       * 상태 글자일 뿐이라 보여줄 것이 없다: 무엇을 했는지는 action 이 이미 말한다.
       */
      note: r.newValue?.startsWith('rejected: ') ? r.newValue.slice('rejected: '.length) : null,
      at: (r.at instanceof Date ? r.at : new Date(r.at as never)).toISOString(),
    }));
  },

  async setDocumentStatus(input, actor): Promise<void> {
    assertAdmin(actor, '서류 검수');
    if (input.status === 'rejected' && !input.reason?.trim()) {
      throw new Error('반려 사유를 입력해주세요.');
    }

    /*
     * ★공정 서류도 칸별로 반려한다★ (한백 지시 2026-08-31). 준공서류 여섯 칸 중 어느 것이
     * 문제인지 단계 판정(「보완 필요」)의 사유 글로 풀어 쓰고 있었다 — 받는 쪽은 그 글을
     * 읽고 다시 칸을 짚어야 했다. 계약 서류는 이미 칸마다 반려하는데 공정만 그 자리가
     * 없어서, 같은 일을 두 화면이 다르게 하고 있었다.
     *
     * 표만 다르고 하는 일은 같다 — 종류 이름으로 가른다(uploadDocument 와 같은 기준).
     */
    const table = isProcessDocKind(input.kind) ? processDocuments : documents;
    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(table)
        .where(and(eq(table.projectId, input.projectId), eq(table.kind, input.kind)))
        .limit(1);

      if (!checkReviewable(row, input)) return; // 같은 값이면 로그를 남기지 않는다

      if (!row) {
        // 미제출 칸의 반려 — 행이 없으면 만든다 (askMissingDocs 가 세우는 것과 같은 모양)
        await tx.insert(table).values({
          projectId: input.projectId,
          kind: input.kind,
          status: 'rejected',
          rejectReason: input.reason!.trim(),
          files: [],
        });
      } else {
        await tx
          .update(table)
          .set({
            status: input.status,
            // 반려가 아니면 사유를 지운다 — 남겨두면 통과 상태인데 반려사유가 함께 뜬다
            rejectReason: input.status === 'rejected' ? input.reason!.trim() : null,
          })
          .where(and(eq(table.projectId, input.projectId), eq(table.kind, input.kind)));
      }

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
       * 공을 한백으로 되돌린다. 이 한쪽이 없으면 반려한 뒤에도 담당가 「한백」으로 남아,
       * 협력사를 기다리는 현장이 한백이 막고 있는 것처럼 보인다.
       */
      /*
       * ★곁효과는 계약 서류에만.★ 공정 서류를 반려한다고 계약 확인을 지우면, 준공 직전
       * 현장이 계약보완으로 떨어진다 — 반려한 것은 준공서류 한 장인데 계약이 되돌아간다.
       * 공정 쪽의 「어디로 내려가는가」는 단계가 정하는 일이라 화면이 부른다(준공보완).
       */
      if (!isProcessDocKind(input.kind)) {
        await applyReviewSideEffects(tx, input.projectId, input.status === 'rejected');
      }

      await writeAudit(tx, {
        projectId: input.projectId,
        actor,
        action:
          input.status === 'rejected' ? '서류 반려'
          : input.status === 'approved' ? '서류 확인'
          : input.status === 'none' ? '반려 취소'
          : '반려 해제',
        field: input.kind,
        oldValue: row?.status ?? 'none',
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
      await assertContractDocsOpen(tx, input.projectId, input.kind, actor);

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
      // 올리는 길이다 — 반려된 칸은 잠긴 뒤에도 다시 올릴 수 있다(착공 뒤 반려 교착, 감사 M9)
      await assertContractDocsOpen(tx, input.projectId, input.kind, actor, { reuploadRejected: true });

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
 * 계약 서류가 잠겼으면 막는다 — ★운영사에 낸 뒤로 협력사는 못 바꾼다★ (한백 지시 2026-08-29).
 *
 * 화면에서 단추를 감추는 것만으로는 부족하다: 주소를 직접 두드리면 그대로 들어온다.
 * 판정은 lib/process 한 곳이고 여기서는 그것을 부른다. 공정 서류는 이 잠금 밖이다 —
 * 시공사가 착공 뒤에도 계속 올리는 것들이라, 같이 잠그면 시공이 멈춘다.
 */
async function assertContractDocsOpen(
  tx: TxLike,
  projectId: string,
  kind: string,
  actor: Actor,
  /**
   * 올리는 길인가 — 그때만 「반려된 칸은 열린다」 예외를 탄다 (한백 지시 2026-09-04, 감사 M9).
   * 빼는 길(deleteDocumentFile)은 이것을 안 주므로 반려 칸이라도 그대로 잠긴다 —
   * 다시 올리면 반려가 풀리는 규칙으로 충분하고, 마지막 장을 빼면 「파일 없는 반려」가 늘어난다.
   */
  opts: { reuploadRejected?: boolean } = {}
): Promise<void> {
  if (isProcessDocKind(kind)) return;
  if (isHanbaek(actor.role)) return;
  const [proc] = await tx
    .select({ status: processes.status })
    .from(processes)
    .where(eq(processes.projectId, projectId))
    .limit(1);
  // 반려·보완요청이 걸리면 계약 확인이 풀린다 — 그때는 고칠 수 있어야 한다(canChangeContractDocs)
  const [proj] = await tx
    .select({ confirmedAt: projects.contractConfirmedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  /*
   * 빈 칸인가 — 잠긴 뒤에도 빈 칸은 채울 수 있다(한백 지시 2026-09-03, canChangeContractDocs
   * 의 slotEmpty 주석 참조). 파일을 빼는 쪽(deleteDocumentFile)은 정의상 칸이 차 있어서
   * 이 예외를 못 탄다 — 낸 서류는 그대로 잠긴다.
   */
  const [slot] = await tx
    .select({ files: documents.files, status: documents.status })
    .from(documents)
    .where(and(eq(documents.projectId, projectId), eq(documents.kind, kind)))
    .limit(1);
  const slotEmpty = !slot || (slot.files as unknown[]).length === 0;
  /*
   * 반려된 칸인가 — 착공 뒤에는 반려해도 계약 확인이 안 지워져서(applyReviewSideEffects 의
   * started) 「확인이 풀렸는가」로는 열리지 않았다. 칸의 상태를 직접 본다(canChangeContractDocs
   * 의 slotRejected 주석). 올리는 길에서만 켠다.
   */
  const slotRejected = opts.reuploadRejected === true && slot?.status === 'rejected';
  // 공정 행이 아직 없으면 계약완료 자리다 — asProcessStatus 가 그 기본값을 안다
  if (!canChangeContractDocs(
    actor.role, asProcessStatus(proc?.status), proj?.confirmedAt !== null, slotEmpty, slotRejected
  )) {
    throw new Error(CONTRACT_DOCS_LOCKED_WHY);
  }
}

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
  input: { filename: string; blobUrl: string; title?: string | null; photo?: string[] | null; stamp?: string | null },
  actorName: string,
  day: string
): DocFile[] {
  const files = ((before ?? []) as DocFile[]).filter((f) => f?.url);
  if (files.some((f) => f.url === input.blobUrl)) return files;
  return [...files, {
    name: input.filename,
    url: input.blobUrl,
    uploadedBy: actorName,
    uploadedAt: day,
    /* 없으면 키를 만들지 않는다 — 사람이 직접 올린 파일에 null 이 적히면 「못 읽었다」로 읽힌다 */
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.photo?.length ? { photo: input.photo } : {}),
    ...(input.stamp ? { stamp: input.stamp } : {}),
  }];
}

/** 공정 서류 갈래 — process_documents 표. 행위신고는 신고일도 같이 채운다. */
async function putProcessDoc(
  tx: TxLike,
  input: { projectId: string; kind: string; filename: string; blobUrl: string; title?: string | null; photo?: string[] | null; stamp?: string | null },
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
      // 다시 올리면 반려가 풀린다 — 안 지우면 통과인데 반려사유가 같이 뜬다
      rejectReason: null,
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

      /*
       * ★준공보완을 끝내면 검토 차례로 돌아온다★ (한백 지적 2026-09-04, 감사 발견).
       *
       * 한백이 준공서류 한 칸을 반려하면 단계가 「준공보완」으로 내려가고 담당이
       * 시공사로 간다(DocRow 의 onReject). 시공사가 고쳐 다시 올리면 그 칸의 반려는
       * 위에서 풀리는데, ★단계와 담당은 그대로였다★ — 「준공보완」은 묶음 정의가 없어
       * (groupsByStatus) 그 구간에 서면 되돌아올 길이 아무 데도 없었다. 보완을 다 끝낸
       * 현장이 시공사 차례에 영영 남고, 한백은 고쳐진 것을 모른다.
       *
       * 계약 서류가 하는 것과 같은 규칙이다(putContractDoc) — 다시 올리면 반려가 풀리고,
       * ★남은 반려가 없으면★ 담당이 한백으로 넘어간다. 한 칸만 고쳤을 때 넘기지 않는
       * 것도 같다: 아직 고칠 것이 남은 현장을 검토 차례로 올리면 한백 할 일에 시공사가
       * 할 일이 뜬다.
       *
       * 되돌아가는 자리는 「준공서류 접수/검토」다 — 반려가 그 칸에서 내려온 것이고,
       * 담당은 COURT_AFTER_STATUS 가 정한다(한백). 정체일은 위에서 이미 찍었다.
       */
      const [pending] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(processDocuments)
        .where(and(
          eq(processDocuments.projectId, input.projectId),
          eq(processDocuments.status, 'rejected')
        ));

      const [cur] = await tx
        .select({ status: processes.status })
        .from(processes)
        .where(eq(processes.projectId, input.projectId))
        .limit(1);
      const backFromFix = (pending?.n ?? 0) === 0
        && asProcessStatus(cur?.status) === '준공보완';

      if (backFromFix) {
        await tx
          .update(processes)
          .set({ status: '준공서류 접수/검토' })
          .where(eq(processes.projectId, input.projectId));
      }

      await tx
        .update(projects)
        .set({
          lastProgressAt: day,
          ...(backFromFix ? { court: COURT_AFTER_STATUS['준공서류 접수/검토'] } : {}),
        })
        .where(eq(projects.id, input.projectId));
      await writeAudit(tx, {
        projectId: input.projectId, actor,
        action: '공정 서류 올림', field: `process.${input.kind}`,
        oldValue: before?.filename ?? null, newValue: input.filename,
      });
      /* 단계를 되돌린 것은 따로 남긴다 — 서류 한 장의 기록에 묻히면 왜 올라왔는지 모른다 */
      if (backFromFix) {
        await writeAudit(tx, {
          projectId: input.projectId, actor,
          action: '준공보완 해소 (반려 전부 고쳐짐)', field: 'process.status',
          oldValue: '준공보완', newValue: '준공서류 접수/검토',
        });
      }
}

/**
 * 계약 서류 갈래 — documents 표. 다시 올리면 반려가 풀리고, 남은 반려가 없으면
 * 담당이 한백으로 넘어간다.
 */
async function putContractDoc(
  tx: TxLike,
  input: { projectId: string; kind: string; filename: string; blobUrl: string; title?: string | null; photo?: string[] | null; stamp?: string | null },
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
     * 고쳐야 할 협력사 목록에서는 그 현장이 사라졌다.
     *
     * 설치이력 파일이 곧 기설치 조사다(한백 확인) — 조사 여부를 따로 묻지 않는다.
     * 그 파일이 올라오면 「조사했다」가 된다. 조사 반려를 같이 풀던 줄은 걷었다
     * (2026-09-03) — 그 반려가 이제 이 칸의 반려라 위 count 가 이미 세고 있다.
     */
    const [left] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(documents)
      .where(and(eq(documents.projectId, input.projectId), eq(documents.status, 'rejected')));

    await tx
      .update(projects)
      .set({
        ...((left?.n ?? 0) > 0 ? {} : { court: '한백' as const }),
        lastProgressAt: day,
        ...(input.kind === 'legacylog' ? { preChecked: true } : {}),
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
 * ★안 낸 서류도 칸마다 반려할 수 있다★ (한백 지시 2026-09-03). 그전에는 미제출 칸의
 * 반려 길이 「누락 서류 N건 보완요청」(askMissingDocs — 필수 전부 한 번에)뿐이라,
 * 검토 중에 특정 칸 하나를 짚어 돌려보낼 수 없었다. 미제출 칸에 허락되는 판정은
 * ★반려 하나★다 — 통과·승인은 여전히 막는다: 통과가 되면 satisfied 가 그 칸을 세어
 * 파일 한 장 없는 계약이 확인 가능해진다.
 *
 * 파일 없는 반려의 되돌림은 「미제출(none)」이다 — 통과(uploaded)로 풀면 위와 같은
 * 구멍이 열린다. 파일이 있는 칸은 none 이 될 수 없다(파일 있는 「미제출」은 거짓말이다).
 */
function checkReviewable(
  row: { status: string; blobUrl: string | null; rejectReason: string | null } | undefined,
  input: { status: DocStatus; reason?: string | null }
): boolean {
  if (!row || row.status === 'none') {
    if (input.status !== 'rejected') {
      throw new Error('제출되지 않은 서류는 반려만 할 수 있습니다.');
    }
    return true; // 행이 없어도 반려는 선다 — setDocumentStatus 가 행을 만든다
  }
  if (input.status === 'none') {
    if (row.blobUrl) throw new Error('파일이 있는 칸은 미제출로 되돌릴 수 없습니다.');
    return row.status !== 'none';
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

/**
 * Postgres 저장소 (Supabase + Drizzle).
 *
 * 파일 저장소가 못 하던 것 두 가지를 여기서 해결한다.
 *   1. 동시 쓰기 — 파일은 두 요청이 같은 스냅샷을 읽고 각자 써서 나중 것이 이겼다.
 *   2. 배포 환경 쓰기 — Vercel 파일시스템은 읽기 전용이다.
 *
 * 조립(단계 판정·정산 계산)은 여기서 하지 않는다. 행을 ProjectRecord 로 모아
 * lib/data/assemble.ts 의 toDetail 에 넘긴다 — 파일 저장소와 같은 답이 나오도록.
 *
 * 조회는 현장 수와 무관하게 쿼리 5~6번이다. 현장마다 관련 행을 따로 읽는 N+1 을 피하려고
 * id 목록으로 한 번에 긁어와 메모리에서 묶는다.
 */
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import {
  contractLines, documents, pricingRules, processDocuments, processes,
  projectNotes, projects, settlements,
} from '@/lib/db/schema';
import type {
  BizType, BuildingType, ContractLine, ContractParty, Court, CpoName, DocStatus,
  IntakeDraft, PayoutRow, PowerType, PreInstall, ProcessInfo, Project, ProjectDetail,
  ProjectDocument, ProjectSummary, ReplType, Settlement, SettlementSummary,
} from '@/types/project';
import type { Viewer } from '@/lib/auth/types';
import { canAccessProject, effectiveVisibility, normalizeOrg } from '@/lib/roles';
import { PROCESS_DOCS } from '@/lib/doc-rules';
import { asProcessStatus, canEnter } from '@/lib/process';
import type { Actor, PaymentPatch, ProcessPatch, ProjectRepository } from './repository';
import {
  ALL_DOC_KEYS, byStalled, isProcessDocKind, payoutRowsOf, redactForViewer, settlementSummaryOf,
  summaryOf, toDetail, type ProjectRecord,
} from './assemble';

/** 트랜잭션 핸들. db 와 같은 질의 인터페이스를 갖는다. */
type TxLike = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

type ProjectRow = typeof projects.$inferSelect;
type LineRow = typeof contractLines.$inferSelect;
type DocRow = typeof documents.$inferSelect;
type ProcRow = typeof processes.$inferSelect;
type ProcDocRow = typeof processDocuments.$inferSelect;
type SettlementRow = typeof settlements.$inferSelect;

// ── 행 → 도메인 ─────────────────────────────────────────────────
// DB 는 text 로 저장하고 도메인은 유니온으로 좁힌다. 좁히는 지점을 이 아래 한 곳에 모아둔다.

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    mgmtNo: r.mgmtNo,
    cpo: r.cpo as CpoName,
    salesOrg: r.salesOrg,
    gcOrg: r.gcOrg,
    name: r.name,
    addr: r.addr,
    bldgType: r.bldgType as BuildingType | null,
    contractParty: r.contractParty as ContractParty | null,
    parkTotal: r.parkTotal,
    mgr: r.mgr,
    tel: r.tel,
    mail: r.mail,
    preInstall: r.preInstall as PreInstall,
    preNote: r.preNote,
    preChecked: r.preChecked,
    powerType: r.powerType as PowerType | null,
    replType: r.replType as ReplType | null,
    bizType: r.bizType as BizType | null,
    envQueueNo: r.envQueueNo,
    note: r.note,
    createdAt: r.createdAt.toISOString().slice(0, 10),
    settlementRuleId: r.settlementRuleId,
    settlementAppliedAt: r.settlementAppliedAt,
    holdState: r.holdState as Project['holdState'],
    holdNote: r.holdNote,
  };
}

function toLine(r: LineRow): ContractLine {
  return {
    id: r.id,
    projectId: r.projectId,
    termYears: r.termYears,
    qty: r.qty,
    powerType: r.powerType as ContractLine['powerType'],
    replType: r.replType as ContractLine['replType'],
    memo: r.memo,
    pricingRuleId: r.pricingRuleId,
    pricedAt: r.pricedAt,
  };
}

/**
 * 서류는 「있는 행」이 아니라 「종류 전체」를 돌려준다.
 * 화면이 15칸을 그리므로, 안 올라온 칸도 status 'none' 으로 자리를 채워야 한다.
 */
function mergeDocs(
  keys: readonly string[],
  rows: Array<DocRow | ProcDocRow>
): ProjectDocument[] {
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return keys.map((kind) => {
    const r = byKind.get(kind);
    return {
      kind,
      filename: r?.filename ?? null,
      blobUrl: r?.blobUrl ?? null,
      status: (r?.status ?? 'none') as ProjectDocument['status'],
      rejectReason: (r && 'rejectReason' in r ? r.rejectReason : null) ?? null,
      uploadedBy: r?.uploadedBy ?? null,
      uploadedAt: r?.uploadedAt ?? null,
    };
  });
}

const PROCESS_DOC_KEYS = PROCESS_DOCS.map((d) => d.key);

function toProcess(projectId: string, r: ProcRow | undefined, docRows: ProcDocRow[]): ProcessInfo {
  return {
    projectId,
    envApprovalDate: r?.envApprovalDate ?? null,
    cpoApprovalDate: r?.cpoApprovalDate ?? null,
    chargerOrderDate: r?.chargerOrderDate ?? null,
    chargerShipDate: r?.chargerShipDate ?? null,
    chargerRecvDate: r?.chargerRecvDate ?? null,
    startPlanDate: r?.startPlanDate ?? null,
    startActualDate: r?.startActualDate ?? null,
    installDoneDate: r?.installDoneDate ?? null,
    commDoneDate: r?.commDoneDate ?? null,
    docs: mergeDocs(PROCESS_DOC_KEYS, docRows),
    status: asProcessStatus(r?.status),
    memo: r?.memo ?? null,
  };
}

function toSettlementRaw(projectId: string, r: SettlementRow | undefined): Omit<Settlement, 'steps'> {
  return {
    projectId,
    cpoCloseDate: r?.closeDate ?? null,
    salesPay1Date: r?.salesPay1Date ?? null,
    salesPay2Date: r?.salesPay2Date ?? null,
    consPay1Date: r?.consPay1Date ?? null,
    consPay2Date: r?.consPay2Date ?? null,
    safetyFee: r?.safetyFee ?? null,
    payNote: r?.payNote ?? null,
  };
}

function toCollected(r: SettlementRow | undefined): Partial<Record<1 | 2 | 3, string>> {
  const out: Partial<Record<1 | 2 | 3, string>> = {};
  if (r?.collected1At) out[1] = r.collected1At;
  if (r?.collected2At) out[2] = r.collected2At;
  if (r?.collected3At) out[3] = r.collected3At;
  return out;
}

/** 현장 행들을 받아 관련 행을 한 번에 긁어와 ProjectRecord 로 묶는다 */
async function recordsOf(rows: ProjectRow[]): Promise<ProjectRecord[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const db = getDb();

  const [lineRows, docRows, procRows, procDocRows, settlementRows] = await Promise.all([
    db.select().from(contractLines).where(inArray(contractLines.projectId, ids)),
    db.select().from(documents).where(inArray(documents.projectId, ids)),
    db.select().from(processes).where(inArray(processes.projectId, ids)),
    db.select().from(processDocuments).where(inArray(processDocuments.projectId, ids)),
    db.select().from(settlements).where(inArray(settlements.projectId, ids)),
  ]);

  const group = <T extends { projectId: string }>(list: T[]): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const item of list) {
      const bucket = m.get(item.projectId);
      if (bucket) bucket.push(item);
      else m.set(item.projectId, [item]);
    }
    return m;
  };
  const linesBy = group(lineRows);
  const docsBy = group(docRows);
  const procDocsBy = group(procDocRows);
  const procBy = new Map(procRows.map((r) => [r.projectId, r]));
  const setBy = new Map(settlementRows.map((r) => [r.projectId, r]));

  return rows.map((row) => {
    const settlementRow = setBy.get(row.id);
    return {
      project: toProject(row),
      lines: (linesBy.get(row.id) ?? []).map(toLine),
      documents: mergeDocs(ALL_DOC_KEYS, docsBy.get(row.id) ?? []),
      process: toProcess(row.id, procBy.get(row.id), procDocsBy.get(row.id) ?? []),
      settlementRaw: toSettlementRaw(row.id, settlementRow),
      collected: toCollected(settlementRow),
      court: row.court as Court,
      lastProgressAt: row.lastProgressAt,
    };
  });
}


/**
 * 한백 전용 쓰기의 마지막 방어선.
 *
 * 라우트에서 requireAdmin() 으로 이미 막지만 여기서 한 번 더 본다 —
 * 나중에 새 라우트를 추가할 때 가드를 빠뜨리면 이 계층이 잡아준다.
 */
function assertAdmin(actor: Actor, what: string): void {
  if (actor.role !== 'admin') {
    throw new Error(`${what}는 한백 관리자만 할 수 있습니다.`);
  }
}

/**
 * 권한을 SQL 로 내린다 — 전부 읽어와 화면에서 가리는 방식은 쓰지 않는다.
 * admin 은 조건 없음, 협력사는 영업사·시공사 중 하나가 자기 소속인 현장만.
 */
function accessWhere(viewer: Viewer) {
  if (viewer.role === 'admin') return undefined;
  // 소속 없는 협력사 계정은 볼 현장이 없다. 조건을 비우면 전부 보이므로 명시적으로 막는다.
  if (!viewer.org) return sql`false`;
  return or(eq(projects.salesOrg, viewer.org), eq(projects.gcOrg, viewer.org));
}

/**
 * 현재 최대 순번. 반드시 번호 배정 락을 잡은 트랜잭션 안에서 부른다.
 *
 * 문자열 max 를 쓰면 안 된다 — 사전순이라 999 를 넘기는 순간
 * 'HB-2026-999' > 'HB-2026-1000' 이 되어 번호가 되감긴다.
 * 마지막 대시 뒤를 정수로 바꿔서 비교한다.
 */
async function maxSeqIn(tx: TxLike): Promise<number> {
  const [row] = await tx
    .select({
      maxSeq: sql<number | null>`max(nullif(split_part(${projects.id}, '-', 3), '')::int)`,
    })
    .from(projects);

  /*
   * 집계 쿼리는 표가 비어 있어도 한 줄(NULL)을 돌려준다.
   * 그래서 행이 아예 없다는 것은 「표가 비었다」가 아니라 「쿼리가 제대로 돌지 않았다」는 뜻이다.
   * 이걸 0 으로 떨어뜨리면 이미 057 이 있는데 001 을 발급하는 사고가 난다 — 실제로 겪었다.
   */
  if (!row) throw new Error('현장 번호를 읽지 못했습니다. 다시 시도해주세요.');
  return row.maxSeq ?? 0;
}

export const pgRepository: ProjectRepository = {
  async listProjects(viewer: Viewer): Promise<ProjectSummary[]> {
    if (viewer.role !== 'admin' && !viewer.org) return [];
    const rows = await getDb().select().from(projects).where(accessWhere(viewer));
    const records = await recordsOf(rows);
    return records.map(summaryOf).sort(byStalled);
  },

  async listSettlements(viewer: Viewer): Promise<SettlementSummary[]> {
    // 관리자가 아니면 금액을 읽어오지도 않는다
    if (viewer.role !== 'admin') return [];
    const rows = await getDb().select().from(projects);
    const records = await recordsOf(rows);
    return records
      .map(settlementSummaryOf)
      .sort((a, b) => b.planTotal - a.planTotal);
  },

  async getProject(id: string, viewer: Viewer): Promise<ProjectDetail | null> {
    const rows = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
    const row = rows[0];
    // 권한은 여기서도 한 번 더 본다 — id 를 직접 넣어 남의 현장을 열 수 있어서는 안 된다
    if (!row || !canAccessProject(viewer.role, viewer.org, row)) return null;
    const [record] = await recordsOf([row]);
    if (!record) return null;

    /*
     * 진행현황은 상세를 열 때만 읽는다 — 목록·보드는 쓰지 않으므로 recordsOf 에 넣지 않는다.
     * 넣으면 현장 138건을 그릴 때마다 쓰지도 않는 메모를 다 긁어온다.
     */
    const noteRows = await getDb()
      .select()
      .from(projectNotes)
      .where(eq(projectNotes.projectId, id))
      .orderBy(desc(projectNotes.at));
    const stamp = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');
    record.notes = noteRows.map((n) => ({
      id: n.id,
      author: n.author,
      body: n.body,
      at: stamp(n.at),
      editedAt: n.editedAt ? stamp(n.editedAt) : null,
    }));

    // 금액을 브라우저로 보내기 전에 지운다 — 화면에서 가리는 것만으로는 소스에 남는다
    return redactForViewer(toDetail(record), effectiveVisibility(viewer.role, viewer.org, row));
  },

  async listPayouts(viewer: Viewer): Promise<PayoutRow[]> {
    const rows = await getDb().select().from(projects).where(accessWhere(viewer));
    const records = await recordsOf(rows);
    return records.flatMap((r) => payoutRowsOf(r, viewer));
  },

  async createProject(draft: IntakeDraft, actor): Promise<string> {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    return db.transaction(async (tx) => {
      /*
       * 번호 배정을 직렬화한다.
       *
       * 이 락이 없으면 동시 접수가 같은 max 를 읽어 같은 번호로 달려들고, 하나만 성공한 뒤
       * 나머지가 재시도로 서로를 막는다(실측: 한 요청이 180초). 재시도로 때울 문제가 아니라
       * 겹치지 않게 만드는 게 맞다.
       *
       * ★트랜잭션 스코프 락이어야 한다★ — 커밋·롤백 때 자동으로 풀린다.
       * 세션 스코프(pg_advisory_lock)를 쓰면 Transaction pooler 가 커넥션을 다른 클라이언트에게
       * 넘길 때 락이 따라가서 영구히 잠긴다.
       *
       * 접수는 사람이 하는 동작이라 직렬화해도 처리량 문제가 없다.
       */
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hb_project_id'))`);

      const id = `HB-2026-${String((await maxSeqIn(tx)) + 1).padStart(3, '0')}`;

      await tx.insert(projects).values({
        id,
        mgmtNo: id,
        cpo: draft.cpo,
        /*
         * 협력사가 접수하면 접수자의 소속이 영업사·시공사다 — 그래야 자기 현장으로 보인다.
         * ★협력사가 보낸 업체명은 쓰지 않는다★ — 남의 회사 이름을 넣어 남의 현장을 만들 수
         * 있으면 안 된다. 한백이 대신 접수할 때만 적어 넣는다(계정 없는 업체의 1건).
         */
        salesOrg: actor.role === 'admin' ? normalizeOrg(draft.salesOrg) : actor.org,
        gcOrg: actor.role === 'admin' ? normalizeOrg(draft.gcOrg) : actor.org,
        name: draft.name,
        addr: draft.addr,
        bldgType: draft.bldgType,
        contractParty: draft.contractParty,
        parkTotal: draft.parkTotal,
        mgr: draft.mgr,
        tel: draft.tel,
        mail: draft.mail,
        preInstall: draft.preInstall,
        preNote: draft.preNote,
        // 접수 때는 아직 조사 전이다 — 판독이 「있음」이라 적어도 사람이 확인해야 한다
        preChecked: false,
        powerType: draft.powerType,
        replType: draft.replType,
        bizType: draft.bizType,
        // 환경부 대기번호는 접수 뒤에 나온다 — 한백이 콘솔에서 채운다
        envQueueNo: null,
        note: draft.note,
        // 정산 규칙은 한백이 검수 단계에서 현장별로 적용한다
        settlementRuleId: null,
        settlementAppliedAt: null,
        court: '한백', // 접수하면 공이 한백으로 넘어간다 (검수 차례)
        lastProgressAt: today,
      });

      if (draft.lines.length > 0) {
        await tx.insert(contractLines).values(
          draft.lines.map((l, i) => ({
            id: `${id}-L${i + 1}`,
            projectId: id,
            termYears: l.termYears,
            qty: l.qty,
            powerType: l.powerType,
            replType: l.replType,
            memo: l.memo,
            // 단가 케이스는 한백이 검수 후 지정한다
            pricingRuleId: null,
            pricedAt: null,
          }))
        );
      }

      // 올라온 서류만 행으로 남긴다. 안 올라온 칸은 조회할 때 mergeDocs 가 채운다.
      if (draft.documents.length > 0) {
        await tx.insert(documents).values(
          draft.documents.map((d) => ({
            projectId: id,
            kind: d.kind,
            filename: d.filename,
            status: 'uploaded', // 검수 대기 — 승인은 한백이 한다
            uploadedBy: actor.name,
            uploadedAt: today,
          }))
        );
      }

      await tx.insert(processes).values({ projectId: id });
      await tx.insert(settlements).values({ projectId: id });

      await writeAudit(tx, { projectId: id, actor, action: '접수', newValue: draft.name });

      return id;
    });
  },

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

      /*
       * 올라오지 않은 서류는 검수할 수 없다.
       * 조회 화면은 15칸을 모두 그리지만(mergeDocs), 행이 없는 칸은 「미제출」이라
       * 승인·반려의 대상이 아니다. 여기서 막지 않으면 없는 서류가 승인된 것으로 남는다.
       */
      if (!row || row.status === 'none') {
        throw new Error('제출되지 않은 서류는 검수할 수 없습니다.');
      }
      if (row.status === input.status && (row.rejectReason ?? null) === (input.reason?.trim() || null)) {
        return; // 같은 값이면 로그를 남기지 않는다
      }

      await tx
        .update(documents)
        .set({
          status: input.status,
          // 반려가 아니면 사유를 지운다 — 남겨두면 통과 상태인데 반려사유가 함께 뜬다
          rejectReason: input.status === 'rejected' ? input.reason!.trim() : null,
        })
        .where(and(eq(documents.projectId, input.projectId), eq(documents.kind, input.kind)));

      // 검수는 진척이다 — 정체일 계산의 기준을 갱신한다
      await tx
        .update(projects)
        .set({ lastProgressAt: new Date().toISOString().slice(0, 10) })
        .where(eq(projects.id, input.projectId));

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

  async addNote(input, actor): Promise<void> {
    const body = input.body.trim();
    if (!body) throw new Error('내용을 입력해주세요.');
    if (body.length > 2000) throw new Error('한 번에 2000자까지 남길 수 있습니다.');

    const db = getDb();
    await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id, salesOrg: projects.salesOrg, gcOrg: projects.gcOrg })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!project) throw new Error('현장을 찾을 수 없습니다.');
      // 남의 현장에는 남길 수 없다. 라우트에서도 보지만 여기서 한 번 더 본다.
      if (!canAccessProject(actor.role, actor.org, project)) {
        throw new Error('이 현장에 남길 권한이 없습니다.');
      }

      await tx.insert(projectNotes).values({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        // 사람 이름이 아니라 소속을 남긴다 — 회사마다 계정이 하나라 이름이 늘 같다
        author: actor.role === 'admin' ? '한백' : actor.org ?? '협력사',
        body,
      });

      /*
       * 진행현황을 남기는 것은 진척이다 — 정체일 기준을 갱신한다.
       * 「14일째 그대로」인 현장에 사정을 적었으면, 멈춘 것이 아니라 알고 있는 상태다.
       */
      await tx
        .update(projects)
        .set({ lastProgressAt: new Date().toISOString().slice(0, 10) })
        .where(eq(projects.id, input.projectId));
    });
  },

  async editNote(input, actor): Promise<void> {
    const body = input.body.trim();
    if (!body) throw new Error('내용을 입력해주세요.');
    if (body.length > 2000) throw new Error('한 번에 2000자까지 남길 수 있습니다.');

    const db = getDb();
    await db.transaction(async (tx) => {
      const [note] = await tx
        .select()
        .from(projectNotes)
        .where(and(eq(projectNotes.id, input.noteId), eq(projectNotes.projectId, input.projectId)))
        .limit(1);
      if (!note) throw new Error('없는 기록입니다.');

      /*
       * 자기가 쓴 것만 고친다. 사람 이름을 안 남기므로 판정 기준은 글에 적힌 소속이다 —
       * 한백은 한백이 쓴 것, 협력사는 자기 회사가 쓴 것.
       */
      const mine = actor.role === 'admin' ? '한백' : actor.org ?? '협력사';
      if (note.author !== mine) throw new Error('남이 남긴 기록은 고칠 수 없습니다.');
      if (note.body === body) return; // 같은 내용이면 고친 흔적을 남기지 않는다

      await tx
        .update(projectNotes)
        .set({ body, editedAt: new Date() })
        .where(eq(projectNotes.id, input.noteId));
    });
  },

  async deleteDocument(input, actor): Promise<{ blobUrl: string | null }> {
    assertAdmin(actor, '서류 삭제');

    const db = getDb();
    return db.transaction(async (tx) => {
      // 계약 서류와 공정 서류는 다른 표에 산다 — uploadDocument 와 같은 기준으로 가른다
      const table = isProcessDocKind(input.kind) ? processDocuments : documents;
      const where = and(eq(table.projectId, input.projectId), eq(table.kind, input.kind));

      const [row] = await tx
        .select({ filename: table.filename, blobUrl: table.blobUrl, status: table.status })
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

      return { blobUrl: row.blobUrl ?? null };
    });
  },

  async setLinePricing(lineId, pricingRuleId, actor): Promise<void> {
    assertAdmin(actor, '단가 케이스 지정');

    const db = getDb();
    await db.transaction(async (tx) => {
      const [line] = await tx
        .select({ id: contractLines.id, projectId: contractLines.projectId, ruleId: contractLines.pricingRuleId })
        .from(contractLines)
        .where(eq(contractLines.id, lineId))
        .limit(1);
      if (!line) throw new Error('계약 라인을 찾을 수 없습니다.');

      // 없는 케이스를 붙이면 조회할 때 rule 이 null 이 되어 「단가 미지정」으로 보인다.
      // 저장은 됐는데 화면엔 안 붙는 상태라 원인을 찾기 어렵다 — 여기서 막는다.
      if (pricingRuleId) {
        const [rule] = await tx
          .select({ id: pricingRules.id, active: pricingRules.active })
          .from(pricingRules)
          .where(eq(pricingRules.id, pricingRuleId))
          .limit(1);
        if (!rule) throw new Error('없는 단가 케이스입니다.');
        if (!rule.active) throw new Error('중지된 단가 케이스는 지정할 수 없습니다.');
      }
      if (line.ruleId === pricingRuleId) return;

      const today = new Date().toISOString().slice(0, 10);
      await tx
        .update(contractLines)
        .set({ pricingRuleId, pricedAt: pricingRuleId ? today : null })
        .where(eq(contractLines.id, lineId));
      await tx.update(projects).set({ lastProgressAt: today }).where(eq(projects.id, line.projectId));

      await writeAudit(tx, {
        projectId: line.projectId, actor, action: '단가 케이스 지정',
        field: lineId, oldValue: line.ruleId, newValue: pricingRuleId,
      });
    });
  },

  async setPayment(projectId, patch: PaymentPatch, actor): Promise<void> {
    assertAdmin(actor, '지급 정보 저장');
    const fields = Object.keys(patch) as Array<keyof PaymentPatch>;
    if (fields.length === 0) return;

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(settlements).where(eq(settlements.projectId, projectId)).limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');

      const changed = fields.filter((f) => (row[f] ?? null) !== (patch[f] ?? null));
      if (changed.length === 0) return;

      await tx.update(settlements).set(patch).where(eq(settlements.projectId, projectId));
      await tx
        .update(projects)
        .set({ lastProgressAt: new Date().toISOString().slice(0, 10) })
        .where(eq(projects.id, projectId));

      for (const f of changed) {
        await writeAudit(tx, {
          projectId, actor, action: '지급 정보 변경',
          field: f, oldValue: row[f] ?? null, newValue: patch[f] ?? null,
        });
      }
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
      const proc = isProcessDocKind(input.kind);
      const today = new Date().toISOString().slice(0, 10);

      if (proc) {
        const [before] = await tx
          .select({ filename: processDocuments.filename })
          .from(processDocuments)
          .where(and(
            eq(processDocuments.projectId, input.projectId),
            eq(processDocuments.kind, input.kind)
          ))
          .limit(1);

        const row = {
          projectId: input.projectId,
          kind: input.kind,
          filename: input.filename,
          blobUrl: input.blobUrl,
          status: 'uploaded',
          uploadedBy: actor.name,
          uploadedAt: today,
        };
        await tx
          .insert(processDocuments)
          .values(row)
          .onConflictDoUpdate({
            target: [processDocuments.projectId, processDocuments.kind],
            set: row,
          });
        await tx
          .update(projects)
          .set({ lastProgressAt: today })
          .where(eq(projects.id, input.projectId));
        await writeAudit(tx, {
          projectId: input.projectId, actor,
          action: '공정 서류 올림', field: `process.${input.kind}`,
          oldValue: before?.filename ?? null, newValue: input.filename,
        });
        return;
      }

      const [before] = await tx
        .select({ status: documents.status })
        .from(documents)
        .where(and(eq(documents.projectId, input.projectId), eq(documents.kind, input.kind)))
        .limit(1);

      const row = {
        projectId: input.projectId,
        kind: input.kind,
        filename: input.filename,
        blobUrl: input.blobUrl,
        // 다시 올리면 반려가 풀린다 — 반려 상태로 남겨두면 고쳐도 계약이 안 넘어간다
        status: 'uploaded',
        rejectReason: null,
        uploadedBy: actor.name,
        uploadedAt: today,
      };
      await tx
        .insert(documents)
        .values(row)
        .onConflictDoUpdate({ target: [documents.projectId, documents.kind], set: row });

      // 서류가 올라오면 공이 한백으로 넘어간다 (검수 차례)
      await tx
        .update(projects)
        .set({ court: '한백', lastProgressAt: today })
        .where(eq(projects.id, input.projectId));

      await writeAudit(tx, {
        projectId: input.projectId, actor,
        action: before?.status === 'rejected' ? '서류 재업로드' : '서류 업로드',
        field: input.kind, oldValue: before?.status ?? 'none', newValue: 'uploaded',
      });
    });
  },

  async setEnvQueueNo(projectId, value, actor): Promise<void> {
    assertAdmin(actor, '환경부 대기번호 입력');

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ envQueueNo: projects.envQueueNo })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');
      if (row.envQueueNo === value) return;

      await tx
        .update(projects)
        .set({ envQueueNo: value, lastProgressAt: new Date().toISOString().slice(0, 10) })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: '환경부 대기번호 변경',
        field: 'envQueueNo', oldValue: row.envQueueNo, newValue: value,
      });
    });
  },

  async updateProcess(projectId, patch: ProcessPatch, actor): Promise<void> {
    assertAdmin(actor, '공정 날짜 입력');
    const fields = Object.keys(patch) as Array<keyof ProcessPatch>;
    if (fields.length === 0) return;

    const db = getDb();
    await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) throw new Error('현장을 찾을 수 없습니다.');

      const [before] = await tx
        .select()
        .from(processes)
        .where(eq(processes.projectId, projectId))
        .limit(1);

      // 공정 행이 없는 현장이 있다 — update 는 0행을 조용히 지나가므로 없으면 만들어 넣는다
      if (before) {
        await tx.update(processes).set(patch).where(eq(processes.projectId, projectId));
      } else {
        await tx.insert(processes).values({ projectId, ...patch });
      }
      await tx
        .update(projects)
        .set({ lastProgressAt: new Date().toISOString().slice(0, 10) })
        .where(eq(projects.id, projectId));

      for (const f of fields) {
        await writeAudit(tx, {
          projectId, actor, action: '공정 날짜 변경',
          field: f,
          oldValue: (before?.[f as keyof typeof before] as string | null) ?? null,
          newValue: patch[f] ?? null,
        });
      }
    });
  },

  async setProcessStatus(projectId, status, actor): Promise<void> {
    assertAdmin(actor, '진행 단계 옮기기');

    const rows = await getDb().select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!rows[0]) throw new Error('현장을 찾을 수 없습니다.');
    const [record] = await recordsOf(rows);
    if (!record) throw new Error('현장을 찾을 수 없습니다.');
    if (record.process.status === status) return;

    // 계약이 끝나지 않은 현장은 공정에 없다 — 상세의 시공 탭이 잠기는 것과 같은 규칙이다
    if (toDetail(record).stage === 'intake') {
      throw new Error('계약이 끝나기 전에는 진행 단계를 옮길 수 없습니다.');
    }
    const entry = canEnter(status, record.process);
    if (!entry.ok) throw new Error(`${status} 로 넘기려면 ${entry.blockedBy} 이(가) 필요합니다.`);

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ status: processes.status })
        .from(processes)
        .where(eq(processes.projectId, projectId))
        .limit(1);
      /*
       * 공정 행이 없는 현장이 있다 — 접수만 되고 아직 공정이 만들어지지 않은 경우다.
       * update 는 0행을 조용히 지나가므로 없으면 만들어 넣는다.
       */
      if (row) {
        if (row.status === status) return;
        await tx.update(processes).set({ status }).where(eq(processes.projectId, projectId));
      } else {
        await tx.insert(processes).values({ projectId, status });
      }
      await tx
        .update(projects)
        .set({ lastProgressAt: new Date().toISOString().slice(0, 10) })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: '진행 단계 변경',
        field: 'process.status', oldValue: row?.status ?? null, newValue: status,
      });
    });
  },

  async setPreInstall(projectId, patch, actor): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: projects.id, salesOrg: projects.salesOrg, gcOrg: projects.gcOrg,
          preInstall: projects.preInstall, preNote: projects.preNote, preChecked: projects.preChecked,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');
      // 조사는 현장에 가는 쪽이 한다 — 그 현장의 협력사와 한백만
      if (!canAccessProject(actor.role, actor.org, row)) {
        throw new Error('이 현장의 기설치를 적을 권한이 없습니다.');
      }

      const next = {
        preInstall: patch.preInstall ?? (row.preInstall as PreInstall),
        preNote: 'preNote' in patch ? (patch.preNote?.trim() || null) : row.preNote,
        preChecked: patch.preChecked ?? row.preChecked,
      };
      if (
        next.preInstall === row.preInstall
        && next.preNote === row.preNote
        && next.preChecked === row.preChecked
      ) return;

      const today = new Date().toISOString().slice(0, 10);
      await tx
        .update(projects)
        // 조사는 진척이다 — 정체일 기준을 갱신한다
        .set({ ...next, lastProgressAt: today })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: '기설치 조사',
        field: 'preInstall',
        oldValue: `${row.preInstall}${row.preChecked ? ' (확인)' : ''}`,
        newValue: `${next.preInstall}${next.preChecked ? ' (확인)' : ''}`,
      });
    });
  },

  async setOrgs(projectId, patch, actor): Promise<void> {
    assertAdmin(actor, '영업사·시공사 지정');

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ salesOrg: projects.salesOrg, gcOrg: projects.gcOrg })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');

      const next = {
        salesOrg: 'salesOrg' in patch ? normalizeOrg(patch.salesOrg) : row.salesOrg,
        gcOrg: 'gcOrg' in patch ? normalizeOrg(patch.gcOrg) : row.gcOrg,
      };
      if (next.salesOrg === row.salesOrg && next.gcOrg === row.gcOrg) return;

      await tx.update(projects).set(next).where(eq(projects.id, projectId));

      /*
       * 소유권이 바뀌면 누가 이 현장을 보는지가 바뀐다 — 반드시 남긴다.
       * 정체일 기준은 건드리지 않는다. 소속을 고치는 것은 현장의 진척이 아니다.
       */
      if (next.salesOrg !== row.salesOrg) {
        await writeAudit(tx, {
          projectId, actor, action: '영업사 지정',
          field: 'salesOrg', oldValue: row.salesOrg, newValue: next.salesOrg,
        });
      }
      if (next.gcOrg !== row.gcOrg) {
        await writeAudit(tx, {
          projectId, actor, action: '시공사 지정',
          field: 'gcOrg', oldValue: row.gcOrg, newValue: next.gcOrg,
        });
      }
    });
  },

  async setCourt(projectId, court, actor): Promise<void> {
    assertAdmin(actor, '공 차례 넘기기');

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ court: projects.court })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');
      if (row.court === court) return;

      await tx
        .update(projects)
        .set({ court, lastProgressAt: new Date().toISOString().slice(0, 10) })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: '공 차례 변경',
        field: 'court', oldValue: row.court, newValue: court,
      });
    });
  },
};

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
import { allSlots } from './db-slot';
import { dayOf, stampOf, today } from '@/lib/date';
import {
  contractLines, documents, payoutEntries, pricingRules, processDocuments, processes,
  projectNotes, projects, settlementRules, settlements,
} from '@/lib/db/schema';
import type {
  BizType, BuildingType, ContractLine, ContractParty, Court, CpoName, DocStatus,
  IntakeDraft, LineAxes, NewPayoutEntry, PayoutCategory, PayoutEntry, PayoutKind, PayoutRow,
  PowerType, PreInstall, PricingRule, ProcessInfo, Project,
  ProjectDetail, ProjectDocument, ProjectSummary, ReplType, Settlement, SettlementRule,
  SettlementStepRule, SettlementSummary,
} from '@/types/project';
import type { Viewer } from '@/lib/auth/types';
import { canAccessProject, effectiveVisibility, normalizeOrg } from '@/lib/roles';
import { needsPreInstallCheck, PROCESS_DOCS } from '@/lib/doc-rules';
import {
  asProcessStatus, assertProcessWrite, canEnter, CHECK_ADVANCES, COURT_AFTER_STATUS, statusIndex,
} from '@/lib/process';
import type { Actor, PaymentPatch, ProcessPatch, ProjectRepository } from './repository';
import { checkPricingRule, duplicateOf, normalizePricingRule, pricingRuleId } from '@/lib/pricing-match';
import {
  checkPayoutEntry, payoutPrerequisiteBlockersOf, payoutReleaseOf, payoutSideOf, payoutStepsOf,
  settlementRuleIdOf, settlementRuleNameOf, settlementStepsKeyOf,
} from '@/lib/settlement';
import {
  ALL_DOC_KEYS, byStalled, contractStateFor, isProcessDocKind, payoutRowsOf, redactForViewer,
  payoutMilestonesFor, settlementSummaryOf,
  summaryOf, toDetail, type ProjectRecord, type RuleMap, type SettleMap,
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

/** 단가 케이스 한 행 — jsonb 두 칸(termYears·bldgTypes)만 배열이다 */
function rowToRule(r: typeof pricingRules.$inferSelect): PricingRule {
  return {
    id: r.id,
    caseName: r.caseName,
    cpo: r.cpo as CpoName,
    bizType: r.bizType as BizType,
    powerType: r.powerType as PricingRule['powerType'],
    termYears: r.termYears as number[],
    bldgTypes: r.bldgTypes as BuildingType[],
    replType: r.replType as ReplType,
    channel: r.channel as PricingRule['channel'],
    bizYear: r.bizYear,
    startDate: r.startDate,
    salesUnit: r.salesUnit,
    consUnit: r.consUnit,
    margin: r.margin,
    defaultSettlementRuleId: r.defaultSettlementRuleId ?? '',
    supervisionBearer: r.supervisionBearer,
    safetyFeeBearer: r.safetyFeeBearer,
    note: r.note,
    active: r.active,
  };
}

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
    preRejectReason: r.preRejectReason,
    powerType: r.powerType as PowerType | null,
    replType: r.replType as ReplType | null,
    bizType: r.bizType as BizType | null,
    bizYear: r.bizYear,
    envQueueNo: r.envQueueNo,
    note: r.note,
    contractConfirmedAt: r.contractConfirmedAt,
    createdAt: dayOf(r.createdAt),
    settlementRuleId: r.settlementRuleId,
    settlementAppliedAt: r.settlementAppliedAt,
    // 옛 이름 DROP — 계약중단으로 읽는다
    holdState: (r.holdState === 'DROP' ? '계약중단' : r.holdState) as Project['holdState'],
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
    cpoSubmitDate: r?.cpoSubmitDate ?? null,
    cpoApprovalDate: r?.cpoApprovalDate ?? null,
    chargerOrderDate: r?.chargerOrderDate ?? null,
    chargerShipDate: r?.chargerShipDate ?? null,
    chargerRecvDate: r?.chargerRecvDate ?? null,
    startPlanDate: r?.startPlanDate ?? null,
    startActualDate: r?.startActualDate ?? null,
    installDoneDate: r?.installDoneDate ?? null,
    installedSpots: r?.installedSpots ?? null,
    installedUnits: r?.installedUnits ?? null,
    commDoneDate: r?.commDoneDate ?? null,
    openDate: r?.openDate ?? null,
    notifyDate: r?.notifyDate ?? null,
    chargerQty: r?.chargerQty ?? null,
    modemQty: r?.modemQty ?? null,
    notifyDoneAt: r?.notifyDoneAt ?? null,
    chargerDoneAt: r?.chargerDoneAt ?? null,
    installConfirmedAt: r?.installConfirmedAt ?? null,
    openDoneAt: r?.openDoneAt ?? null,
    completionSubmitAt: r?.completionSubmitAt ?? null,
    docs: mergeDocs(PROCESS_DOC_KEYS, docRows),
    status: asProcessStatus(r?.status),
    memo: r?.memo ?? null,
  };
}

function toSettlementRaw(projectId: string, r: SettlementRow | undefined): Omit<Settlement, 'steps'> {
  return {
    projectId,
    cpoCloseDate: r?.closeDate ?? null,
    safetyFee: r?.safetyFee ?? null,
    payNote: r?.payNote ?? null,
  };
}

function toPayoutEntry(r: typeof payoutEntries.$inferSelect): PayoutEntry {
  return {
    id: r.id,
    projectId: r.projectId,
    kind: r.kind as PayoutKind,
    category: r.category as PayoutCategory,
    amount: r.amount,
    at: r.at,
    note: r.note ?? null,
    createdAt: r.createdAt,
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

  // 여섯 방을 한꺼번에 던지면 풀보다 많아 큐가 막힌다 — 슬롯 안에서 돈다(db-slot)
  const [lineRows, docRows, procRows, procDocRows, settlementRows, payoutRows] = await allSlots([
    () => db.select().from(contractLines).where(inArray(contractLines.projectId, ids)),
    () => db.select().from(documents).where(inArray(documents.projectId, ids)),
    () => db.select().from(processes).where(inArray(processes.projectId, ids)),
    () => db.select().from(processDocuments).where(inArray(processDocuments.projectId, ids)),
    () => db.select().from(settlements).where(inArray(settlements.projectId, ids)),
    () => db.select().from(payoutEntries).where(inArray(payoutEntries.projectId, ids)),
  ] as const);

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
  const payoutsBy = group(payoutRows);
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
      payoutEntries: (payoutsBy.get(row.id) ?? []).map(toPayoutEntry),
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

/**
 * 단가 케이스 표 — DB 가 정본이다.
 *
 * 서른 몇 행짜리 작은 표라 화면마다 통째로 읽어도 된다. 캐시를 두면 화면에서 케이스를
 * 추가한 직후 옛 표가 보이는 일이 생기고, 그게 왜 그런지 알 수 없다.
 */
async function ruleMap(): Promise<RuleMap> {
  const rows = await getDb().select().from(pricingRules);
  return new Map(rows.map((r) => [r.id, rowToRule(r)]));
}

/** 정산 규칙 한 행 — steps 는 jsonb */
function rowToSettle(r: typeof settlementRules.$inferSelect): SettlementRule {
  return {
    id: r.id,
    name: r.name,
    steps: r.steps as SettlementStepRule[],
    note: r.note,
    active: r.active,
  };
}

/**
 * 정산 규칙 표 — 단가 케이스처럼 DB 가 정본이다.
 *
 * 예전에는 코드 시드(SETTLEMENT_RULE_BY_ID)를 읽었는데, 케이스가 기성 단계를 직접
 * 정의하면서 규칙이 화면에서도 생긴다 — 코드에 없는 규칙이 현장에 붙으면 기성이
 * 영구히 「미적용」으로 보이는 갈림이 케이스 때 실제로 있었다.
 */
async function settleMap(): Promise<SettleMap> {
  const rows = await getDb().select().from(settlementRules);
  return new Map(rows.map((r) => [r.id, rowToSettle(r)]));
}

/**
 * 기성 단계 → 정산 규칙 id. 케이스 추가·수정이 같이 쓴다.
 *
 * 같은 단계의 규칙이 있으면 그것을 붙인다 — 규칙은 이름이 아니라 단계가 정체라서,
 * 모양이 같은데 행이 둘이면 현장 상세의 규칙 고르기에 같은 것이 두 줄로 뜬다.
 * id 는 단계에서 유도되므로(해시) 동시 생성도 같은 행으로 모인다 — PK 위반이면
 * 부르는 쪽의 재시도가 다시 찾는다. 빈 단계는 「기성 미정」 — 규칙 없이 null 이다.
 */
async function resolveSettlementRule(
  tx: TxLike,
  steps: SettlementStepRule[],
  actor: Actor
): Promise<string | null> {
  if (steps.length === 0) return null;
  const key = settlementStepsKeyOf(steps);
  const settles = await tx.select().from(settlementRules);
  const same = settles.find((s) => settlementStepsKeyOf(s.steps as SettlementStepRule[]) === key);
  if (same) return same.id;

  const id = settlementRuleIdOf(steps);
  const name = settlementRuleNameOf(steps);
  await tx.insert(settlementRules).values({ id, name, steps, note: null, active: true });
  await writeAudit(tx, {
    projectId: null, actor, action: '정산 규칙 추가',
    field: id, oldValue: null, newValue: name,
  });
  return id;
}

/**
 * 완료 체크 뒤의 자동 전이 — 체크가 여는 단계(CHECK_ADVANCES)의 조건이 차 있으면
 * 다음 한 걸음만 저절로 간다. 시공사의 체크로도 넘어간다 — 사람이 옮기는 것이
 * 아니라 선언이 옮기는 것이라 setProcessStatus 의 한백 전용 판정을 타지 않는다.
 * 조건(canEnter)·계약 전 잠금은 똑같이 확인한다.
 */
async function advanceAfterCheck(projectId: string, patch: ProcessPatch, actor: Actor): Promise<void> {
  const field = (Object.keys(patch) as Array<keyof ProcessPatch>).find(
    (f) => f in CHECK_ADVANCES && patch[f] != null
  );
  if (!field) return;
  const target = CHECK_ADVANCES[field as keyof typeof CHECK_ADVANCES];

  const db = getDb();
  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!rows[0]) return;
  const [record] = await recordsOf(rows);
  if (!record) return;

  const cur = record.process.status;
  if (statusIndex(target) !== statusIndex(cur) + 1) return;      // 바로 다음 한 걸음만
  if (!canEnter(target, record.process).ok) return;              // 조건이 아직 안 찼다
  if (toDetail(record, await ruleMap(), await settleMap()).stage === 'intake') return;

  await db.transaction(async (tx) => {
    await tx.update(processes).set({ status: target }).where(eq(processes.projectId, projectId));
    await tx
      .update(projects)
      .set({ lastProgressAt: today(), court: COURT_AFTER_STATUS[target] })
      .where(eq(projects.id, projectId));
    await writeAudit(tx, {
      projectId, actor, action: '진행 단계 변경 (완료 체크)',
      field: 'process.status', oldValue: cur, newValue: target,
    });
  });
}

export const pgRepository: ProjectRepository = {
  async listProjects(viewer: Viewer): Promise<ProjectSummary[]> {
    if (viewer.role !== 'admin' && !viewer.org) return [];
    const rows = await getDb().select().from(projects).where(accessWhere(viewer));
    const [records, [rules, settles]] = await Promise.all([
      recordsOf(rows),
      allSlots([() => ruleMap(), () => settleMap()] as const),
    ]);
    return records.map((r) => summaryOf(r, rules, settles)).sort(byStalled);
  },

  async listSettlements(viewer: Viewer): Promise<SettlementSummary[]> {
    // 관리자가 아니면 금액을 읽어오지도 않는다
    if (viewer.role !== 'admin') return [];
    const rows = await getDb().select().from(projects);
    const [records, [rules, settles]] = await Promise.all([
      recordsOf(rows),
      allSlots([() => ruleMap(), () => settleMap()] as const),
    ]);
    return records
      .map((r) => settlementSummaryOf(r, rules, settles))
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
    record.notes = noteRows.map((n) => ({
      id: n.id,
      author: n.author,
      body: n.body,
      at: stampOf(n.at),
      editedAt: n.editedAt ? stampOf(n.editedAt) : null,
    }));

    // 금액을 브라우저로 보내기 전에 지운다 — 화면에서 가리는 것만으로는 소스에 남는다
    const [rules, settles] = await allSlots([() => ruleMap(), () => settleMap()] as const);
    return redactForViewer(
      toDetail(record, rules, settles),
      effectiveVisibility(viewer.role, viewer.org, row)
    );
  },

  async listPayouts(viewer: Viewer): Promise<PayoutRow[]> {
    const rows = await getDb().select().from(projects).where(accessWhere(viewer));
    const [records, [rules, settles]] = await Promise.all([
      recordsOf(rows),
      allSlots([() => ruleMap(), () => settleMap()] as const),
    ]);
    return records.flatMap((r) => payoutRowsOf(r, viewer, rules, settles));
  },

  async createProject(draft: IntakeDraft, actor): Promise<string> {
    const db = getDb();
    const day = today();

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
        // 사업연도는 접수 연도로 시작한다 — 이월 현장만 한백이 고친다
        bizYear: Number(day.slice(0, 4)),
        // 환경부 대기번호는 접수 뒤에 나온다 — 한백이 콘솔에서 채운다
        envQueueNo: null,
        note: draft.note,
        // 정산 규칙은 한백이 검수 단계에서 현장별로 적용한다
        settlementRuleId: null,
        settlementAppliedAt: null,
        court: '한백', // 접수하면 공이 한백으로 넘어간다 (검수 차례)
        lastProgressAt: day,
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
            uploadedAt: day,
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

      /*
       * 검수는 진척이다 — 정체일 계산의 기준을 갱신한다.
       *
       * 반려하면 앞서 한 계약 확인을 지운다. 반려는 「이 계약은 아직 아니다」는 판정이라
       * 그 확인을 무효로 만든다 — 보완한 뒤 한백이 다시 봐야 한다. 안 지우면 협력사가
       * 서류를 다시 올리는 순간 아무도 안 본 계약이 계약완료로 되돌아간다.
       *
       * 반려하면 공도 영업사로 넘어간다 — 보완할 차례다. 다시 올라오면 uploadDocument 가
       * 공을 한백으로 되돌린다. 이 한쪽이 없으면 반려한 뒤에도 공 차례가 「한백」으로 남아,
       * 협력사를 기다리는 현장이 한백이 막고 있는 것처럼 보인다.
       */
      await tx
        .update(projects)
        .set({
          lastProgressAt: today(),
          ...(input.status === 'rejected' ? { contractConfirmedAt: null, court: '영업사' } : {}),
        })
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
        .set({ lastProgressAt: today() })
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
      let suggestedSettlement: string | null = null;
      if (pricingRuleId) {
        const [rule] = await tx
          .select({
            id: pricingRules.id,
            active: pricingRules.active,
            settle: pricingRules.defaultSettlementRuleId,
          })
          .from(pricingRules)
          .where(eq(pricingRules.id, pricingRuleId))
          .limit(1);
        if (!rule) throw new Error('없는 단가 케이스입니다.');
        if (!rule.active) throw new Error('중지된 단가 케이스는 지정할 수 없습니다.');
        suggestedSettlement = rule.settle;
      }
      if (line.ruleId === pricingRuleId) return;

      const day = today();
      await tx
        .update(contractLines)
        .set({ pricingRuleId, pricedAt: pricingRuleId ? day : null })
        .where(eq(contractLines.id, lineId));
      await tx.update(projects).set({ lastProgressAt: day }).where(eq(projects.id, line.projectId));

      /*
       * 케이스의 정산 규칙 제안값을 현장에 옮긴다 — 현장에 아직 규칙이 없을 때만.
       *
       * project.settlementRuleId 를 넣는 코드가 여기 말고는 없었다. 시드 현장만 값이 있고,
       * 새 현장은 단가를 붙여도 기성이 영구히 「정산 규칙 미적용」이었다 — 케이스가
       * 제안값(defaultSettlementRuleId)을 들고 있는데 아무도 읽지 않았다.
       * 이미 규칙이 있는 현장은 건드리지 않는다 — 사람이 정한 값을 덮지 않는다.
       */
      if (suggestedSettlement) {
        const [p] = await tx
          .select({ settle: projects.settlementRuleId })
          .from(projects)
          .where(eq(projects.id, line.projectId))
          .limit(1);
        if (p && !p.settle) {
          await tx
            .update(projects)
            .set({ settlementRuleId: suggestedSettlement, settlementAppliedAt: day })
            .where(eq(projects.id, line.projectId));
          await writeAudit(tx, {
            projectId: line.projectId, actor, action: '정산 규칙 적용',
            field: 'settlementRuleId', oldValue: null, newValue: suggestedSettlement,
          });
        }
      }

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
        .set({ lastProgressAt: today() })
        .where(eq(projects.id, projectId));

      for (const f of changed) {
        await writeAudit(tx, {
          projectId, actor, action: '지급 정보 변경',
          field: f, oldValue: row[f] ?? null, newValue: patch[f] ?? null,
        });
      }
    });
  },

  async setSettlementRule(projectId, ruleId, actor): Promise<void> {
    assertAdmin(actor, '정산 규칙 적용');
    // 조립(assemble)이 읽는 곳(DB)과 같은 표에서 확인한다 — 없는 규칙을 붙이면
    // 저장은 되는데 화면에선 「정산 규칙 미적용」으로 보인다
    if (ruleId !== null) {
      const [rule] = await getDb()
        .select({ active: settlementRules.active })
        .from(settlementRules)
        .where(eq(settlementRules.id, ruleId))
        .limit(1);
      if (!rule) throw new Error('없는 정산 규칙입니다.');
      if (!rule.active) throw new Error('중지된 정산 규칙은 적용할 수 없습니다.');
    }

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ settle: projects.settlementRuleId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');
      if (row.settle === ruleId) return;

      // lastProgressAt 은 건드리지 않는다 — 규칙을 고르는 것은 설정이지 현장의 진척이 아니다
      await tx
        .update(projects)
        .set({ settlementRuleId: ruleId, settlementAppliedAt: ruleId ? today() : null })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: ruleId ? '정산 규칙 적용' : '정산 규칙 해제',
        field: 'settlementRuleId', oldValue: row.settle, newValue: ruleId,
      });
    });
  },

  async runPayoutBatch(items, at: string, actor): Promise<{ count: number; total: number }> {
    assertAdmin(actor, '지급 확정');
    if (items.length === 0) throw new Error('지급할 항목이 없습니다.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) throw new Error('지급일은 YYYY-MM-DD 형식이어야 합니다.');

    // 금액 계산에 필요한 것: 라인 단가(계획)와 원장(조정·지급 합). 케이스는 불변이라 안전하다.
    const rules = await ruleMap();
    const ids = [...new Set(items.map((i) => i.projectId))];
    const rows = await getDb().select().from(projects).where(inArray(projects.id, ids));
    const records = new Map((await recordsOf(rows)).map((r) => [r.project.id, r]));

    const db = getDb();
    let total = 0;
    await db.transaction(async (tx) => {
      for (const item of items) {
        const r = records.get(item.projectId);
        if (!r) throw new Error(`현장을 찾을 수 없습니다 — ${item.projectId}`);
        const name = r.project.name;

        const org = item.kind === '영업비' ? r.project.salesOrg : r.project.gcOrg;
        const prerequisites = payoutPrerequisiteBlockersOf({
          kind: item.kind,
          org,
          unpriced: r.lines.filter((line) => !line.pricingRuleId).length,
          feeMissing: item.kind === '영업비' ? contractStateFor(r).feeMissing : [],
        });
        if (prerequisites.length > 0) throw new Error(`${name} ${item.kind} — ${prerequisites[0]}`);

        const plan = r.lines.reduce((n, l) => {
          const rule = l.pricingRuleId ? rules.get(l.pricingRuleId) : null;
          const unit = item.kind === '영업비' ? rule?.salesUnit : rule?.consUnit;
          return n + (unit ?? 0) * l.qty;
        }, 0);
        const { adjust, paid } = payoutSideOf(r.payoutEntries ?? [], item.kind);
        const { open } = payoutStepsOf(plan, adjust, paid);
        if (!open) throw new Error(`${name} ${item.kind} — 확정할 회차가 없습니다 (잔액 0 이거나 이미 확정됐습니다).`);
        const release = payoutReleaseOf(item.kind, open.no, payoutMilestonesFor(r));
        if (!release.met) {
          throw new Error(`${name} ${item.kind} ${open.no}차 — ${release.trigger} 후 지급할 수 있습니다.`);
        }

        // 두 번 눌러도 두 번 안 나가게 — 같은 회차 줄이 이미 있으면 배치를 통째로 세운다
        const category = `${open.no}차`;
        const [dup] = await tx
          .select({ id: payoutEntries.id })
          .from(payoutEntries)
          .where(and(
            eq(payoutEntries.projectId, item.projectId),
            eq(payoutEntries.kind, item.kind),
            eq(payoutEntries.category, category)
          ))
          .limit(1);
        if (dup) throw new Error(`${name} ${item.kind} ${category} — 이미 지급 확정된 회차입니다.`);

        await tx.insert(payoutEntries).values({
          id: crypto.randomUUID(), projectId: item.projectId,
          kind: item.kind, category, amount: open.amount, at, note: null,
          createdAt: stampOf(new Date()),
        });
        await tx.update(projects).set({ lastProgressAt: today() }).where(eq(projects.id, item.projectId));
        await writeAudit(tx, {
          projectId: item.projectId, actor, action: '지급 확정',
          field: `${item.kind} ${category}`, oldValue: null, newValue: `${open.amount}원 · ${at}`,
        });
        total += open.amount;
      }
    });
    return { count: items.length, total };
  },

  async addPayoutEntry(projectId, input: NewPayoutEntry, actor): Promise<string> {
    assertAdmin(actor, '지급 기록');
    // 회차(1차·2차)는 여기로 못 들어온다 — 금액이 정해져 있어 runPayoutBatch 가 계산해 넣는다
    const bad = checkPayoutEntry(input, { manualOnly: true });
    if (bad) throw new Error(bad);
    const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;

    const db = getDb();
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) throw new Error('현장을 찾을 수 없습니다.');

      await tx.insert(payoutEntries).values({
        id, projectId,
        kind: input.kind, category: input.category,
        amount: input.amount, at: input.at, note,
        createdAt: stampOf(new Date()),
      });
      // 지급을 적는 것도 진척이다 — 정체일 기준을 갱신한다
      await tx.update(projects).set({ lastProgressAt: today() }).where(eq(projects.id, projectId));
      await writeAudit(tx, {
        projectId, actor, action: '지급 기록 추가',
        field: `${input.kind} ${input.category}`,
        oldValue: null, newValue: `${input.amount}원 · ${input.at}${note ? ` · ${note}` : ''}`,
      });
    });
    return id;
  },

  async deletePayoutEntry(projectId, entryId, actor): Promise<void> {
    assertAdmin(actor, '지급 기록 삭제');
    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(payoutEntries)
        .where(and(eq(payoutEntries.id, entryId), eq(payoutEntries.projectId, projectId)))
        .limit(1);
      if (!row) throw new Error('지급 기록을 찾을 수 없습니다.');

      await tx.delete(payoutEntries).where(eq(payoutEntries.id, entryId));
      // 지운 값을 로그에 통째로 남긴다 — 고치기가 없는 대신 무엇이 지워졌는지는 남아야 한다
      await writeAudit(tx, {
        projectId, actor, action: '지급 기록 삭제',
        field: `${row.kind} ${row.category}`,
        oldValue: `${row.amount}원 · ${row.at}${row.note ? ` · ${row.note}` : ''}`, newValue: null,
      });
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
      const day = today();

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
        uploadedAt: day,
      };
      await tx
        .insert(documents)
        .values(row)
        .onConflictDoUpdate({ target: [documents.projectId, documents.kind], set: row });

      // 서류가 올라오면 공이 한백으로 넘어간다 (검수 차례)
      // 설치이력 파일이 곧 기설치 조사다(한백 확인) — 조사 여부를 따로 묻지 않는다
      await tx
        .update(projects)
        .set({
          court: '한백',
          lastProgressAt: day,
          ...(input.kind === 'legacylog' ? { preChecked: true } : {}),
        })
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
        .select({ envQueueNo: projects.envQueueNo, bizType: projects.bizType })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');
      /*
       * 자체투자 현장은 환경부 보조금을 받지 않으므로 대기번호가 없다.
       * 화면에서 입력칸을 주지 않지만 여기서도 막는다 — 라우트는 직접 부를 수 있다.
       */
      if (row.bizType === '자체투자' && value !== null) {
        throw new Error('자체투자 현장은 환경부 대기번호가 없습니다.');
      }
      if (row.envQueueNo === value) return;

      await tx
        .update(projects)
        .set({ envQueueNo: value, lastProgressAt: today() })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: '환경부 대기번호 변경',
        field: 'envQueueNo', oldValue: row.envQueueNo, newValue: value,
      });
    });
  },

  async setBizYear(projectId, year, actor): Promise<void> {
    assertAdmin(actor, '사업연도 입력');

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ bizYear: projects.bizYear })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');
      if (row.bizYear === year) return;

      await tx.update(projects).set({ bizYear: year }).where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: '사업연도 변경',
        field: 'bizYear',
        oldValue: row.bizYear === null ? null : String(row.bizYear),
        newValue: year === null ? null : String(year),
      });
    });
  },

  async updateProcess(projectId, patch: ProcessPatch, actor): Promise<void> {
    const fields = Object.keys(patch) as Array<keyof ProcessPatch>;
    if (fields.length === 0) return;

    const db = getDb();
    await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id, gcOrg: projects.gcOrg })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) throw new Error('현장을 찾을 수 없습니다.');

      // 한백은 전부, 그 현장의 시공사는 한백 전용 칸(환경부 승인·충전기 발주)을 뺀 전부
      assertProcessWrite(actor, project.gcOrg, fields);

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
        .set({ lastProgressAt: today() })
        .where(eq(projects.id, projectId));

      for (const f of fields) {
        // 설치 실적은 숫자다 — 로그는 글자로 남긴다
        const prev = before?.[f as keyof typeof before] ?? null;
        const next = patch[f] ?? null;
        await writeAudit(tx, {
          projectId, actor, action: '공정 입력 변경',
          field: f,
          oldValue: prev === null ? null : String(prev),
          newValue: next === null ? null : String(next),
        });
      }
    });

    // 완료 체크는 선언이자 전이다(한백 확인) — 조건이 차 있으면 다음 단계로 저절로 넘어간다
    await advanceAfterCheck(projectId, patch, actor);
  },

  async setProcessStatus(projectId, status, actor): Promise<void> {
    assertAdmin(actor, '진행 단계 옮기기');

    const rows = await getDb().select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!rows[0]) throw new Error('현장을 찾을 수 없습니다.');
    const [record] = await recordsOf(rows);
    if (!record) throw new Error('현장을 찾을 수 없습니다.');
    if (record.process.status === status) return;

    // 계약이 끝나지 않은 현장은 공정에 없다 — 상세의 시공 탭이 잠기는 것과 같은 규칙이다
    if (toDetail(record, await ruleMap(), await settleMap()).stage === 'intake') {
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
      // 상태를 옮기면 차례도 따라 넘어간다 — 다음 사람이 움직일 차례다 (lib/process.ts)
      await tx
        .update(projects)
        .set({ lastProgressAt: today(), court: COURT_AFTER_STATUS[status] })
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
          preRejectReason: projects.preRejectReason,
          bizType: projects.bizType,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');
      /*
       * 자체투자는 기설치 조사를 하지 않는다 — 환경부 보조금이 기설치 여부로 갈리기
       * 때문에 하는 조사다. 화면에서 조작을 주지 않지만 여기서도 막는다.
       */
      if (!needsPreInstallCheck(row.bizType as Project['bizType'])) {
        throw new Error('자체투자 현장은 기설치 조사를 하지 않습니다.');
      }
      // 조사는 현장에 가는 쪽이 한다 — 그 현장의 협력사와 한백만
      if (!canAccessProject(actor.role, actor.org, row)) {
        throw new Error('이 현장의 기설치를 적을 권한이 없습니다.');
      }

      /*
       * 조사 반려 — 한백이 「다시 조사해라」를 사유와 함께 되돌린다(한백 확인).
       * 사유를 적으면 조사 표시가 풀리고 공이 영업사로 넘어간다. 협력사가 조사를
       * 다시 저장하면(값 선택·확인 표시) 사유가 지워진다 — 보완이 반려를 푼다.
       */
      if (patch.preRejectReason !== undefined && actor.role !== 'admin') {
        throw new Error('기설치 조사 반려는 한백 관리자만 할 수 있습니다.');
      }
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

      const day = today();
      await tx
        .update(projects)
        // 조사는 진척이다 — 정체일 기준을 갱신한다. 반려는 보완 차례라 공이 영업사로.
        .set({ ...next, lastProgressAt: day, ...(rejecting ? { court: '영업사' } : {}) })
        .where(eq(projects.id, projectId));

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
          // 계약이 끝났다는 것은 다음 손이 시공사라는 뜻이다. 되돌리면 공도 한백으로 돌아온다.
          court: confirmed ? '시공사' : '한백',
          lastProgressAt: today(),
        })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: confirmed ? '계약 확인' : '계약 확인 취소',
        field: 'contractConfirmedAt', oldValue: before, newValue: after,
      });
    });
  },

  async listLineAxes(actor): Promise<LineAxes[]> {
    assertAdmin(actor, '단가 판정 축 조회');
    const rows = await getDb()
      .select({
        lineId: contractLines.id,
        projectId: contractLines.projectId,
        projectName: projects.name,
        cpo: projects.cpo,
        bizType: projects.bizType,
        bldgType: projects.bldgType,
        projectReplType: projects.replType,
        termYears: contractLines.termYears,
        qty: contractLines.qty,
        powerType: contractLines.powerType,
        lineReplType: contractLines.replType,
        pricingRuleId: contractLines.pricingRuleId,
      })
      .from(contractLines)
      .innerJoin(projects, eq(contractLines.projectId, projects.id));
    return rows.map((r) => ({
      lineId: r.lineId,
      projectId: r.projectId,
      projectName: r.projectName,
      cpo: r.cpo as CpoName,
      bizType: r.bizType as BizType | null,
      bldgType: r.bldgType as BuildingType | null,
      projectReplType: r.projectReplType as ReplType | null,
      termYears: r.termYears,
      qty: r.qty,
      powerType: r.powerType as LineAxes['powerType'],
      lineReplType: r.lineReplType as ReplType | null,
      pricingRuleId: r.pricingRuleId,
    }));
  },

  async listPricingRules(actor): Promise<PricingRule[]> {
    assertAdmin(actor, '단가 케이스 조회');
    const rows = await getDb().select().from(pricingRules).orderBy(pricingRules.caseName);
    return rows.map(rowToRule);
  },

  async listSettlementRules(actor): Promise<SettlementRule[]> {
    assertAdmin(actor, '정산 규칙 조회');
    const rows = await getDb().select().from(settlementRules).orderBy(settlementRules.name);
    return rows.map(rowToSettle);
  },

  async addPricingRule(input, actor): Promise<string> {
    assertAdmin(actor, '단가 케이스 추가');
    const bad = checkPricingRule(input);
    if (bad.length > 0) throw new Error(bad[0]);
    const rule = normalizePricingRule(input);

    const db = getDb();
    // ME — 같은 칸을 같은 적용 시작으로 덮는 활성 케이스가 이미 있으면 중복이다
    const existing = (await db.select().from(pricingRules)).map(rowToRule);
    const dup = duplicateOf(rule, existing);
    if (dup) {
      throw new Error(`같은 조건을 덮는 케이스가 이미 있습니다 — ${dup.caseName}. 개정이라면 적용 시작을 다르게 적어주세요.`);
    }

    /*
     * id 채번이 select-후-insert 라 같은 축의 동시 요청은 같은 id 를 계산한다 — 두 번째는
     * PK 위반으로 터지고, 그대로 두면 영문 DB 오류가 화면에 나간다. 위반이면 taken 을
     * 다시 읽어 다음 번호로 한 번 더 시도한다. 데이터는 PK 가 지키므로 겹칠 일은 없다.
     */
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await db.transaction(async (tx) => {
          const settleId = await resolveSettlementRule(tx, rule.settlementSteps, actor);

          const taken = await tx.select({ id: pricingRules.id }).from(pricingRules);
          const id = pricingRuleId(rule, new Set(taken.map((t) => t.id)));
          await tx.insert(pricingRules).values({
            id, caseName: rule.caseName, cpo: rule.cpo, bizType: rule.bizType,
            powerType: rule.powerType, termYears: rule.termYears, bldgTypes: rule.bldgTypes,
            replType: rule.replType, channel: rule.channel,
            bizYear: rule.bizYear, startDate: rule.startDate,
            salesUnit: rule.salesUnit, consUnit: rule.consUnit, margin: rule.margin,
            defaultSettlementRuleId: settleId,
            supervisionBearer: rule.supervisionBearer, safetyFeeBearer: rule.safetyFeeBearer,
            note: rule.note, active: true,
          });
          await writeAudit(tx, {
            projectId: null, actor, action: '단가 케이스 추가',
            field: id, oldValue: null, newValue: rule.caseName,
          });
          return id;
        });
      } catch (err) {
        const code = (err as { cause?: { code?: string }; code?: string }).cause?.code
          ?? (err as { code?: string }).code;
        if (code === '23505' && attempt < 2) continue;
        if (code === '23505') throw new Error('같은 케이스가 방금 만들어졌습니다. 목록을 새로고침해 확인해주세요.');
        throw err;
      }
    }
  },

  async updatePricingRule(id, input, actor): Promise<void> {
    assertAdmin(actor, '단가 케이스 수정');
    const bad = checkPricingRule(input);
    if (bad.length > 0) throw new Error(bad[0]);
    const rule = normalizePricingRule(input);

    const db = getDb();
    await db.transaction(async (tx) => {
      const all = (await tx.select().from(pricingRules)).map(rowToRule);
      const me = all.find((r) => r.id === id);
      if (!me) throw new Error('없는 단가 케이스입니다.');

      // 참조가 하나라도 있으면 수정은 소급 변경이다 — 개정(새 케이스)으로 돌려보낸다
      const [ref] = await tx
        .select({ id: contractLines.id })
        .from(contractLines)
        .where(eq(contractLines.pricingRuleId, id))
        .limit(1);
      if (ref) {
        throw new Error('이미 계약 라인이 참조하는 케이스입니다 — 고치면 그 현장의 금액이 소급해서 바뀝니다. 개정으로 새 케이스를 만들고 이것을 중지하세요.');
      }

      // 축·시작을 옮기면 다른 케이스와 같은 칸·같은 시작이 될 수 있다 (setPricingRuleMeta 와 같은 판정)
      if (me.active) {
        const dup = duplicateOf(rule, all.filter((r) => r.id !== id));
        if (dup) {
          throw new Error(`같은 조건을 덮는 케이스가 이미 있습니다 — ${dup.caseName}. 개정이라면 적용 시작을 다르게 적어주세요.`);
        }
      }

      const settleId = await resolveSettlementRule(tx, rule.settlementSteps, actor);
      // id 는 그대로 둔다 — 축이 바뀌어 슬러그가 낡아도, 화면이 읽는 이름은 caseName 이다
      await tx.update(pricingRules).set({
        caseName: rule.caseName, cpo: rule.cpo, bizType: rule.bizType,
        powerType: rule.powerType, termYears: rule.termYears, bldgTypes: rule.bldgTypes,
        replType: rule.replType, channel: rule.channel,
        bizYear: rule.bizYear, startDate: rule.startDate,
        salesUnit: rule.salesUnit, consUnit: rule.consUnit, margin: rule.margin,
        defaultSettlementRuleId: settleId,
        supervisionBearer: rule.supervisionBearer, safetyFeeBearer: rule.safetyFeeBearer,
        note: rule.note,
      }).where(eq(pricingRules.id, id));
      await writeAudit(tx, {
        projectId: null, actor, action: '단가 케이스 수정',
        field: id, oldValue: me.caseName, newValue: rule.caseName,
      });
    });
  },

  async setPricingRuleMeta(id, patch, actor): Promise<void> {
    assertAdmin(actor, '단가 케이스 정보 수정');
    const db = getDb();
    await db.transaction(async (tx) => {
      const all = (await tx.select().from(pricingRules)).map(rowToRule);
      const me = all.find((r) => r.id === id);
      if (!me) throw new Error('없는 단가 케이스입니다.');

      const next = {
        ...me,
        startDate: patch.startDate !== undefined ? patch.startDate.trim() : me.startDate,
        note: patch.note !== undefined ? (patch.note?.trim() || null) : me.note,
      };
      if (next.startDate === me.startDate && next.note === me.note) return;
      if (!next.startDate) throw new Error('적용 시작을 비울 수 없습니다.');

      // 적용 시작을 옮기면 다른 케이스와 같은 칸·같은 시작이 될 수 있다
      if (next.active) {
        const dup = duplicateOf(next, all.filter((r) => r.id !== id));
        if (dup) {
          throw new Error(`그 적용 시작에는 같은 조건의 케이스가 이미 있습니다 — ${dup.caseName}`);
        }
      }

      await tx
        .update(pricingRules)
        .set({ startDate: next.startDate, note: next.note })
        .where(eq(pricingRules.id, id));
      if (next.startDate !== me.startDate) {
        await writeAudit(tx, {
          projectId: null, actor, action: '단가 케이스 적용 시작 변경',
          field: id, oldValue: me.startDate, newValue: next.startDate,
        });
      }
      if (next.note !== me.note) {
        await writeAudit(tx, {
          projectId: null, actor, action: '단가 케이스 비고 변경',
          field: id, oldValue: me.note, newValue: next.note,
        });
      }
    });
  },

  async setPricingRuleActive(id, active, actor): Promise<void> {
    assertAdmin(actor, '단가 케이스 사용 여부 변경');
    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ active: pricingRules.active, caseName: pricingRules.caseName })
        .from(pricingRules)
        .where(eq(pricingRules.id, id))
        .limit(1);
      if (!row) throw new Error('없는 단가 케이스입니다.');
      if (row.active === active) return;

      // 되살릴 때도 중복을 본다 — 중지한 사이에 같은 칸·같은 시작의 케이스가 생겼을 수 있다
      if (active) {
        const all = (await tx.select().from(pricingRules)).map(rowToRule);
        const me = all.find((r) => r.id === id)!;
        const dup = duplicateOf(me, all.filter((r) => r.id !== id));
        if (dup) {
          throw new Error(`같은 조건을 덮는 케이스가 이미 있습니다 — ${dup.caseName}. 그쪽을 중지한 뒤 되살려주세요.`);
        }
      }

      await tx.update(pricingRules).set({ active }).where(eq(pricingRules.id, id));
      await writeAudit(tx, {
        projectId: null, actor, action: active ? '단가 케이스 사용' : '단가 케이스 중지',
        field: id, oldValue: row.active ? '사용' : '중지', newValue: active ? '사용' : '중지',
      });
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
        .set({ court, lastProgressAt: today() })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: '공 차례 변경',
        field: 'court', oldValue: row.court, newValue: court,
      });
    });
  },

  async setHold(projectId, hold, actor): Promise<void> {
    assertAdmin(actor, '현장 멈춤');
    if (hold && !hold.note.trim()) {
      throw new Error('사유를 입력하세요 — 왜 멈췄는지 없으면 나중에 아무도 모릅니다.');
    }

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ holdState: projects.holdState })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');

      await tx
        .update(projects)
        .set({
          holdState: hold?.state ?? null,
          holdNote: hold?.note.trim() ?? null,
          // 재개하면 정체일을 다시 센다 — 멈춰 있던 날을 정체로 세면 억울하다
          ...(hold ? {} : { lastProgressAt: today() }),
        })
        .where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor,
        action: hold ? `현장 ${hold.state}` : '현장 재개',
        field: 'holdState',
        oldValue: row.holdState,
        newValue: hold ? `${hold.state} — ${hold.note.trim()}` : null,
      });
    });
  },

  async setProjectName(projectId, name, actor): Promise<void> {
    assertAdmin(actor, '현장명 변경');
    const next = name.trim();
    if (!next) throw new Error('현장명을 입력하세요.');

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');
      if (row.name === next) return;

      await tx.update(projects).set({ name: next }).where(eq(projects.id, projectId));

      await writeAudit(tx, {
        projectId, actor, action: '현장명 변경',
        field: 'name', oldValue: row.name, newValue: next,
      });
    });
  },

  async deleteProject(projectId, actor): Promise<{ blobUrls: string[] }> {
    assertAdmin(actor, '현장 삭제');

    const db = getDb();
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');

      // 지워질 파일 주소를 먼저 모은다 — cascade 뒤에는 물을 곳이 없다
      const [docRows, procDocRows] = await Promise.all([
        tx.select({ blobUrl: documents.blobUrl }).from(documents)
          .where(eq(documents.projectId, projectId)),
        tx.select({ blobUrl: processDocuments.blobUrl }).from(processDocuments)
          .where(eq(processDocuments.projectId, projectId)),
      ]);
      const blobUrls = [...docRows, ...procDocRows]
        .map((d) => d.blobUrl)
        .filter((u): u is string => Boolean(u));

      await tx.delete(projects).where(eq(projects.id, projectId));

      // 감사기록은 FK 가 없어 남는다 — 무엇이 지워졌는지는 여기가 말한다
      await writeAudit(tx, {
        projectId, actor, action: '현장 삭제',
        field: 'name', oldValue: row.name, newValue: null,
      });

      return { blobUrls };
    });
  },
};

/**
 * 저장소 구현이 같이 쓰는 것 — 행 → 도메인 변환과 권한 확인.
 *
 * ★왜 갈랐나★ `pg-store.ts` 한 파일에 현장·서류·공정·지급·단가가 다 있어 2,800줄이 됐다.
 * 동시 세션이 가장 자주 부딪히는 파일이기도 하다(doc/REFACTOR_PLAN_3.md 2-1). 인터페이스
 * (ProjectRepository)는 그대로 두고 구현만 도메인별로 나눈다 — 부르는 쪽은 한 줄도
 * 바뀌지 않는다. 여기는 그 조각들이 같이 쓰는 바닥이다.
 */
import { isHanbaek } from '@/lib/roles';
import { writeAudit } from '@/lib/db/audit';
import { settlementRuleIdOf, settlementRuleNameOf, settlementStepsKeyOf } from '@/lib/settlement';
import { settlementRules as settlementRulesTable } from '@/lib/db/schema';
import { getDb } from '@/lib/db/client';

/** 트랜잭션 핸들 — drizzle 이 콜백에 주는 것과 같은 타입이다 */
export type TxLike = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  contractLines, documents, payoutEntries, pricingRules, processDocuments, processes,
  projectNotes, projects, settlementRules, settlements,
} from '@/lib/db/schema';
import { allSlots } from '../db-slot';
import { dayOf } from '@/lib/date';
import { PROCESS_DOCS } from '@/lib/doc-rules';
import { asProcessStatus } from '@/lib/process';
import type {
  BizType, BuildingType, ContractLine, CpoName, DocStatus, HoldState, PayoutEntry, PowerType,
  Court, DocFile, ContractParty, PayoutCategory, PayoutKind,
  PreInstall, PricingRule, ProcessInfo, ProcessStatus, Project, ProjectDocument, PromoExtendOption,
  PromoStep, ReplType, Settlement, SettlementRule, SettlementStepRule,
} from '@/types/project';
import type { Viewer } from '@/lib/auth/types';
import { ALL_DOC_KEYS } from '../assemble';
import type { ProjectRecord, RuleMap, SettleMap } from '../assemble';
import type { Actor } from '../repository';

/** 단가 케이스 한 행 — jsonb 두 칸(termYears·bldgTypes)만 배열이다 */
export function rowToRule(r: typeof pricingRules.$inferSelect): PricingRule {
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
    supplyItems: r.supplyItems,
    promo: r.promo as PromoStep[] | null,
    promoExtend: r.promoExtend as PromoExtendOption[] | null,
    chargeRate: r.chargeRate,
    installTerms: r.installTerms,
    otherSupport: r.otherSupport,
    coexistTerms: r.coexistTerms,
    miscTerms: r.miscTerms,
    defaultSettlementRuleId: r.defaultSettlementRuleId ?? '',
    supervisionBearer: r.supervisionBearer,
    safetyFeeBearer: r.safetyFeeBearer,
    note: r.note,
    active: r.active,
  };
}

/** 정산 규칙 한 행 → 도메인 값 */
/** 정산 규칙 한 행 — steps 는 jsonb */
export function rowToSettle(r: typeof settlementRules.$inferSelect): SettlementRule {
  return {
    id: r.id,
    name: r.name,
    steps: r.steps as SettlementStepRule[],
    note: r.note,
    active: r.active,
  };
}

/**
 * 한백 전용 쓰기의 마지막 방어선.
 *
 * 라우트에서 requireAdmin() 으로 이미 막지만 여기서 한 번 더 본다 —
 * 나중에 새 라우트를 추가할 때 가드를 빠뜨리면 이 계층이 잡아준다.
 */
export function assertAdmin(actor: Actor, what: string): void {
  if (actor.role !== 'admin') {
    throw new Error(`${what}는 한백 관리자만 할 수 있습니다.`);
  }
}

/**
 * 한백의 눈만 읽는 것 — 관리자와 열람 전용이 통과한다.
 *
 * assertAdmin 과 가르는 기준은 「쓰기냐 읽기냐」다. 단가 케이스·정산 규칙·판정 축은
 * 금액이 들어 있어 협력사에게 못 주지만, 열람 전용에게는 준다 — 그쪽은 한백의 눈이다.
 * 같은 표를 고치는 쪽(추가·수정·중지)은 그대로 assertAdmin 이다.
 */
export function assertHanbaek(actor: Actor, what: string): void {
  if (!isHanbaek(actor.role)) {
    throw new Error(`${what}는 한백만 할 수 있습니다.`);
  }
}

export /**
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
  const settles = await tx.select().from(settlementRulesTable);
  const same = settles.find((s: typeof settlementRulesTable.$inferSelect) => settlementStepsKeyOf(s.steps as SettlementStepRule[]) === key);
  if (same) return same.id;

  const id = settlementRuleIdOf(steps);
  const name = settlementRuleNameOf(steps);
  await tx.insert(settlementRulesTable).values({ id, name, steps, note: null, active: true });
  await writeAudit(tx, {
    projectId: null, actor, action: '정산 규칙 추가',
    field: id, oldValue: null, newValue: name,
  });
  return id;
}

export type ProjectRow = typeof projects.$inferSelect;
export type LineRow = typeof contractLines.$inferSelect;
export type DocRow = typeof documents.$inferSelect;
export type ProcRow = typeof processes.$inferSelect;
export type ProcDocRow = typeof processDocuments.$inferSelect;
export type SettlementRow = typeof settlements.$inferSelect;

// ── 행 → 도메인 ─────────────────────────────────────────────────
// DB 는 text 로 저장하고 도메인은 유니온으로 좁힌다. 좁히는 지점을 이 아래 한 곳에 모아둔다.


export function toProject(r: ProjectRow): Project {
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
    bizYear: r.bizYear,
    envQueueNo: r.envQueueNo,
    note: r.note,
    contractConfirmedAt: r.contractConfirmedAt,
    payoutTermsConfirmedAt: r.payoutTermsConfirmedAt,
    contractFixAskedAt: r.contractFixAskedAt,
    contractSubmittedAt: r.contractSubmittedAt,
    createdAt: dayOf(r.createdAt),
    settlementRuleId: r.settlementRuleId,
    settlementAppliedAt: r.settlementAppliedAt,
    // 옛 이름 DROP — 계약중단으로 읽는다
    holdState: (r.holdState === 'DROP' ? '계약중단' : r.holdState) as Project['holdState'],
    holdNote: r.holdNote,
  };
}

export function toLine(r: LineRow): ContractLine {
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
export function mergeDocs(
  keys: readonly string[],
  rows: Array<DocRow | ProcDocRow>
): ProjectDocument[] {
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return keys.map((kind) => {
    const r = byKind.get(kind);
    /*
     * 파일 목록은 files 가 정본이다(migrations/0021). filename·blob_url 은 첫 파일의
     * 사본이라 여기서 files 를 먼저 본다 — 두 값이 어긋나도 화면은 정본을 따른다.
     *
     * 열을 아예 안 보지는 않는다: 접수(createProject)는 파일이 붙기 전에 filename 만 있는
     * 행을 만든다. 그 한 칸을 「이름 없음」으로 보이게 할 이유가 없다.
     */
    const files = ((r?.files ?? []) as DocFile[]).filter((f) => f?.url);
    return {
      kind,
      files,
      filename: files[0]?.name ?? r?.filename ?? null,
      blobUrl: files[0]?.url ?? r?.blobUrl ?? null,
      status: (r?.status ?? 'none') as ProjectDocument['status'],
      rejectReason: (r && 'rejectReason' in r ? r.rejectReason : null) ?? null,
      uploadedBy: r?.uploadedBy ?? null,
      uploadedAt: r?.uploadedAt ?? null,
    };
  });
}

export const PROCESS_DOC_KEYS = PROCESS_DOCS.map((d) => d.key);

export function toProcess(projectId: string, r: ProcRow | undefined, docRows: ProcDocRow[]): ProcessInfo {
  return {
    projectId,
    envApprovalDate: r?.envApprovalDate ?? null,
    completeDoneAt: r?.completeDoneAt ?? null,
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
    chargerOrderQty: r?.chargerOrderQty ?? null,
    modemOrderQty: r?.modemOrderQty ?? null,
    chargerQty: r?.chargerQty ?? null,
    modemQty: r?.modemQty ?? null,
    chargerModelId: r?.chargerModelId ?? null,
    notifyDoneAt: r?.notifyDoneAt ?? null,
    notifySkippedAt: r?.notifySkippedAt ?? null,
    notifyRequiredAt: r?.notifyRequiredAt ?? null,
    chargerDoneAt: r?.chargerDoneAt ?? null,
    installConfirmedAt: r?.installConfirmedAt ?? null,
    openDoneAt: r?.openDoneAt ?? null,
    completionSubmitAt: r?.completionSubmitAt ?? null,
    docs: mergeDocs(PROCESS_DOC_KEYS, docRows),
    status: asProcessStatus(r?.status),
    memo: r?.memo ?? null,
  };
}

export function toSettlementRaw(projectId: string, r: SettlementRow | undefined): Omit<Settlement, 'steps'> {
  return {
    projectId,
    cpoCloseDate: r?.closeDate ?? null,
    safetyFee: r?.safetyFee ?? null,
    payNote: r?.payNote ?? null,
  };
}

export function toPayoutEntry(r: typeof payoutEntries.$inferSelect): PayoutEntry {
  return {
    id: r.id,
    projectId: r.projectId,
    kind: r.kind as PayoutKind,
    category: r.category as PayoutCategory,
    /* 1·2 아닌 값은 없다(0054 마이그레이션·checkPayoutEntry) — 그래도 좁혀서 넘긴다 */
    step: r.step === 1 || r.step === 2 ? r.step : null,
    amount: r.amount,
    at: r.at,
    note: r.note ?? null,
    createdAt: r.createdAt,
  };
}

export function toCollected(
  r: SettlementRow | undefined
): Partial<Record<1 | 2 | 3, { at: string; amount: number | null }>> {
  const out: Partial<Record<1 | 2 | 3, { at: string; amount: number | null }>> = {};
  // 날짜가 곧 「받았다」는 표시다 — 금액은 협의로 계획과 달라졌을 때만 있다(migrations/0034)
  if (r?.collected1At) out[1] = { at: r.collected1At, amount: r.collected1Amount ?? null };
  if (r?.collected2At) out[2] = { at: r.collected2At, amount: r.collected2Amount ?? null };
  if (r?.collected3At) out[3] = { at: r.collected3At, amount: r.collected3Amount ?? null };
  return out;
}

/** 현장 행들을 받아 관련 행을 한 번에 긁어와 ProjectRecord 로 묶는다 */
export async function recordsOf(rows: ProjectRow[]): Promise<ProjectRecord[]> {
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
 * 권한을 SQL 로 내린다 — 전부 읽어와 화면에서 가리는 방식은 쓰지 않는다.
 * 한백(관리자·열람 전용)은 조건 없음, 협력사는 영업사·시공사 중 하나가 자기 소속인 현장만.
 */
export function accessWhere(viewer: Viewer) {
  if (isHanbaek(viewer.role)) return undefined;
  // 소속 없는 협력사 계정은 볼 현장이 없다. 조건을 비우면 전부 보이므로 명시적으로 막는다.
  if (!viewer.org) return sql`false`;
  return or(eq(projects.salesOrg, viewer.org), eq(projects.gcOrg, viewer.org));
}

/**
 * 단가 케이스 표 — DB 가 정본이다.
 *
 * 서른 몇 행짜리 작은 표라 화면마다 통째로 읽어도 된다. 캐시를 두면 화면에서 케이스를
 * 추가한 직후 옛 표가 보이는 일이 생기고, 그게 왜 그런지 알 수 없다.
 */
export async function ruleMap(): Promise<RuleMap> {
  const rows = await getDb().select().from(pricingRules);
  return new Map(rows.map((r) => [r.id, rowToRule(r)]));
}


/**
 * 정산 규칙 표 — 단가 케이스처럼 DB 가 정본이다.
 *
 * 예전에는 코드 시드(SETTLEMENT_RULE_BY_ID)를 읽었는데, 케이스가 기성 단계를 직접
 * 정의하면서 규칙이 화면에서도 생긴다 — 코드에 없는 규칙이 현장에 붙으면 기성이
 * 영구히 「미적용」으로 보이는 갈림이 케이스 때 실제로 있었다.
 */
export async function settleMap(): Promise<SettleMap> {
  const rows = await getDb().select().from(settlementRules);
  return new Map(rows.map((r) => [r.id, rowToSettle(r)]));
}

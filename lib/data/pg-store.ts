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
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { allSlots } from './db-slot';
import { dayOf, stampOf, today } from '@/lib/date';
import {
  chargerModels, contractLines, documents, payoutEntries, pricingRules, processDocuments, processes,
  batchFinals, projectNotes, projects, settlementRules, settlements, taxInvoices,
} from '@/lib/db/schema';
import type {
  BizType, BuildingType, ChargerModel, ContractLine, ContractParty, Court, CpoName, DocFile, DocStatus,
  IntakeDraft, LineAxes, NewPayoutEntry, PayoutCategory, PayoutEntry, PayoutKind, PayoutRow,
  PowerType, PreInstall, PricingRule, ProcessInfo, ProcessStatus, Project, PromoExtendOption, PromoStep,
  ProjectDetail, ProjectDocument, ProjectSummary, ReplType, Settlement, SettlementRule,
  BatchFinal, SettlementStepRule, SettlementSummary, TaxInvoice,
} from '@/types/project';
import { normalizeRepl, PROCESS_STATUSES, subsidized } from '@/types/project';
import type { Viewer } from '@/lib/auth/types';
import { canAccessProject, canWrite, effectiveVisibility, isHanbaek, normalizeOrg } from '@/lib/roles';
import { needsPreInstallCheck, PROCESS_DOCS } from '@/lib/doc-rules';
import {
  asProcessStatus, assertProcessWrite, canEnter, CHECK_ADVANCES, COURT_AFTER_STATUS,
  gateContextOf, statusIndex,
} from '@/lib/process';
import type { Actor, PaymentPatch, ProcessPatch, ProjectRepository } from './repository';
/*
 * 구현을 도메인별로 가르는 중이다(doc/REFACTOR_PLAN_3.md 2-1) — 인터페이스는 그대로고
 * 부르는 쪽도 그대로다. 여기서는 조각을 펼쳐 담기만 한다.
 */
import { batchStore } from './store/batches';
import { contractStore } from './store/contract';
import { processStore } from './store/process';
import { docStore } from './store/docs';
import { payoutStore } from './store/payouts';
import { pricingStore } from './store/pricing';
import {
  accessWhere, assertAdmin, assertHanbaek, mergeDocs, PROCESS_DOC_KEYS, recordsOf,
  resolveSettlementRule, ruleMap, rowToRule, rowToSettle, settleMap, toCollected, toLine,
  toPayoutEntry, toProcess, toProject, toSettlementRaw,
} from './store/shared';
import type {
  DocRow, LineRow, ProcDocRow, ProcRow, ProjectRow, SettlementRow,
} from './store/shared';
import { checkPricingRule, duplicateOf, normalizePricingRule, pricingRuleId } from '@/lib/pricing-match';
import {
  checkPayoutEntry, entryTypeOf, payoutPrerequisiteBlockersOf, payoutReleaseOf, payoutSideOf,
  payoutStepsOf, settlementRuleIdOf, settlementRuleNameOf, settlementStepsKeyOf,
} from '@/lib/settlement';
import {
  ALL_DOC_KEYS, byStalled, contractStateFor, isProcessDocKind, missingRequiredDocs,
  payoutPlansOf, payoutRowsOf, redactForViewer,
  payoutMilestonesFor, settlementSummaryOf,
  summaryOf, toDetail, type ProjectRecord, type RuleMap, type SettleMap,
} from './assemble';

/** 트랜잭션 핸들. db 와 같은 질의 인터페이스를 갖는다. */
type TxLike = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

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
  // 단가·정산 규칙·충전기 모델은 store/pricing.ts 에 있다 (REFACTOR_PLAN_3 2-1)
  ...pricingStore,
  // 지급 배치·세금계산서는 store/batches.ts 에 있다
  ...batchStore,
  // 지급조건·원장·기성 수금은 store/payouts.ts 에 있다
  ...payoutStore,
  // 서류 올리기·검수·빼기는 store/docs.ts 에 있다
  ...docStore,
  // 계약 선언·확인·보완요청·기설치는 store/contract.ts 에 있다
  ...contractStore,
  // 공정 마일스톤·단계 이동은 store/process.ts 에 있다
  ...processStore,

  async listProjects(viewer: Viewer): Promise<ProjectSummary[]> {
    if (!isHanbaek(viewer.role) && !viewer.org) return [];
    const rows = await getDb().select().from(projects).where(accessWhere(viewer));
    const [records, [rules, settles]] = await Promise.all([
      recordsOf(rows),
      allSlots([() => ruleMap(), () => settleMap()] as const),
    ]);
    return records.map((r) => summaryOf(r, rules, settles)).sort(byStalled);
  },


  async listTodoSources(viewer: Viewer) {
    const rows = await getDb().select().from(projects).where(accessWhere(viewer));
    const [records, [rules, settles]] = await Promise.all([
      recordsOf(rows),
      allSlots([() => ruleMap(), () => settleMap()] as const),
    ]);
    return {
      projects: records.map((r) => summaryOf(r, rules, settles)).sort(byStalled),
      history: records.flatMap((r) => payoutRowsOf(r, viewer, rules, settles)),
      // 한백이 아니면 기성 금액을 조립조차 하지 않는다
      settlements: isHanbaek(viewer.role)
        ? records.map((r) => settlementSummaryOf(r, rules, settles))
        : [],
    };
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

      await tx.insert(projects).values(projectRowOf(id, draft, actor, day));
      if (draft.lines.length > 0) await tx.insert(contractLines).values(lineRowsOf(id, draft));
      // 올라온 서류만 행으로 남긴다. 안 올라온 칸은 조회할 때 mergeDocs 가 채운다.
      if (draft.documents.length > 0) {
        await tx.insert(documents).values(draft.documents.map((d) => ({
          projectId: id,
          kind: d.kind,
          filename: d.filename,
          status: 'uploaded', // 검수 대기 — 승인은 한백이 한다
          uploadedBy: actor.name,
          uploadedAt: day,
        })));
      }

      await tx.insert(processes).values({ projectId: id });
      await tx.insert(settlements).values({ projectId: id });

      await writeAudit(tx, { projectId: id, actor, action: '접수', newValue: draft.name });

      return id;
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
       * 자체투자·연동 현장은 환경부 보조금을 받지 않으므로 대기번호가 없다.
       * 화면에서 입력칸을 주지 않지만 여기서도 막는다 — 라우트는 직접 부를 수 있다.
       */
      if (!subsidized(row.bizType as BizType | null) && value !== null) {
        throw new Error(`${row.bizType} 현장은 환경부 대기번호가 없습니다.`);
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
    assertAdmin(actor, '담당 넘기기');

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
        projectId, actor, action: '담당 변경',
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

/**
 * 접수 한 건의 현장 행.
 *
 * ★협력사가 보낸 업체명은 쓰지 않는다★ — 접수자의 소속이 영업사·시공사다. 남의 회사
 * 이름을 넣어 남의 현장을 만들 수 있으면 안 된다. 한백이 대신 접수할 때만 적어 넣는다.
 */
function projectRowOf(id: string, draft: IntakeDraft, actor: Actor, day: string) {
  return {
    id,
    mgmtNo: id,
    cpo: draft.cpo,
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
    // 안 가르는 운영사의 신규위치는 눕혀서 넣는다 — 접수 API 는 화면 없이도 부를 수 있다
    replType: normalizeRepl(draft.cpo, draft.replType),
    bizType: draft.bizType,
    // 사업연도는 접수 연도로 시작한다 — 이월 현장만 한백이 고친다
    bizYear: Number(day.slice(0, 4)),
    // 환경부 대기번호는 접수 뒤에 나온다 — 한백이 콘솔에서 채운다
    envQueueNo: null,
    note: draft.note,
    // 정산 규칙은 한백이 검수 단계에서 현장별로 적용한다
    settlementRuleId: null,
    settlementAppliedAt: null,
    court: '한백' as const, // 접수하면 담당이 한백으로 넘어간다 (검수 차례)
    lastProgressAt: day,
  };
}

/** 계약 라인들 — 단가 케이스는 한백이 검수 후 지정한다 */
function lineRowsOf(id: string, draft: IntakeDraft) {
  return draft.lines.map((l, i) => ({
    id: `${id}-L${i + 1}`,
    projectId: id,
    termYears: l.termYears,
    qty: l.qty,
    powerType: l.powerType,
    replType: normalizeRepl(draft.cpo, l.replType),
    memo: l.memo,
    pricingRuleId: null,
    pricedAt: null,
  }));
}

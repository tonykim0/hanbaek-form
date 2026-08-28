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
  if (!canEnter(target, record.process, gateContextOf(record.project)).ok) return; // 조건이 아직 안 찼다
  if (toDetail(record, await ruleMap(), await settleMap()).stage === 'intake') return;
  await moveStatus(projectId, cur, target, actor, '진행 단계 변경 (완료 체크)');
}

/**
 * 체크를 풀면 그 체크가 열었던 단계에서 물러난다 (한백 지시 2026-08-26).
 *
 * ★안 물러나면 기록 없이 통과한 현장이 남는다★ — canEnter 는 지나온 자리를 다시 묻지
 * 않으므로(lib/process), 「행위신고 불필요」를 체크해 충전기 발주로 올라간 뒤 체크를
 * 풀면 신고 기록이 하나도 없는 채로 준공까지 흘러간다.
 *
 * ★부르는 쪽이 「실제로 풀린 칸」을 준다★ — patch 를 그대로 훑지 않는다. 라우트가
 * 행위신고 상호배제로 반대쪽에 심는 null 을 해제로 읽어서, 체크가 단계를 올린 직후
 * 스스로 되돌리는 일이 있었다(2026-08-26 실사고 — 시공 구간 입구가 막혔다).
 * 되감을 수 없는 경우(더 진행됨)는 부르는 쪽이 저장 전에 이미 거절한다.
 */
async function retreatAfterUncheck(
  projectId: string, field: keyof typeof CHECK_ADVANCES, actor: Actor
): Promise<void> {
  const opened = CHECK_ADVANCES[field];

  const rows = await getDb().select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!rows[0]) return;
  const [record] = await recordsOf(rows);
  if (!record) return;

  // 계약이 안 끝난 현장은 공정을 움직이지 않는다 — advanceAfterCheck 와 같은 잠금
  if (toDetail(record, await ruleMap(), await settleMap()).stage === 'intake') return;

  const cur = record.process.status;
  if (statusIndex(cur) !== statusIndex(opened)) return;  // 그 단계에 서 있을 때만 물러난다
  const back = PROCESS_STATUSES[statusIndex(opened) - 1];
  if (!back) return;
  await moveStatus(projectId, cur, back, actor, '진행 단계 되돌림 (체크 해제)', { progress: false });
}

/**
 * 단계를 옮기고 담당·감사기록을 함께 맞춘다 — 체크로 오르내릴 때 쓴다.
 * 되돌림에는 정체일을 찍지 않는다(progress: false) — 되돌리는 것은 진척이 아니다.
 */
async function moveStatus(
  projectId: string, cur: ProcessStatus, target: ProcessStatus, actor: Actor, action: string,
  opts: { progress?: boolean } = {}
): Promise<void> {
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.update(processes).set({ status: target }).where(eq(processes.projectId, projectId));
    await tx
      .update(projects)
      .set({
        ...(opts.progress === false ? {} : { lastProgressAt: today() }),
        court: COURT_AFTER_STATUS[target],
      })
      .where(eq(projects.id, projectId));
    await writeAudit(tx, {
      projectId, actor, action,
      field: 'process.status', oldValue: cur, newValue: target,
    });
  });
}

export const pgRepository: ProjectRepository = {
  // 단가·정산 규칙·충전기 모델은 store/pricing.ts 에 있다 (REFACTOR_PLAN_3 2-1)
  ...pricingStore,
  // 지급 배치·세금계산서는 store/batches.ts 에 있다
  ...batchStore,
  // 지급조건·원장·기성 수금은 store/payouts.ts 에 있다
  ...payoutStore,

  async listProjects(viewer: Viewer): Promise<ProjectSummary[]> {
    if (!isHanbaek(viewer.role) && !viewer.org) return [];
    const rows = await getDb().select().from(projects).where(accessWhere(viewer));
    const [records, [rules, settles]] = await Promise.all([
      recordsOf(rows),
      allSlots([() => ruleMap(), () => settleMap()] as const),
    ]);
    return records.map((r) => summaryOf(r, rules, settles)).sort(byStalled);
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
            replType: normalizeRepl(draft.cpo, l.replType),
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
      /*
       * 파일 없이 반려로 서 있는 칸(누락 서류 보완요청, askMissingDocs)은 통과시킬 수 없다.
       * 통과 상태로 만들면 satisfied 가 그 칸을 센다 — 파일 한 장 없는 계약이 확인 가능해진다.
       * 되돌리는 길은 보완요청 취소다(askMissingDocs ask=false).
       */
      if (input.status !== 'rejected' && !row.blobUrl) {
        throw new Error('파일이 없는 칸은 통과시킬 수 없습니다 — 제출을 기다리는 자리입니다.');
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
      const day = today();
      /*
       * ★착공 뒤에는 계약 단계로 내려가지 않는다★ (한백 지시 2026-08-26).
       *
       * 반려는 계약 확인을 지우고, 확인이 없으면 단계가 intake 로 유도된다(lib/stage.ts) —
       * 그러면 공사가 도는 현장이 시공 보드에서 사라지고 단계 이동이 전부 막힌다
       * (setProcessStatus 가 「계약이 끝나기 전에는 못 옮긴다」로 거절한다).
       * 서류의 문제는 그대로 반려로 남지만(칸은 계약보완이 아니라 공정 그대로),
       * 이미 시작된 공사를 계약 칸으로 끌어내리지는 않는다.
       */
      const [proc] = await tx
        .select({ status: processes.status })
        .from(processes)
        .where(eq(processes.projectId, input.projectId))
        .limit(1);
      const started = statusIndex(asProcessStatus(proc?.status)) >= statusIndex('착공');

      await tx
        .update(projects)
        .set({
          lastProgressAt: day,
          ...(input.status === 'rejected'
            ? {
                ...(started ? {} : { contractConfirmedAt: null }),
                contractFixAskedAt: sql`coalesce(${projects.contractFixAskedAt}, ${day})`,
                court: '영업사',
              }
            : {}),
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
      const proc = isProcessDocKind(input.kind);
      const day = today();

      /*
       * ★쌓는다 — 갈아치우지 않는다★ (한백 지시 2026-08-25).
       *
       * 예전에는 한 칸에 파일 하나여서 새로 올리면 앞의 것이 사라졌다(저장소에서도 지웠다).
       * 회의록이 두 장으로 스캔되거나 사진대지가 동별로 갈려 오면 올릴 자리가 없었다.
       *
       * 같은 주소는 두 번 넣지 않는다 — 두 번 눌림·접수 재시도에 같은 파일이 두 줄로 남는다.
       */
      const appended = (before: unknown): DocFile[] => {
        const files = ((before ?? []) as DocFile[]).filter((f) => f?.url);
        if (files.some((f) => f.url === input.blobUrl)) return files;
        return [
          ...files,
          { name: input.filename, url: input.blobUrl, uploadedBy: actor.name, uploadedAt: day },
        ];
      };

      if (proc) {
        const [before] = await tx
          .select({ filename: processDocuments.filename, files: processDocuments.files })
          .from(processDocuments)
          .where(and(
            eq(processDocuments.projectId, input.projectId),
            eq(processDocuments.kind, input.kind)
          ))
          .limit(1);

        const files = appended(before?.files);
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
        return;
      }

      const [before] = await tx
        .select({ status: documents.status, files: documents.files })
        .from(documents)
        .where(and(eq(documents.projectId, input.projectId), eq(documents.kind, input.kind)))
        .limit(1);

      const files = appended(before?.files);
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

  async updateProcess(projectId, patch: ProcessPatch, actor): Promise<void> {
    const fields = Object.keys(patch) as Array<keyof ProcessPatch>;
    if (fields.length === 0) return;

    /** 실제로 풀린 체크 칸 — 트랜잭션 안에서 정하고, 커밋 뒤 단계를 되돌리는 데 쓴다 */
    let unchecked: keyof typeof CHECK_ADVANCES | null = null;
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

      /*
       * ★실제로 풀린 체크만 해제로 본다★ — 라우트가 행위신고 상호배제로 반대쪽에 심는
       * null 은 「원래도 null」이라 여기서 걸러진다. 안 걸러서 체크가 단계를 올린 직후
       * 스스로 되돌리는 일이 있었다(2026-08-26 실사고).
       *
       * ★거절은 저장 전에 한다★ — 예전에는 커밋 뒤 트랜잭션 밖에서 던져서, 「해제할 수
       * 없습니다」를 띄우면서 값은 이미 지워져 있었다. 그 값이 지급 트리거면 근거가
       * 조용히 사라진다(개통완료·설치완료).
       */
      unchecked = fields.find(
        (f) => f in CHECK_ADVANCES && patch[f] === null && before?.[f as keyof typeof before] != null
      ) as keyof typeof CHECK_ADVANCES | undefined ?? null;
      if (unchecked) {
        const opened = CHECK_ADVANCES[unchecked];
        const cur = asProcessStatus(before?.status);
        if (statusIndex(cur) > statusIndex(opened)) {
          throw new Error(`이미 ${cur} 까지 진행돼 해제할 수 없습니다 — 단계를 먼저 되돌리세요.`);
        }
      }

      /*
       * ★완료 체크는 그 구간에 와서 한다★ (2026-08-26 발견).
       *
       * 체크 필드가 곧 지급 트리거다(설치완료 → 시공비 1차, 개통완료 → 양쪽 2차 —
       * assemble.payoutMilestonesFor). 그런데 화면의 스테퍼는 미래 구간도 열어 주고
       * 서버는 「누가 적는가」만 봤다 — 충전기 발주 현장에서 설치완료·개통완료 칩을
       * 골라 체크하면 ★착공도 안 한 현장의 지급이 전액 열렸다★. 단계는 한 걸음씩만
       * 오르므로(advanceAfterCheck) 보드는 제자리인 채 돈만 열리는 조합이었다.
       *
       * 이미 지난 구간의 체크는 막지 않는다 — 되돌려 고치는 길이다(화면 규칙 7).
       */
      const cur = asProcessStatus(before?.status);
      for (const f of fields) {
        if (!(f in CHECK_ADVANCES) || patch[f] == null) continue;
        const opened = CHECK_ADVANCES[f as keyof typeof CHECK_ADVANCES];
        if (statusIndex(cur) < statusIndex(opened) - 1) {
          throw new Error(`아직 그 구간이 아닙니다 — 지금은 ${cur} 입니다.`);
        }
      }

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
    if (unchecked) await retreatAfterUncheck(projectId, unchecked, actor);
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
    const entry = canEnter(status, record.process, gateContextOf(record.project));
    if (!entry.ok) throw new Error(`${status} 로 넘기려면 ${entry.blockedBy} 이(가) 필요합니다.`);

    /*
     * 「운영사 계약서 제출」은 넘기는 것이 곧 선언이다 — 낸 날을 여기서 찍는다.
     *
     * 조건(STATUS_GATES)을 걷어내면서 이 칸을 적는 자리가 화면에서 사라졌다. 날짜는
     * 남긴다 — 언제 냈는지는 상세가 보여준다. 이미 찍혀 있으면 덮지 않는다.
     *
     * ★그 칸에 들어설 때만 찍는다.★ 「지났으면 다 찍는다」로 두면 옛 현장을 착공→설치완료로
     * 옮길 때 오늘 날짜가 제출일로 들어간다 — 오래전에 낸 현장에 틀린 날을 새로 적는 꼴이다.
     * 건너뛰어 지나간 현장은 날짜 없이 「제출됨」으로 보인다(제출 여부는 단계가 말한다).
     *
     * 되돌려서 그 앞으로 내려가면 지운다 — 되돌리기는 「그 일이 없던 것으로」다(화면 규칙 7).
     */
    const before = record.process.cpoSubmitDate;
    const stamp =
      status === '운영사 계약서 제출' && !before
        ? { cpoSubmitDate: today() }
        : statusIndex(status) < statusIndex('운영사 계약서 제출') && before
          ? { cpoSubmitDate: null }
          : {};

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
        await tx.update(processes).set({ status, ...stamp }).where(eq(processes.projectId, projectId));
      } else {
        await tx.insert(processes).values({ projectId, status, ...stamp });
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
      if ('cpoSubmitDate' in stamp) {
        await writeAudit(tx, {
          projectId, actor, action: '운영사 계약서 제출',
          field: 'process.cpoSubmitDate',
          oldValue: before, newValue: stamp.cpoSubmitDate,
        });
      }
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
      /* 착공 뒤에는 계약 단계로 내려가지 않는다 — 서류 반려와 같은 규칙(한백 지시 2026-08-26) */
      const [proc] = await tx
        .select({ status: processes.status })
        .from(processes)
        .where(eq(processes.projectId, projectId))
        .limit(1);
      const started = statusIndex(asProcessStatus(proc?.status)) >= statusIndex('착공');

      await tx
        .update(projects)
        /*
         * 조사는 진척이다 — 정체일 기준을 갱신한다. 반려는 보완 차례라 담당이 영업사로.
         *
         * ★반려는 서류 반려와 같은 뒷일을 한다(한백 지적 2026-08-26).★ 앞서 한 계약
         * 확인을 지우고, 보완요청이 있었다는 사실을 남긴다(첫 번째 것만). 안 지우면
         * 확인일이 남아 단계가 시공으로 유도되고(lib/stage), 그러면 보드의 계약 세 칸
         * 판정 자체를 안 타서 반려해 놓고도 현장이 제자리에 서 있다 —
         * 전주태평에스케이뷰가 그랬다. 문구도 reviewDocument 쪽과 같은 뜻으로 맞춘다.
         */
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
           * ★공 차례는 그 단계가 정한다★ (한백 지시 2026-08-25).
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
      for (const kind of kinds) {
        const row = {
          projectId,
          kind,
          filename: null,
          blobUrl: null,
          status: ask ? 'rejected' : 'none',
          rejectReason: ask ? why : null,
          uploadedBy: null,
          uploadedAt: null,
        };
        await tx
          .insert(documents)
          .values(row)
          .onConflictDoUpdate({
            target: [documents.projectId, documents.kind],
            // 파일 칸은 건드리지 않는다 — 겨냥한 것이 「파일 없는 칸」이라 비어 있지만,
            // 덮어쓰기로 남의 파일을 지우는 길을 열어두지 않는다.
            set: { status: row.status, rejectReason: row.rejectReason },
          });
      }

      await tx
        .update(projects)
        .set({
          lastProgressAt: day,
          ...(ask
            ? {
                // 반려와 같은 일이다 — 확인을 무효로 만들고, 공은 보완할 쪽으로
                contractConfirmedAt: null,
                contractFixAskedAt: sql`coalesce(${projects.contractFixAskedAt}, ${day})`,
                court: '영업사',
              }
            : // 되돌리면 볼 차례는 다시 한백이다. 확인은 사람이 다시 눌러야 한다.
              { court: '한백' }),
        })
        .where(eq(projects.id, projectId));

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

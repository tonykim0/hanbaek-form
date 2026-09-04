/**
 * 협력사에게 내려주는 돈 — 지급조건 · 원장 · 기성 수금.
 *
 * `pg-store.ts` 에서 떼어 왔다(doc/REFACTOR_PLAN_3.md 2-1). 인터페이스는 그대로고
 * 부르는 쪽도 그대로다 — pgRepository 가 이 객체를 펼쳐 담는다.
 *
 * ★두 방향이 여기 같이 있다★ — 운영사에게서 받는 기성(listSettlements·수금 기록)과
 * 협력사에게 주는 지급(원장·회차)이다. 계획·잔액·마진이 단가 케이스 하나에서 같이
 * 나오기 때문에 가르면 오히려 같은 계산이 두 벌이 된다.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import {
  batchFinals, contractLines, payoutEntries, pricingRules, projects, settlementRules, settlements,
} from '@/lib/db/schema';
import { allSlots } from '../db-slot';
import { stampOf, today } from '@/lib/date';
import { isHanbaek } from '@/lib/roles';
import {
  checkPayoutEntry, entryTypeOf, payoutPrerequisiteBlockersOf, payoutReleaseOf, payoutSideOf,
  payoutStepsOf,
} from '@/lib/settlement';
import {
  contractStateFor, payoutMilestonesFor, payoutPlansOf, payoutRowsOf, settlementSummaryOf, toDetail,
} from '../assemble';
import type { ProjectRecord, RuleMap } from '../assemble';
import type { Viewer } from '@/lib/auth/types';
import type {
  NewPayoutEntry, PayoutCategory, PayoutKind, PayoutRow, SettlementSummary,
} from '@/types/project';
import type { Actor, PaymentPatch, ProjectRepository } from '../repository';
import {
  accessWhere, assertAdmin, recordsOf, resolveSettlementRule, ruleMap, settleMap,
} from './shared';
import type { TxLike } from './shared';

/** pgRepository 가 펼쳐 담는 조각 — 이름과 시그니처는 인터페이스가 정한다 */
export const payoutStore: Pick<
  ProjectRepository,
  'listSettlements' | 'listPayouts' | 'listPayoutOverview' | 'setLinePricing' | 'setPayment'
  | 'setPayoutTermsConfirmed' | 'setSettlementRule' | 'setCpoCloseDate' | 'setSettlementCollected'
  | 'runPayoutBatch' | 'addPayoutEntry' | 'addPayoutEntries' | 'deletePayoutEntry'
> = {
  async listSettlements(viewer: Viewer): Promise<SettlementSummary[]> {
    // 한백이 아니면 금액을 읽어오지도 않는다
    if (!isHanbaek(viewer.role)) return [];
    const rows = await getDb().select().from(projects);
    const [records, [rules, settles]] = await Promise.all([
      recordsOf(rows),
      allSlots([() => ruleMap(), () => settleMap()] as const),
    ]);
    return records
      .map((r) => settlementSummaryOf(r, rules, settles))
      .sort((a, b) => b.planTotal - a.planTotal);
  },

  async listPayouts(viewer: Viewer): Promise<PayoutRow[]> {
    const rows = await getDb().select().from(projects).where(accessWhere(viewer));
    const [records, [rules, settles]] = await Promise.all([
      recordsOf(rows),
      allSlots([() => ruleMap(), () => settleMap()] as const),
    ]);
    return records.flatMap((r) => payoutRowsOf(r, viewer, rules, settles));
  },

  async listPayoutOverview(viewer: Viewer) {
    // 현장을 한 번만 읽어 계획과 내역을 같이 조립한다 — 두 길로 갈라 두 번 읽지 않는다
    const rows = await getDb().select().from(projects).where(accessWhere(viewer));
    const [records, [rules, settles]] = await Promise.all([
      recordsOf(rows),
      allSlots([() => ruleMap(), () => settleMap()] as const),
    ]);
    return {
      plans: records.flatMap((r) => payoutPlansOf(r, viewer, rules, settles)),
      history: records.flatMap((r) => payoutRowsOf(r, viewer, rules, settles)),
    };
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

      const suggestedSettlement = pricingRuleId ? await checkPricingRule(tx, pricingRuleId) : null;
      if (line.ruleId === pricingRuleId) return;

      await assertTermsOpen(tx, line.projectId);

      const day = today();
      await tx
        .update(contractLines)
        .set({ pricingRuleId, pricedAt: pricingRuleId ? day : null })
        .where(eq(contractLines.id, lineId));
      await tx.update(projects).set({ lastProgressAt: day }).where(eq(projects.id, line.projectId));

      if (suggestedSettlement) {
        await applySuggestedSettlement(tx, line.projectId, suggestedSettlement, day, actor);
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
      /*
       * ★정산 행이 없으면 만든다.★ (2026-08-28 버그 수정)
       *
       * 여기가 UPDATE 뿐이라, settlements 행이 없는 현장에서는 메모가 조용히 저장되지
       * 않았다 — 실제로 현장 149곳 중 129곳에 그 행이 없었다(접수도 이관도 안 만든다).
       * 「현장을 찾을 수 없습니다」라는 문구까지 틀렸다: 현장은 있고 정산 행이 없던 것이다.
       */
      const [row] = await tx.select().from(settlements).where(eq(settlements.projectId, projectId)).limit(1);
      const before = row ?? null;

      const changed = fields.filter((f) => (before?.[f] ?? null) !== (patch[f] ?? null));
      if (changed.length === 0) return;

      await tx
        .insert(settlements)
        .values({ projectId, ...patch })
        .onConflictDoUpdate({ target: settlements.projectId, set: patch });
      await tx
        .update(projects)
        .set({ lastProgressAt: today() })
        .where(eq(projects.id, projectId));

      for (const f of changed) {
        await writeAudit(tx, {
          projectId, actor, action: '지급 정보 변경',
          field: f, oldValue: before?.[f] ?? null, newValue: patch[f] ?? null,
        });
      }
    });
  },

  async setPayoutTermsConfirmed(projectId, confirmed: boolean, actor): Promise<void> {
    assertAdmin(actor, '지급조건 확정');
    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');
      const before = row.payoutTermsConfirmedAt ?? null;

      if (confirmed) {
        if (before) return;
        /*
         * ★덜 된 조건을 굳히지 않는다.★ 단가가 안 붙은 라인이 있으면 계획 금액이 비어
         * 있고, 정산 규칙이 없으면 기성 차수가 계산되지 않는다 — 그 상태로 잠그면
         * 「고칠 수도 없고 계산도 안 되는」 현장이 된다.
         */
        const lines = await tx.select().from(contractLines).where(eq(contractLines.projectId, projectId));
        if (lines.length === 0) throw new Error('계약 라인이 없어 확정할 수 없습니다.');
        const unpriced = lines.filter((l) => !l.pricingRuleId).length;
        if (unpriced > 0) throw new Error(`단가 미지정 라인 ${unpriced}건 — 단가를 지정한 뒤 확정하세요.`);
        if (!row.settlementRuleId) throw new Error('정산 규칙이 없어 확정할 수 없습니다.');
      } else if (!before) {
        return;
      }

      const at = confirmed ? today() : null;
      await tx.update(projects).set({ payoutTermsConfirmedAt: at }).where(eq(projects.id, projectId));
      await writeAudit(tx, {
        projectId, actor,
        action: confirmed ? '지급조건 확정' : '지급조건 확정 해제',
        field: 'payoutTermsConfirmedAt', oldValue: before, newValue: at,
      });
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

      // 정산 규칙도 지급조건의 일부다 — 기성 차수·금액이 여기서 나온다(setLinePricing 주석)
      const [lockedRule] = await tx
        .select({ at: projects.payoutTermsConfirmedAt })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (lockedRule?.at) {
        throw new Error(`지급조건이 확정된 현장입니다(${lockedRule.at}) — 확정을 해제한 뒤 바꾸세요.`);
      }

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

  async setCpoCloseDate(projectId, date: string | null, actor): Promise<void> {
    assertAdmin(actor, '준공마감일 지정');
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('준공마감일은 YYYY-MM-DD 형식이어야 합니다.');
    }
    const db = getDb();
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ closeDate: settlements.closeDate })
        .from(settlements)
        .where(eq(settlements.projectId, projectId))
        .limit(1);
      if ((before?.closeDate ?? null) === date) return;

      await tx
        .insert(settlements)
        .values({ projectId, closeDate: date })
        .onConflictDoUpdate({ target: settlements.projectId, set: { closeDate: date } });

      await writeAudit(tx, {
        projectId, actor, action: date ? '준공마감일 지정' : '준공마감일 해제',
        field: 'cpoCloseDate', oldValue: before?.closeDate ?? null, newValue: date,
      });
    });
  },

  async setSettlementCollected(projectId, no: 1 | 2 | 3, value, actor): Promise<void> {
    assertAdmin(actor, '기성 수금 기록');
    if (value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value.at)) {
        throw new Error('수금일은 YYYY-MM-DD 형식이어야 합니다.');
      }
      if (value.amount !== null
        && (!Number.isInteger(value.amount) || value.amount <= 0)) {
        throw new Error('수금액은 0 보다 큰 원 단위 정수여야 합니다.');
      }
    }

    const atCol = ([settlements.collected1At, settlements.collected2At, settlements.collected3At])[no - 1];
    const amountCol = ([settlements.collected1Amount, settlements.collected2Amount, settlements.collected3Amount])[no - 1];
    const atKey = (['collected1At', 'collected2At', 'collected3At'] as const)[no - 1];
    const amountKey = (['collected1Amount', 'collected2Amount', 'collected3Amount'] as const)[no - 1];

    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!row) throw new Error('현장을 찾을 수 없습니다.');

      const [before] = await tx
        .select({ at: atCol, amount: amountCol })
        .from(settlements)
        .where(eq(settlements.projectId, projectId))
        .limit(1);

      /*
       * ★열리지 않은 차수는 받을 수 없다.★
       * 조건(환경부 승인·착공·준공마감)이 차야 청구가 열린다 — 그 전에 수금이 찍히면
       * 계획에 없던 돈이 들어온 것으로 보이고, 차수 상태(대기/청구가능/수금)도 뒤집힌다.
       * 되돌리는 것(value === null)은 언제나 열어 둔다.
       */
      if (value) {
        const [record] = await recordsOf([row]);
        const steps = toDetail(record, await ruleMap(), await settleMap()).admin?.steps ?? [];
        const step = steps.find((x) => x.no === no);
        if (!step || step.state === 'na') throw new Error(`${no}차는 이 현장의 정산 규칙에 없습니다.`);
        if (step.state === 'waiting') {
          throw new Error(`${no}차(${step.trigger})는 아직 조건이 차지 않았습니다.`);
        }
      }

      await tx
        .insert(settlements)
        .values({ projectId, [atKey]: value?.at ?? null, [amountKey]: value?.amount ?? null })
        .onConflictDoUpdate({
          target: settlements.projectId,
          set: { [atKey]: value?.at ?? null, [amountKey]: value?.amount ?? null },
        });

      await writeAudit(tx, {
        projectId, actor,
        action: value ? `기성 ${no}차 수금` : `기성 ${no}차 수금 해제`,
        field: atKey,
        oldValue: before?.at ?? null,
        newValue: value ? `${value.at}${value.amount === null ? '' : ` · ${value.amount}원`}` : null,
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
        const open = openStepFor(r, item.kind, rules);
        await assertBatchOpen(tx, r, item.kind, open.no, at);
        await writePayoutStep(tx, r.project.id, item.kind, open, at, actor);
        total += open.amount;
      }
    });
    return { count: items.length, total };
  },

  async addPayoutEntry(projectId, input: NewPayoutEntry, actor): Promise<string> {
    const [id] = await this.addPayoutEntries(projectId, [input], actor);
    return id;
  },

  async addPayoutEntries(projectId, inputs: NewPayoutEntry[], actor): Promise<string[]> {
    assertAdmin(actor, '지급 기록');
    if (inputs.length === 0) throw new Error('넣을 값이 없습니다.');
    // 회차(1차·2차)는 여기로 못 들어온다 — 금액이 정해져 있어 runPayoutBatch 가 계산해 넣는다
    for (const input of inputs) {
      const bad = checkPayoutEntry(input, { manualOnly: true });
      if (bad) throw new Error(bad);
    }
    const rows = inputs.map((input) => ({
      id: crypto.randomUUID(),
      input,
      note: typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null,
    }));

    const db = getDb();
    await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) throw new Error('현장을 찾을 수 없습니다.');

      const stamp = stampOf(new Date());
      for (const { id, input, note } of rows) {
        await tx.insert(payoutEntries).values({
          id, projectId,
          kind: input.kind, category: input.category,
          /* 사람이 고른 회차 — 안 고르면 null 이라 예전처럼 총액에 붙는다 */
          amount: input.amount, step: input.step ?? null, at: input.at, note,
          createdAt: stamp,
        });
        /*
         * 손으로 적는 지급(선금·차액·회수 …)도 돈이 나간 것이다 — 같은 이유로 조건을 잠근다.
         * 조정(자재비·차감 등)은 계획을 바꾸는 것이라 잠그지 않는다.
         */
        if (entryTypeOf(input.category) === '지급') {
          await tx
            .update(projects)
            .set({ payoutTermsConfirmedAt: input.at })
            .where(and(eq(projects.id, projectId), isNull(projects.payoutTermsConfirmedAt)));
        }
        await writeAudit(tx, {
          projectId, actor, action: '지급 기록 추가',
          /* 회차가 회차 기준액을 통째로 움직인다 — 로그에 없으면 되짚을 수 없다 */
          field: `${input.kind} ${input.category}${input.step ? ` ${input.step}차분` : ''}`,
          oldValue: null, newValue: `${input.amount}원 · ${input.at}${note ? ` · ${note}` : ''}`,
        });
      }
      // 지급을 적는 것도 진척이다 — 정체일 기준을 갱신한다
      await tx.update(projects).set({ lastProgressAt: today() }).where(eq(projects.id, projectId));
    });
    return rows.map((r) => r.id);
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

      /*
       * 확정된 배치의 지급 줄은 잠긴다 — 협력사가 그 합계로 세금계산서를 발행했다.
       * 조정(자재비·차감)은 배치가 아니라서 안 본다. 줄의 지급처는 현장에서 유도한다.
       */
      if (entryTypeOf(row.category as PayoutCategory) === '지급') {
        const [proj] = await tx
          .select({ salesOrg: projects.salesOrg, gcOrg: projects.gcOrg })
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        const org = row.kind === '영업비' ? proj?.salesOrg : proj?.gcOrg;
        if (org) {
          const [fin] = await tx
            .select({ id: batchFinals.id })
            .from(batchFinals)
            .where(and(
              eq(batchFinals.org, org),
              eq(batchFinals.kind, row.kind),
              eq(batchFinals.payDate, row.at),
            ))
            .limit(1);
          if (fin) {
            throw new Error('최종 확정된 배치의 지급입니다 — 빼려면 먼저 확정을 해제하세요.');
          }
        }
      }

      await tx.delete(payoutEntries).where(eq(payoutEntries.id, entryId));
      // 지운 값을 로그에 통째로 남긴다 — 고치기가 없는 대신 무엇이 지워졌는지는 남아야 한다
      await writeAudit(tx, {
        projectId, actor, action: '지급 기록 삭제',
        /* 지운 값을 통째로 남긴다 — 회차도 그 값의 일부다(고치는 길이 지우고 다시 적기다) */
        field: `${row.kind} ${row.category}${row.step ? ` ${row.step}차분` : ''}`,
        oldValue: `${row.amount}원 · ${row.at}${row.note ? ` · ${row.note}` : ''}`, newValue: null,
      });
    });
  },
};

/**
 * 이번에 확정할 회차와 금액 — 못 하면 왜 못 하는지로 던진다.
 *
 * 계획은 단가 × 대수, 회차는 그 70% 와 잔액이다(lib/settlement). 그 앞에 지급 자체를
 * 막는 사정(받는 곳 미지정·단가 미지정·영업비 서류 미비)이 있으면 먼저 걸린다.
 */
function openStepFor(
  r: ProjectRecord,
  kind: PayoutKind,
  rules: RuleMap
): { no: 1 | 2; amount: number } {
  const name = r.project.name;

  /*
   * ★멈춘 계약에는 돈이 나가지 않는다★ (한백 지시 2026-09-04, 감사 H3).
   * 화면(lib/payout-board workOf)이 「계약중단 — 지급 불가」로 막지만 화면만 막으면
   * 주소를 두드리는 길이 남는다. 이미 나간 것은 여기서 되돌리지 않는다 — 되받는 것은
   * 「회수」 명목으로 사람이 적는다.
   */
  if (r.project.holdState) {
    throw new Error(`${name} — ${r.project.holdState} 상태라 지급할 수 없습니다.`);
  }

  const org = kind === '영업비' ? r.project.salesOrg : r.project.gcOrg;
  const prerequisites = payoutPrerequisiteBlockersOf({
    kind,
    org,
    unpriced: r.lines.filter((line) => !line.pricingRuleId).length,
    payoutDocsMissing: kind === '영업비' ? contractStateFor(r).payoutDocsMissing : [],
  });
  if (prerequisites.length > 0) throw new Error(`${name} ${kind} — ${prerequisites[0]}`);

  const plan = r.lines.reduce((n, l) => {
    const rule = l.pricingRuleId ? rules.get(l.pricingRuleId) : null;
    const unit = kind === '영업비' ? rule?.salesUnit : rule?.consUnit;
    return n + (unit ?? 0) * l.qty;
  }, 0);
  const { open } = payoutStepsOf(plan, payoutSideOf(r.payoutEntries ?? [], kind));
  if (!open) throw new Error(`${name} ${kind} — 확정할 회차가 없습니다 (잔액 0 이거나 이미 확정됐습니다).`);

  const release = payoutReleaseOf(kind, open.no, payoutMilestonesFor(r));
  if (!release.met) {
    throw new Error(`${name} ${kind} ${open.no}차 — ${release.trigger} 후 지급할 수 있습니다.`);
  }
  return open;
}

/**
 * 그 배치에 얹을 수 있는가 — 잠긴 배치와 두 번 확정을 막는다.
 *
 * 최종 확정된 배치에 얹으면 잠긴 합계가 바뀐다. 같은 회차 줄이 이미 있으면 두 번 눌린
 * 것이라 배치를 통째로 세운다 — 한 건만 빼고 넘어가면 어느 것이 나갔는지 알 수 없다.
 */
async function assertBatchOpen(
  tx: TxLike,
  r: ProjectRecord,
  kind: PayoutKind,
  no: 1 | 2,
  at: string
): Promise<void> {
  const name = r.project.name;
  const org = kind === '영업비' ? r.project.salesOrg : r.project.gcOrg;
  if (org) {
    const [fin] = await tx
      .select({ id: batchFinals.id })
      .from(batchFinals)
      .where(and(eq(batchFinals.org, org), eq(batchFinals.kind, kind), eq(batchFinals.payDate, at)))
      .limit(1);
    if (fin) throw new Error(`${name} ${kind} — ${at} ${org} ${kind} 배치는 최종 확정돼 잠겨 있습니다.`);
  }

  const [dup] = await tx
    .select({ id: payoutEntries.id })
    .from(payoutEntries)
    .where(and(
      eq(payoutEntries.projectId, r.project.id),
      eq(payoutEntries.kind, kind),
      eq(payoutEntries.category, `${no}차`)
    ))
    .limit(1);
  if (dup) throw new Error(`${name} ${kind} ${no}차 — 이미 지급 확정된 회차입니다.`);
}

/**
 * 회차 한 줄을 원장에 적고 그 뒷일을 한다.
 *
 * ★지급이 나가면 지급조건을 잠근다★ (한백 지시 2026-08-28) — 돈이 움직인 뒤에 단가를
 * 갈아 끼우면 잔액과 기성이 같이 뒤틀린다. 이미 확정된 현장은 그대로 둔다(확정일이
 * 앞당겨지면 안 된다).
 */
async function writePayoutStep(
  tx: TxLike,
  projectId: string,
  kind: PayoutKind,
  open: { no: 1 | 2; amount: number },
  at: string,
  actor: Actor
): Promise<void> {
  const category = `${open.no}차`;
  await tx.insert(payoutEntries).values({
    id: crypto.randomUUID(), projectId,
    /* 지급 줄에서 회차는 명목과 짝이다 — 서버가 채운다(사람이 고르는 것은 조정뿐) */
    kind, category, amount: open.amount, step: open.no, at, note: null,
    createdAt: stampOf(new Date()),
  });
  await tx.update(projects).set({ lastProgressAt: today() }).where(eq(projects.id, projectId));
  await tx
    .update(projects)
    .set({ payoutTermsConfirmedAt: at })
    .where(and(eq(projects.id, projectId), isNull(projects.payoutTermsConfirmedAt)));
  await writeAudit(tx, {
    projectId, actor, action: '지급 확정',
    field: `${kind} ${category}`, oldValue: null, newValue: `${open.amount}원 · ${at}`,
  });
}

/**
 * 붙일 단가 케이스가 쓸 수 있는 것인지 보고, 케이스가 든 정산 규칙 제안값을 돌려준다.
 *
 * 없는 케이스를 붙이면 조회할 때 rule 이 null 이 되어 「단가 미지정」으로 보인다 —
 * 저장은 됐는데 화면엔 안 붙는 상태라 원인을 찾기 어렵다. 여기서 막는다.
 */
async function checkPricingRule(tx: TxLike, pricingRuleId: string): Promise<string | null> {
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
  return rule.settle;
}

/**
 * ★확정된 지급조건은 못 바꾼다★ (migrations/0035, 한백 지시 2026-08-28).
 *
 * 단가 케이스가 계획·잔액·기성·마진을 전부 정하므로, 돈이 움직인 뒤에 갈아 끼우면
 * 지급과 기성 구조가 같이 뒤틀린다. 고쳐야 하면 확정을 먼저 해제한다.
 */
async function assertTermsOpen(tx: TxLike, projectId: string): Promise<void> {
  const [locked] = await tx
    .select({ at: projects.payoutTermsConfirmedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (locked?.at) {
    throw new Error(`지급조건이 확정된 현장입니다(${locked.at}) — 확정을 해제한 뒤 바꾸세요.`);
  }
}

/**
 * 케이스의 정산 규칙 제안값을 현장에 옮긴다 — 현장에 아직 규칙이 없을 때만.
 *
 * project.settlementRuleId 를 넣는 코드가 여기 말고는 없었다. 시드 현장만 값이 있고,
 * 새 현장은 단가를 붙여도 기성이 영구히 「정산 규칙 미적용」이었다 — 케이스가
 * 제안값(defaultSettlementRuleId)을 들고 있는데 아무도 읽지 않았다.
 * 이미 규칙이 있는 현장은 건드리지 않는다 — 사람이 정한 값을 덮지 않는다.
 */
async function applySuggestedSettlement(
  tx: TxLike, projectId: string, suggested: string, day: string, actor: Actor
): Promise<void> {
  const [p] = await tx
    .select({ settle: projects.settlementRuleId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!p || p.settle) return;
  await tx
    .update(projects)
    .set({ settlementRuleId: suggested, settlementAppliedAt: day })
    .where(eq(projects.id, projectId));
  await writeAudit(tx, {
    projectId, actor, action: '정산 규칙 적용',
    field: 'settlementRuleId', oldValue: null, newValue: suggested,
  });
}

/**
 * 단가 케이스 · 정산 규칙 · 충전기 모델 — 기준값을 다루는 저장소 조각.
 *
 * `pg-store.ts` 에서 떼어 왔다(doc/REFACTOR_PLAN_3.md 2-1). 인터페이스는 그대로고
 * 부르는 쪽은 바뀌지 않는다 — pgRepository 가 이 객체를 펼쳐 담는다.
 *
 * ★케이스는 참조되면 불변이다★ — 고치는 것은 개정(새 행)과 중지뿐이고, 여기 있는
 * 수정 메서드도 참조 전에만 통한다. 그 판정은 lib/pricing-match 가 한다.
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { chargerModels, contractLines, pricingRules, projects, settlementRules } from '@/lib/db/schema';
import { checkPricingRule, duplicateOf, normalizePricingRule, pricingRuleId } from '@/lib/pricing-match';
import type {
  BizType, BuildingType, ChargerModel, CpoName, LineAxes, PricingRule, ReplType, SettlementRule,
} from '@/types/project';
import type { ProjectRepository } from '../repository';
import { assertAdmin, assertHanbaek, resolveSettlementRule, rowToRule, rowToSettle } from './shared';

/** pgRepository 가 펼쳐 담는 조각 — 이름과 시그니처는 인터페이스가 정한다 */
export const pricingStore: Pick<
  ProjectRepository,
  'listLineAxes' | 'listPricingRules' | 'listChargerModels' | 'addChargerModel'
  | 'listSettlementRules' | 'addPricingRule' | 'updatePricingRule'
  | 'setPricingRuleMeta' | 'setPricingRuleActive' | 'deletePricingRule'
> = {
  async listLineAxes(actor): Promise<LineAxes[]> {
    assertHanbaek(actor, '단가 판정 축 조회');
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
    assertHanbaek(actor, '단가 케이스 조회');
    const rows = await getDb().select().from(pricingRules).orderBy(pricingRules.caseName);
    return rows.map(rowToRule);
  },

  /* 금액이 없어 누구나 본다 — 시공사가 자기 현장의 모델을 고른다 */
  async listChargerModels(): Promise<ChargerModel[]> {
    const rows = await getDb().select().from(chargerModels).orderBy(chargerModels.name);
    return rows.map((r) => ({
      id: r.id, name: r.name, maker: r.maker, note: r.note, active: r.active,
    }));
  },

  async addChargerModel(input, actor): Promise<string> {
    assertAdmin(actor, '충전기 모델 등록');
    const name = input.name?.trim();
    if (!name) throw new Error('모델명을 적어주세요.');
    if (name.length > 80) throw new Error('모델명이 너무 깁니다.');

    const db = getDb();
    // 이름이 겹치면 거절한다 — 같은 모델이 두 이름으로 갈리면 현장마다 다른 것을 고른다
    const [dup] = await db.select({ id: chargerModels.id }).from(chargerModels)
      .where(eq(chargerModels.name, name)).limit(1);
    if (dup) throw new Error(`이미 등록된 모델입니다 — ${name}`);

    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(chargerModels).values({
        id, name,
        maker: input.maker?.trim() || null,
        note: input.note?.trim() || null,
      });
      await writeAudit(tx, {
        projectId: null, actor, action: '충전기 모델 등록',
        field: 'chargerModels', oldValue: null, newValue: name,
      });
    });
    return id;
  },

  async listSettlementRules(actor): Promise<SettlementRule[]> {
    assertHanbaek(actor, '정산 규칙 조회');
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
            supplyItems: rule.supplyItems, promo: rule.promo,
            promoExtend: rule.promoExtend, chargeRate: rule.chargeRate,
            installTerms: rule.installTerms, otherSupport: rule.otherSupport,
            coexistTerms: rule.coexistTerms, miscTerms: rule.miscTerms,
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

      /*
       * ★참조돼 있어도 고친다 — 개정은 없다★ (한백 지시 2026-09-04 「기존에 있던 걸
       * 수정하는 게 맞는 거야. 개정이란 없어 — 내가 새 표를 주지 않는 이상」).
       *
       * 그전에는 참조 하나만 있어도 「개정으로 새 케이스」로 돌려보냈다 — 그 강요가
       * 2027 케이스 사고(9/3)를 만들었다. 라인은 케이스를 참조만 하므로 수정은 그
       * 현장들의 계획에 그대로 반영된다 — 그것이 곧 의도다(마진 분해를 고치면 전 현장이
       * 따라온다). 새 정책표가 오면 그때만 새 케이스를 세운다(시작일로 갈린다).
       *
       * ★잠긴 현장이 참조 중이면 거절한다.★ 지급조건 확정(= 돈이 나갔거나 한백이 굳힌
       * 현장)은 단가 변경이 금지다 — 케이스를 고치는 것은 그 금지를 뒷문으로 여는 것이라
       * 같은 자물쇠가 걸려야 한다. 해제(관리자)가 먼저다.
       */
      const lockedRefs = await tx
        .select({ name: projects.name })
        .from(contractLines)
        .innerJoin(projects, eq(contractLines.projectId, projects.id))
        .where(and(
          eq(contractLines.pricingRuleId, id),
          isNotNull(projects.payoutTermsConfirmedAt)
        ));
      if (lockedRefs.length > 0) {
        const names = [...new Set(lockedRefs.map((r) => r.name))];
        const head = names.slice(0, 3).join(' · ');
        throw new Error(
          `지급조건이 확정된 현장 ${names.length}곳이 이 케이스를 참조합니다(${head}${names.length > 3 ? ' 외' : ''}) — 고치려면 그 현장의 확정을 먼저 해제하세요.`
        );
      }

      // 축·시작을 옮기면 다른 케이스와 같은 칸·같은 시작이 될 수 있다 (setPricingRuleMeta 와 같은 판정)
      if (me.active) {
        const dup = duplicateOf(rule, all.filter((r) => r.id !== id));
        if (dup) {
          throw new Error(`같은 조건을 덮는 케이스가 이미 있습니다 — ${dup.caseName}. 다른 시기의 표라면 적용 시작을 다르게 적어주세요.`);
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
        supplyItems: rule.supplyItems, promo: rule.promo,
        promoExtend: rule.promoExtend, chargeRate: rule.chargeRate,
        installTerms: rule.installTerms, otherSupport: rule.otherSupport,
        coexistTerms: rule.coexistTerms, miscTerms: rule.miscTerms,
        defaultSettlementRuleId: settleId,
        supervisionBearer: rule.supervisionBearer, safetyFeeBearer: rule.safetyFeeBearer,
        note: rule.note,
      }).where(eq(pricingRules.id, id));
      /* 몇 현장의 계획이 따라 바뀌었는지를 로그에 남긴다 — 소급 반영이 이 수정의 뜻이다 */
      const refs = await tx
        .select({ id: contractLines.id })
        .from(contractLines)
        .where(eq(contractLines.pricingRuleId, id));
      await writeAudit(tx, {
        projectId: null, actor, action: '단가 케이스 수정',
        field: id, oldValue: me.caseName,
        newValue: refs.length > 0 ? `${rule.caseName} (참조 라인 ${refs.length}건에 반영)` : rule.caseName,
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

  async deletePricingRule(id, actor): Promise<void> {
    assertAdmin(actor, '단가 케이스 삭제');
    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ caseName: pricingRules.caseName })
        .from(pricingRules)
        .where(eq(pricingRules.id, id))
        .limit(1);
      if (!row) throw new Error('없는 단가 케이스입니다.');
      /*
       * ★참조가 하나라도 있으면 못 지운다★ — 지우면 그 라인의 지급액·기성이 계산 불능이
       * 된다. 화면은 참조된 케이스에 삭제 단추를 안 주지만(개정·중지가 그 길), 표시가
       * 낡았을 수 있어 여기서 다시 센다. 건수를 문구에 적는다(화면 규칙 3).
       */
      const refs = await tx
        .select({ id: contractLines.id })
        .from(contractLines)
        .where(eq(contractLines.pricingRuleId, id));
      if (refs.length > 0) {
        throw new Error(`현장 라인 ${refs.length}건이 이 케이스를 참조합니다 — 지울 수 없습니다. 개정·중지를 쓰세요.`);
      }
      await tx.delete(pricingRules).where(eq(pricingRules.id, id));
      await writeAudit(tx, {
        projectId: null, actor, action: '단가 케이스 삭제',
        field: id, oldValue: row.caseName, newValue: null,
      });
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
};

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
import { pricingRules, settlementRules } from '@/lib/db/schema';
import type {
  BizType, BuildingType, CpoName, PricingRule, PromoExtendOption, PromoStep, ReplType,
  SettlementRule, SettlementStepRule,
} from '@/types/project';
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

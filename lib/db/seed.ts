/**
 * 시드 — 빈 DB 에 규칙과 예시 현장을 심는다.
 *
 *   npx tsx lib/db/seed.ts                    규칙(정산 6 · 단가 34) + 예시 현장 6건
 *   npx tsx lib/db/seed.ts --with-dev-users   개발 계정 4개도 넣는다 (로컬 전용)
 *   npx tsx lib/db/seed.ts --reset            현장 데이터를 지우고 다시 심는다 (규칙은 유지)
 *
 * 멱등하다 — 여러 번 돌려도 규칙이 중복되거나 덮어써지지 않는다.
 *
 * ★규칙은 절대 덮어쓰지 않는다(onConflictDoNothing).★ 단가·정산 케이스는 불변이라,
 * 이미 현장에 적용된 규칙의 금액이 시드 재실행으로 바뀌면 과거 계약 금액이 소급 변경된다.
 * 대신 시드 파일과 DB 가 어긋난 게 있으면 찾아서 보고한다.
 */
import { loadEnvFile } from '../env-file';

loadEnvFile();

import { eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import {
  contractLines, documents, payoutEntries, pricingRules, processDocuments, processes,
  projects, settlementRules, settlements, users,
} from './schema';
import { PRICING_RULES } from '../data/seed/pricing-rules';
import { SETTLEMENT_RULES } from '../data/seed/settlement-rules';
import { SEED_RECORDS } from '../data/mock';
import { DEV_USERS } from '../auth/users';

const args = process.argv.slice(2);
const withDevUsers = args.includes('--with-dev-users');
const reset = args.includes('--reset');

const db = getDb();
const ts = (day: string) => new Date(`${day}T00:00:00Z`);

async function seedRules() {
  await db.insert(settlementRules).values(
    SETTLEMENT_RULES.map((r) => ({
      id: r.id, name: r.name, steps: r.steps, note: r.note, active: r.active,
    }))
  ).onConflictDoNothing();

  await db.insert(pricingRules).values(
    PRICING_RULES.map((r) => ({
      id: r.id, caseName: r.caseName, cpo: r.cpo, bizType: r.bizType,
      powerType: r.powerType, termYears: r.termYears, bldgTypes: r.bldgTypes,
      replType: r.replType, channel: r.channel, bizYear: r.bizYear, startDate: r.startDate,
      salesUnit: r.salesUnit, consUnit: r.consUnit, margin: r.margin,
      supplyItems: r.supplyItems, promo: r.promo,
      promoExtend: r.promoExtend, chargeRate: r.chargeRate,
      installTerms: r.installTerms, otherSupport: r.otherSupport,
      coexistTerms: r.coexistTerms, miscTerms: r.miscTerms,
      defaultSettlementRuleId: r.defaultSettlementRuleId,
      supervisionBearer: r.supervisionBearer, safetyFeeBearer: r.safetyFeeBearer,
      note: r.note, active: r.active,
    }))
  ).onConflictDoNothing();

  const [sCount, pCount] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(settlementRules),
    db.select({ n: sql<number>`count(*)::int` }).from(pricingRules),
  ]);
  console.log(`  정산 규칙 ${sCount[0].n}개 · 단가 규칙 ${pCount[0].n}개`);

  /*
   * 덮어쓰지 않기로 했으니, 어긋난 게 있으면 조용히 넘기지 않고 드러낸다.
   *
   * ★금액만 보면 안 된다.★ 예전에는 salesUnit·consUnit·margin 만 비교했다. 그래서 교체유형의
   * 낱말이 바뀐 것(신규 → 환경부 신규)을 34행 전부 놓쳤다 — DB 는 옛 낱말을 그대로 갖고 있었고
   * 아무도 몰랐다. 축은 「어느 현장에 이 케이스가 붙는가」를 정하므로, 어긋나면 금액이 맞아도
   * 그 케이스는 아무 현장에도 안 맞는다.
   *
   * 금액과 축을 다르게 다룬다 — 금액은 불변이라 DB 를 지키고, 축은 낱말이라 시드에 맞춘다.
   */
  const stored = await db.select().from(pricingRules);
  const byId = new Map(stored.map((r) => [r.id, r]));

  const money = PRICING_RULES.filter((seed) => {
    const row = byId.get(seed.id);
    if (!row) return false;
    return row.salesUnit !== seed.salesUnit
      || row.consUnit !== seed.consUnit
      || row.margin !== seed.margin;
  });
  if (money.length > 0) {
    console.warn(`  ⚠ 시드 파일과 DB 금액이 다른 케이스 ${money.length}건 — DB 값을 유지했습니다:`);
    for (const d of money) {
      const row = byId.get(d.id)!;
      console.warn(
        `    ${d.id}  DB(${row.salesUnit}/${row.consUnit}/${row.margin})` +
        ` ← 시드(${d.salesUnit}/${d.consUnit}/${d.margin})`
      );
    }
    console.warn('  단가는 불변입니다. 바꿔야 한다면 새 케이스를 추가하세요.');
  }

  /* 적용 시작도 축이다 — 시간축이 케이스의 정체를 가른다(같은 칸의 반기 개정을 이것으로 구분한다) */
  const axisOf = (r: { cpo: string; bizType: string; powerType: string; replType: string;
    channel: string; startDate: string; termYears: unknown; bldgTypes: unknown }) =>
    [r.cpo, r.bizType, r.powerType, r.replType, r.channel, r.startDate,
      JSON.stringify(r.termYears), JSON.stringify(r.bldgTypes)].join('|');

  const axis = PRICING_RULES.filter((seed) => {
    const row = byId.get(seed.id);
    return row ? axisOf(row) !== axisOf(seed) : false;
  });
  if (axis.length > 0) {
    console.warn(`  ⚠ 축이 다른 케이스 ${axis.length}건:`);
    for (const d of axis) {
      const row = byId.get(d.id)!;
      /*
       * 참조 중인 케이스는 건드리지 않는다.
       *
       * 이 정렬은 「낱말 개명」(신규 → 환경부 신규)을 위한 것인데, 코드는 개명과 조건 변경을
       * 구분할 수 없다 — 시드 파일에서 기존 블록을 복사해 새 케이스를 만들다 id 를 안 바꾸면,
       * insert 는 onConflictDoNothing 으로 조용히 빠지고 이 update 가 「이미 라인이 참조하는
       * 케이스의 조건」을 새 축으로 덮는다. 지정 당시 조건이 흔적 없이 사라진다.
       * 참조가 없으면 안전하고, 있으면 사람이 봐야 하는 일이다.
       */
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(contractLines)
        .where(eq(contractLines.pricingRuleId, d.id));
      if (n > 0) {
        console.warn(`    ${d.id}  계약 라인 ${n}건이 참조 중 — 건너뜁니다. DB(${axisOf(row)}) ≠ 시드(${axisOf(d)})`);
        continue;
      }
      console.warn(`    ${d.id}  DB(${axisOf(row)}) → 시드(${axisOf(d)})`);
      await db.update(pricingRules).set({
        cpo: d.cpo, bizType: d.bizType, powerType: d.powerType, replType: d.replType,
        channel: d.channel, startDate: d.startDate,
        termYears: d.termYears, bldgTypes: d.bldgTypes, caseName: d.caseName,
      }).where(eq(pricingRules.id, d.id));
    }
  }
}

async function clearProjects() {
  // projects 의 자식은 onDelete cascade 라 현장만 지우면 따라 지워진다
  await db.delete(projects);
  console.log('  기존 현장 데이터 삭제');
}

async function seedProjects() {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(projects);
  if (existing[0].n > 0) {
    console.log(`  현장 ${existing[0].n}건이 이미 있어 예시 현장은 건너뜁니다 (--reset 으로 초기화)`);
    return;
  }

  for (const r of SEED_RECORDS) {
    const p = r.project;
    await db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id: p.id, mgmtNo: p.mgmtNo, cpo: p.cpo, salesOrg: p.salesOrg, gcOrg: p.gcOrg,
        name: p.name, addr: p.addr, bldgType: p.bldgType, contractParty: p.contractParty,
        parkTotal: p.parkTotal, mgr: p.mgr, tel: p.tel, mail: p.mail,
        preInstall: p.preInstall, preNote: p.preNote, powerType: p.powerType,
        replType: p.replType, bizType: p.bizType, envQueueNo: p.envQueueNo,
        settlementRuleId: p.settlementRuleId, settlementAppliedAt: p.settlementAppliedAt,
        holdState: p.holdState, holdNote: p.holdNote,
        court: r.court, lastProgressAt: r.lastProgressAt, createdAt: ts(p.createdAt),
      });

      if (r.lines.length > 0) {
        await tx.insert(contractLines).values(
          r.lines.map((l) => ({
            id: l.id, projectId: l.projectId, termYears: l.termYears, qty: l.qty,
            powerType: l.powerType, replType: l.replType, memo: l.memo,
            pricingRuleId: l.pricingRuleId, pricedAt: l.pricedAt,
          }))
        );
      }

      // 안 올라온 칸은 행을 만들지 않는다 — 조회할 때 mergeDocs 가 15칸을 채운다
      const realDocs = r.documents.filter((d) => d.status !== 'none' || d.filename);
      if (realDocs.length > 0) {
        await tx.insert(documents).values(
          realDocs.map((d) => ({
            projectId: p.id, kind: d.kind, filename: d.filename, status: d.status,
            rejectReason: d.rejectReason, uploadedBy: d.uploadedBy, uploadedAt: d.uploadedAt,
          }))
        );
      }

      const proc = r.process;
      await tx.insert(processes).values({
        projectId: p.id,
        envApprovalDate: proc.envApprovalDate, cpoApprovalDate: proc.cpoApprovalDate,
        chargerOrderDate: proc.chargerOrderDate,
        chargerShipDate: proc.chargerShipDate, chargerRecvDate: proc.chargerRecvDate,
        startPlanDate: proc.startPlanDate, startActualDate: proc.startActualDate,
        installDoneDate: proc.installDoneDate, commDoneDate: proc.commDoneDate,
        status: proc.status, memo: proc.memo,
      });

      const realProcDocs = proc.docs.filter((d) => d.status !== 'none' || d.filename);
      if (realProcDocs.length > 0) {
        await tx.insert(processDocuments).values(
          realProcDocs.map((d) => ({
            projectId: p.id, kind: d.kind, filename: d.filename, status: d.status,
            uploadedBy: d.uploadedBy, uploadedAt: d.uploadedAt,
          }))
        );
      }

      const s = r.settlementRaw;
      await tx.insert(settlements).values({
        projectId: p.id, closeDate: s.cpoCloseDate,
        collected1At: r.collected[1]?.at ?? null,
        collected2At: r.collected[2]?.at ?? null,
        collected3At: r.collected[3]?.at ?? null,
        collected1Amount: r.collected[1]?.amount ?? null,
        collected2Amount: r.collected[2]?.amount ?? null,
        collected3Amount: r.collected[3]?.amount ?? null,
        safetyFee: s.safetyFee,
      });

      if (r.payoutEntries && r.payoutEntries.length > 0) {
        await tx.insert(payoutEntries).values(
          r.payoutEntries.map((e) => ({
            id: e.id, projectId: p.id, kind: e.kind, category: e.category,
            amount: e.amount, at: e.at, note: e.note, createdAt: e.createdAt,
          }))
        );
      }
    });
  }
  console.log(`  예시 현장 ${SEED_RECORDS.length}건`);
}

async function seedDevUsers() {
  /*
   * 개발 계정의 비밀번호는 전부 `dev1234!` 로 공개돼 있다.
   * 지금 로그인은 이 표를 읽지 않는다(lib/auth/users.ts 가 환경변수·시드를 본다) —
   * 계정 저장소를 DB 로 바꿀 때 실제 비밀번호로 다시 심는다.
   */
  await db.insert(users).values(
    DEV_USERS.map((u) => ({
      id: u.id, name: u.name, role: u.role, org: u.org,
      passwordHash: u.hash, active: true,
    }))
  ).onConflictDoNothing();
  console.log(`  개발 계정 ${DEV_USERS.length}개 (비밀번호 dev1234! — 로컬 전용)`);
}

async function main() {
  console.log(`시드 시작 — ${process.env.DATABASE_URL?.includes('6543') ? 'Transaction pooler' : '직접/Session'}`);
  await seedRules();
  if (reset) await clearProjects();
  await seedProjects();
  if (withDevUsers) await seedDevUsers();
  console.log('완료');
  process.exit(0);
}

main().catch((err) => {
  console.error('시드 실패:', err);
  process.exit(1);
});

/**
 * 지급 배치 · 세금계산서 — 협력사에게 나가는 돈을 묶고 증빙을 붙이는 자리.
 *
 * `pg-store.ts` 에서 떼어 왔다(doc/REFACTOR_PLAN_3.md 2-1). 인터페이스는 그대로고
 * 부르는 쪽도 그대로다 — pgRepository 가 이 객체를 펼쳐 담는다.
 *
 * ★배치 = 지급처 × 구분 × 지급일★ 이 셋이 열쇠다. 지급일을 옮기면 그 배치에 붙은
 * 세금계산서의 pay_date 도 같이 옮겨야 한다 — 키가 갈라지면 첨부가 고아가 된다.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { batchFinals, payoutEntries, projects, taxInvoices } from '@/lib/db/schema';
import { today } from '@/lib/date';
import { entryTypeOf } from '@/lib/settlement';
import { canWrite, isHanbaek, normalizeOrg } from '@/lib/roles';
import { canAttachInvoice, INVOICE_LOCKED_WHY } from '@/lib/payout-board';
import type { BatchFinal, PayoutCategory, PayoutKind, TaxInvoice } from '@/types/project';
import type { Actor, ProjectRepository } from '../repository';
import { assertAdmin, assertHanbaek } from './shared';

/** pgRepository 가 펼쳐 담는 조각 — 이름과 시그니처는 인터페이스가 정한다 */
export const batchStore: Pick<
  ProjectRepository,
  'movePayoutBatch' | 'cancelPayoutBatch' | 'finalizeBatch' | 'listBatchFinals'
  | 'listTaxInvoices' | 'saveTaxInvoice' | 'updateTaxInvoice' | 'deleteTaxInvoice'
> = {
  async movePayoutBatch(org, kind, from, to, actor): Promise<{ moved: number }> {
    assertAdmin(actor, '배치 지급일 변경');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('지급일은 YYYY-MM-DD 형식이어야 합니다.');
    if (from === to) throw new Error('같은 지급일입니다.');

    const db = getDb();
    return db.transaction(async (tx) => {
      /*
       * 배치의 줄 = 그 지급일의 「지급」 타입 원장 줄 중, kind 가 가리키는 쪽의
       * 소속이 이 지급처인 것. 원장에는 org 가 없어서(정본은 현장) 현장을 조인해 가른다.
       * 조정(자재비·차감)은 안 옮긴다 — at 이 지급일이 아니라 발생일이다.
       */
      const rows = await tx
        .select({
          id: payoutEntries.id, projectId: payoutEntries.projectId,
          kind: payoutEntries.kind, category: payoutEntries.category,
          salesOrg: projects.salesOrg, gcOrg: projects.gcOrg,
        })
        .from(payoutEntries)
        .innerJoin(projects, eq(payoutEntries.projectId, projects.id))
        .where(eq(payoutEntries.at, from));
      const mine = rows.filter(
        (r) =>
          entryTypeOf(r.category as PayoutCategory) === '지급' &&
          r.kind === kind &&
          (r.kind === '영업비' ? r.salesOrg : r.gcOrg) === org
      );
      if (mine.length === 0) throw new Error('그 지급일에 이 지급처로 나간 지급이 없습니다.');
      /*
       * ★확정은 양쪽 다 본다★ (한백 지적 2026-08-31).
       *
       * 전에는 옮겨 오는 쪽(from)만 봤다. 그런데 옮겨간 날에 같은 지급처의 배치가 있으면
       * 합쳐지므로(아래 주석), ★잠긴 배치의 내용이 바깥에서 늘어날 수 있었다.★
       * 확정은 「이 내용으로 잠갔다」는 뜻이고, 세금계산서도 그 합계로 발행돼 있다 —
       * 줄이 하나 밀려 들어가면 협력사가 발행한 금액과 우리 명세서가 어긋난다.
       *
       * 가확정(runPayoutBatch)과 원장 추가는 이미 받는 쪽을 본다(assertBatchOpen) —
       * 옮기기만 그 잣대에서 빠져 있었다.
       */
      for (const [day, why] of [[from, '옮기려는'], [to, '옮겨갈']] as const) {
        const [fin] = await tx
          .select({ id: batchFinals.id })
          .from(batchFinals)
          .where(and(eq(batchFinals.org, org), eq(batchFinals.kind, kind), eq(batchFinals.payDate, day)))
          .limit(1);
        if (fin) {
          throw new Error(
            `${why} ${day} ${org} ${kind} 배치는 최종 확정돼 잠겨 있습니다 — 먼저 확정을 해제하세요.`
          );
        }
      }

      // 옮겨간 날에 같은 지급처의 배치가 이미 있으면 합쳐진다 — 명세서도 한 장이 된다. 막지 않는다.
      await tx
        .update(payoutEntries)
        .set({ at: to })
        .where(inArray(payoutEntries.id, mine.map((r) => r.id)));
      // 세금계산서는 배치를 따라간다 — 남겨두면 옛 날짜의 고아가 된다
      await tx
        .update(taxInvoices)
        .set({ payDate: to })
        .where(and(eq(taxInvoices.org, org), eq(taxInvoices.kind, kind), eq(taxInvoices.payDate, from)));

      await writeAudit(tx, {
        projectId: null, actor, action: `배치 지급일 변경 — ${org} ${kind}`,
        field: 'payDate', oldValue: from, newValue: `${to} (${mine.length}건)`,
      });
      return { moved: mine.length };
    });
  },

  async listTaxInvoices(actor): Promise<TaxInvoice[]> {
    /*
     * 한백은 전부, ★협력사는 자기 지급처 것만★ (한백 지시 2026-08-30 — 협력사가 직접
     * 올리게 되면서 자기가 올린 것을 화면에서 봐야 한다). 배치의 확정 상태는
     * listBatchFinals 가 따로 준다.
     *
     * 화면에서 거르지 않는다 — 서버가 렌더한 데이터는 브라우저에 통째로 실린다.
     */
    if (!isHanbaek(actor.role)) {
      if (!actor.org) return [];
      const mine = await getDb().select().from(taxInvoices)
        .where(eq(taxInvoices.org, actor.org));
      return mine.map((r) => ({
        id: r.id, org: r.org, kind: r.kind as PayoutKind, payDate: r.payDate,
        blobUrl: r.blobUrl, filename: r.filename,
        supplyAmount: r.supplyAmount, taxAmount: r.taxAmount, totalAmount: r.totalAmount,
        uploadedAt: r.uploadedAt,
      }));
    }
    const rows = await getDb().select().from(taxInvoices);
    return rows.map((r) => ({
      id: r.id, org: r.org, kind: r.kind as PayoutKind, payDate: r.payDate,
      blobUrl: r.blobUrl, filename: r.filename,
      supplyAmount: r.supplyAmount, taxAmount: r.taxAmount, totalAmount: r.totalAmount,
      uploadedAt: r.uploadedAt,
    }));
  },

  async cancelPayoutBatch(org, kind, payDate, actor): Promise<{ canceled: number }> {
    assertAdmin(actor, '가확정 취소');
    const db = getDb();
    return db.transaction(async (tx) => {
      /*
       * 확정됐거나 계산서가 이미 붙은 배치는 통째로 못 무른다 — 협력사가 발행했거나
       * 발행 직전이라는 뜻이다. 계산서를 먼저 지우게 해서 「첨부가 조용히 고아가 되는」
       * 길을 막는다. 잠금 해제 → 계산서 삭제 → 취소 순서가 되돌리는 길이다.
       */
      const [fin] = await tx
        .select({ id: batchFinals.id })
        .from(batchFinals)
        .where(and(eq(batchFinals.org, org), eq(batchFinals.kind, kind), eq(batchFinals.payDate, payDate)))
        .limit(1);
      if (fin) throw new Error('최종 확정된 배치입니다 — 먼저 확정을 해제하세요.');
      const [inv] = await tx
        .select({ id: taxInvoices.id })
        .from(taxInvoices)
        .where(and(eq(taxInvoices.org, org), eq(taxInvoices.kind, kind), eq(taxInvoices.payDate, payDate)))
        .limit(1);
      if (inv) throw new Error('세금계산서가 붙어 있습니다 — 먼저 계산서를 지우세요.');

      const rows = await tx
        .select({
          id: payoutEntries.id, projectId: payoutEntries.projectId,
          kind: payoutEntries.kind, category: payoutEntries.category, amount: payoutEntries.amount,
          salesOrg: projects.salesOrg, gcOrg: projects.gcOrg,
        })
        .from(payoutEntries)
        .innerJoin(projects, eq(payoutEntries.projectId, projects.id))
        .where(eq(payoutEntries.at, payDate));
      const mine = rows.filter(
        (r) =>
          entryTypeOf(r.category as PayoutCategory) === '지급' &&
          r.kind === kind &&
          (r.kind === '영업비' ? r.salesOrg : r.gcOrg) === org
      );
      if (mine.length === 0) throw new Error('그 지급일에 이 배치로 나간 지급이 없습니다.');

      await tx.delete(payoutEntries).where(inArray(payoutEntries.id, mine.map((r) => r.id)));
      // 무엇을 물렀는지 통째로 남긴다 — 회차들이 지급 가능으로 돌아간다
      await writeAudit(tx, {
        projectId: null, actor, action: `가확정 취소 — ${org} ${kind} ${payDate}`,
        field: 'batch',
        oldValue: mine.map((r) => `${r.projectId} ${r.category} ${r.amount}원`).join(' · '),
        newValue: null,
      });
      return { canceled: mine.length };
    });
  },

  async finalizeBatch(org, kind, payDate, undo, actor): Promise<void> {
    assertAdmin(actor, '배치 최종 확정');
    const db = getDb();
    await db.transaction(async (tx) => {
      const [fin] = await tx
        .select()
        .from(batchFinals)
        .where(and(eq(batchFinals.org, org), eq(batchFinals.kind, kind), eq(batchFinals.payDate, payDate)))
        .limit(1);

      if (undo) {
        if (!fin) throw new Error('아직 확정되지 않은 배치입니다.');
        await tx.delete(batchFinals).where(eq(batchFinals.id, fin.id));
      } else {
        if (fin) throw new Error('이미 확정된 배치입니다.');
        /*
         * 없는 배치를 확정하면 잠글 것이 없는데 잠겼다는 행만 남는다 — 지급 줄이 실제로
         * 있는지 본다. 세금계산서는 보지 않는다(한백 확인 2026-08-24 — 계산서는 검토
         * 없는 보관용 첨부일 뿐, 확정의 조건이 아니다).
         */
        const rows = await tx
          .select({
            kind: payoutEntries.kind, category: payoutEntries.category,
            salesOrg: projects.salesOrg, gcOrg: projects.gcOrg,
          })
          .from(payoutEntries)
          .innerJoin(projects, eq(payoutEntries.projectId, projects.id))
          .where(eq(payoutEntries.at, payDate));
        const exists = rows.some(
          (r) =>
            entryTypeOf(r.category as PayoutCategory) === '지급' &&
            r.kind === kind &&
            (r.kind === '영업비' ? r.salesOrg : r.gcOrg) === org
        );
        if (!exists) throw new Error('그 지급일에 이 배치로 나간 지급이 없습니다.');
        await tx.insert(batchFinals).values({
          id: crypto.randomUUID(), org, kind, payDate, finalizedAt: today(),
        });
      }
      await writeAudit(tx, {
        projectId: null, actor,
        action: `배치 ${undo ? '확정 해제' : '최종 확정'} — ${org} ${kind} ${payDate}`,
        field: 'finalized', oldValue: fin?.finalizedAt ?? null, newValue: undo ? null : today(),
      });
    });
  },

  async listBatchFinals(actor): Promise<BatchFinal[]> {
    // 협력사도 자기 배치의 확정 여부는 본다 — 가확정/확정 배지가 이걸로 그려진다
    const rows = isHanbaek(actor.role)
      ? await getDb().select().from(batchFinals)
      : actor.org
        ? await getDb().select().from(batchFinals).where(eq(batchFinals.org, actor.org))
        : [];
    return rows.map((r) => ({
      org: r.org, kind: r.kind as PayoutKind, payDate: r.payDate, finalizedAt: r.finalizedAt,
    }));
  },

  async saveTaxInvoice(input, actor): Promise<{ id: string; replacedBlobUrl: string | null }> {
    if (!canWrite(actor.role)) throw new Error('열람 전용 계정입니다.');
    /*
     * ★지급처는 여기서 한 번 정규화하고 그 값만 쓴다★ (2026-08-30 검토).
     * 판정(canAttachInvoice)은 normalizeOrg 로 느슨하게 보는데 조회는 원문으로 하고
     * 있어서, 이름 가운데 제로폭 문자를 하나 끼우면 소속 판정은 통과하고 확정 조회는
     * 빗나갔다 — 확정된 배치에 붙는 길이 열려 있었다. DB 의 지급처는 이미 정규화된
     * 값이라(계정·현장 저장이 그렇게 한다) 정규화한 값으로 맞추는 것이 옳다.
     */
    const org = normalizeOrg(input.org);
    if (!org) throw new Error('지급처가 없습니다.');
    // 형식 → 배치가 실재하나 → 붙일 권한이 있나. 형식이 깨진 날짜로 조회부터 하지 않는다
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.payDate)) throw new Error('지급일이 올바르지 않습니다.');
    await assertBatchExists(org, input.kind, input.payDate);
    /*
     * ★협력사는 자기 지급처의 배치에만, 확정 전까지만★ (한백 지시 2026-08-30).
     * 판정은 lib/payout-board 한 곳이고 화면도 같은 것을 본다 — 화면에서 단추만 감추면
     * 남의 지급처를 적어 보내는 길이 남는다.
     */
    await assertCanAttach(actor, org, input.kind, input.payDate);

    const db = getDb();
    const id = crypto.randomUUID();
    return db.transaction(async (tx) => {
      // 배치 하나에 한 장 — 이미 있으면 교체다. 옛 파일 주소를 돌려줘 라우트가 Blob 을 지운다.
      const [prev] = await tx
        .select()
        .from(taxInvoices)
        .where(and(
          eq(taxInvoices.org, org),
          eq(taxInvoices.kind, input.kind),
          eq(taxInvoices.payDate, input.payDate),
        ))
        .limit(1);
      // 확정 여부와 무관하게 붙이고 바꾼다 — 검토 없는 보관용 첨부다(한백 확인 2026-08-24)
      if (prev) await tx.delete(taxInvoices).where(eq(taxInvoices.id, prev.id));

      await tx.insert(taxInvoices).values({
        id, org, kind: input.kind, payDate: input.payDate,
        blobUrl: input.blobUrl, filename: input.filename,
        supplyAmount: input.supplyAmount, taxAmount: input.taxAmount, totalAmount: input.totalAmount,
        uploadedAt: today(),
      });
      await writeAudit(tx, {
        projectId: null, actor, action: `세금계산서 ${prev ? '교체' : '저장'} — ${org} ${input.kind} ${input.payDate}`,
        field: 'file', oldValue: prev?.filename ?? null,
        newValue: `${input.filename}${input.supplyAmount !== null ? ` · 공급가액 ${input.supplyAmount}원` : ' · 금액 미확인'}`,
      });
      return { id, replacedBlobUrl: prev?.blobUrl ?? null };
    });
  },

  async updateTaxInvoice(id, patch, actor): Promise<void> {
    assertAdmin(actor, '세금계산서 금액 수정');
    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(taxInvoices).where(eq(taxInvoices.id, id)).limit(1);
      if (!row) throw new Error('세금계산서를 찾을 수 없습니다.');
      await tx
        .update(taxInvoices)
        .set({ supplyAmount: patch.supplyAmount, taxAmount: patch.taxAmount, totalAmount: patch.totalAmount })
        .where(eq(taxInvoices.id, id));
      await writeAudit(tx, {
        projectId: null, actor, action: `세금계산서 금액 수정 — ${row.org} ${row.payDate}`,
        field: 'amounts',
        oldValue: `공급 ${row.supplyAmount ?? '?'} · 세액 ${row.taxAmount ?? '?'} · 합계 ${row.totalAmount ?? '?'}`,
        newValue: `공급 ${patch.supplyAmount ?? '?'} · 세액 ${patch.taxAmount ?? '?'} · 합계 ${patch.totalAmount ?? '?'}`,
      });
    });
  },

  async deleteTaxInvoice(id, actor): Promise<{ blobUrl: string }> {
    if (!canWrite(actor.role)) throw new Error('열람 전용 계정입니다.');
    const db = getDb();
    const [target] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, id)).limit(1);
    if (!target) throw new Error('세금계산서를 찾을 수 없습니다.');
    // 붙이는 것과 같은 판정이다 — 올릴 수 있는 사람이 뺄 수도 있다
    await assertCanAttach(actor, target.org, target.kind as PayoutKind, target.payDate);
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(taxInvoices).where(eq(taxInvoices.id, id)).limit(1);
      if (!row) throw new Error('세금계산서를 찾을 수 없습니다.');
      await tx.delete(taxInvoices).where(eq(taxInvoices.id, id));
      await writeAudit(tx, {
        projectId: null, actor, action: `세금계산서 삭제 — ${row.org} ${row.payDate}`,
        field: 'file', oldValue: row.filename, newValue: null,
      });
      return { blobUrl: row.blobUrl };
    });
  },
};

/**
 * 세금계산서를 붙이거나 뺄 수 있는지 — 못 하면 왜인지 말하고 던진다.
 *
 * 확정 여부는 여기서 읽는다(batch_finals). 판정 자체는 lib/payout-board 의
 * canAttachInvoice 한 곳이고, 화면도 그것을 본다.
 */
async function assertCanAttach(
  actor: Actor,
  org: string,
  kind: PayoutKind,
  payDate: string
): Promise<void> {
  if (isHanbaek(actor.role)) return;
  /*
   * ★소속을 먼저 본다★ (2026-08-30 검토). 확정 여부를 먼저 읽고 문구를 가르면, 남의
   * 지급처를 적어 보낸 사람이 「확정된 배치입니다」라는 답으로 ★남의 배치가 지급까지
   * 갔는지★를 알아낸다. 남의 것이면 확정을 묻지도 말고 같은 문구로 막는다.
   */
  if (!canAttachInvoice({ role: actor.role, org: actor.org, batchOrg: org, finalized: false })) {
    throw new Error('내 지급처의 계산서만 올릴 수 있습니다.');
  }
  const [fin] = await getDb()
    .select({ id: batchFinals.id })
    .from(batchFinals)
    .where(and(
      eq(batchFinals.org, org),
      eq(batchFinals.kind, kind),
      eq(batchFinals.payDate, payDate),
    ))
    .limit(1);
  if (fin) throw new Error(INVOICE_LOCKED_WHY);
}

/**
 * 그 배치가 실제로 있나 — 그 지급일에 그 지급처로 나간 지급 줄이 있는가.
 *
 * ★없는 배치에 계산서를 붙이면 아무 데도 안 붙는 행이 남는다★ (2026-08-30 검토).
 * 배치는 원장에서 접어 만드는 것이라(batchesOf) 지급 줄이 없으면 화면에 뜨지도 않는다 —
 * 날짜만 바꿔 가며 행과 파일을 무한히 쌓을 수 있었다. 최종 확정(finalizeBatch)이 이미
 * 같은 것을 보고 있었는데 첨부만 안 보고 있었다.
 *
 * ★빼기(deleteTaxInvoice)에서는 보지 않는다★ — 이미 생긴 고아 행과 배치가 사라진 뒤의
 * 계산서를 치울 길까지 같이 막힌다.
 */
async function assertBatchExists(org: string, kind: PayoutKind, payDate: string): Promise<void> {
  const rows = await getDb()
    .select({
      kind: payoutEntries.kind, category: payoutEntries.category,
      salesOrg: projects.salesOrg, gcOrg: projects.gcOrg,
    })
    .from(payoutEntries)
    .innerJoin(projects, eq(payoutEntries.projectId, projects.id))
    .where(eq(payoutEntries.at, payDate));
  const exists = rows.some(
    (r) =>
      entryTypeOf(r.category as PayoutCategory) === '지급' &&
      r.kind === kind &&
      normalizeOrg(r.kind === '영업비' ? r.salesOrg : r.gcOrg) === org
  );
  if (!exists) throw new Error('그 지급일에 이 배치로 나간 지급이 없습니다.');
}

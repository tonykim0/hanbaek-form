/**
 * 협력사 지급관리 보드의 줄 — 현장 상세 하나에서 만든다.
 *
 * 예전에는 길이 둘이었다: 한백은 전 현장 요약(listSettlements)에서, 협력사는 현장마다
 * 상세를 다시 읽어서. 같은 것을 두 모양으로 조립하니 금액이 갈릴 자리가 있었고, 협력사
 * 경로의 N+1 이 화면을 죽였다(300초 타임아웃, 2026-08-21). 이제 저장소가 현장을 한 번
 * 읽고 이 함수를 부른다(listPayoutOverview → payoutPlansOf) — 한백도 협력사도 같은 길이다.
 *
 * 협력사에게 마진·남의 몫이 안 가는 것은 저장소가 지워서 준다(redactForViewer).
 */
import type {
  BatchFinal, PayoutEntry, PayoutKind, PayoutMilestones, PayoutPlanRow, PayoutRow,
  ProjectDetail, TaxInvoice,
} from '@/types/project';
import {
  payoutPrerequisiteBlockersOf, payoutReleaseOf, payoutSideOf, payoutStepsOf,
} from '@/lib/settlement';
import { today } from '@/lib/date';
import type { Visibility } from '@/lib/roles';

/**
 * 화면이 받는 지급 줄 — 도메인 타입(PayoutPlanRow)과 같다.
 * 저장소가 이 모양으로 만들어 주므로(listPayoutOverview) 여기서 다시 정의하지 않는다.
 */
export type PayoutRowInput = PayoutPlanRow;

/**
 * 협력사의 길 — 자기 현장 상세에서 보이는 쪽(vis)만 줄로 만든다.
 * 상세는 저장소가 이미 지워서 준 것이라, 여기서 다시 가릴 것은 없다 —
 * vis 는 「어느 쪽 줄을 만들 것인가」만 정한다.
 */
export function payoutsOfDetail(d: ProjectDetail, vis: Visibility): PayoutRowInput[] {
  const milestones: PayoutMilestones = {
    contractCompletedAt: d.project.contractConfirmedAt,
    installCompletedAt: d.process.installConfirmedAt,
    openedAt: d.process.openDoneAt,
  };
  const stepEntry = (kind: PayoutKind, cat: '1차' | '2차') =>
    d.payoutEntries.find((e: PayoutEntry) => e.kind === kind && e.category === cat) ?? null;

  const build = (kind: PayoutKind): PayoutRowInput => {
    const side = payoutSideOf(d.payoutEntries, kind);
    const unit = (l: ProjectDetail['lines'][number]) =>
      kind === '영업비' ? l.rule?.salesUnit ?? null : l.rule?.consUnit ?? null;
    return {
      key: `${d.project.id}|${kind}`,
      projectId: d.project.id,
      projectName: d.project.name,
      cpo: d.project.cpo,
      kind,
      org: kind === '영업비' ? d.project.salesOrg : d.project.gcOrg,
      plan: d.lines.reduce((n, l) => n + (unit(l) ?? 0) * l.qty, 0),
      adjust: side.adjust,
      confirmed: side.paid,
      // 자기 쪽 단가가 안 붙은 라인 — 요약의 unpricedLines 와 같은 말을 자기 쪽만 센다
      unpriced: d.lines.filter((l) => unit(l) === null).length,
      milestones,
      feeMissing: kind === '영업비' ? d.contract.feeMissing : [],
      step1At: stepEntry(kind, '1차')?.at ?? null,
      step2At: stepEntry(kind, '2차')?.at ?? null,
      step1EntryId: stepEntry(kind, '1차')?.id ?? null,
      step2EntryId: stepEntry(kind, '2차')?.id ?? null,
    };
  };

  const rows: PayoutRowInput[] = [];
  if (vis.sales) rows.push(build('영업비'));
  if (vis.cons) rows.push(build('시공비'));
  return rows;
}

// ── 지급 줄의 작업 상태 ────────────────────────────────────────────
/*
 * 지급관리 표(PayoutWorkBoard)에 있던 것을 옮겼다 — 거래명세서 화면(StatementsBoard)이
 * 「지급 가능」 풀을 같은 판정으로 모아야 한다. 계산이 두 벌이면 한쪽 화면에는 지급
 * 가능인데 다른 쪽에는 없는 줄이 생긴다.
 */

export type WorkState = '지급 가능' | '조건 대기' | '확정 완료';

export interface PayoutWork extends PayoutRowInput {
  state: WorkState;
  blockers: string[];
  open: { no: 1 | 2; amount: number } | null;
  due: number;
  step1Amount: number;
  step2Amount: number;
  step1Done: boolean;
  step2Done: boolean;
}

export function workOf(p: PayoutRowInput): PayoutWork {
  const steps = payoutStepsOf(p.plan, p.adjust, p.confirmed);
  const prerequisites = payoutPrerequisiteBlockersOf({
    kind: p.kind, org: p.org, unpriced: p.unpriced, feeMissing: p.feeMissing,
  });
  const stepFields = {
    due: steps.due,
    step1Amount: steps.parts[0],
    step2Amount: steps.parts[1],
    step1Done: steps.step1Done,
    step2Done: steps.step2Done,
  };

  if (p.unpriced > 0) {
    return { ...p, ...stepFields, state: '조건 대기', blockers: prerequisites, open: null };
  }
  if (!steps.open) {
    return { ...p, ...stepFields, state: '확정 완료', blockers: [], open: null };
  }

  const release = payoutReleaseOf(p.kind, steps.open.no, p.milestones);
  const blockers = [...prerequisites];
  if (!release.met) blockers.push(`${release.trigger} 대기`);

  return {
    ...p,
    ...stepFields,
    state: blockers.length > 0 ? '조건 대기' : '지급 가능',
    blockers,
    open: steps.open,
  };
}

/** 지급일 후보 — 트리거 충족일의 익월 10일·25일 (지급 규칙, 한백 확인) */
export function payDateChoices(metAt: string): [string, string] {
  const [y, m] = metAt.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const mm = String(m === 12 ? 1 : m + 1).padStart(2, '0');
  return [`${ny}-${mm}-10`, `${ny}-${mm}-25`];
}

/* ── 배치 — 지급처 × 구분 × 지급일 ──────────────────────────────────────────
 * 세금계산서 한 장의 단위이자 거래명세서 한 장의 단위다. 묶는 규칙과 상태 판정이
 * 화면(협력사 거래명세서)과 서버(할 일)에 두 벌 있으면 「발행하라」는 신호가 서로
 * 어긋난다 — 위의 workOf 를 여기 모은 것과 같은 이유로 정본을 여기 둔다.
 */

export interface Batch {
  paidAt: string;
  org: string | null;
  kind: PayoutKind;
  count: number;
  total: number;
  finalized: boolean;
  invoice: TaxInvoice | null;
}

export type BatchState = '가확정' | '확정' | '지급완료' | '확정 누락';

/** 배치의 열쇠 — 세 축과 그 순서까지 여기가 정본이다 */
export const batchKey = (payDate: string, org: string | null, kind: PayoutKind) =>
  `${payDate}|${org ?? ''}|${kind}`;

/**
 * 배치의 자리 — 두 축이 만드는 네 자리다.
 *
 * ★확정은 지급의 전제다 (한백 확정 2026-08-24).★ 축이 둘이고, 한쪽이 다른 쪽을 덮으면 안 된다:
 *   확정 여부   사람이 누른다
 *   지급일     시간이 지나간다
 *
 *                지급일 전    지급일 지남
 *   확정 안 됨    가확정       확정 누락   ← 전제를 건너뛴 채 나갔다
 *   확정됨       확정         지급완료
 *
 * ★예전에는 지급일이 지나면 확정 여부와 무관하게 「지급완료」였다.★ 그러면 확정하고
 * 지급된 것과 확정 없이 지급된 것이 같은 배지가 되어, 절차를 건너뛴 배치를 목록에서
 * 찾을 길이 없었다 — 정보가 없는 게 아니라 덮여 있었다.
 *
 * 「가확정」의 신호(협력사에게 계산서를 발행하라)는 지급일 전에만 뜻이 있다 — 지난 배치까지
 * 발행 요청으로 보이면 협력사가 옛 지급마다 계산서를 다시 발행하려 든다. 그래서 지난
 * 미확정에는 다른 이름을 준다: 「확정 누락」은 협력사가 할 일이 아니라 한백이 놓친 것이다.
 */
export function batchStateOf(b: { paidAt: string; finalized: boolean }): BatchState {
  const past = b.paidAt < today();
  if (b.finalized) return past ? '지급완료' : '확정';
  return past ? '확정 누락' : '가확정';
}

/** 원장 줄을 배치로 접는다 — 지급일 내림차순, 같은 날은 지급처·구분순 */
export function batchesOf(
  history: PayoutRow[],
  finals: BatchFinal[],
  invoices: TaxInvoice[] = []
): Batch[] {
  const inv = new Map(invoices.map((i) => [batchKey(i.payDate, i.org, i.kind), i]));
  const fin = new Set(finals.map((f) => batchKey(f.payDate, f.org, f.kind)));
  const map = new Map<string, Batch>();
  for (const r of history) {
    const key = batchKey(r.paidAt, r.org, r.kind);
    const b = map.get(key) ?? {
      paidAt: r.paidAt, org: r.org, kind: r.kind, count: 0, total: 0,
      finalized: r.org ? fin.has(key) : false,
      invoice: r.org ? inv.get(key) ?? null : null,
    };
    b.count += 1;
    b.total += r.amount;
    map.set(key, b);
  }
  return [...map.values()].sort(
    (a, b) =>
      b.paidAt.localeCompare(a.paidAt)
      || (a.org ?? '').localeCompare(b.org ?? '', 'ko')
      || a.kind.localeCompare(b.kind)
  );
}

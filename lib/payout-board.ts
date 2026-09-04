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
import { canWrite, isHanbaek, normalizeOrg, type Role, type Visibility } from '@/lib/roles';

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
    completedAt: d.process.completeDoneAt,
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
      adjustBy: side.adjustBy,
      confirmed: side.paid,
      ledger: side.ledger,
      // 자기 쪽 단가가 안 붙은 라인 — 요약의 unpricedLines 와 같은 말을 자기 쪽만 센다
      unpriced: d.lines.filter((l) => unit(l) === null).length,
      holdState: d.project.holdState,
      milestones,
      payoutDocsMissing: kind === '영업비' ? d.contract.payoutDocsMissing : [],
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

/*
 * ★「확정」은 배치 잠금 하나에만 쓴다★ (한백 물음 2026-08-31 「확정 완료는 뭐야」).
 * 이 화면의 다른 자리에서 「확정」은 가확정 → 확정 → 지급완료로 이어지는 배치의 잠금이다.
 * 여기 「확정 완료」는 그것과 아무 상관이 없다 — 배치를 하나도 확정하지 않아도 돈만 다
 * 나갔으면 이 자리였다. 같은 낱말이 한 화면에서 두 뜻이면 서로 말이 안 통한다.
 */
export type WorkState = '지급 가능' | '조건 대기' | '초과' | '지급 완료';

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

/**
 * 「조건 대기」를 둘로 가른다 — ★기다리는 것과 우리가 할 일은 다르다★
 * (한백 지적 2026-08-31 「눈에 잘 안 들어와」).
 *
 * 프로덕션 298줄 중 286줄이 조건 대기인데, 그 안에 두 가지가 섞여 있었다(2026-08-31 실측):
 *   263줄  설치완료·개통완료·계약완료 대기   — 공정이 아직 안 왔다. 기다리는 것이 맞다.
 *   120줄  실사보고서·컨설팅결과서 미달 · 단가 미지정 — ★사람이 지금 할 수 있는 일★
 * 둘이 한 이름으로 묶여 있으니 「할 일이 있는 줄」이 안 보였다.
 *
 * 판정은 막는 사유의 글에 기대지 않는다 — 서류·단가는 그 자리에서 채울 수 있는 것이고,
 * 공정 마일스톤은 시간이 와야 하는 것이다. 그 성질로 가른다.
 */
export type WorkGroup = '지급 가능' | '보완 필요' | '공정 대기' | '지급 완료';

/**
 * 사람이 지금 채울 수 있는 사유인가 — 서류·단가·송금 대상이 그것이다.
 *
 * ★막는 사유 넷을 전부 세어 맞춘다★ (한백 물음 2026-08-31 「보완 필요, 공정 대기는
 * 뭐야」). 처음 가를 때 「송금 대상 미지정」(영업사·시공사가 안 정해진 줄)을 빠뜨려서,
 * 현장 상세에서 지급처만 넣으면 되는 줄이 「공정 대기」에 앉아 있었다 — 기다릴 것이
 * 없는데 기다리는 칸에 있으니 아무도 안 본다.
 * `payoutPrerequisiteBlockersOf` 에 사유를 더하면 여기도 같이 본다.
 */
const FILLABLE = /지급조건 서류|단가 미지정|송금 대상 미지정/;

export function workGroupOf(w: { state: WorkState; blockers: string[] }): WorkGroup {
  // 초과는 낼 것이 없을 뿐 끝난 것이 아니다 — 되받거나 잔금에서 뺄 일이 남았다
  if (w.state === '초과') return '보완 필요';
  if (w.state !== '조건 대기') return w.state;
  return w.blockers.some((b) => FILLABLE.test(b)) ? '보완 필요' : '공정 대기';
}

/**
 * 이 줄이 지급관리의 대상인가 — ★「낼 것이 없다」와 「다 냈다」는 다른 말이다.★
 *
 * (한백 지적 2026-08-31 「확정완료에 이상한 데이터가 들어가 있는 듯」)
 * 계획액이 0 이하면 `payoutStepsOf` 가 열린 회차를 안 만들고, 그러면 workOf 가
 * 「지급 완료」로 내보낸다 — 돈이 한 푼도 안 나갔는데 완료 칸에 선다. 프로덕션에서
 * 실제로 한 건 나왔다(인천 서구 불로삼보해피하임 · 자체투자 · 영업비 계획 0).
 *
 * 계획도 0이고 나간 돈도 0이면 그 현장 그 구분에는 지급이라는 것이 애초에 없다 —
 * 규칙상 없는 것이라 「해당없음」이고(화면 규칙 10), 지급관리가 셀 줄이 아니다.
 * ★나간 돈이 있으면 계획이 0이어도 남긴다★ — 그건 초과 지급이라 오히려 봐야 한다.
 *
 * ★단가 미지정은 0이 아니다 — 모른다★ (2026-08-31 실측에서 잡았다).
 * 계획액은 단가 × 대수라, 단가가 안 붙은 라인은 0으로 더해진다. 그것을 「지급이 없다」로
 * 읽으면 ★단가를 지정해야 하는 줄이 화면에서 사라진다★ — 프로덕션에서 제외 줄이
 * 9건에서 17건으로 늘며 드러났다. 0 이 정말 0 이라고 말할 수 있는 것은 단가가 다
 * 붙었을 때뿐이다.
 */
export const isPayoutSubject = (p: { due: number; confirmed: number; unpriced: number }) =>
  p.due > 0 || p.confirmed !== 0 || p.unpriced > 0;

export function workOf(p: PayoutRowInput): PayoutWork {
  const steps = payoutStepsOf(p.plan, {
    adjust: p.adjust, adjustBy: p.adjustBy, paid: p.confirmed, ledger: p.ledger,
  });
  const prerequisites = payoutPrerequisiteBlockersOf({
    kind: p.kind, org: p.org, unpriced: p.unpriced, payoutDocsMissing: p.payoutDocsMissing,
  });
  const stepFields = {
    due: steps.due,
    step1Amount: steps.parts[0],
    step2Amount: steps.parts[1],
    step1Done: steps.step1Done,
    step2Done: steps.step2Done,
  };

  /*
   * ★멈춘 계약에는 돈이 나가지 않는다★ (한백 지시 2026-09-04, 감사 H3).
   *
   * 판정이 보던 것은 단가·서류·트리거 셋뿐이라 「이 계약이 살아 있나」를 아무도 안 봤다.
   * 계약파기로 중단한 현장의 영업비 1차가 「지급 가능」으로 서 있었고, 체크해서
   * 가확정하면 서버도 안 막아 원장에 그대로 기록됐다. 같은 저장소의 할 일(lib/todos)과
   * 보드(lib/board)는 이미 멈춘 현장을 빼고 있었다 — 지급 화면만 몰랐다.
   *
   * ★맨 앞에서 막는다★ — 단가·서류가 다 차 있어도 멈춘 계약이면 그것이 답이다.
   * 이미 나간 것은 이 판정이 되돌리지 않는다(원장은 사실의 기록이다). 되받는 것은
   * 「회수」 명목으로 사람이 적는다(PAYOUT_CATEGORIES 의 sign -1).
   */
  if (p.holdState) {
    return {
      ...p, ...stepFields, state: '조건 대기', open: null,
      blockers: [`${p.holdState} — 지급 불가`],
    };
  }

  if (p.unpriced > 0) {
    return { ...p, ...stepFields, state: '조건 대기', blockers: prerequisites, open: null };
  }
  if (!steps.open) {
    /*
     * ★계획보다 더 나간 줄은 완료가 아니다★ (한백 지적 2026-08-31 「2차 나간 현장 아직
     * 없어」). 회차 완료를 금액 누적으로 재는 탓에, 1차에 계획보다 많이 나가면 2차가
     * 원장에 줄 하나 없이 저절로 채워진다 — 반달마을푸르지오 영업비가 그 자리다
     * (계획 150만 · 나감 178.5만 · 초과 28.5만). 프로덕션 실측으로 ★2차가 원장에 실제로
     * 있는 줄은 0건★이고, 유일한 「완료」가 이 초과 충당이었다.
     *
     * 낼 것이 없는 것은 맞지만 끝난 것은 아니다 — 되받거나 잔금에서 빼야 한다.
     * 그건 사람이 지금 할 수 있는 일이라 「보완 필요」로 간다.
     */
    const over = p.confirmed - steps.due;
    if (over > 0) {
      return {
        ...p, ...stepFields, state: '초과', open: null,
        blockers: [`초과 지급 ${over.toLocaleString('ko-KR')}원 — 회수·차감 필요`],
      };
    }
    return { ...p, ...stepFields, state: '지급 완료', blockers: [], open: null };
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

/**
 * 이 배치에 세금계산서를 올리고 뺄 수 있는가 (한백 지시 2026-08-30).
 *
 * ★협력사가 직접 올린다.★ 예전에는 한백만 올릴 수 있어서, 협력사가 메일로 보내면 한백이
 * 받아 옮겨 붙였다. 발행은 협력사의 일이고 그 파일도 협력사가 들고 있으니, 그 자리에서
 * 바로 붙이는 것이 한 걸음 적다.
 *
 * ★자기 지급처의 배치만.★ 배치는 (지급처 × 구분 × 지급일)이라, 남의 지급처를 적어 보내면
 * 남의 계산서를 갈아치울 수 있다. 소속으로 막는다.
 *
 * ★확정되면 잠긴다.★ 확정은 한백이 배치를 잠그는 행위다 — 그 뒤에 협력사가 파일을 바꾸면
 * 한백이 보고 잠근 것과 붙어 있는 것이 달라진다. 한백은 확정 뒤에도 바꿀 수 있다:
 * 첨부는 보관이라 잠금과 무관하고(그 판단은 2026-08-24), 잘못 온 계산서를 고치는 것은
 * 한백의 일이다.
 *
 * 열람 전용은 못 한다.
 */
export function canAttachInvoice(input: {
  role: Role;
  /** 보는 사람의 소속 */
  org: string | null;
  /** 그 배치의 지급처 */
  batchOrg: string | null;
  /** 그 배치가 최종 확정됐나 */
  finalized: boolean;
}): boolean {
  if (!canWrite(input.role)) return false;
  if (isHanbaek(input.role)) return true;
  if (!input.org || !input.batchOrg) return false;
  if (normalizeOrg(input.org) !== normalizeOrg(input.batchOrg)) return false;
  return !input.finalized;
}

/** 못 붙이는 까닭 — 저장소와 화면이 같은 문장을 쓴다 */
export const INVOICE_LOCKED_WHY =
  '확정된 배치입니다 — 계산서를 바꾸려면 한백에 알려주세요.';

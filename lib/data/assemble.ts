/**
 * 저장된 행들을 화면이 받는 ProjectDetail 로 조립한다.
 *
 * 왜 따로 두는가: 파일 저장소와 Postgres 저장소가 같은 판정을 해야 한다.
 * 단계(stage)·정산 단계·서류 필수 판정은 저장된 값이 아니라 유도된 값이라서,
 * 조립 로직이 두 벌로 갈리면 두 저장소가 같은 데이터에 다른 답을 낸다.
 * 여기 한 곳만 두고 양쪽이 부른다.
 */
import type {
  ContractLine,
  ContractLineView,
  Court,
  ProcessInfo,
  Project,
  ProjectDetail,
  ProjectDocument,
  ProjectNote,
  PayoutRow,
  ProjectSummary,
  Settlement,
  SettlementStep,
  SettlementSummary,
} from '@/types/project';
import { buildDocContext, PROCESS_DOCS } from '@/lib/doc-rules';
import { PAY_SPLIT, payInstallments, settlementForProject } from '@/lib/settlement';
import { contractStateOf, deriveStage, stalledDaysSince } from '@/lib/stage';
import { entryOkOf } from '@/lib/process';
import { effectiveVisibility, type Visibility } from '@/lib/roles';
import type { Viewer } from '@/lib/auth/types';
import { PRICING_RULE_BY_ID } from './seed/pricing-rules';
import { SETTLEMENT_RULE_BY_ID } from './seed/settlement-rules';

/**
 * 접수 서류 16종 (INTAKE_SPEC §3 + 설치승인서). 번호가 아니라 종류로 다룬다.
 * 순서는 화면에 그려지는 순서이므로 lib/doc-rules.ts 의 SPECS 와 맞춰 둔다.
 */
export const ALL_DOC_KEYS = [
  'contract', 'agreement', 'sealuse', 'privacy', 'apply', 'consult',
  'minutes', 'kepcobill', 'bldgreg', 'bizreg', 'survey', 'legacylog', 'legacyev',
  'etc', 'checklist2', 'approval',
];

/** 공정 서류 종류 (PROCESS_DOCS 의 key) */
export const PROCESS_DOC_KEYS: string[] = PROCESS_DOCS.map((d) => d.key);

/**
 * 이 서류는 공정 쪽인가.
 *
 * 계약 서류와 공정 서류는 다른 표에 산다. 종류 이름이 겹치지 않으므로 이름으로 가른다 —
 * 부르는 쪽이 어느 표인지 알아야 하면 화면마다 그 지식이 흩어진다.
 */
export function isProcessDocKind(kind: string): boolean {
  return PROCESS_DOC_KEYS.includes(kind);
}

/** 우리가 아는 서류 종류인가 — 모르는 이름은 저장하지 않는다 */
export function isKnownDocKind(kind: string): boolean {
  return ALL_DOC_KEYS.includes(kind) || PROCESS_DOC_KEYS.includes(kind);
}

export function processDocs(done: string[]): ProjectDocument[] {
  return PROCESS_DOCS.map((d) => ({
    kind: d.key,
    filename: done.includes(d.key) ? `${d.key}.pdf` : null,
    blobUrl: null,
    status: done.includes(d.key) ? 'approved' : 'none',
    rejectReason: null,
    uploadedBy: done.includes(d.key) ? '대상전력' : null,
    uploadedAt: done.includes(d.key) ? '2026-05-14' : null,
  }));
}

/**
 * 저장소가 읽어온 한 현장의 원본 행들.
 * 유도값(stage·stalledDays·정산 단계)은 들어 있지 않다 — toDetail 이 계산한다.
 */
export interface ProjectRecord {
  project: Project;
  lines: ContractLine[];
  documents: ProjectDocument[];
  process: ProcessInfo;
  settlementRaw: Omit<Settlement, 'steps'>;
  collected: Partial<Record<1 | 2 | 3, string>>;
  court: Court;
  lastProgressAt: string;
  /**
   * 진행현황. 상세를 열 때만 읽는다 — 목록·보드는 쓰지 않으므로 없으면 빈 배열로 본다.
   */
  notes?: ProjectNote[];
}

export const emptyProcess = (projectId: string): ProcessInfo => ({
  projectId,
  envApprovalDate: null,
  cpoSubmitDate: null,
  cpoApprovalDate: null,
  chargerOrderDate: null,
  chargerShipDate: null,
  chargerRecvDate: null,
  startPlanDate: null,
  startActualDate: null,
  installDoneDate: null,
  commDoneDate: null,
  docs: processDocs([]),
  status: '계약완료',
  memo: null,
});

export const emptySettlement = (projectId: string): Omit<Settlement, 'steps'> => ({
  projectId,
  cpoCloseDate: null,
  salesPay1Date: null,
  salesPay2Date: null,
  consPay1Date: null,
  consPay2Date: null,
  safetyFee: null,
  payNote: null,
});

/** 서류 필수 판정에 필요한 현장 조건 — 조립과 계약 확인이 같은 것을 봐야 한다 */
function docCtxOf(r: ProjectRecord) {
  return buildDocContext({
    cpo: r.project.cpo,
    contractParty: r.project.contractParty,
    bldgType: r.project.bldgType,
    projectPowerType: r.project.powerType,
    linePowerTypes: r.lines.map((l) => l.powerType),
    preInstall: r.project.preInstall,
    bizType: r.project.bizType,
  });
}

/**
 * 계약 판정 — 저장소가 쓰기를 받아들일지 볼 때 부른다.
 *
 * 화면은 이것을 다시 계산하지 않는다. toDetail 이 같은 값을 detail.contract 로 실어 보내고,
 * 목록 요약도 여기서 뽑는다 — 조건을 여러 곳에 쓰면 「버튼은 눌리는데 저장이 거절되는」
 * 상태가 생긴다.
 */
export function contractStateFor(r: ProjectRecord) {
  return contractStateOf({ docCtx: docCtxOf(r), documents: r.documents, lines: r.lines });
}

export function toDetail(r: ProjectRecord): ProjectDetail {
  // 케이스는 불변이라 참조만으로 안전하다 — 값을 복사해 둘 필요가 없다
  const lines: ContractLineView[] = r.lines.map((l) => ({
    ...l,
    rule: l.pricingRuleId ? PRICING_RULE_BY_ID.get(l.pricingRuleId) ?? null : null,
  }));
  const settlementRule = r.project.settlementRuleId
    ? SETTLEMENT_RULE_BY_ID.get(r.project.settlementRuleId) ?? null
    : null;

  const docCtx = docCtxOf(r);

  const steps = settlementForProject(
    lines, settlementRule, r.process, r.settlementRaw.cpoCloseDate, r.collected
  );
  const settlement: Settlement = { ...r.settlementRaw, steps };
  const contract = contractStateOf({ docCtx, documents: r.documents, lines: r.lines });
  const stage = deriveStage({
    docCtx,
    documents: r.documents,
    lines: r.lines,
    settlement,
    contractConfirmedAt: r.project.contractConfirmedAt,
  });

  return {
    // 진행현황은 조립하지 않는다 — 저장소가 읽어 그대로 실어 보낸다
    notes: r.notes ?? [],
    project: r.project,
    lines,
    settlementRule,
    documents: r.documents,
    process: r.process,
    settlement,
    stage,
    // 계약 판정은 여기서 한 번만 한다 — 화면이 다시 세면 조건이 갈린다
    contract,
    court: r.court,
    stalledDays: stalledDaysSince(r.lastProgressAt),
  };
}

/** 목록 카드가 받는 요약. 상세를 조립한 뒤 필요한 것만 추린다. */
export function summaryOf(r: ProjectRecord): ProjectSummary {
  const d = toDetail(r);
  return {
    id: d.project.id,
    mgmtNo: d.project.mgmtNo,
    name: d.project.name,
    addr: d.project.addr,
    cpo: d.project.cpo,
    bldgType: d.project.bldgType,
    bizType: d.project.bizType,
    powerType: d.project.powerType,
    envQueueNo: d.project.envQueueNo,
    // 조사 전이면 값을 주지 않는다 — 접수 기본값 '없음' 과 「안 봤음」을 가른다
    preInstall: d.project.preChecked ? d.project.preInstall : null,
    createdAt: d.project.createdAt,
    lines: d.lines.map((l) => ({ termYears: l.termYears, qty: l.qty })),
    stage: d.stage,
    status: d.process.status,
    holdState: d.project.holdState,
    salesOrg: d.project.salesOrg,
    gcOrg: d.project.gcOrg,
    court: d.court,
    stalledDays: d.stalledDays,
    // 세 값 모두 d.contract 에서 온다 — 목록이 자기 식으로 다시 세면 보드와 상세가 갈린다
    priced: d.contract.allPriced,
    rejectedDocs: d.contract.rejected,
    docsFilled: d.contract.docsFilled,
    entryOk: entryOkOf(d.process),
  };
}

/**
 * 정산관리 목록이 받는 요약. [한백 전용]
 * 금액이 들어 있으므로 부르는 쪽이 관리자인지 반드시 확인해야 한다.
 */
export function settlementSummaryOf(r: ProjectRecord): SettlementSummary {
  const d = toDetail(r);
  const steps = d.settlement.steps;
  const sum = (list: SettlementStep[]) => list.reduce((n, x) => n + (x.planAmount ?? 0), 0);
  return {
    id: d.project.id,
    name: d.project.name,
    cpo: d.project.cpo,
    qty: d.lines.reduce((n, l) => n + l.qty, 0),
    stage: d.stage,
    status: d.process.status,
    ruleName: d.settlementRule?.name ?? null,
    steps,
    planTotal: sum(steps),
    collectedTotal: sum(steps.filter((x) => x.state === 'collected')),
    cpoCloseDate: d.settlement.cpoCloseDate,
    salesOrg: d.project.salesOrg,
    gcOrg: d.project.gcOrg,
    salesTotal: d.lines.reduce((n, l) => n + (l.rule?.salesUnit ?? 0) * l.qty, 0),
    consTotal: d.lines.reduce((n, l) => n + (l.rule?.consUnit ?? 0) * l.qty, 0),
    marginTotal: d.lines.reduce((n, l) => n + (l.rule?.margin ?? 0) * l.qty, 0),
    unpricedLines: d.lines.filter((l) => !l.rule).length,
    salesPay1Date: d.settlement.salesPay1Date,
    salesPay2Date: d.settlement.salesPay2Date,
    consPay1Date: d.settlement.consPay1Date,
    consPay2Date: d.settlement.consPay2Date,
    payNote: d.settlement.payNote,
  };
}

/**
 * 지급 줄 — 현장 하나가 최대 네 줄(영업비 1·2차, 시공비 1·2차).
 *
 * ★보는 사람에 따라 줄이 빠진다.★ 영업만 맡은 회사에게 시공비 줄을 주지 않는다.
 * 화면에서 가리는 것이 아니라 여기서 안 만든다 — 서버가 렌더한 값은 브라우저에 통째로 남는다.
 *
 * 마진·기성은 어느 줄에도 없다. 그것은 한백이 운영사에게서 받는 쪽이고 협력사가 볼 것이 아니다.
 */
export function payoutRowsOf(r: ProjectRecord, viewer: Viewer): PayoutRow[] {
  const d = toDetail(r);
  const vis = effectiveVisibility(viewer.role, viewer.org, d.project);

  const base = {
    projectId: d.project.id,
    projectName: d.project.name,
    cpo: d.project.cpo,
    qty: d.lines.reduce((n, l) => n + l.qty, 0),
  };
  const sides: Array<{
    kind: PayoutRow['kind']; org: string | null; total: number; dates: Array<string | null>; show: boolean;
  }> = [
    {
      kind: '영업비', org: d.project.salesOrg, show: vis.sales,
      total: d.lines.reduce((n, l) => n + (l.rule?.salesUnit ?? 0) * l.qty, 0),
      dates: [d.settlement.salesPay1Date, d.settlement.salesPay2Date],
    },
    {
      kind: '시공비', org: d.project.gcOrg, show: vis.cons,
      total: d.lines.reduce((n, l) => n + (l.rule?.consUnit ?? 0) * l.qty, 0),
      dates: [d.settlement.consPay1Date, d.settlement.consPay2Date],
    },
  ];

  return sides
    .filter((side) => side.show)
    .flatMap((side) =>
      payInstallments(side.total).map((amount, i) => ({
        ...base,
        kind: side.kind,
        org: side.org,
        no: i + 1,
        label: `${i + 1}차 ${Math.round(PAY_SPLIT[i] * 100)}%`,
        amount,
        paidAt: side.dates[i] ?? null,
      }))
    );
}

/** 정체일이 큰 순 — 오래 멈춘 현장이 위로 */
export function byStalled(a: ProjectSummary, b: ProjectSummary): number {
  return b.stalledDays - a.stalledDays;
}

/**
 * 보는 사람에 맞춰 금액을 지운다.
 *
 * ★화면에서 가리는 것으로는 부족하다.★ 서버가 렌더한 데이터는 통째로 브라우저에 실려서,
 * 페이지 소스를 열면 가려둔 값이 그대로 보인다. 실제로 협력사 화면에 마진이 실려 나갔다.
 * 그래서 브라우저로 보내기 전에 이 자리에서 지운다.
 *
 * 기성 계획액도 함께 지운다 — 한백 전용인데 같은 경로로 실려 나간다.
 */
export function redactForViewer(detail: ProjectDetail, vis: Visibility): ProjectDetail {
  return {
    ...detail,
    lines: detail.lines.map((l) => ({
      ...l,
      rule: l.rule && {
        ...l.rule,
        salesUnit: vis.sales ? l.rule.salesUnit : null,
        consUnit: vis.cons ? l.rule.consUnit : null,
        margin: vis.cost ? l.rule.margin : null,
      },
    })),
    settlement: {
      ...detail.settlement,
      steps: detail.settlement.steps.map((s) => ({
        ...s,
        planAmount: vis.cost ? s.planAmount : null,
      })),
    },
  };
}

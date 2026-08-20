/**
 * 시드 현장 5건 — 화면 골격을 세우고 빈 DB 를 채우는 데 쓴다.
 *
 * 실제 노션 매트릭스(dec6088d…)에서 읽은 케이스를 참조한다. 금액 자체는 최종확인 전이지만
 * 화면이 다뤄야 할 형태는 이것이 맞다.
 *
 * 조립 로직(toDetail·단계 판정)은 여기 없다 — lib/data/assemble.ts 에 한 벌만 둔다.
 */
import type {
  PayoutRow, ProjectDetail, ProjectDocument, ProjectSummary, SettlementSummary,
} from '@/types/project';
import type { ProjectRepository } from './repository';
import type { Viewer } from '@/lib/auth/types';
import { canAccessProject, effectiveVisibility } from '@/lib/roles';
import {
  ALL_DOC_KEYS, byStalled, emptyProcess, emptySettlement, processDocs,
  redactForViewer, settlementSummaryOf, summaryOf, toDetail, type ProjectRecord,
} from './assemble';

/** 저장소를 옮기는 동안 예전 이름을 쓰는 코드가 있어 남겨둔다 */
export type MockRecord = ProjectRecord;

function docs(
  approved: string[],
  overrides: Record<string, Partial<ProjectDocument>> = {}
): ProjectDocument[] {
  return ALL_DOC_KEYS.map((kind) => {
    const base: ProjectDocument = {
      kind,
      filename: approved.includes(kind) ? `${kind}.pdf` : null,
      blobUrl: null,
      status: approved.includes(kind) ? 'approved' : 'none',
      rejectReason: null,
      uploadedBy: approved.includes(kind) ? '에코일렉' : null,
      uploadedAt: approved.includes(kind) ? '2026-03-02' : null,
    };
    return { ...base, ...(overrides[kind] ?? {}) };
  });
}


export const SEED_RECORDS: MockRecord[] = [
  {
    project: {
      id: 'HB-2026-041', mgmtNo: 'HB-2026-041', cpo: '플러그링크',
      salesOrg: '에코일렉', gcOrg: '에코일렉', name: '속초 ES아뜨리움',
      addr: '강원 속초시 조양동 1451', bldgType: '공동주택', contractParty: '입주자대표회의',
      parkTotal: 214, mgr: '김성호', tel: '033-635-2201', mail: null,
      preInstall: '없음', preChecked: true, preNote: null, powerType: '모자분리', replType: '환경부 신규',
      bizType: '환경부', createdAt: '2026-03-04', envQueueNo: '2026-318', note: null,
      settlementRuleId: 'pl-2step', settlementAppliedAt: '2026-03-06', holdState: null, holdNote: null,
    },
    lines: [
      { id: 'L-041-1', projectId: 'HB-2026-041', termYears: 7, qty: 3, powerType: '모자분리', replType: '환경부 신규', memo: null, pricingRuleId: 'pl-h1-y7-mother-new-apt', pricedAt: '2026-03-06' },
      { id: 'L-041-2', projectId: 'HB-2026-041', termYears: 10, qty: 4, powerType: '모자분리', replType: '환경부 신규', memo: null, pricingRuleId: null, pricedAt: null },
    ],
    documents: docs(
      ['contract', 'agreement', 'sealuse', 'privacy', 'apply', 'consult', 'kepcobill', 'bldgreg', 'bizreg', 'survey', 'legacylog'],
      { minutes: { status: 'rejected', filename: 'minutes.pdf', rejectReason: '서명 페이지 누락', uploadedBy: '에코일렉', uploadedAt: '2026-03-02' } }
    ),
    process: {
      ...emptyProcess('HB-2026-041'),
      envApprovalDate: '2026-02-18', cpoApprovalDate: null,
      chargerOrderDate: '2026-03-11',
      chargerRecvDate: '2026-03-25',
      startPlanDate: '2026-04-06',
      docs: processDocs(['notify', 'elecapply']),
      status: '계약완료',
    },
    settlementRaw: emptySettlement('HB-2026-041'),
    collected: {},
    court: '시공사',
    lastProgressAt: '2026-08-06',
  },
  {
    project: {
      id: 'HB-2026-018', mgmtNo: 'HB-2026-018', cpo: '플러그링크',
      salesOrg: '대상전력', gcOrg: '대상전력', name: '신안비치팔레스1차',
      addr: '경기 화성시 능동 1043', bldgType: '공동주택', contractParty: '입주자대표회의',
      parkTotal: 120, mgr: '홍길동', tel: '031-123-4567', mail: 'hong@example.com',
      preInstall: '없음', preChecked: true, preNote: null, powerType: '모자분리', replType: '환경부 신규',
      bizType: '환경부', createdAt: '2026-01-22', envQueueNo: '2025-1204', note: null,
      settlementRuleId: 'pl-2step', settlementAppliedAt: '2026-01-24', holdState: null, holdNote: null,
    },
    lines: [
      { id: 'L-018-1', projectId: 'HB-2026-018', termYears: 10, qty: 7, powerType: '모자분리', replType: '환경부 신규', memo: null, pricingRuleId: 'pl-h1-y10-mother-new-apt', pricedAt: '2026-01-24' },
    ],
    documents: docs(['contract', 'agreement', 'sealuse', 'privacy', 'apply', 'consult', 'minutes', 'kepcobill', 'bldgreg', 'bizreg', 'survey', 'legacylog']),
    process: {
      ...emptyProcess('HB-2026-018'),
      envApprovalDate: '2026-02-02', cpoApprovalDate: '2026-02-10',
      chargerOrderDate: '2026-02-20',
      chargerRecvDate: '2026-03-05',
      startPlanDate: '2026-03-16',
      startActualDate: '2026-03-18',
      installDoneDate: '2026-06-24',
      commDoneDate: '2026-07-02',
      docs: processDocs(['notify', 'elecapply', 'safety', 'kepcofee', 'completion', 'photoDone', 'comm']),
      status: '준공서류 접수/검토',
      memo: '준공서류 제출 완료. 운영사 마감 회차 대기 중.',
    },
    settlementRaw: emptySettlement('HB-2026-018'),
    collected: { 1: '2026-03-06' },
    court: '운영사',
    lastProgressAt: '2026-07-08',
  },
  {
    project: {
      id: 'HB-2026-052', mgmtNo: 'HB-2026-052', cpo: '현대엔지니어링',
      salesOrg: '제일전기통신', gcOrg: null, name: '동탄 센트럴파크뷰',
      addr: '경기 화성시 오산동 967', bldgType: '공동주택', contractParty: '건설사',
      parkTotal: 388, mgr: '이재훈', tel: '031-370-8800', mail: null,
      preInstall: '없음', preChecked: false, preNote: '지하 2층 일부 미확인 — 재방문 필요', powerType: '한전불입',
      replType: '환경부 신규', bizType: '환경부', createdAt: '2026-08-11', envQueueNo: null, note: null,
      settlementRuleId: null, settlementAppliedAt: null, holdState: null, holdNote: null,
    },
    lines: [
      { id: 'L-052-1', projectId: 'HB-2026-052', termYears: 10, qty: 5, powerType: '한전불입', replType: '환경부 신규', memo: null, pricingRuleId: null, pricedAt: null },
    ],
    documents: docs(
      ['contract', 'sealuse', 'privacy', 'apply', 'consult', 'survey', 'bldgreg', 'bizreg', 'legacylog'],
      { checklist2: { status: 'uploaded', filename: 'checklist2.pdf', uploadedBy: '제일전기통신', uploadedAt: '2026-08-11' } }
    ),
    process: emptyProcess('HB-2026-052'),
    settlementRaw: emptySettlement('HB-2026-052'),
    collected: {},
    court: '한백',
    lastProgressAt: '2026-08-15',
  },
  {
    project: {
      id: 'HB-2026-055', mgmtNo: 'HB-2026-055', cpo: 'SK일렉링크',
      salesOrg: '네이비인프라', gcOrg: '네이비인프라', name: '울산 태화강아이파크',
      addr: '울산 중구 태화동 452', bldgType: '공동주택', contractParty: '입주자대표회의',
      parkTotal: 176, mgr: '박선우', tel: '052-244-1120', mail: null,
      preInstall: '있음', preChecked: true, preNote: '지상 주차장 완속 2기 (타사)', powerType: '모자분리',
      replType: '환경부 신규', bizType: '환경부', createdAt: '2026-08-08', envQueueNo: null, note: null,
      settlementRuleId: null, settlementAppliedAt: null, holdState: null, holdNote: null,
    },
    lines: [
      { id: 'L-055-1', projectId: 'HB-2026-055', termYears: 7, qty: 4, powerType: '모자분리', replType: '환경부 신규', memo: null, pricingRuleId: null, pricedAt: null },
    ],
    documents: docs(
      ['contract', 'sealuse', 'privacy', 'apply', 'consult', 'survey', 'kepcobill', 'bldgreg', 'bizreg', 'legacylog'],
      { minutes: { status: 'rejected', filename: 'minutes.pdf', rejectReason: '의결 정족수 확인 불가 — 참석자 명부 필요', uploadedBy: '네이비인프라', uploadedAt: '2026-08-08' } }
    ),
    process: emptyProcess('HB-2026-055'),
    settlementRaw: emptySettlement('HB-2026-055'),
    collected: {},
    court: '영업사',
    lastProgressAt: '2026-08-10',
  },
  {
    project: {
      id: 'HB-2026-033', mgmtNo: 'HB-2026-033', cpo: '나이스인프라',
      salesOrg: '이에프이노베이션', gcOrg: '이에프이노베이션', name: '청주 리버파크자이',
      addr: '충북 청주시 흥덕구 복대동 2298', bldgType: '공동주택', contractParty: '입주자대표회의',
      parkTotal: 302, mgr: '정민아', tel: '043-232-7700', mail: null,
      preInstall: '없음', preChecked: true, preNote: null, powerType: '모자분리', replType: '환경부 신규',
      bizType: '환경부', createdAt: '2026-02-14', envQueueNo: '2026-77', note: null,
      settlementRuleId: 'nice-2step', settlementAppliedAt: '2026-02-17', holdState: null, holdNote: null,
    },
    lines: [
      { id: 'L-033-1', projectId: 'HB-2026-033', termYears: 10, qty: 6, powerType: '모자분리', replType: '환경부 신규', memo: null, pricingRuleId: 'nice-h1-y10-mother-new-apt', pricedAt: '2026-02-17' },
    ],
    documents: docs(['contract', 'agreement', 'sealuse', 'privacy', 'apply', 'consult', 'minutes', 'kepcobill', 'bldgreg', 'bizreg', 'survey', 'legacylog']),
    process: {
      ...emptyProcess('HB-2026-033'),
      envApprovalDate: '2026-03-09', cpoApprovalDate: '2026-03-20',
      chargerOrderDate: '2026-04-02',
      chargerRecvDate: '2026-04-19',
      startPlanDate: '2026-05-07',
      startActualDate: '2026-05-11',
      docs: processDocs(['notify', 'elecapply', 'kepcofee']),
      status: '계약완료',
    },
    settlementRaw: emptySettlement('HB-2026-033'),
    collected: {},
    court: '시공사',
    lastProgressAt: '2026-08-13',
  }

];

const READ_ONLY = 'mockRepository 는 읽기 전용입니다. lib/data/file-store 또는 pg-store 를 사용하세요.';

export const mockRepository: ProjectRepository = {
  async listProjects(viewer: Viewer): Promise<ProjectSummary[]> {
    return SEED_RECORDS
      .filter((r) => canAccessProject(viewer.role, viewer.org, r.project))
      .map(summaryOf)
      .sort(byStalled);
  },

  async listSettlements(viewer: Viewer): Promise<SettlementSummary[]> {
    if (viewer.role !== 'admin') return [];
    return SEED_RECORDS.map(settlementSummaryOf).sort((a, b) => b.planTotal - a.planTotal);
  },

  // 메모리 저장은 불가능하다 — Next 가 라우트별로 서버 번들을 따로 만들어서
  // API 핸들러에서 쓴 값이 페이지 번들에서는 보이지 않는다. file-store 나 pg-store 를 쓴다.
  async createProject(): Promise<string> {
    throw new Error(READ_ONLY);
  },
  async setDocumentStatus(): Promise<void> {
    throw new Error(READ_ONLY);
  },
  async deleteDocument(): Promise<{ blobUrl: string | null }> {
    throw new Error(READ_ONLY);
  },
  async addNote(): Promise<void> {
    throw new Error(READ_ONLY);
  },
  async editNote(): Promise<void> {
    throw new Error(READ_ONLY);
  },
  async setCourt(): Promise<void> {
    throw new Error(READ_ONLY);
  },
  async setOrgs(): Promise<void> {
    throw new Error(READ_ONLY);
  },
  async setPreInstall(): Promise<void> {
    throw new Error(READ_ONLY);
  },
  async listPayouts(): Promise<PayoutRow[]> {
    return [];
  },
  async setLinePricing(): Promise<void> {
    throw new Error(READ_ONLY);
  },
  async setPayment(): Promise<void> {
    throw new Error(READ_ONLY);
  },
  async setProcessStatus(): Promise<void> {
    throw new Error(READ_ONLY);
  },
  async updateProcess(): Promise<void> {
    throw new Error(READ_ONLY);
  },
  async setEnvQueueNo(): Promise<void> {
    throw new Error(READ_ONLY);
  },
  async uploadDocument(): Promise<void> {
    throw new Error(READ_ONLY);
  },

  async getProject(id: string, viewer: Viewer): Promise<ProjectDetail | null> {
    const r = SEED_RECORDS.find((x) => x.project.id === id);
    if (!r || !canAccessProject(viewer.role, viewer.org, r.project)) return null;
    return redactForViewer(toDetail(r), effectiveVisibility(viewer.role, viewer.org, r.project));
  },
};

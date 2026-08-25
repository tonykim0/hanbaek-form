/**
 * 시드 현장 5건 — 빈 DB 를 채운다(`npm run db:seed`).
 *
 * 실제 노션 매트릭스(dec6088d…)에서 읽은 케이스를 참조한다. 금액 자체는 최종확인 전이지만
 * 화면이 다뤄야 할 형태는 이것이 맞다.
 *
 * ★여기 저장소 구현은 없다.★ 예전에는 읽기 전용 mockRepository(메서드 34개가 전부
 * throw)가 같이 있었는데 아무도 쓰지 않았다 — 개발 DB 가 분리되면서 파일 저장소와 함께
 * 걷어냈다(2026-08-22). 조립 로직은 lib/data/assemble.ts 에 한 벌만 있다.
 */
import type { ProjectDocument } from '@/types/project';
import {
  ALL_DOC_KEYS, emptyProcess, emptySettlement, processDocs, type ProjectRecord,
} from './assemble';

function docs(
  approved: string[],
  overrides: Record<string, Partial<ProjectDocument>> = {}
): ProjectDocument[] {
  return ALL_DOC_KEYS.map((kind) => {
    const base: ProjectDocument = {
      kind,
      files: [],
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


export const SEED_RECORDS: ProjectRecord[] = [
  {
    project: {
      id: 'HB-2026-041', mgmtNo: 'HB-2026-041', cpo: '플러그링크',
      salesOrg: '에코일렉', gcOrg: '에코일렉', name: '속초 ES아뜨리움',
      addr: '강원 속초시 조양동 1451', bldgType: '공동주택', contractParty: '입주자대표회의',
      parkTotal: 214, mgr: '김성호', tel: '033-635-2201', mail: null,
      preInstall: '없음', preChecked: true, preRejectReason: null, preNote: null, powerType: '모자분리', replType: '환경부 신규',
      bizType: '환경부', createdAt: '2026-03-04', bizYear: 2026, envQueueNo: '2026-318', note: null, contractSubmittedAt: null, contractFixAskedAt: null, contractConfirmedAt: null,
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
      preInstall: '없음', preChecked: true, preRejectReason: null, preNote: null, powerType: '모자분리', replType: '환경부 신규',
      bizType: '환경부', createdAt: '2026-01-22', bizYear: 2025, envQueueNo: '2025-1204', note: null, contractSubmittedAt: null, contractFixAskedAt: null, contractConfirmedAt: '2026-04-20',
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
    },
    settlementRaw: emptySettlement('HB-2026-018'),
    /*
     * 원장 시드 — 노션 정산관리에 실제로 있던 흐름이다: 1차(70%)를 채우기 전에 선금이
     * 먼저 나가고, 나중에 차액을 채운다. 선금 160만 + 차액 428만 = 588만 = 840만 × 70%.
     */
    payoutEntries: [
      { id: 'PE-018-1', projectId: 'HB-2026-018', kind: '영업비', category: '선금', amount: 1600000, at: '2026-03-10', note: '1차 선지급', createdAt: '2026-03-10 10:00' },
      { id: 'PE-018-2', projectId: 'HB-2026-018', kind: '영업비', category: '차액', amount: 4280000, at: '2026-05-11', note: '1차 잔여분', createdAt: '2026-05-11 10:00' },
      { id: 'PE-018-3', projectId: 'HB-2026-018', kind: '시공비', category: '1차', amount: 4410000, at: '2026-07-10', note: null, createdAt: '2026-07-10 10:00' },
    ],
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
      preInstall: '없음', preChecked: false, preRejectReason: null, preNote: '지하 2층 일부 미확인 — 재방문 필요', powerType: '한전불입',
      replType: '환경부 신규', bizType: '환경부', createdAt: '2026-08-11', bizYear: 2026, envQueueNo: null, note: null, contractSubmittedAt: null, contractFixAskedAt: null, contractConfirmedAt: null,
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
      preInstall: '있음', preChecked: true, preRejectReason: null, preNote: '지상 주차장 완속 2기 (타사)', powerType: '모자분리',
      replType: '환경부 신규', bizType: '환경부', createdAt: '2026-08-08', bizYear: 2026, envQueueNo: null, note: null, contractSubmittedAt: null, contractFixAskedAt: null, contractConfirmedAt: null,
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
      preInstall: '없음', preChecked: true, preRejectReason: null, preNote: null, powerType: '모자분리', replType: '환경부 신규',
      bizType: '환경부', createdAt: '2026-02-14', bizYear: 2026, envQueueNo: '2026-77', note: null, contractSubmittedAt: null, contractFixAskedAt: null, contractConfirmedAt: '2026-06-02',
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
    // 차감(조정) 예 — 줘야 할 금액 자체가 주는 경우. 잔액 = 750 − 60 − 525 = 165만.
    payoutEntries: [
      { id: 'PE-033-1', projectId: 'HB-2026-033', kind: '영업비', category: '1차', amount: 5250000, at: '2026-06-25', note: null, createdAt: '2026-06-25 10:00' },
      { id: 'PE-033-2', projectId: 'HB-2026-033', kind: '영업비', category: '차감', amount: -600000, at: '2026-07-27', note: '요율 미달 재정산 — 대당 10만원 차감', createdAt: '2026-07-27 10:00' },
    ],
    collected: {},
    court: '시공사',
    lastProgressAt: '2026-08-13',
  }

];

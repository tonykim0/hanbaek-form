/**
 * Postgres 스키마 — SYSTEM_ARCHITECTURE §6 논리 스키마의 물리 구현.
 *
 * 원칙 셋:
 *  1. 단가·정산 규칙은 ★불변★ — 추가와 비활성만. 한 번 지정되면 수정하지 않는다.
 *     그래서 계약 라인은 값을 복사(스냅샷)하지 않고 규칙을 참조만 한다.
 *  2. 금액은 전부 정수(원). KRW 는 소수점이 없어 numeric 이 필요 없고,
 *     integer 면 부동소수 오차가 원천적으로 안 생긴다.
 *  3. 협력사 직접입력이라 audit_log 를 남긴다. 노션엔 없던 것.
 */
import {
  boolean, index, integer, jsonb, pgTable, primaryKey,
  text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';

// ── 계정 ────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: text('id').primaryKey(),               // 로그인 ID
  name: text('name').notNull(),
  role: text('role').notNull(),              // admin | salesCons | cons | sales
  org: text('org'),                          // 협력사 소속. 관리자는 null
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 협력사 정보 — 계정마다 사업자등록증·정산 계좌를 둔다.
 *
 * 지급(하도급 정산)에 쓰는 값이라 계정이 아니라 회사의 것에 가깝지만, 지금 계정은
 * 회사당 하나라 계정에 붙인다. 파일(사업자등록증·통장사본)은 Vercel Blob 에 두고
 * 여기는 URL 만 둔다. 배포 설정(AUTH_USERS) 계정은 users 행이 없어 여기 못 붙는다.
 */
export const partnerDetails = pgTable('partner_details', {
  userId: text('user_id').primaryKey().references(() => users.id),
  bizRegNo: text('biz_reg_no'),                 // 사업자등록번호 — 숫자 10자리
  bizCertUrl: text('biz_cert_url'),             // 사업자등록증 파일
  bankName: text('bank_name'),
  bankAccountNo: text('bank_account_no'),
  bankHolder: text('bank_holder'),              // 예금주
  bankbookUrl: text('bankbook_url'),            // 통장사본 파일
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── 규칙 (불변) ─────────────────────────────────────────────────
export const settlementRules = pgTable('settlement_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** [{ trigger, basis }] — basis 는 고정/비율/잔액 */
  steps: jsonb('steps').notNull(),
  note: text('note'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pricingRules = pgTable('pricing_rules', {
  id: text('id').primaryKey(),
  caseName: text('case_name').notNull(),
  cpo: text('cpo').notNull(),
  bizType: text('biz_type').notNull(),
  powerType: text('power_type').notNull(),          // 모자분리 | 한전불입 (겸용은 행을 쪼갬)
  termYears: jsonb('term_years').notNull(),         // [7] 또는 [7,10]
  bldgTypes: jsonb('bldg_types').notNull(),
  replType: text('repl_type').notNull(),
  /** 턴키 | 시공만 — 영업 없이 시공만 하는 현장의 단가는 구성이 다르다 */
  channel: text('channel').notNull().default('턴키'),
  bizYear: integer('biz_year').notNull(),
  startDate: text('start_date').notNull(),
  salesUnit: integer('sales_unit').notNull(),
  consUnit: integer('cons_unit').notNull(),
  margin: integer('margin').notNull(),
  /** 이 케이스에 통상 붙는 정산 규칙 — 제안값. 실제 적용은 현장에 둔다. */
  defaultSettlementRuleId: text('default_settlement_rule_id').references(() => settlementRules.id),
  supervisionBearer: text('supervision_bearer'),
  safetyFeeBearer: text('safety_fee_bearer'),
  note: text('note'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byAxis: index('pricing_rules_axis_idx').on(t.cpo, t.bizType, t.powerType, t.replType, t.active),
}));

// ── 현장 ────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),                      // HB-2026-041
  mgmtNo: text('mgmt_no'),
  cpo: text('cpo').notNull(),
  salesOrg: text('sales_org'),
  gcOrg: text('gc_org'),
  name: text('name').notNull(),
  addr: text('addr'),
  bldgType: text('bldg_type'),
  contractParty: text('contract_party'),            // 노션에 없던 신규 필드
  parkTotal: integer('park_total'),
  mgr: text('mgr'),
  tel: text('tel'),
  mail: text('mail'),
  preInstall: text('pre_install').notNull().default('없음'),
  preNote: text('pre_note'),
  /**
   * 기설치 조사를 했는가.
   *
   * preInstall 의 '없음' 과 「아직 안 봤음」을 가르는 값이다 — 접수 기본값이 '없음' 이라
   * 이것 없이는 「조사해서 없음」과 「조사를 안 함」이 같은 모양으로 보인다.
   * 환경부 사업은 현장마다 이 조사를 해야 해서, 안 한 현장을 골라내는 것이 실제 업무다.
   */
  preChecked: boolean('pre_checked').notNull().default(false),
  powerType: text('power_type'),
  replType: text('repl_type'),
  bizType: text('biz_type'),
  /** 환경부 보조금 신청 대기번호 — 받은 형태 그대로 (「2026-595」 또는 「595」) */
  envQueueNo: text('env_queue_no'),
  /** 접수할 때 협력사가 적은 말. 영업비 차감·프로모션 적용 같은 조건이 여기 온다. */
  note: text('note'),
  /**
   * 한백이 계약을 확인한 날 (YYYY-MM-DD). null 이면 확인 전.
   * 서류가 반려되면 지워진다 — 보완 뒤 다시 확인해야 한다.
   */
  contractConfirmedAt: text('contract_confirmed_at'),
  /** 한백이 현장별로 적용하는 정산 규칙 */
  settlementRuleId: text('settlement_rule_id').references(() => settlementRules.id),
  settlementAppliedAt: text('settlement_applied_at'),
  /** 보류 | DROP. null 이면 정상 진행 중 — 진행 단계와 섞지 않는다. */
  holdState: text('hold_state'),
  holdNote: text('hold_note'),
  /** 공 차례 — 지금 누가 움직여야 하는가 */
  court: text('court').notNull().default('한백'),
  /** 마지막 진척일. 정체일 계산의 기준 — 노션엔 없던 지표 */
  lastProgressAt: text('last_progress_at').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byOrg: index('projects_org_idx').on(t.salesOrg, t.gcOrg),
  byCourt: index('projects_court_idx').on(t.court),
}));

export const contractLines = pgTable('contract_lines', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  termYears: integer('term_years').notNull(),
  qty: integer('qty').notNull(),
  powerType: text('power_type'),                    // 혼용 현장은 라인별로 갈린다
  replType: text('repl_type'),                      // 자체투자 현장은 라인별로 갈린다
  memo: text('memo'),
  /** 참조만 한다. 케이스가 불변이라 값을 복사할 필요가 없다. */
  pricingRuleId: text('pricing_rule_id').references(() => pricingRules.id),
  pricedAt: text('priced_at'),
}, (t) => ({
  byProject: index('contract_lines_project_idx').on(t.projectId),
}));

// ── 서류 ────────────────────────────────────────────────────────
export const documents = pgTable('documents', {
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  /** contract, agreement, minutes … 번호가 아니라 종류 */
  kind: text('kind').notNull(),
  filename: text('filename'),
  /** Vercel Blob URL */
  blobUrl: text('blob_url'),
  status: text('status').notNull().default('none'), // none | uploaded | approved | rejected
  rejectReason: text('reject_reason'),
  uploadedBy: text('uploaded_by'),
  uploadedAt: text('uploaded_at'),
}, (t) => ({
  pk: primaryKey({ columns: [t.projectId, t.kind] }),
}));

// ── 공정 ────────────────────────────────────────────────────────
export const processes = pgTable('processes', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  envApprovalDate: text('env_approval_date'),        // 환경부 승인 트리거
  /** 운영사에 계약서를 낸 날 — 「운영사 계약서 제출」의 근거. 우리가 하는 일이다. */
  cpoSubmitDate: text('cpo_submit_date'),
  /** 운영사 시공승인일 — 따로 통보받는다. 「시공진행필요」의 근거 */
  cpoApprovalDate: text('cpo_approval_date'),
  chargerOrderDate: text('charger_order_date'),
  chargerShipDate: text('charger_ship_date'),
  chargerRecvDate: text('charger_recv_date'),
  startPlanDate: text('start_plan_date'),
  startActualDate: text('start_actual_date'),        // 착공 트리거
  installDoneDate: text('install_done_date'),
  /** 설치 실적 — 몇 거점 · 몇 기. 시공사가 설치완료 때 적는다 */
  installedSpots: integer('installed_spots'),
  installedUnits: integer('installed_units'),
  commDoneDate: text('comm_done_date'),
  /** 행위신고일 — 파일을 올리면 그 날이 기본으로 들어간다(비어 있을 때만) */
  notifyDate: text('notify_date'),
  /** 묶음별 완료 체크(체크한 날) — 단계 이동을 잠근다. types/project.ts ProcessInfo 주석 참조 */
  notifyDoneAt: text('notify_done_at'),
  chargerDoneAt: text('charger_done_at'),
  installConfirmedAt: text('install_confirmed_at'),
  openDoneAt: text('open_done_at'),
  completionSubmitAt: text('completion_submit_at'),
  /** 진행현황 6단계 (types/project.ts PROCESS_STATUSES) */
  status: text('status').notNull().default('계약완료'),
  memo: text('memo'),
});

export const processDocuments = pgTable('process_documents', {
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),                      // notify, elecapply, completion …
  filename: text('filename'),
  blobUrl: text('blob_url'),
  status: text('status').notNull().default('none'),
  uploadedBy: text('uploaded_by'),
  uploadedAt: text('uploaded_at'),
}, (t) => ({
  pk: primaryKey({ columns: [t.projectId, t.kind] }),
}));

/**
 * 진행현황 — 한백과 협력사가 이 현장에 대해 남기는 말.
 *
 * 감사로그(audit_log)와 다른 것이다. 감사로그는 「무슨 값이 무엇으로 바뀌었나」를 기계가
 * 남기고, 이것은 「무슨 일이 있었나」를 사람이 남긴다 — 관리사무소가 공사를 미뤘다,
 * 한전 불입이 지연됐다 같은, 어느 칸에도 안 들어가는 사정이 여기 온다.
 *
 * 자기가 쓴 것은 고칠 수 있다 — 오타나 잘못 적은 날짜를 그냥 두면 다음 사람이 그것을 믿는다.
 * 다만 고친 흔적(editedAt)은 남긴다. 남의 글은 못 고치고, 지우는 길은 두지 않는다.
 */
export const projectNotes = pgTable('project_notes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  /** 어느 쪽이 썼나 — 「한백」 또는 협력사 이름. 사람 이름은 남기지 않는다(계정이 회사당 하나다) */
  author: text('author').notNull(),
  body: text('body').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  /** 고친 시각. null 이면 처음 쓴 그대로다. */
  editedAt: timestamp('edited_at', { withTimezone: true }),
}, (t) => ({
  byProject: index('project_notes_project_idx').on(t.projectId, t.at),
}));

// ── 정산 ────────────────────────────────────────────────────────
export const settlements = pgTable('settlements', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  /** 준공마감일 — 한백이 지정한다. 공정에서 유도하지 않는다. */
  closeDate: text('close_date'),
  collected1At: text('collected_1_at'),
  collected2At: text('collected_2_at'),
  collected3At: text('collected_3_at'),
  safetyFee: integer('safety_fee'),
  /** 지급 관련 메모 — 감액·보류 사유 등 금액만으로 설명되지 않는 것 */
  payNote: text('pay_note'),
});

/**
 * 하도급사 지급 원장 — 한 행이 지급(또는 조정) 한 건이다.
 *
 * 지급일 4칸(영업 1·2차, 시공 1·2차)으로 저장하던 것을 바꿨다 — 선금·차액·회수·차감이
 * 날짜 한 칸에 들어가지 않는다. 금액은 부호 있는 원 단위 정수, 회수·차감은 음수.
 * 검사 규칙은 lib/settlement.ts checkPayoutEntry 한 곳이다.
 */
export const payoutEntries = pgTable('payout_entries', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  category: text('category').notNull(),
  amount: integer('amount').notNull(),
  /** 지급일(지급) 또는 발생일(조정), YYYY-MM-DD */
  at: text('at').notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  byProject: index('payout_entries_project_idx').on(t.projectId, t.at),
}));

// ── 감사 로그 ───────────────────────────────────────────────────
/** 협력사가 직접 입력하므로 누가 무엇을 바꿨는지 남긴다 */
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  projectId: text('project_id'),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  field: text('field'),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byProject: index('audit_log_project_idx').on(t.projectId, t.at),
}));

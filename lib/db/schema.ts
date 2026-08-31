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
  role: text('role').notNull(),              // admin | viewer | salesCons | cons | sales
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
 * 여기는 URL 만 둔다.
 *
 * users 를 참조하지 않는다 — 계정은 DB 와 배포 설정(AUTH_USERS)·개발 시드 두 곳에
 * 살아서(lib/auth/users.ts), FK 를 걸면 배포 설정 계정은 자기 계좌를 못 적는다.
 * 계정 검증은 저장소(requirePartnerAccount)가 userStore 로 한다.
 */
export const partnerDetails = pgTable('partner_details', {
  userId: text('user_id').primaryKey(),
  bizRegNo: text('biz_reg_no'),                 // 사업자등록번호 — 숫자 10자리
  /** 대표자·사업장 주소 — 거래명세서의 공급자 칸에 들어간다(0015). 업태·종목은 안 적는다 */
  ceo: text('ceo'),
  addr: text('addr'),
  bizCertUrl: text('biz_cert_url'),             // 사업자등록증 파일
  bankName: text('bank_name'),
  bankAccountNo: text('bank_account_no'),
  bankHolder: text('bank_holder'),              // 예금주
  bankbookUrl: text('bankbook_url'),            // 통장사본 파일
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 로그인 실패 기록 — 전수 대입을 막는다.
 *
 * ★왜 표가 필요한가★
 * 비밀번호 최소 길이를 4자로 내렸다(PASSWORD_MIN_LEN). 숫자 4자리면 조합이 만 가지뿐이라
 * 해시를 아무리 세게 걸어도(pbkdf2 12만 회) 로그인 화면을 두드리는 것만으로 뚫린다 —
 * 해싱은 DB 가 새어나갔을 때를 막는 장치고, 이 표는 화면을 두드리는 쪽을 막는다.
 *
 * 메모리에 세지 않는다 — 서버리스는 인스턴스가 여러 개라 각자 따로 세면 인스턴스 수만큼
 * 시도할 수 있다. 세는 자리는 모두가 같이 보는 한 곳이어야 한다.
 *
 * key 는 두 종류다. `id:<로그인ID>` 는 그 계정을 지키고, `ip:<주소>` 는 한 주소에서 여러
 * 계정을 훑는 것을 막는다.
 */
export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  fails: integer('fails').notNull().default(0),
  /** 이 창의 첫 실패 — 창이 지나면 처음부터 다시 센다 */
  firstFailAt: timestamp('first_fail_at', { withTimezone: true }).notNull().defaultNow(),
  /** 이 시각까지 막는다. null 이면 아직 안 막힌 것 */
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
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
  /** 턴키 | 영업 | 시공 — 한쪽만 맡는 현장의 단가는 구성이 다르다 (옛 값 '시공만' 은 '시공' 으로 이관) */
  channel: text('channel').notNull().default('턴키'),
  bizYear: integer('biz_year').notNull(),
  startDate: text('start_date').notNull(),
  salesUnit: integer('sales_unit').notNull(),
  consUnit: integer('cons_unit').notNull(),
  margin: integer('margin').notNull(),
  /*
   * 정책 조건 — 전부 nullable 이다. 이 칸이 생기기 전에 만든 케이스가 이미 있고(2026-08-22),
   * 그것들은 「아직 안 적음」이라 빈 값이 맞다. notNull + 기본값으로 채우면 「0원 · 없음」이
   * 되어 적은 것과 안 적은 것이 같아 보인다(화면 규칙 10번).
   */
  supplyItems: text('supply_items'),
  /** [{ months, rate }] — 구간이 이어진다. null 은 미지정, [] 은 프로모션 없음 */
  promo: jsonb('promo'),
  /**
   * [{ months, rate, deduct }] — 고를 수 있는 프로모션 연장. 협력사도 본다(연장 여부 판단).
   * null 은 미지정, [] 은 연장 없음.
   *
   * 옛 칸 promo_extend_deduct(integer, 1개월당 차감액)를 대신한다 — 늘리는 요금마다
   * 차감액이 갈리는 것을 한 숫자로 담을 수 없었다(0011). 옛 칸은 DB 에 남아 있다:
   * 마이그레이션은 배포보다 먼저 돌아서, 지우면 아직 바뀌기 전 배포가 그 칸을 찾다 터진다.
   * 값이 전부 null 이라 남겨 둬도 해가 없고, 새 코드가 다 나간 뒤 따로 지운다.
   */
  promoExtend: jsonb('promo_extend'),
  chargeRate: integer('charge_rate'),
  installTerms: text('install_terms'),
  otherSupport: text('other_support'),
  coexistTerms: text('coexist_terms'),
  miscTerms: text('misc_terms'),
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
  /** 기설치 조사 반려 사유 — 한백이 되돌린 이유. 다시 조사하면 지워진다 */
  preRejectReason: text('pre_reject_reason'),
  powerType: text('power_type'),
  replType: text('repl_type'),
  bizType: text('biz_type'),
  /** 환경부 보조금 신청 대기번호 — 받은 형태 그대로 (「2026-595」 또는 「595」) */
  envQueueNo: text('env_queue_no'),
  /** 환경부 사업연도 — 단가 케이스·대기번호의 연도와 같은 축. 접수 연도가 기본값 */
  bizYear: integer('biz_year'),
  /** 접수할 때 협력사가 적은 말. 영업비 차감·프로모션 적용 같은 조건이 여기 온다. */
  note: text('note'),
  /**
   * 한백이 계약을 확인한 날 (YYYY-MM-DD). null 이면 확인 전.
   * 서류가 반려되면 지워진다 — 보완 뒤 다시 확인해야 한다.
   */
  contractConfirmedAt: text('contract_confirmed_at'),
  /** 한백이 처음 보완요청(서류 반려)을 한 날 — 지우지 않는다 (migrations/0020) */
  contractFixAskedAt: text('contract_fix_asked_at'),
  /**
   * 협력사가 「계약서 접수하기」를 누른 날 (YYYY-MM-DD). null 이면 아직 모으는 중이다.
   * 확인일과 짝이다 — 이쪽은 협력사가 「다 냈다」, 저쪽은 한백이 「봤다」.
   */
  contractSubmittedAt: text('contract_submitted_at'),
  /*
   * 지급조건(단가 케이스·정산 규칙)을 확정한 날 — 확정되면 못 바꾼다(migrations/0035).
   * 지급이 나가면 자동으로 찍힌다: 돈이 움직인 뒤에 조건을 갈아 끼우면 잔액과 기성이
   * 같이 뒤틀리기 때문이다. 고쳐야 하면 관리자가 해제하고 고친 뒤 다시 확정한다.
   */
  payoutTermsConfirmedAt: text('payout_terms_confirmed_at'),
  /** 한백이 현장별로 적용하는 정산 규칙 */
  settlementRuleId: text('settlement_rule_id').references(() => settlementRules.id),
  settlementAppliedAt: text('settlement_applied_at'),
  /** 계약중단(옛 값: 보류 · DROP). null 이면 정상 진행 중 — 진행 단계와 섞지 않는다. */
  holdState: text('hold_state'),
  holdNote: text('hold_note'),
  /** 담당 — 지금 누가 움직여야 하는가 */
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
  /**
   * 이 칸의 파일들 — [{ name, url, uploadedBy, uploadedAt }] (migrations/0021).
   * 파일 목록의 정본이다. 위 filename·blob_url 은 첫 파일의 사본이다(옛 코드·SQL 이 본다).
   */
  files: jsonb('files').notNull().default([]),
}, (t) => ({
  pk: primaryKey({ columns: [t.projectId, t.kind] }),
}));

/**
 * 충전기 모델 — 등록해 두고 현장에서 고른다 (한백 지시 2026-08-26).
 *
 * 노션에서는 「모델명(충전기)」 multi_select 였다. 표로 두는 이유는 오타로 같은 모델이
 * 여러 이름을 갖는 것을 막기 위해서다. 쓰지 않게 된 모델은 지우지 않고 내린다
 * (active=false) — 옛 현장이 그 모델을 참조하고 있다.
 */
export const chargerModels = pgTable('charger_models', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** 제조사 — 모델명만으로 어느 회사 것인지 모를 때가 있다 */
  maker: text('maker'),
  note: text('note'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── 공정 ────────────────────────────────────────────────────────
export const processes = pgTable('processes', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  envApprovalDate: text('env_approval_date'),        // 환경부 승인 트리거
  /** 운영사에 계약서를 낸 날 — 「운영사 계약서 제출」의 근거. 우리가 하는 일이다. */
  cpoSubmitDate: text('cpo_submit_date'),
  /** 운영사 시공승인일 — 따로 통보받는다. 「충전기 발주」의 근거 */
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
  /** 개통완료일 — 통신까지 끝나고 실제 개통된 날. 시공사가 적는다 */
  openDate: text('open_date'),
  /** 행위신고일 — 파일을 올리면 그 날이 기본으로 들어간다(비어 있을 때만) */
  notifyDate: text('notify_date'),
  /** 발주한 수량 — 한백이 적는다. 수령 수량과 가른다(부분 입고·오배송을 알아야 한다) */
  chargerOrderQty: integer('charger_order_qty'),
  modemOrderQty: integer('modem_order_qty'),
  /** 수령한 수량 — 충전기 몇 대, 모뎀 몇 개. 시공사가 수령 때 센다 */
  chargerQty: integer('charger_qty'),
  modemQty: integer('modem_qty'),
  /**
   * 이 현장에 들어가는 충전기 모델 — 목록(charger_models)에서 고른다.
   * 이름을 적지 않고 참조하는 이유: 오타로 같은 모델이 여러 이름을 갖는 것을 막는다.
   */
  chargerModelId: text('charger_model_id').references(() => chargerModels.id),
  /** 묶음별 완료 체크(체크한 날) — 단계 이동을 잠근다. types/project.ts ProcessInfo 주석 참조 */
  notifyDoneAt: text('notify_done_at'),
  /** 행위신고 불필요로 판정한 날 — 완료와 다른 칸이다 (migrations/0024) */
  notifySkippedAt: text('notify_skipped_at'),
  /** 행위신고가 필요하다고 판정한 날 — 미정과 가른다 (migrations/0029) */
  notifyRequiredAt: text('notify_required_at'),
  chargerDoneAt: text('charger_done_at'),
  installConfirmedAt: text('install_confirmed_at'),
  openDoneAt: text('open_done_at'),
  completionSubmitAt: text('completion_submit_at'),
  /** 준공완료로 넘어간 날 — 영업비·시공비 2차 지급의 조건이다(2026-08-31) */
  completeDoneAt: text('complete_done_at'),
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
  /** 이 칸의 파일들 — 계약 서류와 같은 모양이다 (migrations/0021) */
  files: jsonb('files').notNull().default([]),
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
  /*
   * 실수금액 — 받은 금액을 그대로 적는다(migrations/0034). null 이면 계획액대로 받은 것이다.
   * 협의로 턴키단가와 다르게 받는 현장이 있어서 둔다 — 그 한 건 때문에 협의용 단가 케이스를
   * 만들면 단가표가 정책표가 아니게 된다.
   */
  collected1Amount: integer('collected_1_amount'),
  collected2Amount: integer('collected_2_amount'),
  collected3Amount: integer('collected_3_amount'),
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

// ── 세금계산서 ─────────────────────────────────────────────────
/**
 * 배치(지급처 × 구분 × 지급일)마다 한 장. [한백 전용]
 * 현장이 아니라 배치에 붙는다 — 협력사는 한 지급일에 여러 현장 몫을 묶되 영업비와
 * 시공비는 따로 발행한다(한백 확인 2026-08-24). 그래서 project_id 가 없고 kind 가 있다. 배치의 지급일을 옮기면 이 행의 pay_date 도 같이
 * 옮긴다(pg-store movePayoutBatch) — 키가 갈라지면 첨부가 고아가 된다.
 */
export const taxInvoices = pgTable('tax_invoices', {
  id: text('id').primaryKey(),
  org: text('org').notNull(),
  /** 영업비 | 시공비 — 영업·시공은 계산서를 따로 끊는다(한백 확인 2026-08-24) */
  kind: text('kind').notNull(),
  payDate: text('pay_date').notNull(),
  blobUrl: text('blob_url').notNull(),
  filename: text('filename').notNull(),
  /** 금액 칸 — 대조 기능을 걷어내며 지금은 쓰지 않는다(2026-08-23). 되살리면 여기부터. */
  supplyAmount: integer('supply_amount'),
  taxAmount: integer('tax_amount'),
  totalAmount: integer('total_amount'),
  uploadedAt: text('uploaded_at').notNull(),
}, (t) => ({
  // 배치(지급처 × 구분 × 지급일) 하나에 한 장 — 다시 올리면 교체다
  byBatch: uniqueIndex('tax_invoices_batch_kind_idx').on(t.org, t.payDate, t.kind),
}));

// ── 배치 최종 확정 ─────────────────────────────────────────────
/**
 * 확정된 배치(지급처 × 구분 × 지급일) — 행이 있으면 확정, 없으면 가확정이다.
 * 세금계산서와 무관하다(한백 확인 2026-08-24 — 계산서는 검토 없는 보관용 첨부일 뿐,
 * 확정은 한백이 배치를 잠그는 행위다). 확정되면 항목 빼기·지급일 변경·취소가 막힌다.
 */
export const batchFinals = pgTable('batch_finals', {
  id: text('id').primaryKey(),
  org: text('org').notNull(),
  kind: text('kind').notNull(),
  payDate: text('pay_date').notNull(),
  finalizedAt: text('finalized_at').notNull(),
}, (t) => ({
  byBatch: uniqueIndex('batch_finals_batch_idx').on(t.org, t.kind, t.payDate),
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

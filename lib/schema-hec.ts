/**
 * HEC (현대엔지니어링) schema — form data, SDT ID maps, and text replacement definitions.
 *
 * Reuses the same 67 SDT IDs from pluglink (별지5호 + 개인정보동의서 + 별지7호).
 * Adds text replacement rules for 운영계약서, 직인동의서, 수량공문 sections
 * (these sections have no SDTs — we replace hardcoded sample text directly).
 */

// ─────────────────────────────────────────────
// Form data shape (pluglink fields + 4 HEC-only)
// ─────────────────────────────────────────────

export type BuildingType = 'apartment' | 'yeonlip' | 'sangga' | 'etc_officetel' | 'etc_knowledge' | 'etc_government';
export type InstallLocationKind = 'indoor' | 'outdoor' | '';
export type Ownership = 'own' | 'rent' | '';
export type OwnerRelation = 'self' | 'family' | 'friend' | 'employee' | 'none' | '';
export type PowerSupply = 'moja' | 'hanjeon' | '';

export interface HecFormData {
  // 1. 고객사 정보
  custName: string;
  custBizId: string;
  custAddr: string;
  custTel: string;
  custEmail: string;

  // 2. 계약 정보
  installAddr: string;
  installQty: string;
  contractTerm: '7' | '10';
  contractYear: string;
  contractMonth: string;
  contractDay: string;

  // 3. 모집대행사 / 조사자
  salesCompany: string;
  salesName: string;
  salesTel: string;
  surveyorCompany: string;
  surveyorName: string;
  surveyorTel: string;

  // 4. 사전 현장 컨설팅 결과서 (별지7호)
  parkingLotCount: string;
  buildingType: BuildingType;
  installLocation: InstallLocationKind;
  ownership: Ownership;
  ownerRelation: OwnerRelation;
  powerSupply: PowerSupply;
  installTypeWall: boolean;
  installTypeStand: boolean;

  // 중복설치 여부
  dupFast: boolean;
  dupFastQty: string;
  dupSlow: boolean;
  dupSlowQty: string;
  dupDist: boolean;
  dupDistQty: string;
  dupOutlet: boolean;
  dupOutletQty: string;
  dupKiosk: boolean;

  // HEC 전용 필드
  custRepresentative: string;
  siteManager: string;
  parkingSlotsSlow: string;
  evCount: string;
}

// ─────────────────────────────────────────────
// SDT id constants (별지5호 + 개인정보동의서 + 별지7호 only)
// Same IDs as pluglink — the HEC template reuses them.
// ─────────────────────────────────────────────

const TEXT_IDS = {
  // 별지 5호 — 환경공단 신청서
  custName_b5_apt: '831731575',
  parkingLotCount_b5: '1461920188',
  installAddr_b5: '-1640952418',
  custName_b5_app: '1151491943',
  custBizId_b5: '-944686474',
  custTel_b5: '1309512896',
  salesCompany_b5: '1917981892',
  salesName_b5: '-626934252',
  salesTel_b5: '-1602870797',
  smartChargerQty_b5: '390864121',
  contractMonth_b5sign: '-331451839',
  contractDay_b5sign: '1586042883',
  custName_b5privacy: '604467492',
  // 개인정보동의서
  contractMonth_b5privacy: '1036239247',
  contractDay_b5privacy: '885302165',
  custName_privacy: '1499070229',
  // 별지 7호 — 사전 현장 컨설팅 결과서
  custName_b7_b: '1897010284',
  custTel_b7: '-189372705',
  custAddr_b7: '-1528866009',
  smartQty_b7: '-1335375053',
  // 별지7호/5호 11kW~30kW 수량 — 신규 양식에서 추가된 필드(항상 공란 처리)
  qty11to30_b7: '313466420',
  qty11to30_b5: '1751003065',
  parkingLotCount_b7: '350158903',
  facilityName_b5: '-1480913900',
  installAddr_b7: '1954517277',
  facilityName_other: '-561410159',
  dupFastQty: '2064678604',
  dupSlowQty: '1393619667',
  dupDistQty: '-602881735',
  dupOutletQty: '1226803090',
  surveyorCompany: '1414659046',
  surveyorTel: '-632096669',
  surveyorName: '140012807',
  surveyDate: '-501512409',
  // 직인사용 동의서 — SDT(콘텐츠 컨트롤)로 전환 (텍스트 치환 대체)
  sealSangho: '900000001',
  sealAddr: '900000002',
  sealRep: '900000003',
  sealDate: '900000004',
  // 운영계약서 본문 — SDT로 전환
  chargerQty: '900000011',
  contractTermTable: '900000012',
  // 배치3: 약관서두 · 공문 필드 — SDT로 전환
  preambleName: '900000021',
  gongmunEmail: '900000022',
  gongmunDate: '900000023',
  gongmunCompanySend: '900000024',
  gongmunBaseDate: '900000025',
  gongmunEvCount: '900000026',
  gongmunCompanySign: '900000027',
} as const;

const CB_IDS = {
  // 별지5호 — 설치 희망지 (Row 0)
  b5_loc1_apt: '2085950294',
  b5_loc1_biz: '550437745',
  b5_loc1_etc: '-176436175',
  // 별지5호 — 장소 (Row 1)
  b5_loc2_apt: '-322042069',
  b5_loc2_biz: '-629096557',
  b5_loc2_etc: '-697774570',
  // 건물형태
  bldDanok: '-1430114800',
  bldApt: '1613170918',
  bldYeonlip: '-2100858647',
  bldSangga: '575708064',
  bldEtc: '-1855254905',
  // 설치위치
  locIndoor: '1703440318',
  locOutdoor: '2078551633',
  // 소유여부
  ownOwn: '1315296875',
  ownRent: '-94944360',
  // 소유주와의 관계
  relSelf: '1173694114',
  relFamily: '-1758897530',
  relFriend: '420457414',
  relEmployee: '-1654982638',
  relNone: '-1730915888',
  // 전력인입
  powerMoja: '-6213483',
  powerHanjeon: '1212161000',
  // 설치타입
  typeWall: '1167367960',
  typeStand: '-176657065',
  // 전기수용용량
  highVoltConfirm: '-980231648',
  lowVoltConfirm: '-1940137475',
  // 중복설치
  dupFast: '-251354294',
  dupSlow: '-1361963411',
  dupDist: '731112624',
  dupOutlet: '940579513',
  dupKiosk: '2136826911',
  dupNone: '-1538116413',
} as const;

// ─────────────────────────────────────────────
// Build SDT maps (별지5호 + 개인정보 + 별지7호)
// ─────────────────────────────────────────────

export interface SdtMaps {
  text: Record<string, string>;
  checkbox: Record<string, boolean>;
  /** 블록 SDT id 목록 — 채움 시 해당 SDT(문단 포함)를 문서에서 제거 */
  remove?: string[];
}

function etcLabel(bt: BuildingType): string {
  if (bt === 'etc_officetel') return '오피스텔';
  if (bt === 'etc_knowledge') return '지식산업센터';
  if (bt === 'etc_government') return '관공서';
  return '';
}

export function buildHecSdtMaps(form: HecFormData): SdtMaps {
  const installAddr = form.installAddr.trim() || form.custAddr;
  const smartQty = form.installQty;
  const surveyDate = `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`;

  const text: Record<string, string> = {
    [TEXT_IDS.custName_b5_apt]: form.custName,
    [TEXT_IDS.parkingLotCount_b5]: form.parkingLotCount,
    [TEXT_IDS.installAddr_b5]: installAddr,
    [TEXT_IDS.custName_b5_app]: form.custName,
    [TEXT_IDS.custBizId_b5]: form.custBizId,
    [TEXT_IDS.custTel_b5]: form.custTel,
    [TEXT_IDS.salesCompany_b5]: form.salesCompany,
    [TEXT_IDS.salesName_b5]: form.salesName,
    [TEXT_IDS.salesTel_b5]: form.salesTel,
    [TEXT_IDS.smartChargerQty_b5]: smartQty,
    [TEXT_IDS.contractMonth_b5sign]: form.contractMonth,
    [TEXT_IDS.contractDay_b5sign]: form.contractDay,
    [TEXT_IDS.custName_b5privacy]: form.custName,
    [TEXT_IDS.contractMonth_b5privacy]: form.contractMonth,
    [TEXT_IDS.contractDay_b5privacy]: form.contractDay,
    [TEXT_IDS.custName_privacy]: form.custName,

    // 별지5호 서명날짜·개인정보동의서 날짜의 연도 (보조사업 연도가 매년 바뀌므로
    // 정적 '2026' 대신 폼 연도를 SDT로 반영)
    '900000201': form.contractYear, // 별지5호 서명 연도
    '900000202': form.contractYear, // 개인정보동의서 연도

    [TEXT_IDS.custName_b7_b]: form.custName,
    [TEXT_IDS.custTel_b7]: form.custTel,
    [TEXT_IDS.custAddr_b7]: form.custAddr,
    [TEXT_IDS.smartQty_b7]: smartQty,
    [TEXT_IDS.qty11to30_b7]: '',
    [TEXT_IDS.qty11to30_b5]: '',
    [TEXT_IDS.parkingLotCount_b7]: form.parkingLotCount,
    [TEXT_IDS.installAddr_b7]: installAddr,

    [TEXT_IDS.surveyorCompany]: form.salesCompany,
    [TEXT_IDS.surveyorTel]: form.salesTel,
    [TEXT_IDS.surveyorName]: form.salesName,
    [TEXT_IDS.surveyDate]: surveyDate,

    // 직인사용 동의서 (SDT)
    [TEXT_IDS.sealSangho]: form.custName,
    [TEXT_IDS.sealAddr]: form.custAddr,
    [TEXT_IDS.sealRep]: form.custRepresentative,
    [TEXT_IDS.sealDate]: `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`,

    // 운영계약서 본문 (SDT)
    [TEXT_IDS.chargerQty]: form.installQty,
    [TEXT_IDS.contractTermTable]: form.contractTerm,

    // 약관서두 · 수량공문 (SDT)
    [TEXT_IDS.preambleName]: form.custName,
    [TEXT_IDS.gongmunEmail]: form.custEmail,
    [TEXT_IDS.gongmunDate]: `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`,
    [TEXT_IDS.gongmunCompanySend]: form.custName,
    [TEXT_IDS.gongmunBaseDate]: `${form.contractYear}년 ${form.contractMonth}월 기준`,
    [TEXT_IDS.gongmunEvCount]: form.evCount,
    [TEXT_IDS.gongmunCompanySign]: form.custName,

    // 배치4: 서명부 · 서명날짜 · 계약기간 본문 · 주차면 · 공문 전화 (텍스트치환 → SDT)
    '900000031': form.custAddr, // 서명부 주소 #1
    '900000032': form.custAddr, // 서명부 주소 #2
    '900000033': form.custName, // 서명부 상호 #1
    '900000034': form.custName, // 서명부 상호 #2
    '900000035': form.custRepresentative, // 서명부 대표자 #1
    '900000036': form.custRepresentative, // 서명부 대표자 #2
    '900000037': `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`, // 서명날짜 #1
    '900000038': `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`, // 서명날짜 #2
    '900000039': form.contractTerm, // 계약기간 본문절 (운영시작일로부터 X년)
    '900000040': form.installQty, // 주차면 수
    '900000041': form.custTel, // 공문 TEL 전화번호

    [TEXT_IDS.dupFastQty]: form.dupFast ? form.dupFastQty : '',
    [TEXT_IDS.dupSlowQty]: form.dupSlow ? form.dupSlowQty : '',
    [TEXT_IDS.dupDistQty]: form.dupDist ? form.dupDistQty : '',
    [TEXT_IDS.dupOutletQty]: form.dupOutlet ? form.dupOutletQty : '',

    [TEXT_IDS.facilityName_b5]: etcLabel(form.buildingType),
    [TEXT_IDS.facilityName_other]: etcLabel(form.buildingType),
  };

  const isApt = form.buildingType === 'apartment' || form.buildingType === 'yeonlip';
  const isBiz = form.buildingType === 'sangga';
  const isEtc = form.buildingType === 'etc_officetel' || form.buildingType === 'etc_knowledge' || form.buildingType === 'etc_government';

  const checkbox: Record<string, boolean> = {
    [CB_IDS.b5_loc1_apt]: isApt,
    [CB_IDS.b5_loc1_biz]: isBiz,
    [CB_IDS.b5_loc1_etc]: isEtc,
    [CB_IDS.b5_loc2_apt]: isApt,
    [CB_IDS.b5_loc2_biz]: isBiz,
    [CB_IDS.b5_loc2_etc]: isEtc,

    [CB_IDS.bldDanok]: false,
    [CB_IDS.bldApt]: form.buildingType === 'apartment',
    [CB_IDS.bldYeonlip]: form.buildingType === 'yeonlip',
    [CB_IDS.bldSangga]: form.buildingType === 'sangga',
    [CB_IDS.bldEtc]: isEtc,

    [CB_IDS.locIndoor]: form.installLocation === 'indoor',
    [CB_IDS.locOutdoor]: form.installLocation === 'outdoor',

    [CB_IDS.ownOwn]: form.ownership === 'own',
    [CB_IDS.ownRent]: form.ownership === 'rent',

    [CB_IDS.relSelf]: form.ownerRelation === 'self',
    [CB_IDS.relFamily]: form.ownerRelation === 'family',
    [CB_IDS.relFriend]: form.ownerRelation === 'friend',
    [CB_IDS.relEmployee]: form.ownerRelation === 'employee',
    [CB_IDS.relNone]: form.ownerRelation === 'none',

    [CB_IDS.powerMoja]: form.powerSupply === 'moja',
    [CB_IDS.powerHanjeon]: form.powerSupply === 'hanjeon',

    [CB_IDS.typeWall]: form.installTypeWall,
    [CB_IDS.typeStand]: form.installTypeStand,

    [CB_IDS.highVoltConfirm]: form.powerSupply === 'moja',
    [CB_IDS.lowVoltConfirm]: form.powerSupply === 'hanjeon',

    [CB_IDS.dupFast]: form.dupFast,
    [CB_IDS.dupSlow]: form.dupSlow,
    [CB_IDS.dupDist]: form.dupDist,
    [CB_IDS.dupOutlet]: form.dupOutlet,
    [CB_IDS.dupKiosk]: form.dupKiosk,
  };

  const anyDup =
    form.dupFast || form.dupSlow || form.dupDist || form.dupOutlet || form.dupKiosk;
  checkbox[CB_IDS.dupNone] = !anyDup;

  return { text, checkbox };
}

// ─────────────────────────────────────────────
// Text replacement rules for non-SDT sections
// (운영계약서, 직인동의서, 수량공문)
// ─────────────────────────────────────────────

export interface TextReplacement {
  /** Exact text to find in <w:t> element */
  find: string;
  /** Replacement text (may reference form fields) */
  replace: string;
}

/**
 * Build text replacements for the three non-SDT sections.
 * These replace hardcoded sample data in <w:t> elements.
 */
export function buildTextReplacements(_form: HecFormData): TextReplacement[] {
  // 운영계약서/직인동의서/수량공문의 모든 텍스트치환 필드가 SDT로 전환됨.
  // (서명부·서명날짜·계약기간본문·주차면·공문전화 = 배치4에서 900000031~041로 전환)
  return [];
}

/**
 * Paragraph-level replacements for anchors that are split across multiple
 * <w:t> runs (proofErr / spell-check markers break them apart), so the
 * single-<w:t> pass in fillDocx-hec can never match them.
 * Applied as substring replacement over each paragraph's combined text.
 */
export function buildHecParagraphReplacements(form: HecFormData): TextReplacement[] {
  return [
    // (직인 상호 · 충전기 수량은 SDT로 전환됨)
  ];
}

/**
 * Label→value map for filling empty header table cells.
 * The first table in the document has rows like:
 *   | 법인명 | (empty cell) |
 * We find the label cell and fill the adjacent empty cell.
 */
export function buildHeaderTableMap(form: HecFormData): Record<string, string> {
  const installAddr = form.installAddr.trim() || form.custAddr;

  return {
    // 부지제공자 info (first group, lines ~155–651)
    '법인명': form.custName,
    '주소': form.custAddr,
    '사업자등록번호': form.custBizId,
    '담당자': form.siteManager,
    '전화번호': form.custTel,
    '이메일': form.custEmail,
    // 계약내용 (second group)
    '설치장소': installAddr,
  };
}

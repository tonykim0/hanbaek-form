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

export type BuildingType = 'apartment' | 'commercial' | 'etc';
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
  smartChargerQty_b5: '1751003065',
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
  smartQty_b7: '483050426',
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

    [TEXT_IDS.custName_b7_b]: form.custName,
    [TEXT_IDS.custTel_b7]: form.custTel,
    [TEXT_IDS.custAddr_b7]: form.custAddr,
    [TEXT_IDS.smartQty_b7]: smartQty,
    [TEXT_IDS.parkingLotCount_b7]: form.parkingLotCount,
    [TEXT_IDS.installAddr_b7]: installAddr,

    [TEXT_IDS.surveyorCompany]: form.salesCompany,
    [TEXT_IDS.surveyorTel]: form.salesTel,
    [TEXT_IDS.surveyorName]: form.salesName,
    [TEXT_IDS.surveyDate]: surveyDate,

    [TEXT_IDS.dupFastQty]: form.dupFast ? form.dupFastQty : '',
    [TEXT_IDS.dupSlowQty]: form.dupSlow ? form.dupSlowQty : '',
    [TEXT_IDS.dupDistQty]: form.dupDist ? form.dupDistQty : '',
    [TEXT_IDS.dupOutletQty]: form.dupOutlet ? form.dupOutletQty : '',

    [TEXT_IDS.facilityName_b5]: '',
    [TEXT_IDS.facilityName_other]: '',
  };

  const checkbox: Record<string, boolean> = {
    [CB_IDS.b5_loc1_apt]: form.buildingType === 'apartment',
    [CB_IDS.b5_loc1_biz]: form.buildingType === 'commercial',
    [CB_IDS.b5_loc1_etc]: form.buildingType === 'etc',
    [CB_IDS.b5_loc2_apt]: form.buildingType === 'apartment',
    [CB_IDS.b5_loc2_biz]: form.buildingType === 'commercial',
    [CB_IDS.b5_loc2_etc]: form.buildingType === 'etc',

    [CB_IDS.bldDanok]: false,
    [CB_IDS.bldApt]: form.buildingType === 'apartment',
    [CB_IDS.bldYeonlip]: false,
    [CB_IDS.bldSangga]: form.buildingType === 'commercial',
    [CB_IDS.bldEtc]: form.buildingType === 'etc',

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
export function buildTextReplacements(form: HecFormData): TextReplacement[] {
  const installAddr = form.installAddr.trim() || form.custAddr;
  const dateStr = `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`;

  return [
    // ── 운영계약서: 계약기간 행 ──
    // "완속 :  " → "완속 : {term}"  (split across runs: this is the first run)
    // We handle the contractTerm in the fill function by filling the header table

    // ── 운영계약서: 충전기수량 ──
    {
      find: '완속충전기 :   대(7kW / C type / 1CH)',
      replace: `완속충전기 : ${form.installQty}대(7kW / C type / 1CH)`,
    },

    // ── 운영계약서: 약관 서두 ──
    {
      find: '___________________________',
      replace: form.custName,
    },

    // ── 운영계약서: 서명부 날짜 (1번째) ──
    {
      find: '년    월    일',
      replace: `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`,
    },

    // ── 직인사용 동의서 ──
    {
      find: '상호: 운암포레스힐2 관리사무소',
      replace: `상호: ${form.custName}`,
    },
    {
      find: '주소: 광주광역시 북구 대자실로 22',
      replace: `주소: ${form.custAddr}`,
    },
    {
      find: '대표자: 이명주',
      replace: `대표자: ${form.custRepresentative}`,
    },
    {
      find: '2025년 9월 25일',
      replace: dateStr,
    },

    // ── 수량공문 ──
    {
      find: '현대재송동아파트 관리사무소\u00a0\u00a0\u00a0\u00a0\u00a0 (인)',
      replace: `${form.custName}\u00a0\u00a0\u00a0\u00a0\u00a0 (인)`,
    },
    {
      find: '현대재송동아파트 관리사무소',
      replace: form.custName,
    },
    {
      find: '2025년 12월 01일',
      replace: dateStr,
    },
    {
      find: '\u00a0\u00a0• 기준 일자 : 2025년 12월 기준',
      replace: `\u00a0\u00a0• 기준 일자 : ${form.contractYear}년 ${form.contractMonth}월 기준`,
    },
    {
      find: '\u00a0\u00a0• 등록 대수 : 6대',
      replace: `\u00a0\u00a0• 등록 대수 : ${form.evCount}대`,
    },
    {
      find: 'gs9966@naver.com',
      replace: form.custEmail,
    },
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

/**
 * v2 schema — adds 사전 현장 컨설팅 결과서 (별지7호) checkbox mapping.
 *
 * Text-field SDT ids (54개) reverse-engineered in v1.
 * Checkbox SDT ids (35개 중 26개 사용) reverse-engineered for v2 by walking
 * word/document.xml and matching surrounding paragraph text to form labels.
 *
 * 별지5호 결제방식 / 개인정보 동의 체크박스는 SDT가 아니라 일반 텍스트 ■/☐.
 * 템플릿에 이미 후불청구·동의함으로 하드코딩되어 있음 — 코드 작업 불필요.
 *
 * 별지5호 "설치 희망지/장소" location-type 체크박스 8개 (공동주택/사업장/소상공인/기타)는
 * v2 spec에 없으므로 매핑하지 않음. Word에서 수동 토글.
 */

// ─────────────────────────────────────────────
// Form data shape
// ─────────────────────────────────────────────

export type BuildingType = 'apartment' | 'commercial' | 'etc';
export type InstallLocationKind = 'indoor' | 'outdoor' | '';
export type Ownership = 'own' | 'rent' | '';
export type OwnerRelation = 'self' | 'family' | 'friend' | 'employee' | 'none' | '';
export type PowerSupply = 'moja' | 'hanjeon' | '';

export interface ContractFormData {
  // 1. 고객사 정보
  custName: string;
  custBizId: string;
  custAddr: string;
  custTel: string;
  custEmail: string;

  // 2. 계약 정보 (계약일 = 조사일, 항상 동일)
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
}

// ─────────────────────────────────────────────
// SDT id constants (extracted from word/document.xml)
// ─────────────────────────────────────────────

/** Text-field SDT ids — fill with string values */
const TEXT_IDS = {
  // 본 계약서 — 서비스 이용자 정보
  custName_main: '-1816484080',
  custBizId_main: '937573591',
  custAddr_main: '-1075586418',
  custTel_main: '1464382075',
  custEmail_main: '967321462',
  // 본 계약서 — 계약 정보
  installAddr_main: '-1244179184',
  contractTerm_main: '431938047',
  installQty_main: '1216165470',
  contractMonth_main: '1214539629',
  contractDay_main: '-772481185',
  // 합의서
  custName_agree: '-1973589452',
  contractMonth_agree1: '-948464699',
  contractDay_agree1: '-1913301594',
  contractMonth_agree2: '-1357123100',
  contractDay_agree2: '-1597244636',
  custName_agreeSign: '-1757892075',
  custBizId_agreeSign: '163435165',
  custAddr_agreeSign: '-1393194833',
  // 직인사용 동의서
  custName_seal: '-482924421',
  custAddr_seal: '-296913556',
  contractMonth_seal: '693811433',
  contractDay_seal: '-1878540111',
  // 행위신고 업무대행 동의서 — v2 폼에서 입력받지 않음, 빈 값으로 클리어
  apartmentName: '-234317306',
  managerTel: '-1697459294',
  managerBirth: '1791007271',
  managerName: '-1316109819',
  contractMonth_act: '455301447',
  contractDay_act: '-1267931261',
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
  contractMonth_b5privacy: '1036239247',
  contractDay_b5privacy: '885302165',
  // 별지 7호 — 사전 현장 컨설팅 결과서
  custName_b7_a: '1499070229',
  custName_b7_b: '1897010284',
  custTel_b7: '-189372705',
  custAddr_b7: '-1528866009',
  smartQty_b7: '483050426',
  parkingLotCount_b7: '350158903',
  installAddr_b7: '1954517277',
  // 조사자 (별지 7호)
  surveyorCompany: '1414659046',
  surveyorTel: '-632096669',
  surveyorName: '140012807',
  surveyDate: '-501512409',
  // 별지 7호 — 중복설치 수량 (v2 신규 매핑)
  dupFastQty: '2064678604',
  dupSlowQty: '1393619667',
  dupDistQty: '-602881735',
  dupOutletQty: '1226803090',
  // 시설명 placeholder — 빈 문자열로 클리어
  facilityName_b5: '-1480913900',
  facilityName_other: '-561410159',
} as const;

/** Checkbox SDT ids — set true/false */
const CB_IDS = {
  // 건물형태
  bldDanok: '-1430114800',     // 단독주택 (form 노출 안 함, 항상 false)
  bldApt: '1613170918',        // 아파트 (template default ■)
  bldYeonlip: '-2100858647',   // 연립주택 (form 노출 안 함)
  bldSangga: '575708064',      // 상가
  bldEtc: '-1855254905',       // 기타

  // 설치위치
  locIndoor: '1703440318',     // 실내,지하
  locOutdoor: '2078551633',    // 실외,노상

  // 소유여부
  ownOwn: '1315296875',        // 소유 (template default ■)
  ownRent: '-94944360',        // 임대

  // 소유주와의 관계
  relSelf: '1173694114',       // 본인 (template default ■)
  relFamily: '-1758897530',    // 가족
  relFriend: '420457414',      // 지인
  relEmployee: '-1654982638',  // 직원
  relNone: '-1730915888',      // 무관

  // 전력인입
  powerMoja: '-6213483',       // 모자분할
  powerHanjeon: '1212161000',  // 한전불입

  // 설치타입 (다중 선택)
  typeWall: '1167367960',      // 벽부형
  typeStand: '-176657065',     // 스탠드

  // 5번 — 전기수용용량 확인
  highVoltConfirm: '-980231648',  // 고압시 변압기 용량 확인 (← 모자분할)
  lowVoltConfirm: '-1940137475',  // 저압 경우 계약전력 확인 (← 한전불입)

  // 6번 — 중복설치
  dupFast: '-251354294',
  dupSlow: '-1361963411',
  dupDist: '731112624',
  dupOutlet: '940579513',
  dupKiosk: '2136826911',
  dupNone: '-1538116413',     // 해당사항 없음 (template default ■)

  // 별지5호 — 설치 희망지 (Row 0): 공동주택/사업장/소상공인/기타
  b5_loc1_apt: '2085950294',     // 공동주택
  b5_loc1_biz: '550437745',      // 사업장
  // (소상공인 868034671 — form 매핑 없음)
  b5_loc1_etc: '-176436175',     // 기타

  // 별지5호 — 장소 (Row 1): 공동주택/사업장/소상공인/기타
  b5_loc2_apt: '-322042069',     // 공동주택
  b5_loc2_biz: '-629096557',     // 사업장
  // (소상공인 850464996 — form 매핑 없음)
  b5_loc2_etc: '-697774570',     // 기타
} as const;

// ─────────────────────────────────────────────
// Build maps for fillDocx
// ─────────────────────────────────────────────

export interface SdtMaps {
  /** SDT id → text value (every entry will be filled, empty string clears placeholder) */
  text: Record<string, string>;
  /** SDT id → checked state */
  checkbox: Record<string, boolean>;
}

export function buildSdtMaps(form: ContractFormData): SdtMaps {
  const installAddr = form.installAddr.trim() || form.custAddr;
  // smart charger qty always equals install qty in v2
  const smartQty = form.installQty;
  // 계약일 = 조사일 (항상 동일)
  const surveyDate = `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`;

  // ─── Text fields ───
  const text: Record<string, string> = {
    [TEXT_IDS.custName_main]: form.custName,
    [TEXT_IDS.custBizId_main]: form.custBizId,
    [TEXT_IDS.custAddr_main]: form.custAddr,
    [TEXT_IDS.custTel_main]: form.custTel,
    [TEXT_IDS.custEmail_main]: form.custEmail,
    [TEXT_IDS.installAddr_main]: installAddr,
    [TEXT_IDS.contractTerm_main]: form.contractTerm,
    [TEXT_IDS.installQty_main]: form.installQty,
    [TEXT_IDS.contractMonth_main]: form.contractMonth,
    [TEXT_IDS.contractDay_main]: form.contractDay,

    [TEXT_IDS.custName_agree]: form.custName,
    [TEXT_IDS.contractMonth_agree1]: form.contractMonth,
    [TEXT_IDS.contractDay_agree1]: form.contractDay,
    [TEXT_IDS.contractMonth_agree2]: form.contractMonth,
    [TEXT_IDS.contractDay_agree2]: form.contractDay,
    [TEXT_IDS.custName_agreeSign]: form.custName,
    [TEXT_IDS.custBizId_agreeSign]: form.custBizId,
    [TEXT_IDS.custAddr_agreeSign]: form.custAddr,

    [TEXT_IDS.custName_seal]: form.custName,
    [TEXT_IDS.custAddr_seal]: form.custAddr,
    [TEXT_IDS.contractMonth_seal]: form.contractMonth,
    [TEXT_IDS.contractDay_seal]: form.contractDay,

    // 행위신고 업무대행 동의서 — v2 폼에서 입력받지 않음, 빈 값으로 클리어
    [TEXT_IDS.apartmentName]: '',
    [TEXT_IDS.managerTel]: '',
    [TEXT_IDS.managerBirth]: '',
    [TEXT_IDS.managerName]: '',
    [TEXT_IDS.contractMonth_act]: form.contractMonth,
    [TEXT_IDS.contractDay_act]: form.contractDay,

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

    [TEXT_IDS.custName_b7_a]: form.custName,
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

    // 중복설치 수량 — 체크된 항목만 값, 미체크는 빈 문자열
    [TEXT_IDS.dupFastQty]: form.dupFast ? form.dupFastQty : '',
    [TEXT_IDS.dupSlowQty]: form.dupSlow ? form.dupSlowQty : '',
    [TEXT_IDS.dupDistQty]: form.dupDist ? form.dupDistQty : '',
    [TEXT_IDS.dupOutletQty]: form.dupOutlet ? form.dupOutletQty : '',

    // 시설명 placeholder 클리어
    [TEXT_IDS.facilityName_b5]: '',
    [TEXT_IDS.facilityName_other]: '',
  };

  // ─── Checkboxes ───
  const checkbox: Record<string, boolean> = {
    // 건물형태 — 라디오 (별지7호)
    [CB_IDS.bldDanok]: false,
    [CB_IDS.bldApt]: form.buildingType === 'apartment',
    [CB_IDS.bldYeonlip]: false,
    [CB_IDS.bldSangga]: form.buildingType === 'commercial',
    [CB_IDS.bldEtc]: form.buildingType === 'etc',

    // 별지5호 — 설치 희망지/장소 cascade from 건물형태
    // 아파트 → 공동주택, 상업시설 → 사업장, 기타 → 기타
    [CB_IDS.b5_loc1_apt]: form.buildingType === 'apartment',
    [CB_IDS.b5_loc1_biz]: form.buildingType === 'commercial',
    [CB_IDS.b5_loc1_etc]: form.buildingType === 'etc',
    [CB_IDS.b5_loc2_apt]: form.buildingType === 'apartment',
    [CB_IDS.b5_loc2_biz]: form.buildingType === 'commercial',
    [CB_IDS.b5_loc2_etc]: form.buildingType === 'etc',

    // 설치위치 — 라디오
    [CB_IDS.locIndoor]: form.installLocation === 'indoor',
    [CB_IDS.locOutdoor]: form.installLocation === 'outdoor',

    // 소유여부 — 라디오
    [CB_IDS.ownOwn]: form.ownership === 'own',
    [CB_IDS.ownRent]: form.ownership === 'rent',

    // 소유주와의 관계 — 라디오
    [CB_IDS.relSelf]: form.ownerRelation === 'self',
    [CB_IDS.relFamily]: form.ownerRelation === 'family',
    [CB_IDS.relFriend]: form.ownerRelation === 'friend',
    [CB_IDS.relEmployee]: form.ownerRelation === 'employee',
    [CB_IDS.relNone]: form.ownerRelation === 'none',

    // 전력인입 — 라디오
    [CB_IDS.powerMoja]: form.powerSupply === 'moja',
    [CB_IDS.powerHanjeon]: form.powerSupply === 'hanjeon',

    // 설치타입 — 다중
    [CB_IDS.typeWall]: form.installTypeWall,
    [CB_IDS.typeStand]: form.installTypeStand,

    // 5번 cascade from 전력인입
    [CB_IDS.highVoltConfirm]: form.powerSupply === 'moja',
    [CB_IDS.lowVoltConfirm]: form.powerSupply === 'hanjeon',

    // 6번 중복설치
    [CB_IDS.dupFast]: form.dupFast,
    [CB_IDS.dupSlow]: form.dupSlow,
    [CB_IDS.dupDist]: form.dupDist,
    [CB_IDS.dupOutlet]: form.dupOutlet,
    [CB_IDS.dupKiosk]: form.dupKiosk,
  };

  // 해당사항 없음: 모두 미체크일 때만 자동 ■
  const anyDup =
    form.dupFast || form.dupSlow || form.dupDist || form.dupOutlet || form.dupKiosk;
  checkbox[CB_IDS.dupNone] = !anyDup;

  return { text, checkbox };
}

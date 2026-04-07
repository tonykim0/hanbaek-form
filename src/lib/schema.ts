/**
 * Form schema and SDT ID mapping for the Plug Link 2026 contract template.
 *
 * The mapping was reverse-engineered from the file:
 *   2026년_계약서류_입력폼_직접입력v1_0__260407.docx
 *
 * If Plug Link releases a new version of the template, the SDT IDs may change.
 * In that case, re-run the analysis (see README) and update the IDs below.
 */

export interface ContractFormData {
  // 1. Customer (서비스 이용자)
  custName: string;
  custBizId: string;
  custAddr: string;
  custTel: string;
  custEmail: string;

  // 2. Contract / install
  installAddr: string;        // leave empty to use custAddr
  installLocation: string;    // 추가 위치 정보 (지하주차장 B1 등)
  installQty: string;         // 설치수량 (대)
  contractTerm: '7' | '10';
  contractMonth: string;
  contractDay: string;

  // 3. 환경공단 신청서
  parkingLotCount: string;
  smartChargerQty: string;    // 7~11kW 슬롯, empty = use installQty

  // 4. 모집대행사 / 조사자 (defaults pre-filled from env vars)
  salesCompany: string;
  salesName: string;
  salesTel: string;
  surveyorCompany: string;
  surveyorName: string;
  surveyorTel: string;
  surveyDate: string;

  // 5. Optional - 의무관리 공동주택만
  apartmentName: string;      // 단지명 (empty = use custName)
  managerName: string;
  managerBirth: string;
  managerTel: string;
}

/**
 * Build a map from SDT id (as string) to the value to insert.
 * Returns only entries that have non-empty values; empty values are
 * intentionally left as the original placeholder.
 */
export function buildSdtValueMap(form: ContractFormData): Record<string, string> {
  const installAddr = form.installAddr.trim() || form.custAddr;
  const installFull = form.installLocation.trim()
    ? `${installAddr} (${form.installLocation.trim()})`
    : installAddr;

  const smartQty = form.smartChargerQty.trim() || form.installQty;
  const apartmentName = form.apartmentName.trim() || form.custName;

  const map: Record<string, string> = {
    // ──────────────────────────────────────────────────
    // Main contract — service user info table
    // ──────────────────────────────────────────────────
    '-1816484080': form.custName,        // 상호
    '937573591': form.custBizId,         // 사업자등록번호
    '-1075586418': form.custAddr,        // 주소
    '1464382075': form.custTel,          // 전화번호
    '967321462': form.custEmail,         // 이메일

    // Contract info table
    '-1244179184': installFull,          // 설치장소
    '431938047': form.contractTerm,      // 계약기간 (7 or 10)
    '1216165470': form.installQty,       // 설치수량 (대)
    '1214539629': form.contractMonth,    // 계약일 월
    '-772481185': form.contractDay,      // 계약일 일

    // ──────────────────────────────────────────────────
    // 합의서 (Agreement) — body & signature
    // ──────────────────────────────────────────────────
    '-1973589452': form.custName,        // 합의서 본문 상호
    '-948464699': form.contractMonth,    // 본문 월
    '-1913301594': form.contractDay,     // 본문 일
    '-1357123100': form.contractMonth,   // 합의서 서명 월
    '-1597244636': form.contractDay,     // 합의서 서명 일
    '-1757892075': form.custName,        // 서명란 상호
    '163435165': form.custBizId,         // 서명란 사업자번호
    '-1393194833': form.custAddr,        // 서명란 주소

    // ──────────────────────────────────────────────────
    // 직인사용 동의서
    // ──────────────────────────────────────────────────
    '-482924421': form.custName,
    '-296913556': form.custAddr,
    '693811433': form.contractMonth,
    '-1878540111': form.contractDay,

    // ──────────────────────────────────────────────────
    // 행위신고 업무대행 동의서 (의무관리 단지)
    // ──────────────────────────────────────────────────
    '-234317306': apartmentName,         // 단지명
    '-1697459294': form.managerTel,      // 관리소장 전화
    '1791007271': form.managerBirth,     // 관리소장 생년월일
    '-1316109819': form.managerName,     // 관리소장 성명
    '455301447': form.contractMonth,
    '-1267931261': form.contractDay,

    // ──────────────────────────────────────────────────
    // 별지 5호 — 환경공단 완속충전시설 설치 신청서
    // ──────────────────────────────────────────────────
    '831731575': form.custName,          // 아파트/사업자명
    '1461920188': form.parkingLotCount,  // 보유 주차면수
    '-1640952418': installAddr,          // 도로명 주소
    '1151491943': form.custName,         // 신청자 상호
    '-944686474': form.custBizId,        // 사업자등록번호
    '1309512896': form.custTel,          // 연락처
    '1917981892': form.salesCompany,     // 모집대행사명
    '-626934252': form.salesName,        // 담당자명
    '-1602870797': form.salesTel,        // 모집대행사 연락처
    '1751003065': smartQty,              // 스마트 충전기 7~11kW 희망수량
    '-331451839': form.contractMonth,    // 신청자 서명 월
    '1586042883': form.contractDay,      // 일
    '604467492': form.custName,          // 개인정보 동의서 신청자
    '1036239247': form.contractMonth,
    '885302165': form.contractDay,

    // ──────────────────────────────────────────────────
    // 별지 7호 — 사전 현장 컨설팅 결과서
    // ──────────────────────────────────────────────────
    '1499070229': form.custName,         // 신청자 정보
    '1897010284': form.custName,
    '-189372705': form.custTel,
    '-1528866009': form.custAddr,
    '483050426': smartQty,               // 7~11kW (?)기
    '350158903': form.parkingLotCount,   // 주차면수
    '1954517277': installAddr,           // 설치장소 주소

    // ──────────────────────────────────────────────────
    // 조사자 (별지 7호)
    // ──────────────────────────────────────────────────
    '1414659046': form.surveyorCompany,
    '-632096669': form.surveyorTel,
    '140012807': form.surveyorName,
    '-501512409': form.surveyDate,
  };

  // Drop empty entries — those will be left as original placeholder text
  const cleaned: Record<string, string> = {};
  for (const [id, value] of Object.entries(map)) {
    if (value && value.trim()) {
      cleaned[id] = value;
    }
  }
  return cleaned;
}

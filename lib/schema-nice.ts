/**
 * NICE (나이스인프라) schema — form data, SDT maps, and text replacements.
 * Reuses the same 67 SDT IDs from HEC (별지5호 + 개인정보 + 별지7호).
 */

import {
  HecFormData,
  buildHecSdtMaps,
  SdtMaps,
} from './schema-hec';

export type NiceFormData = Omit<
  HecFormData,
  'siteManager' | 'parkingSlotsSlow' | 'evCount'
> & {
  installDetailLocation: string;
};

const NICE_UNIT_PRICE = 3_600_000;

// 계약행(제1조 표) 수량·계약금액 — NICE 템플릿에 주입된 전용 SDT
const NICE_CONTRACT_QTY_ID = '900000041';
const NICE_CONTRACT_AMOUNT_ID = '900000042';

export function buildNiceSdtMaps(form: NiceFormData): SdtMaps {
  const maps = buildHecSdtMaps(form as unknown as HecFormData);
  // 직인동의서 주소/대표자/날짜는 기존 seal SDT id(900000002/3/4)로 채워짐.
  maps.text[NICE_CONTRACT_QTY_ID] = form.installQty;
  maps.text[NICE_CONTRACT_AMOUNT_ID] = computeNiceContractAmount(form.installQty);
  return maps;
}

export interface TextReplacement {
  find: string;
  replace: string;
}

export function buildNiceInstallLocation(form: NiceFormData): string {
  const baseAddr = form.installAddr.trim() || form.custAddr;
  const detail = form.installDetailLocation.trim();
  return detail ? `${baseAddr} / 상세위치 : ${detail}` : baseAddr;
}

export function buildNiceParagraphReplacements(form: NiceFormData): TextReplacement[] {
  const installLocation = buildNiceInstallLocation(form);
  const dateStr = `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`;

  return [
    // 설치장소 주소 (table 0 row 9) — multi-run, paragraph-level
    {
      find: '부산광역시 연제구 거제대로 275 / 상세위치 : 지하 1층 06,12 기둥 옆',
      replace: installLocation,
    },
    // 서명부 고객사명 (multi-run paragraph)
    {
      find: '거제 미소지움 더퍼스트 아파트 입주자대표회의',
      replace: form.custName,
    },
    {
      find: '[신청자]거제 미소지움 더퍼스트 아파트 입주자대표회의(인)',
      replace: `[신청자]${form.custName}(인)`,
    },
    // 서명부 날짜 split across two paragraphs: '계약 체결일 : 2026년4월' + '7일'
    {
      find: '계약 체결일 : 2026년4월',
      replace: `계약 체결일 : ${dateStr}`,
    },
    {
      find: '7일',
      replace: '',
    },
    // 직인사용 동의서 상호 — multi-run in NICE template
    {
      find: '상호: 운암포레스힐2 관리사무소',
      replace: `상호: ${form.custName}`,
    },
  ];
}

export function buildNiceTextReplacements(_form: NiceFormData): TextReplacement[] {
  // 직인동의서 주소/대표자/날짜는 SDT(900000002/3/4)로 전환됨.
  // 별지7호 '실외,지상' 오타는 템플릿에서 이미 수정됨.
  return [];
}

export function buildNiceHeaderTableMap(form: NiceFormData): Record<string, string> {
  return {
    '신청자명(기관/단체)': form.custName,
    '고유번호(사업자등록번호)': form.custBizId,
    '주소': form.custAddr,
    '연락처': form.custTel,
    '이메일주소': form.custEmail,
  };
}

export function formatWon(n: number): string {
  return n.toLocaleString('en-US');
}

export function computeNiceContractAmount(installQty: string): string {
  const qty = parseInt(installQty, 10);
  if (!qty || Number.isNaN(qty)) return '';
  return formatWon(qty * NICE_UNIT_PRICE);
}

export { NICE_UNIT_PRICE };

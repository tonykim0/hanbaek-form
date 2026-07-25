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
  // 직인동의서 상호/주소/대표자/날짜는 기존 seal SDT id(900000001/2/3/4)로 채워짐.
  maps.text[NICE_CONTRACT_QTY_ID] = form.installQty;
  maps.text[NICE_CONTRACT_AMOUNT_ID] = computeNiceContractAmount(form.installQty);
  // 설치위치(제1조 표) — 문단치환에서 SDT로 전환
  maps.text['900000043'] = buildNiceInstallLocation(form);
  // 제3조 계약기간 인라인 체크박스 — fillNiceContractTerm에서 SDT로 전환
  const box7 = form.contractTerm === '7' ? '■' : '☐';
  const box10 = form.contractTerm === '10' ? '■' : '☐';
  maps.text['900000048'] = `${box7} 7년(84개월) ${box10} 10년(120개월)`;
  // 별첨 합의서 특별 프로모션 — 계약기간(7/10년)에 따라 제공기간·단가가 달라짐
  maps.text['900000049'] =
    form.contractTerm === '7'
      ? '제공 기간은 제3조에 따라 사용 개시일로부터 6개월 동안이며 제공 단가는 149원/kwh(VAT 포함)'
      : '제공 기간은 제3조에 따라 사용 개시일로부터 최초 6개월은 149원/kwh, 이후 6개월은 220원/kwh(VAT 포함)';
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
  const dateStr = `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`;

  // 설치위치·직인 상호는 SDT(900000043 / 900000001)로 전환됨.
  // 서명부(고객사명·신청자·계약체결일)는 문서 내 2~4벌 중복이라 문단치환 유지
  // (이미 run-split 내성이 있고, 대상이 교체 전용 더미데이터라 편집 취약성이 낮음).
  return [
    // 서명부 고객사명 (multi-run paragraph, 2벌)
    {
      find: '거제 미소지움 더퍼스트 아파트 입주자대표회의',
      replace: form.custName,
    },
    {
      find: '[신청자]거제 미소지움 더퍼스트 아파트 입주자대표회의(인)',
      replace: `[신청자]${form.custName}(인)`,
    },
    // 서명부 날짜 split across two paragraphs: '계약 체결일 : 2026년4월' + '7일' (4벌)
    {
      find: '계약 체결일 : 2026년4월',
      replace: `계약 체결일 : ${dateStr}`,
    },
    {
      find: '7일',
      replace: '',
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

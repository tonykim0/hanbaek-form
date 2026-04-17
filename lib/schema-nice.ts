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

export function buildNiceSdtMaps(form: NiceFormData): SdtMaps {
  return buildHecSdtMaps(form as unknown as HecFormData);
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
  ];
}

export function buildNiceTextReplacements(form: NiceFormData): TextReplacement[] {
  const dateStr = `${form.contractYear}년 ${form.contractMonth}월 ${form.contractDay}일`;

  return [
    // 직인사용 동의서
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
    // 별지 7호 "실외,3" → "실외,지상" (pluglink 템플릿 공통 오타)
    {
      find: '☐실외,3',
      replace: '☐실외,지상',
    },
  ];
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

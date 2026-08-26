/**
 * NICE (나이스인프라) schema — form data, SDT maps, and text replacements.
 * Reuses the same 67 SDT IDs from HEC (별지5호 + 개인정보 + 별지7호).
 */

import {
  HecFormData,
  buildHecSdtMaps,
  SdtMaps,
} from './schema-hec';
import { resolveInstallAddr } from './address';
import { formatKoreanBizId } from './bizid';

export type NiceFormData = Omit<
  HecFormData,
  'siteManager' | 'parkingSlotsSlow' | 'evCount'
> & {
  // 사업구분 — 보조금사업(subsidy) / 자체투자(invest). 생성 템플릿만 달라짐.
  businessType: 'subsidy' | 'invest';
  installDetailLocation: string;
};

const NICE_UNIT_PRICE = 3_600_000;

// 계약행(제1조 표) 수량·계약금액 — NICE 템플릿에 주입된 전용 SDT
const NICE_CONTRACT_QTY_ID = '900000041';
const NICE_CONTRACT_AMOUNT_ID = '900000042';

export function buildNiceSdtMaps(form: NiceFormData): SdtMaps {
  const maps = buildHecSdtMaps(form as unknown as HecFormData);
  /*
   * 조사자(별지7호 7번) — 자동 재발행은 문서에서 읽은 조사자를 그대로 쓴다. 별지5호의
   * 모집대행사와 다를 수 있어서다.
   *
   * ★비어 있으면 모집대행사로 채운다★ (2026-08-26) — 조사자를 적는 입력칸이 어느 화면에도
   * 없다. 페이지 기본값이 상호 '한백' 하나뿐이라, 양식으로 새로 쓴 사전현장컨설팅결과서는
   * 조사자 성명·연락처가 늘 빈 칸으로 나갔다(한백 김정우 010-5343-9983 이 빠진 것이 이것).
   * 공용 매핑(schema-hec)은 그 자리를 sales* 로 메우게 되어 있는데 여기서 무조건 덮어써
   * 그 길을 막고 있었다. 나이스는 모집대행사가 한백이라 메우는 값이 곧 조사자다.
   */
  maps.text['1414659046'] = form.surveyorCompany || form.salesCompany;
  maps.text['-632096669'] = form.surveyorTel || form.salesTel;
  maps.text['140012807'] = form.surveyorName || form.salesName;
  // 직인동의서 상호/주소/대표자/날짜는 기존 seal SDT id(900000001/2/3/4)로 채워짐.
  maps.text[NICE_CONTRACT_QTY_ID] = form.installQty;
  maps.text[NICE_CONTRACT_AMOUNT_ID] = computeNiceContractAmount(form.installQty);
  // 설치위치(제1조 표) — 문단치환에서 SDT로 전환
  maps.text['900000043'] = buildNiceInstallLocation(form);
  // 제3조 계약기간 — 입력폼에서 선택한 기간만 표시
  maps.text['900000048'] = formatNiceContractTerm(form.contractTerm);
  // 별첨 합의서 특별 프로모션 — 제목·①은 템플릿 고정, ②는 10년 계약에만 표시
  maps.text['900000049'] =
    form.contractTerm === '10'
      ? '② ①번 적용 종료일 다음날부터 180일 / 220원 추가 적용'
      : '';
  return maps;
}

export interface TextReplacement {
  find: string;
  replace: string;
}

export function formatNiceContractTerm(
  contractTerm: NiceFormData['contractTerm']
): string {
  return contractTerm === '7' ? '■ 7년(84개월)' : '■ 10년(120개월)';
}

export function buildNiceInstallLocation(form: NiceFormData): string {
  const baseAddr = resolveInstallAddr(form);
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
  // 별지7호 설치위치 표기는 템플릿에서 '실외, 노상'으로 통일됨.
  return [];
}

export function buildNiceHeaderTableMap(form: NiceFormData): Record<string, string> {
  return {
    '신청자명(기관/단체)': form.custName,
    '고유번호(사업자등록번호)': formatKoreanBizId(form.custBizId),
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

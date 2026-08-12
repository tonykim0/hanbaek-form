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
  /** 자동 재발행용: 별지5호·7호 장소 체크를 건물형태와 별도로 보존 */
  siteCategory?: '' | 'apartment' | 'business' | 'small_business' | 'etc';
  /** 자동 재발행용: 11kW 이상~30kW 미만 수량 */
  installQty11to30?: string;
  /** 자동 재발행용: 원본의 「해당사항 없음」 체크를 추정 없이 보존 */
  dupNone?: boolean;
};

const NICE_UNIT_PRICE = 3_600_000;

// 계약행(제1조 표) 수량·계약금액 — NICE 템플릿에 주입된 전용 SDT
const NICE_CONTRACT_QTY_ID = '900000041';
const NICE_CONTRACT_AMOUNT_ID = '900000042';

export function buildNiceSdtMaps(form: NiceFormData): SdtMaps {
  const maps = buildHecSdtMaps(form as unknown as HecFormData);
  // NICE 자동 재발행에서는 별지5호의 모집대행사와 별지7호의 조사자가
  // 서로 다를 수 있으므로 조사자 칸에는 surveyor* 필드를 그대로 사용한다.
  maps.text['1414659046'] = form.surveyorCompany;
  maps.text['-632096669'] = form.surveyorTel;
  maps.text['140012807'] = form.surveyorName;
  maps.text['1751003065'] = form.installQty11to30 ?? '';
  maps.text['313466420'] = form.installQty11to30 ?? '';

  if (form.siteCategory !== undefined) {
    const categoryIds = {
      apartment: ['2085950294', '-322042069'],
      business: ['550437745', '-629096557'],
      small_business: ['868034671', '850464996'],
      etc: ['-176436175', '-697774570'],
    } as const;
    for (const ids of Object.values(categoryIds)) {
      for (const id of ids) maps.checkbox[id] = false;
    }
    if (form.siteCategory) {
      for (const id of categoryIds[form.siteCategory]) maps.checkbox[id] = true;
    }
  }
  if (form.dupNone !== undefined) maps.checkbox['-1538116413'] = form.dupNone;
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

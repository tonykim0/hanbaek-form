/**
 * 협력사가 보내온 스캔 PDF → 입력폼 값 역추출.
 *
 * 협력사가 계약서류를 손으로 채워 출력·스캔해 보내면, 그 PDF를 읽어
 * 입력폼을 자동으로 채웁니다. 처음부터 다시 타이핑하지 않고 틀린 칸만
 * 고쳐서 재생성하는 것이 목적입니다.
 *
 * 이 파일은 클라이언트·서버가 함께 쓰는 순수 타입/매핑만 담습니다.
 *   · 프롬프트 → lib/prompts-import.ts (서버)
 *   · Claude 호출 → lib/claude-import.ts (서버)
 *   · 업로드·호출 → lib/import-client.ts (클라이언트)
 */

import type { FieldValues, Path, PathValue, UseFormSetValue } from 'react-hook-form';

// ─────────────────────────────────────────────
// 추출 결과 shape
// ─────────────────────────────────────────────

/**
 * Claude가 스캔본에서 읽어낸 폼 값. 4개 CPO 폼의 합집합이며,
 * 읽지 못한 칸은 null 입니다 (폼 기본값을 덮지 않도록 적용 단계에서 건너뜁니다).
 */
export interface ImportedFormFields {
  businessType: 'subsidy' | 'invest' | null;

  // 고객사
  custName: string | null;
  custBizId: string | null;
  custAddr: string | null;
  custTel: string | null;
  custEmail: string | null;
  custRepresentative: string | null;
  siteManager: string | null;

  // 계약
  installAddr: string | null;
  installQty: string | null;
  contractTerm: '7' | '10' | null;
  contractYear: string | null;
  contractMonth: string | null;
  contractDay: string | null;
  installDetailLocation: string | null;

  // 모집대행사 / 조사자
  salesCompany: string | null;
  salesName: string | null;
  salesTel: string | null;
  surveyorCompany: string | null;
  surveyorName: string | null;
  surveyorTel: string | null;

  // 별지7호 사전 현장 컨설팅 결과서
  parkingLotCount: string | null;
  buildingType:
    | 'apartment'
    | 'yeonlip'
    | 'sangga'
    | 'etc_officetel'
    | 'etc_knowledge'
    | 'etc_government'
    | 'etc_custom'
    | null;
  buildingTypeEtc: string | null;
  installLocIndoor: boolean | null;
  installLocOutdoor: boolean | null;
  ownership: 'own' | 'rent' | null;
  ownerRelation: 'self' | 'family' | 'friend' | 'employee' | 'none' | null;
  powerMoja: boolean | null;
  powerHanjeon: boolean | null;
  installTypeWall: boolean | null;
  installTypeStand: boolean | null;

  // 중복설치
  dupFast: boolean | null;
  dupFastQty: string | null;
  dupSlow: boolean | null;
  dupSlowQty: string | null;
  dupDist: boolean | null;
  dupDistQty: string | null;
  dupOutlet: boolean | null;
  dupOutletQty: string | null;
  dupKiosk: boolean | null;

  // HEC 전용
  evCount: string | null;
  siteTotalSlow: string | null;
  siteTotalFast: string | null;
}

export type ImportedFieldKey = keyof ImportedFormFields;

/** 스캔본에서 확인된 서류 종류 — 어디까지 읽혔는지 사용자에게 보여줍니다. */
export interface DetectedDocument {
  /** 예: '계약서', '별지5호 설치신청서', '별지7호 사전현장컨설팅 결과서' */
  name: string;
  /** 1-based 페이지 번호 */
  pages: number[];
}

export interface FormImportResult {
  fields: ImportedFormFields;
  /** 필드명 → 0~1 신뢰도. 낮은 값은 UI에서 '확인 필요'로 표시합니다. */
  confidence: Partial<Record<ImportedFieldKey, number>>;
  /** 서류 간 값이 어긋나거나 비어 있는 칸 등, 사람이 봐야 하는 지점 */
  issues: string[];
  detectedCpo: string | null;
  detectedDocs: DetectedDocument[];
  /** 실제로 Claude에 넘긴 페이지 수 */
  analyzedPages: number;
  /** 원본 페이지 수 (analyzedPages보다 크면 뒷부분이 잘렸다는 뜻) */
  totalPages: number;
}

export interface FormImportErrorResponse {
  error: string;
  code: string;
}

/** 신뢰도가 이 값 미만이면 '확인 필요'로 표시합니다. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

// ─────────────────────────────────────────────
// CPO별 적용 대상 필드
// ─────────────────────────────────────────────

/**
 * 4개 폼이 공유하는 필드. 폼에 없는 키를 setValue 하면 제출 데이터에
 * 쓰이지 않는 값이 섞여 들어가므로, CPO별로 적용 대상을 명시합니다.
 */
const COMMON_KEYS = [
  'businessType',
  'custName',
  'custBizId',
  'custAddr',
  'custTel',
  'custEmail',
  'installAddr',
  'installQty',
  'contractTerm',
  'contractYear',
  'contractMonth',
  'contractDay',
  'salesCompany',
  'salesName',
  'salesTel',
  'surveyorCompany',
  'surveyorName',
  'surveyorTel',
  'parkingLotCount',
  'buildingType',
  'buildingTypeEtc',
  'installLocIndoor',
  'installLocOutdoor',
  'ownership',
  'ownerRelation',
  'powerMoja',
  'powerHanjeon',
  'installTypeWall',
  'installTypeStand',
  'dupFast',
  'dupFastQty',
  'dupSlow',
  'dupSlowQty',
  'dupDist',
  'dupDistQty',
  'dupOutlet',
  'dupOutletQty',
  'dupKiosk',
] as const satisfies readonly ImportedFieldKey[];

export type CpoKey = 'hec' | 'nice' | 'sk' | 'pluglink';

export const IMPORT_FIELD_KEYS: Record<CpoKey, readonly ImportedFieldKey[]> = {
  // HecFormData — 공통 + 대표자·현장담당자·전기차등록대수·별지2 총 설치대수
  hec: [
    ...COMMON_KEYS,
    'custRepresentative',
    'siteManager',
    'evCount',
    'siteTotalSlow',
    'siteTotalFast',
  ],
  // NiceFormData — 공통 + 대표자 + 제1조 설치위치 상세
  nice: [...COMMON_KEYS, 'custRepresentative', 'installDetailLocation'],
  // SkFormData — 공통 + 대표자 (직인동의서에 들어감)
  sk: [...COMMON_KEYS, 'custRepresentative'],
  // ContractFormData — 공통만
  pluglink: [...COMMON_KEYS],
};

// ─────────────────────────────────────────────
// 폼 적용
// ─────────────────────────────────────────────

export interface ApplyOutcome {
  /** 실제로 폼에 채워진 필드 */
  applied: ImportedFieldKey[];
  /** 스캔본에서 읽지 못해 폼 기본값을 그대로 둔 필드 */
  missing: ImportedFieldKey[];
  /** 채웠지만 신뢰도가 낮아 사람이 확인해야 하는 필드 */
  lowConfidence: ImportedFieldKey[];
}

/**
 * 추출값을 react-hook-form에 반영합니다.
 *
 * null·빈 문자열은 건너뜁니다 — 잘못 읽은 빈칸이 폼 기본값(예: 모집대행사
 * 기본 담당자)을 지워버리면 오히려 손이 더 갑니다.
 */
export function applyImportedFields<TFieldValues extends FieldValues>(
  result: FormImportResult,
  setValue: UseFormSetValue<TFieldValues>,
  keys: readonly ImportedFieldKey[]
): ApplyOutcome {
  const applied: ImportedFieldKey[] = [];
  const missing: ImportedFieldKey[] = [];
  const lowConfidence: ImportedFieldKey[] = [];

  for (const key of keys) {
    const value = result.fields[key];
    if (value === null || value === undefined || value === '') {
      missing.push(key);
      continue;
    }
    setValue(
      key as Path<TFieldValues>,
      value as PathValue<TFieldValues, Path<TFieldValues>>,
      { shouldValidate: false, shouldDirty: true }
    );
    applied.push(key);

    const score = result.confidence[key];
    if (typeof score === 'number' && score < LOW_CONFIDENCE_THRESHOLD) {
      lowConfidence.push(key);
    }
  }

  return { applied, missing, lowConfidence };
}

/** 사용자에게 보여줄 한글 필드명 */
export const FIELD_LABELS: Record<ImportedFieldKey, string> = {
  businessType: '사업구분',
  custName: '법인명(단체명)',
  custBizId: '사업자등록번호',
  custAddr: '사업자등록증 주소',
  custTel: '대표 전화번호',
  custEmail: '이메일',
  custRepresentative: '대표자',
  siteManager: '현장 담당자',
  installAddr: '건축물대장 주소(설치장소)',
  installQty: '설치수량',
  contractTerm: '계약기간',
  contractYear: '계약연도',
  contractMonth: '계약월',
  contractDay: '계약일',
  installDetailLocation: '설치 상세위치',
  salesCompany: '외주모집대행사',
  salesName: '모집대행 담당자',
  salesTel: '모집대행 연락처',
  surveyorCompany: '조사업체',
  surveyorName: '조사자명',
  surveyorTel: '조사자 연락처',
  parkingLotCount: '보유 주차면수',
  buildingType: '건물형태',
  buildingTypeEtc: '건물형태(직접입력)',
  installLocIndoor: '설치위치 실내·지하',
  installLocOutdoor: '설치위치 실외·노상',
  ownership: '소유여부',
  ownerRelation: '소유주와의 관계',
  powerMoja: '전력인입 모자분할',
  powerHanjeon: '전력인입 한전불입',
  installTypeWall: '설치타입 벽부형',
  installTypeStand: '설치타입 스탠드',
  dupFast: '중복설치 급속',
  dupFastQty: '중복설치 급속 수량',
  dupSlow: '중복설치 완속',
  dupSlowQty: '중복설치 완속 수량',
  dupDist: '중복설치 전력분배형',
  dupDistQty: '중복설치 전력분배형 수량',
  dupOutlet: '중복설치 과금형콘센트',
  dupOutletQty: '중복설치 과금형콘센트 수량',
  dupKiosk: '중복설치 키오스크',
  evCount: '전기차 등록대수',
  siteTotalSlow: '총 설치대수(완속)',
  siteTotalFast: '총 설치대수(급속)',
};

/** 사람이 반드시 확인해야 하는 핵심 필드 — 비어 있으면 눈에 띄게 알립니다. */
export const CRITICAL_KEYS: readonly ImportedFieldKey[] = [
  'custName',
  'custBizId',
  'custAddr',
  'custTel',
  'installAddr',
  'installQty',
  'parkingLotCount',
];

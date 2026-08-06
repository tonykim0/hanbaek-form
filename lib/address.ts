/**
 * 도로명주소 형식 판별.
 *
 * 계약서에는 도로명주소를 적어야 하는데 지번주소(…동 123-45)가 그대로
 * 입력되는 경우가 있어, 입력 단계에서 걸러내기 위한 용도입니다.
 * 행정 데이터 조회 없이 형식만 보므로, 확실한 경우에만 오류로 막고
 * 애매한 경우는 경고만 띄웁니다.
 *
 * 도로명주소 — 시도 + 시군구 + 「…대로/로/길」 + 건물번호
 *   예) 광주광역시 광산구 비아로 23
 *       서울특별시 강남구 테헤란로1길 5, 101동 202호
 * 지번주소 — 「…동/리/가」 + 번지
 *   예) 서울특별시 강남구 역삼동 736-25
 *       경기도 광주시 오포읍 문형리 산 21
 */

/**
 * 카카오 우편번호 서비스는 시·도를 축약형(경기 · 서울)으로 돌려줍니다.
 * 계약서에는 정식 명칭으로 들어가야 해서 펴 줍니다.
 */
const SIDO_FULL_NAME: Record<string, string> = {
  서울: '서울특별시',
  부산: '부산광역시',
  대구: '대구광역시',
  인천: '인천광역시',
  광주: '광주광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  경기: '경기도',
  강원: '강원특별자치도',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전북특별자치도',
  전남: '전라남도',
  경북: '경상북도',
  경남: '경상남도',
  제주: '제주특별자치도',
};

/** 검색으로 고른 도로명주소를 계약서 표기에 맞게 정리 */
export function normalizeRoadAddress(raw: string): string {
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  const [first, ...rest] = value.split(' ');
  const full = SIDO_FULL_NAME[first];
  return full && rest.length > 0 ? [full, ...rest].join(' ') : value;
}

/** 「…대로/로/길」 뒤에 건물번호(숫자)가 오는가 */
const ROAD_PATTERN = /(?:^|[\s,])[가-힣A-Za-z0-9]*(?:대로|로|길)\s*\d/;

/**
 * 「…동/리/가」 뒤에 번지(숫자, 산번지 포함)가 오는가.
 * 「동인동1가」처럼 이름에 숫자가 섞인 경우도 포함하되, 「101동 202호」 같은
 * 상세주소와 구분하기 위해 첫 글자는 한글이어야 합니다.
 */
const JIBUN_PATTERN =
  /(?:^|[\s,])[가-힣][가-힣0-9]{0,9}(?:동|리|가)\s*(?:산\s*)?\d+(?:-\d+)?(?=$|[\s,])/;

/**
 * 「5층」 「202호」 「101동」 같은 상세주소가 붙어 있는가.
 * 숫자로 시작하는 토큰만 보므로 「삼성2동」 「3동길」 같은 지명·도로명은 걸리지 않습니다.
 */
const DETAIL_PATTERN = /(?:^|[\s,(])(?:지하\s*)?\d+\s*(?:층|호|동)(?=$|[\s,)])/;

export function hasDetailAddress(raw: string): boolean {
  return DETAIL_PATTERN.test((raw ?? '').trim());
}

export type AddressKind =
  /** 도로명 + 건물번호가 확인됨 */
  | 'road'
  /** 지번주소로 보임 — 도로명 형식이 전혀 없고 「…동/리 번지」가 있음 */
  | 'jibun'
  /** 판단 불가 — 도로명도 지번도 뚜렷하지 않음 */
  | 'unknown'
  /** 빈 값 */
  | 'empty';

export function classifyAddress(raw: string): AddressKind {
  const value = (raw ?? '').trim();
  if (!value) return 'empty';
  if (ROAD_PATTERN.test(value)) return 'road';
  if (JIBUN_PATTERN.test(value)) return 'jibun';
  return 'unknown';
}

/**
 * 입력을 막아야 하는 경우의 메시지. 지번주소가 확실할 때만 값을 돌려줍니다.
 * (react-hook-form의 validate에 그대로 쓰기 위한 형태)
 */
export function roadAddressError(
  raw: string,
  options?: {
    /** 설치장소처럼 「지하 1층」 등 위치 정보가 필요한 필드는 상세주소를 허용 */
    allowDetail?: boolean;
  }
): string | undefined {
  if (classifyAddress(raw) === 'jibun') {
    return '지번주소로 보입니다 — 도로명주소로 입력해주세요 (예: 광주광역시 광산구 비아로 23)';
  }
  if (!options?.allowDetail && hasDetailAddress(raw)) {
    return '층·호·동 등 상세주소는 빼고 도로명주소까지만 입력해주세요 (예: 광주광역시 광산구 비아로 23)';
  }
  return undefined;
}

/**
 * 막지는 않되 확인이 필요한 경우의 경고 메시지.
 * 도로명·지번 어느 쪽으로도 판단되지 않을 때 띄웁니다.
 */
export function roadAddressWarning(raw: string): string | undefined {
  return classifyAddress(raw) === 'unknown'
    ? '⚠ 도로명주소 형식이 아닌 것 같습니다 — 「도로명 + 건물번호」가 있는지 확인해주세요'
    : undefined;
}

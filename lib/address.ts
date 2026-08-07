/**
 * 도로명주소 형식 판별.
 *
 * 두 주소는 성격이 다릅니다.
 *   · 고객사 주소 — 사업자등록증에 적힌 그대로. 지번주소 · 상세주소도 그대로 씁니다.
 *   · 설치장소 주소 — 반드시 건축물대장상 도로명주소. 지번주소는 막습니다.
 * 그래서 고객사 주소가 도로명이 아닐 때는 설치장소를 따로 받아야 합니다
 * (설치장소를 비우면 고객사 주소가 그대로 들어가기 때문입니다).
 *
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
 * 설치장소로 쓸 수 있는 도로명주소인가 — 「도로명 + 건물번호」가 확인되고
 * 층 · 호 같은 상세주소가 붙어 있지 않은 경우.
 *
 * 설치장소를 비우면 고객사 주소가 그대로 들어가므로, 이 값이 false 면
 * 설치장소를 따로 입력받아야 합니다.
 */
export function isRoadAddress(raw: string): boolean {
  return classifyAddress(raw) === 'road' && !hasDetailAddress(raw);
}

/**
 * 고객사 주소(사업자등록증상 주소) 안내.
 *
 * 사업자등록증에 적힌 주소는 지번 · 상세주소일 수 있으므로 막지 않습니다.
 * 다만 그런 경우 설치장소를 따로 적어야 해서 알려줍니다.
 */
export function bizAddressNotice(raw: string): string | undefined {
  const value = (raw ?? '').trim();
  if (!value || isRoadAddress(value)) return undefined;
  const kind = classifyAddress(value);
  const what =
    kind === 'jibun'
      ? '지번주소'
      : hasDetailAddress(value)
        ? '상세주소가 포함된 주소'
        : '도로명주소가 아닐 수 있는 주소';
  return `${what}입니다 — 사업자등록증 그대로 두고, 아래 「건축물대장 주소 (설치장소)」를 입력해주세요`;
}

/**
 * 계약서에 넣을 설치장소 주소.
 *
 * 설치장소를 비워두면 고객사 주소를 씁니다. 입력 화면에서 고객사 주소가
 * 도로명주소가 아닐 때는 설치장소를 필수로 받으므로(isRoadAddress 참고),
 * 이 경로로 지번주소가 계약서에 들어가지 않습니다.
 */
export function resolveInstallAddr(form: {
  installAddr: string;
  custAddr: string;
}): string {
  return form.installAddr.trim() || form.custAddr;
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

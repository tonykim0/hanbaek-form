/**
 * 주소에서 지역을 뽑아 현장명 앞에 붙인다.
 *
 * 138건이 되면 「태평아파트」 하나로는 어느 현장인지 모른다. 이름 앞에 지역이 붙어 있어야
 * 보드·표·정산 어디서 봐도 바로 가려진다.
 *
 *   전북특별자치도 전주시 완산구 태평2길 22 (태평동) + 태평아파트
 *     → 전북 전주 태평아파트
 *
 * 시·도는 줄여 쓰고(전북특별자치도 → 전북), 그 아래는 시·군·구 하나만 딴다.
 * 시 안의 구(전주시 완산구)는 버린다 — 이름이 길어지는 만큼 구분에 보태는 것이 없다.
 */

/** 시·도 정식 이름 → 부르는 이름. 앞이 긴 것부터 봐야 「전라북도」가 「전북」에 먹히지 않는다. */
const SIDO: Array<[RegExp, string]> = [
  [/^서울(특별시)?$/, '서울'],
  [/^부산(광역시)?$/, '부산'],
  [/^대구(광역시)?$/, '대구'],
  [/^인천(광역시)?$/, '인천'],
  [/^광주(광역시)?$/, '광주'],
  [/^대전(광역시)?$/, '대전'],
  [/^울산(광역시)?$/, '울산'],
  [/^세종(특별자치시)?$/, '세종'],
  [/^경기(도)?$/, '경기'],
  [/^강원(특별자치도|도)?$/, '강원'],
  [/^충청북도$|^충북$/, '충북'],
  [/^충청남도$|^충남$/, '충남'],
  [/^전북특별자치도$|^전라북도$|^전북$/, '전북'],
  [/^전라남도$|^전남$/, '전남'],
  [/^경상북도$|^경북$/, '경북'],
  [/^경상남도$|^경남$/, '경남'],
  [/^제주(특별자치도|도)?$/, '제주'],
];

/** 시·군·구 한 조각. 「태평2길」·「대학로」 같은 도로명에 걸리지 않게 끝 글자로만 본다. */
const CITY_RE = /^(.{1,10}?)(시|군|구)$/;

/**
 * 「전주시」→「전주」처럼 끝 글자를 뗀다.
 *
 * 다만 한 글자로 줄어드는 곳은 떼지 않는다 — 「광주 북」은 지명으로 읽히지 않는다.
 * 북구·중구·동구·서구·남구가 여기 걸린다.
 */
function shorten(token: string): string {
  const m = CITY_RE.exec(token);
  if (!m) return token;
  return m[1].length >= 2 ? m[1] : token;
}

/**
 * 주소 → 지역 조각. 없으면 빈 배열.
 *
 *   전북특별자치도 전주시 완산구 …  → ['전북', '전주']
 *   서울특별시 강남구 …             → ['서울', '강남']
 *   세종특별자치시 …                → ['세종']
 *   제주특별자치도 제주시 …         → ['제주']        (겹치면 하나만)
 */
export function regionPartsOf(addr: string | null | undefined): string[] {
  if (!addr?.trim()) return [];
  const tokens = addr.trim().split(/\s+/);
  const parts: string[] = [];

  let i = 0;
  const sido = SIDO.find(([re]) => re.test(tokens[0] ?? ''));
  if (sido) {
    parts.push(sido[1]);
    i = 1;
  }

  /*
   * 시·도 다음의 첫 시·군·구 하나. 도로명·번지에 닿기 전에 나오므로 앞에서 몇 칸만 본다 —
   * 끝까지 훑으면 「…아이파크 2구」 같은 것이 걸린다.
   */
  for (const token of tokens.slice(i, i + 2)) {
    if (!CITY_RE.test(token)) continue;
    parts.push(shorten(token));
    break;
  }

  // 「제주 제주」·「광주 광주」처럼 같은 말이 겹치면 하나만 남긴다
  return parts.filter((p, idx) => idx === 0 || p !== parts[idx - 1]);
}

/** 주소에서 뽑은 지역. 붙일 것이 없으면 빈 문자열. */
export function regionPrefixOf(addr: string | null | undefined): string {
  return regionPartsOf(addr).join(' ');
}

/**
 * 현장명 앞에 지역을 붙인다.
 *
 * 이미 들어 있는 말은 다시 붙이지 않는다. 다만 시·도만 들어 있고 시·군·구가 없는 경우
 * (「전북 태평아파트」)는 손대지 않는다 — 중간에 끼워 넣으면 말 순서가 꼬인다.
 */
export function withRegionPrefix(name: string, addr: string | null | undefined): string {
  const trimmed = name.trim();
  const parts = regionPartsOf(addr);
  if (!trimmed || parts.length === 0) return trimmed;

  const [sido, city] = parts;
  if (city && trimmed.includes(city)) {
    return trimmed.includes(sido) ? trimmed : `${sido} ${trimmed}`;
  }
  if (trimmed.includes(sido)) return trimmed;
  return `${parts.join(' ')} ${trimmed}`;
}

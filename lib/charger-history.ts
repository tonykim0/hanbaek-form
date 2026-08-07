/**
 * 주소 → 충전기 · 보조금 이력 조회의 공용 로직.
 *
 * 인덱스를 만드는 스크립트(scripts/build-charger-index.ts)와 조회하는 화면
 * (components/ChargerHistoryLookup.tsx)이 같은 규칙으로 주소를 다뤄야 하므로
 * 주소 파싱 · 키 계산 · 판정을 모두 이 파일에 모아 둡니다.
 *
 * 조회 키는 「시군구 + 도로명 + 건물번호」입니다. 도로명은 시군구 안에서
 * 유일하도록 부여되므로 읍 · 면 · 리는 버립니다.
 */

/* ------------------------------------------------------------------ 시 · 도 */

/**
 * 원본 데이터가 쓰는 시 · 도 이름(정식 표기).
 * 카카오 우편번호 서비스는 축약형(경기 · 서울)을 돌려주고, 데이터는
 * 「전남광주통합특별시」처럼 통합 명칭을 쓰기 때문에 양쪽을 맞춰야 합니다.
 */
export const SIDO_ALIAS: Record<string, string> = {
  서울: '서울특별시',
  서울특별시: '서울특별시',
  부산: '부산광역시',
  부산광역시: '부산광역시',
  대구: '대구광역시',
  대구광역시: '대구광역시',
  인천: '인천광역시',
  인천광역시: '인천광역시',
  대전: '대전광역시',
  대전광역시: '대전광역시',
  울산: '울산광역시',
  울산광역시: '울산광역시',
  세종: '세종특별자치시',
  세종특별자치시: '세종특별자치시',
  경기: '경기도',
  경기도: '경기도',
  강원: '강원특별자치도',
  강원도: '강원특별자치도',
  강원특별자치도: '강원특별자치도',
  충북: '충청북도',
  충청북도: '충청북도',
  충남: '충청남도',
  충청남도: '충청남도',
  전북: '전북특별자치도',
  전라북도: '전북특별자치도',
  전북특별자치도: '전북특별자치도',
  경북: '경상북도',
  경상북도: '경상북도',
  경남: '경상남도',
  경상남도: '경상남도',
  제주: '제주특별자치도',
  제주도: '제주특별자치도',
  제주특별자치도: '제주특별자치도',
  // 광주 · 전남은 통합 명칭 하나로 관리됩니다.
  광주: '전남광주통합특별시',
  광주광역시: '전남광주통합특별시',
  전남: '전남광주통합특별시',
  전라남도: '전남광주통합특별시',
  전남광주통합특별시: '전남광주통합특별시',
  // 원본에 섞여 있는 준말 · 오기
  서울시: '서울특별시',
  부산시: '부산광역시',
  대구시: '대구광역시',
  인천시: '인천광역시',
  대전시: '대전광역시',
  울산시: '울산광역시',
  경산북도: '경상북도',
};

export function canonicalSido(raw: string): string {
  const value = (raw ?? '').trim();
  return SIDO_ALIAS[value] ?? value;
}

/* ------------------------------------------------------------- 주소 파싱 */

/**
 * 「테헤란로」 「남악5로72번길」 「292번길」처럼 도로명으로 끝나는 토큰.
 * 「구암3.1로」처럼 점이 들어가는 도로명도 있습니다.
 */
const ROAD_TOKEN = /^[가-힣A-Za-z0-9·.]+(?:대로|로|길)$/;
/** 건물번호 — 「23」 「23-4」 (지하 · 산 표기 포함) */
const NUM_TOKEN = /^(?:지하)?산?\d+(?:-\d+)?$/;
/** 시 · 군 · 구 토큰 (읍 · 면 · 리 · 동은 키에서 제외) */
const SGG_TOKEN = /(?:시|군|구)$/;

export interface ParsedAddress {
  /** 데이터 표기로 맞춘 시 · 도 */
  sido: string;
  /** 시군구 — 「수원시영통구」처럼 공백을 뺀 형태 */
  sgg: string;
  /** 도로명 */
  road: string;
  /** 건물번호 */
  num: string;
  /** 조회 키 — 「도로명|건물번호」 */
  roadNumKey: string;
  /** 시 · 도 + 시군구 키 — 「부산광역시|동구」 */
  regionKey: string;
}

function tokenize(raw: string): string[] {
  return (raw ?? '')
    .replace(/[?？]/g, ' ') // 원본에 공백이 「？」로 깨져 들어온 행이 있습니다
    .replace(/[,(].*$/, ' ') // 「, 101동 202호」 「(역삼동)」 같은 뒤쪽 군더더기 제거
    // 원본 표기가 흔들리는 부분을 맞춰 줍니다.
    .replace(/(?:^|\s)산\s+(\d)/g, ' 산$1') // 「장회리 산 13-24」 → 「장회리 산13-24」
    .replace(/(?:^|\s)지하\s+(\d)/g, ' 지하$1') // 「시민대로 지하 238」 → 「시민대로 지하238」
    .replace(/([가-힣])동\s+(\d+가)(?=\s|$)/g, '$1동$2') // 「인후동 1가」 → 「인후동1가」
    .replace(/(\d+(?:-\d+)?)번지(?=\s|$)/g, '$1') // 「2409번지」 → 「2409」
    .replace(/([가-힣0-9.]+(?:대로|로|길))(\d+(?:-\d+)?)(?=\s|$)/g, '$1 $2') // 「상예로381」 → 「상예로 381」
    .replace(/([가-힣][가-힣0-9]*(?:동|리|가))(\d+(?:-\d+)?)(?=\s|$)/g, '$1 $2') // 「이호리122-3」 → 「이호리 122-3」
    // 「오송생명로 77첨단임상시험센터」 → 「… 77 첨단임상시험센터」.
    // 「292번길」 「2차로」처럼 숫자 뒤가 도로명인 토큰은 건드리지 않습니다.
    .replace(
      /(^|\s)(\d+(?:-\d+)?)(?![가-힣0-9.]*(?:대로|로|길|가)(?=\s|$))([가-힣]{2,})(?=\s|$)/g,
      '$1$2 $3'
    )
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * 앞쪽 토큰에서 시 · 도와 시군구를 갈라냅니다.
 * 원본에 「청주시 …」처럼 시 · 도가 빠진 주소가 섞여 있어, 첫 토큰이 시 · 도가
 * 아니면 시군구의 일부로 봅니다(그 경우 sido 는 빈 값).
 */
function splitRegion(tokens: string[], end: number): { sido: string; sgg: string } {
  const hasSido = tokens.length > 0 && SIDO_ALIAS[tokens[0]] !== undefined;
  const sido = hasSido ? SIDO_ALIAS[tokens[0]] : '';
  const parts = tokens.slice(hasSido ? 1 : 0, end).filter((t) => SGG_TOKEN.test(t));
  // 「경상북도 경산시 경산시 …」처럼 같은 시군구가 겹쳐 적힌 행이 있어 눌러 줍니다
  const sgg = parts.filter((t, i) => t !== parts[i - 1]).join('');
  return { sido, sgg };
}

/**
 * 도로명주소에서 조회에 쓸 조각을 뽑아냅니다.
 * 도로명 + 건물번호를 찾지 못하면 null (지번주소 · 빈 값 등).
 */
export function parseRoadAddress(raw: string): ParsedAddress | null {
  const tokens = tokenize(raw);
  if (tokens.length < 2) return null;

  let roadAt = -1;
  for (let i = 1; i < tokens.length - 1; i += 1) {
    if (ROAD_TOKEN.test(tokens[i]) && NUM_TOKEN.test(tokens[i + 1])) {
      roadAt = i;
      break;
    }
  }
  if (roadAt < 0) return null;

  // 「안양로 292번길 20」처럼 도로명이 띄어져 들어온 경우 붙여 줍니다.
  let road = tokens[roadAt];
  let regionEnd = roadAt;
  if (/^\d/.test(road) && roadAt > 1 && ROAD_TOKEN.test(tokens[roadAt - 1])) {
    road = tokens[roadAt - 1] + road;
    regionEnd = roadAt - 1;
  }

  const num = tokens[roadAt + 1].replace(/^지하/, '');
  const { sido, sgg } = splitRegion(tokens, regionEnd);

  return {
    sido,
    sgg,
    road,
    num,
    roadNumKey: `${road}|${num}`,
    regionKey: `${sido}|${sgg}`,
  };
}

/* --------------------------------------------------------- 지번주소 보조 */

/** 지번 보조 키를 도로명 키와 구분하는 접두사 */
export const JIBUN_PREFIX = 'J:';

/** 「역삼동」 「남악리」 「동인동1가」 — 법정동 · 리 토큰 */
const DONG_TOKEN = /^[가-힣][가-힣0-9]*(?:동|리|가)$/;
/** 번지 — 「1584」 「123-27」 (산번지 포함) */
const BUNJI_TOKEN = /^산?\d+(?:-\d+)?$/;

/**
 * 지번주소 파싱.
 *
 * 원본의 「도로명주소」 칸에 지번이 들어온 행이 2%쯤 있어, 도로명으로 못 찾는
 * 현장을 지번으로도 찾을 수 있게 보조 키를 만듭니다.
 * 키에는 접두사(J:)를 붙여 도로명 키와 섞이지 않게 합니다.
 */
export function parseJibunAddress(raw: string): ParsedAddress | null {
  const tokens = tokenize(raw);
  if (tokens.length < 2) return null;

  let dongAt = -1;
  for (let i = 1; i < tokens.length - 1; i += 1) {
    if (DONG_TOKEN.test(tokens[i]) && BUNJI_TOKEN.test(tokens[i + 1])) {
      dongAt = i;
      break;
    }
  }
  if (dongAt < 0) return null;

  const dong = tokens[dongAt];
  const num = tokens[dongAt + 1];
  const { sido, sgg } = splitRegion(tokens, dongAt);

  return {
    sido,
    sgg,
    road: dong,
    num,
    roadNumKey: `${JIBUN_PREFIX}${dong}|${num}`,
    regionKey: `${sido}|${sgg}`,
  };
}

/* ------------------------------------------------------------------ 샤드 */

/** FNV-1a 32비트 — 인덱스 생성기와 화면이 같은 값을 내야 해서 직접 구현 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export const SHARD_COUNT = 256;

/** 도로명 + 건물번호가 들어갈 샤드 이름 (00 ~ ff) */
export function shardOf(roadNumKey: string): string {
  return (fnv1a32(roadNumKey) % SHARD_COUNT).toString(16).padStart(2, '0');
}

export const DATA_BASE = '/data/charger-history';

/* ------------------------------------------------------------ 인덱스 형태 */

/** 보조금 구분 코드 — 원본 「보조금구분」을 한 글자로 줄인 것 */
export const SUBSIDY_CODE = {
  /** 완속보조금 */
  S: '완속보조금',
  /** 급속보조금 */
  F: '급속보조금',
  /** 브랜드사업(공단-완속) */
  s: '브랜드사업(공단-완속)',
  /** 브랜드사업(공단-급속) */
  f: '브랜드사업(공단-급속)',
  /** 브랜드사업(협회-완속) */
  a: '브랜드사업(협회-완속)',
  /** 브랜드사업(협회-급속) */
  b: '브랜드사업(협회-급속)',
  /** 일반 — 보조금 없이 설치(자부담) */
  N: '일반(자부담)',
  /** 원본에 값이 없음 */
  U: '미표기',
} as const;

export type SubsidyCode = keyof typeof SUBSIDY_CODE;

/** 보조금을 받은 설치인가 (일반 · 미표기는 아님) */
export function isSubsidized(code: string): boolean {
  return code !== 'N' && code !== 'U';
}

/**
 * 설치 이력 한 줄 — 크기를 줄이려고 배열로 담습니다.
 * [설치년도, 설치월, 대수, 보조금구분코드, 보조금신청번호, 운영기관, 급속여부]
 */
export type HistoryRow = [
  year: string,
  month: string,
  qty: number,
  code: SubsidyCode,
  applyNo: string,
  operator: string,
  fast: 0 | 1,
];

export interface SiteRecord {
  /** 대표 도로명주소 (원본 표기) */
  ad: string;
  /** 충전소명 — 같은 주소에 여러 개면 모두 */
  nm: string[];
  /** 충전소구분 상세 (아파트 · 오피스텔 …) */
  kd: string;
  /** 완속 대수 */
  s: number;
  /** 급속 대수 */
  f: number;
  /** 보조금으로 설치된 대수 */
  g: number;
  /** 설치 이력 */
  h: HistoryRow[];
}

/** 한 「도로명|건물번호」에 걸린 지역별 기록 — 키는 「시도|시군구」 */
export type Bucket = Record<string, SiteRecord>;

/** 지번으로 도로명 키를 찾아가는 포인터 — [조회 키, 지역 키] */
export type JibunPointer = [key: string, regionKey: string];

export interface Shard {
  /** 조회 키(「도로명|건물번호」) → 지역별 기록 */
  k: Record<string, Bucket>;
  /**
   * 지번 키(「J:법정동|번지」) → 지역별 포인터.
   * 원본의 도로명 표기가 흔들려 도로명으로 못 찾는 현장을 지번으로 찾기 위한
   * 우회로입니다. 기록 자체는 k 쪽에만 둡니다.
   */
  j: Record<string, Record<string, JibunPointer>>;
}

export interface IndexMeta {
  /** 원본 파일명 */
  source: string;
  /** 데이터 기준일 (YYYY-MM-DD) */
  asOf: string;
  /** 원본 행 수 */
  rows: number;
  /** 주소(도로명+건물번호) 수 */
  addresses: number;
  /** 지역별 기록 수 */
  sites: number;
  shardCount: number;
}

/* ------------------------------------------------------------------ 판정 */

export type LookupStatus =
  /** 입력한 시군구에서 기록을 찾음 */
  | '매칭'
  /** 같은 도로명 · 번호가 다른 시군구에만 있음 */
  | '시군구불일치'
  /** 어디에도 기록이 없음 */
  | '무매칭';

/** 어느 경로로 찾았는지 — 화면에서 확신 정도를 알려주기 위한 값 */
export type MatchBy =
  /** 도로명 + 시군구가 그대로 일치 */
  | '도로명'
  /** 도로명은 맞고 시군구 표기가 조금 다름 (「청주시」 ↔ 「청주시상당구」) */
  | '도로명(시군구 보정)'
  /** 도로명으로 못 찾아 지번으로 찾음 */
  | '지번';

export type Verdict =
  /** 보조금 이력 없음 — 전부 자부담 */
  | '보조금없음'
  /** 급속만 설치되어 있음 */
  | '급속만'
  /** 완속 전부가 보조금 설치 */
  | '보조금전부'
  /** 보조금 + 자부담이 섞여 있음 */
  | '보조금일부';

export interface Summary {
  verdict: Verdict;
  /** 완속 대수 */
  slow: number;
  /** 급속 대수 */
  fast: number;
  /** 보조금 설치 대수 */
  subsidized: number;
  /** 보조금 없이 설치된 대수 */
  ownFunded: number;
  /** 보조금 신청 연도 (오래된 순) */
  applyYears: string[];
  /** 운영기관별 대수 (많은 순) */
  operators: Array<{ name: string; qty: number }>;
  /** 설치 이력 (최근 순) */
  rows: HistoryRow[];
}

export function summarize(rec: SiteRecord): Summary {
  const total = rec.s + rec.f;
  const ownFunded = Math.max(0, total - rec.g);

  const operators = new Map<string, number>();
  const years = new Set<string>();
  for (const [, , qty, code, applyNo, operator] of rec.h) {
    operators.set(operator, (operators.get(operator) ?? 0) + qty);
    if (isSubsidized(code)) {
      const year = /^(\d{4})/.exec(applyNo)?.[1];
      if (year) years.add(year);
    }
  }

  let verdict: Verdict;
  if (rec.g === 0) verdict = rec.s === 0 && rec.f > 0 ? '급속만' : '보조금없음';
  else if (rec.g >= total) verdict = '보조금전부';
  else verdict = '보조금일부';

  return {
    verdict,
    slow: rec.s,
    fast: rec.f,
    subsidized: rec.g,
    ownFunded,
    applyYears: [...years].sort(),
    operators: [...operators.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)),
    rows: [...rec.h].sort(
      (a, b) => `${b[0]}${b[1] || '00'}`.localeCompare(`${a[0]}${a[1] || '00'}`)
    ),
  };
}

export const VERDICT_TEXT: Record<Verdict, { label: string; tone: 'warn' | 'ok' | 'info' }> = {
  보조금없음: { label: '보조금 이력 없음 (자부담 설치만)', tone: 'ok' },
  급속만: { label: '급속충전기만 설치 — 완속 보조금 이력 없음', tone: 'ok' },
  보조금전부: { label: '보조금 이력 있음 — 설치분 전부가 보조금', tone: 'warn' },
  보조금일부: { label: '보조금 이력 있음 — 자부담 설치와 섞여 있음', tone: 'warn' },
};

/* ------------------------------------------------------------------ 조회 */

export interface RegionLabel {
  sido: string;
  sgg: string;
}

export function parseRegionKey(regionKey: string): RegionLabel {
  const [sido = '', sgg = ''] = regionKey.split('|');
  return { sido, sgg };
}

export function regionText(regionKey: string): string {
  const { sido, sgg } = parseRegionKey(regionKey);
  return [sido, sgg].filter(Boolean).join(' ') || '(지역 미상)';
}

export type LookupResult =
  | {
      status: '매칭';
      by: MatchBy;
      parsed: ParsedAddress;
      /** 찾은 기록의 「시도|시군구」 */
      regionKey: string;
      record: SiteRecord;
      /** 같은 도로명 · 번호에 걸린 다른 지역 (표기 확인용) */
      otherRegions: string[];
    }
  | {
      status: '시군구불일치';
      parsed: ParsedAddress;
      /** 같은 도로명 · 번호가 있는 다른 지역들 */
      candidates: string[];
    }
  | { status: '무매칭'; parsed: ParsedAddress | null };

/** 샤드를 내려받는 함수 — 화면은 fetch, 검증 스크립트는 파일 읽기를 넘깁니다 */
export type ShardLoader = (shard: string) => Promise<Shard>;

/**
 * 시군구 표기가 조금 달라도 같은 곳으로 볼 수 있는가.
 * 원본에 시 · 도가 빠진 주소(「청주시 …」)가 섞여 있어, 한쪽이 다른 쪽을
 * 포함하면 같은 지역으로 봅니다.
 */
function regionLooksSame(input: ParsedAddress, regionKey: string): boolean {
  const cand = parseRegionKey(regionKey);
  const sidoOk = !input.sido || !cand.sido || input.sido === cand.sido;
  if (!sidoOk) return false;
  if (!input.sgg || !cand.sgg) return true;
  return input.sgg.includes(cand.sgg) || cand.sgg.includes(input.sgg);
}

/**
 * 주소로 충전기 · 보조금 이력을 찾습니다.
 *
 * 도로명 → (표기가 조금 다른) 도로명 → 지번 순으로 시도하고, 그래도 없으면
 * 같은 도로명 · 번호가 있는 다른 시군구를 후보로 돌려줍니다.
 */
export async function lookupChargerHistory(
  input: { road: string; jibun?: string },
  load: ShardLoader
): Promise<LookupResult> {
  // 인덱스와 같은 순서로 봅니다 (두 칸의 내용이 바뀐 원본 행에 대비)
  const road = parseRoadAddress(input.road) ?? parseRoadAddress(input.jibun ?? '');

  if (road) {
    const bucket = (await load(shardOf(road.roadNumKey))).k[road.roadNumKey];
    if (bucket) {
      const regions = Object.keys(bucket);
      const exact = bucket[road.regionKey];
      if (exact) {
        return {
          status: '매칭',
          by: '도로명',
          parsed: road,
          regionKey: road.regionKey,
          record: exact,
          otherRegions: regions.filter((r) => r !== road.regionKey),
        };
      }
      const near = regions.filter((r) => regionLooksSame(road, r));
      if (near.length === 1) {
        return {
          status: '매칭',
          by: '도로명(시군구 보정)',
          parsed: road,
          regionKey: near[0],
          record: bucket[near[0]],
          otherRegions: regions.filter((r) => r !== near[0]),
        };
      }
    }
  }

  // 도로명으로 못 찾으면 지번으로 우회 — 원본의 도로명 표기가 흔들리는 경우 대비.
  // 인덱스를 만들 때와 같은 순서(지번 칸 → 도로명 칸)로 봅니다.
  const jibun = parseJibunAddress(input.jibun ?? '') ?? parseJibunAddress(input.road);
  if (jibun) {
    const pointers = (await load(shardOf(jibun.roadNumKey))).j[jibun.roadNumKey];
    if (pointers) {
      const regionKeys = Object.keys(pointers);
      const picked =
        pointers[jibun.regionKey] ??
        (regionKeys.filter((r) => regionLooksSame(jibun, r)).length === 1
          ? pointers[regionKeys.find((r) => regionLooksSame(jibun, r))!]
          : undefined);
      if (picked) {
        const [key, regionKey] = picked;
        const bucket = (await load(shardOf(key))).k[key];
        const record = bucket?.[regionKey];
        if (record) {
          return {
            status: '매칭',
            by: '지번',
            parsed: road ?? jibun,
            regionKey,
            record,
            otherRegions: Object.keys(bucket).filter((r) => r !== regionKey),
          };
        }
      }
    }
  }

  if (road) {
    const bucket = (await load(shardOf(road.roadNumKey))).k[road.roadNumKey];
    if (bucket) {
      return { status: '시군구불일치', parsed: road, candidates: Object.keys(bucket) };
    }
    return { status: '무매칭', parsed: road };
  }
  return { status: '무매칭', parsed: jibun };
}

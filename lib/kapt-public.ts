import type { ApartmentCandidate } from "./kapt-types";

const KAPT_ROOT = "https://www.k-apt.go.kr";
const SESSION_TTL = 8 * 60 * 1000;
const SEARCH_TTL = 5 * 60 * 1000;
const DETAIL_TTL = 30 * 60 * 1000;

type Raw = Record<string, unknown>;
type Session = { csrf: string; headerName: string; cookie: string };

let sessionCache: { expiresAt: number; value: Session } | null = null;
const searchCache = new Map<string, { expiresAt: number; value: ApartmentCandidate[] }>();
const detailCache = new Map<string, { expiresAt: number; value: Raw }>();

function asRecord(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function rows(value: unknown): Raw[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function numberOrNull(value: unknown) {
  const normalized = text(value).replaceAll(",", "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function metaContent(html: string, name: string) {
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta[^>]+name=["']${safeName}["'][^>]+content=["']([^"']+)["']`, "i");
  return html.match(pattern)?.[1] ?? "";
}

function cookieHeader(headers: Headers) {
  const enhanced = headers as Headers & { getSetCookie?: () => string[] };
  const values = enhanced.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
  return values
    .flatMap((value) => value.split(/,(?=[^;,]+=)/))
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function createSession(): Promise<Session> {
  const response = await fetch(`${KAPT_ROOT}/kaptinfo/openKaptMng.do`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "HanbaekApartmentLookup/1.0 (+public K-apt lookup)",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new Error(`K-apt session returned ${response.status}`);
  const html = await response.text();
  const session = {
    csrf: metaContent(html, "_csrf"),
    headerName: metaContent(html, "_csrf_header") || "X-CSRF-TOKEN",
    cookie: cookieHeader(response.headers),
  };

  if (!session.csrf || !session.cookie) throw new Error("K-apt session information is unavailable");
  sessionCache = { expiresAt: Date.now() + SESSION_TTL, value: session };
  return session;
}

async function getSession() {
  if (sessionCache && sessionCache.expiresAt > Date.now()) return sessionCache.value;
  return createSession();
}

async function postKapt(path: string, values: Record<string, string>, retry = true): Promise<Raw> {
  const session = await getSession();
  const body = new URLSearchParams({ ...values, _csrf: session.csrf });
  const response = await fetch(`${KAPT_ROOT}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${KAPT_ROOT}/kaptinfo/openKaptMng.do`,
      Cookie: session.cookie,
      [session.headerName]: session.csrf,
    },
    body,
    signal: AbortSignal.timeout(12_000),
  });

  if ((response.status === 401 || response.status === 403) && retry) {
    sessionCache = null;
    return postKapt(path, values, false);
  }
  if (!response.ok) throw new Error(`K-apt ${path} returned ${response.status}`);
  return asRecord(await response.json());
}

function searchDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function legalAddressTerm(query: string) {
  return query
    .split(/\s+/)
    .map((part) => part.replace(/[(),]/g, ""))
    .findLast((part) => /^[가-힣0-9]+(?:동|읍|면|가|리)$/.test(part));
}

function roadAddressTerm(query: string) {
  const matches = query.match(/[가-힣0-9]+(?:대로|로|길)/g);
  return matches?.at(-1);
}

async function searchByName(query: string) {
  const payload = await postKapt("/kaptinfo/getKaptList.do", {
    bjdCode: "",
    kaptName: query,
    searchDate: searchDate(),
    kaptDuty: "ALL",
  });
  return rows(payload.resultList);
}

async function searchByLegalAddress(term: string) {
  const addressPayload = await postKapt("/cmmn/bjd/searchBjdList.do", {
    bjd_name: term,
    reg: "",
  });
  const result: Raw[] = [];
  for (const address of rows(addressPayload.resultList).slice(0, 3)) {
    const bjdCode = text(address.bjdCode);
    if (!bjdCode) continue;
    const payload = await postKapt("/kaptinfo/getKaptList.do", {
      bjdCode,
      kaptName: "",
      searchDate: searchDate(),
      kaptDuty: "ALL",
    });
    result.push(...rows(payload.resultList));
  }
  return result;
}

async function searchByRoadAddress(term: string, fullQuery: string) {
  const roadPayload = await postKapt("/cmmn/road/searchRoadListByRoadName.do", {
    road_name: term,
    reg: "",
  });
  const roadCodes = Array.from(
    new Set(
      rows(roadPayload.resultList)
        .filter((road) => text(road.fullNm) === term)
        .map((road) => text(road.dorocd))
        .filter(Boolean),
    ),
  ).slice(0, 3);
  const result: Raw[] = [];
  for (const roadCode of roadCodes) {
    const payload = await postKapt("/cmmn/road/searchRoadAptList.do", {
      roadCode,
      reprCheck: "0",
      searchDate: searchDate(),
    });
    result.push(...rows(payload.resultList));
  }

  const buildingNumber = fullQuery.match(/\b\d+(?:-\d+)?\b/)?.[0];
  if (!buildingNumber) return result;
  const exact = result.filter((item) => text(item.addr).includes(buildingNumber));
  return exact.length ? exact : result;
}

function normalizeCandidate(item: Raw): ApartmentCandidate {
  const rawAddress = text(item.addr);
  const rawLegalAddress = text(item.bjdName);
  const looksLikeRoad = /(?:대로|로|길)\s*\d/.test(rawAddress);
  const address = looksLikeRoad ? rawLegalAddress : rawAddress || rawLegalAddress;
  const roadAddress = looksLikeRoad ? rawAddress : "";
  const regionSource = address || roadAddress;

  return {
    kaptCode: text(item.kaptCode),
    name: text(item.kaptName),
    address,
    roadAddress,
    region: regionSource.split(/\s+/).slice(0, 2).join(" "),
    households: numberOrNull(item.kaptdaTCnt ?? item.kaptdaCnt),
    approvalDate: text(item.kaptUsedate) || null,
  };
}

export async function searchKaptPublicCandidates(query: string) {
  const cacheKey = query.trim().toLocaleLowerCase("ko-KR");
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const merged: Raw[] = [];
  merged.push(...(await searchByName(query)));

  const legalTerm = legalAddressTerm(query);
  if (legalTerm) merged.push(...(await searchByLegalAddress(legalTerm)));

  const roadTerm = roadAddressTerm(query);
  if (roadTerm) merged.push(...(await searchByRoadAddress(roadTerm, query)));

  const unique = new Map<string, ApartmentCandidate>();
  for (const item of merged) {
    const candidate = normalizeCandidate(item);
    if (candidate.kaptCode && candidate.name && !unique.has(candidate.kaptCode)) {
      unique.set(candidate.kaptCode, candidate);
    }
  }

  const result = Array.from(unique.values()).slice(0, 30);
  searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_TTL, value: result });
  return result;
}

export async function getKaptPublicDetail(kaptCode: string) {
  const cached = detailCache.get(kaptCode);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const payload = await postKapt("/kaptinfo/getKaptInfo_detail.do", { kaptCode });
  detailCache.set(kaptCode, { expiresAt: Date.now() + DETAIL_TTL, value: payload });
  return payload;
}

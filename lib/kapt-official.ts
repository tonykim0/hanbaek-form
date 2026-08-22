import type { ApartmentCandidate } from "./kapt-types";

const API_ROOT = "https://apis.data.go.kr/1613000";
const CACHE_TTL = 6 * 60 * 60 * 1000;

type AnyRecord = Record<string, unknown>;

let catalogCache: { expiresAt: number; items: ApartmentCandidate[] } | null = null;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function numberOrNull(value: unknown) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractItems(payload: unknown): AnyRecord[] {
  const root = asRecord(payload);
  const response = asRecord(root.response ?? root);
  const body = asRecord(response.body ?? response);
  const items = asRecord(body.items ?? body);
  const item = items.item ?? body.item ?? [];
  if (Array.isArray(item)) return item.map(asRecord);
  return Object.keys(asRecord(item)).length ? [asRecord(item)] : [];
}

export async function fetchOfficialJson(
  path: string,
  params: Record<string, string>,
) {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) throw new Error("DATA_GO_KR_SERVICE_KEY is not configured");

  const url = new URL(`${API_ROOT}/${path}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("_type", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Official API returned ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

function normalizeCandidate(item: AnyRecord): ApartmentCandidate {
  const name = text(item.kaptName ?? item.kaptNm ?? item.name);
  const address = text(item.kaptAddr ?? item.bjdAddr ?? item.addr);
  const roadAddress = text(item.doroJuso ?? item.roadAddr ?? item.roadAddress);
  const region = text(item.as1) + (text(item.as2) ? ` ${text(item.as2)}` : "");
  return {
    kaptCode: text(item.kaptCode ?? item.kaptCd),
    name,
    address,
    roadAddress,
    region: region.trim() || address.split(" ").slice(0, 2).join(" "),
    households: numberOrNull(item.kaptdaCnt ?? item.hshldCnt ?? item.households),
    approvalDate: text(item.kaptUsedate ?? item.useAprvDt) || null,
  };
}

async function getOfficialCatalog() {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache.items;
  }

  const payload = await fetchOfficialJson("AptListService3/getTotalAptList3", {
    pageNo: "1",
    numOfRows: "50000",
  });
  const items = extractItems(payload)
    .map(normalizeCandidate)
    .filter((item) => item.kaptCode && item.name);

  catalogCache = { expiresAt: Date.now() + CACHE_TTL, items };
  return items;
}

export async function searchOfficialCandidates(query: string) {
  const catalog = await getOfficialCatalog();
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  return catalog
    .filter((item) =>
      [item.name, item.address, item.roadAddress, item.region]
        .join(" ")
        .toLocaleLowerCase("ko-KR")
        .includes(normalized),
    )
    .slice(0, 20);
}

export function hasOfficialKey() {
  return Boolean(process.env.DATA_GO_KR_SERVICE_KEY);
}

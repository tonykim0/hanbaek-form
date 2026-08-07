import { NextResponse } from "next/server";
import { getKaptPublicDetail } from "@/lib/kapt-public";
import type { ElectricVehicleCharger, InformationItem } from "@/lib/kapt-types";

type Raw = Record<string, unknown>;

function record(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function rows(value: unknown): Raw[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function value(source: Raw, keys: string[], fallback = "-") {
  for (const key of keys) {
    const candidate = source[key];
    if (typeof candidate === "string" || typeof candidate === "number") {
      const normalized = String(candidate).trim();
      if (normalized) return normalized;
    }
  }
  return fallback;
}

function numberOrNull(raw: unknown) {
  const normalized = String(raw ?? "").trim().replaceAll(",", "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function withUnit(raw: string, unit: string) {
  if (!raw || raw === "-") return "-";
  if (raw.endsWith(unit)) return raw;
  const parsed = Number(raw.replaceAll(",", ""));
  return Number.isFinite(parsed) ? `${parsed.toLocaleString("ko-KR")}${unit}` : `${raw}${unit}`;
}

function item(label: string, source: Raw, keys: string[], fallback = "-"): InformationItem {
  return { label, value: value(source, keys, fallback) };
}

function installed(source: Raw, yesKey: string, noKey: string) {
  if (source[yesKey] === "Y") return "설치";
  if (source[noKey] === "Y") return "미설치";
  return "미확인";
}

function access(source: Raw, residentKey: string, publicKey: string) {
  const labels: string[] = [];
  if (source[residentKey] === "Y") labels.push("입주민 전용");
  if (source[publicKey] === "Y") labels.push("외부인 개방");
  return labels.join(" · ") || "미확인";
}

function timePart(source: Raw, key: string) {
  const raw = value(source, [key], "");
  return raw ? raw.padStart(2, "0") : "";
}

function timeRange(source: Raw, prefix: "Grd" | "Ung") {
  const startHour = timePart(source, `timeSt${prefix}H`);
  const startMinute = timePart(source, `timeSt${prefix}M`);
  const endHour = timePart(source, `timeEd${prefix}H`);
  const endMinute = timePart(source, `timeEd${prefix}M`);
  return startHour && startMinute && endHour && endMinute
    ? `${startHour}:${startMinute} ~ ${endHour}:${endMinute}`
    : "미확인";
}

function mapCode(list: Raw[], code: string) {
  return value(list.find((entry) => value(entry, ["code"], "") === code) ?? {}, ["codeValue"]);
}

function normalizeChargers(payload: Raw): ElectricVehicleCharger[] {
  const typeCodes = rows(payload.elecCarChargerType);
  const speedCodes = rows(payload.elecCarChargerSpeed);
  return rows(payload.kaptdfListElCharger).map((charger, index) => {
    const typeCode = value(charger, ["elChargerType"], "");
    const directType = value(charger, ["elChargerTypeNote"], "");
    return {
      id: value(charger, ["idx"], String(index + 1)),
      location: value(charger, ["elType"], "") === "01" ? "지상" : value(charger, ["elType"], "") === "02" ? "지하" : "미확인",
      installationType: ({ "01": "벽부형", "02": "스탠드형", "03": "이동형" } as Record<string, string>)[value(charger, ["elInsType"], "")] ?? "미확인",
      chargerType: typeCode === "05" && directType ? directType : mapCode(typeCodes, typeCode),
      speed: mapCode(speedCodes, value(charger, ["elChargerSpeed"], "")),
      count: numberOrNull(charger.elChargerCnt),
      operator: value(charger, ["elChargerCompanyName"]),
      operatorPhone: value(charger, ["elChargerCompanyTel"]),
    };
  });
}

export async function GET(
  _request: Request,
  context: { params: { kaptCode: string } },
) {
  const { kaptCode } = context.params;

  if (!/^[A-Za-z0-9_-]{3,30}$/.test(kaptCode)) {
    return NextResponse.json({
      notice: "올바른 단지코드가 아닙니다.",
    }, { status: 400 });
  }

  try {
    const payload = await getKaptPublicDetail(kaptCode);
    const basic = record(payload.resultMap_kapt);
    const car = record(payload.getKaptdfCarInfo);
    const addresses = rows(payload.resultMap_kapt_addrList);
    const legalAddress = value(addresses.find((row) => row.addrGbn === "B") ?? {}, ["addr"]);
    const roadAddress = value(addresses.find((row) => row.addrGbn === "R") ?? {}, ["addr"]);
    const households = numberOrNull(basic.kaptdaTCnt ?? basic.kaptdaCnt);
    const chargers = normalizeChargers(payload);
    const chargerTotal = chargers.reduce((sum, charger) => sum + (charger.count ?? 0), 0);

    return NextResponse.json({
      source: "kapt",
      updatedAt: new Date().toISOString(),
      complex: {
        kaptCode,
        name: value(basic, ["kaptName"]),
        address: legalAddress,
        roadAddress,
        region: (legalAddress === "-" ? roadAddress : legalAddress).split(/\s+/).slice(0, 2).join(" "),
        households,
        approvalDate: value(basic, ["kaptUsedate"], "") || null,
      },
      basicInfo: [
        { label: "법정동주소", value: legalAddress },
        { label: "도로명주소", value: roadAddress },
        item("분양형태", basic, ["codeSale"]),
        item("난방방식", basic, ["codeHeat"]),
        { label: "세대수", value: households === null ? "-" : `${households.toLocaleString("ko-KR")}세대` },
        { label: "동수", value: withUnit(value(basic, ["kaptDongCnt"]), "개동") },
        item("사용승인일", basic, ["kaptUsedate"]),
        item("복도유형", basic, ["codeHall"]),
        { label: "건축물대장 연면적", value: withUnit(value(basic, ["kaptTarea"]), "㎡") },
        item("시공사", basic, ["kaptBcompany"]),
        item("시행사", basic, ["kaptAcompany"]),
        item("관리방식", basic, ["codeMgr"]),
      ],
      electricVehicle: {
        overview: [
          { label: "입주민 차량보유대수", value: withUnit(value(car, ["carTot"]), "대") },
          { label: "입주민 전기차 보유대수", value: withUnit(value(car, ["carTotEl"]), "대") },
          { label: "충전기 설치 여부 · 지상", value: installed(car, "elisGrdYn", "elisGrdNotYn") },
          { label: "충전기 설치 여부 · 지하", value: installed(car, "elisUngYn", "elisUngNotYn") },
          { label: "전기차 전용 주차면 · 지상", value: withUnit(value(car, ["elnpGrd"]), "면") },
          { label: "전기차 전용 주차면 · 지하", value: withUnit(value(car, ["elnpUng"]), "면") },
          { label: "외부인 개방 여부 · 지상", value: access(car, "exopGrd01Yn", "exopGrd02Yn") },
          { label: "외부인 개방 여부 · 지하", value: access(car, "exopUng01Yn", "exopUng02Yn") },
          { label: "이용가능 시간 · 지상", value: timeRange(car, "Grd") },
          { label: "이용가능 시간 · 지하", value: timeRange(car, "Ung") },
          { label: "등록된 충전기 총 대수", value: `${chargerTotal.toLocaleString("ko-KR")}대` },
        ],
        chargers,
      },
      notice: "K-apt 공개 조회 화면의 기본정보와 전기차 충전시설 정보입니다.",
    });
  } catch (error) {
    console.error("K-apt apartment detail failed", error);
    return NextResponse.json({
      notice: "K-apt 상세정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
    }, { status: 502 });
  }
}

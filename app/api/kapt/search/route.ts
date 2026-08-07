import { NextRequest, NextResponse } from "next/server";
import { hasOfficialKey, searchOfficialCandidates } from "@/lib/kapt-official";
import { searchKaptPublicCandidates } from "@/lib/kapt-public";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({
      mode: "kapt",
      candidates: [],
      notice: "검색어를 두 글자 이상 입력해주세요.",
    }, { status: 400 });
  }

  if (query.length > 100) {
    return NextResponse.json({
      mode: "kapt",
      candidates: [],
      notice: "검색어는 100자 이내로 입력해주세요.",
    }, { status: 400 });
  }

  if (hasOfficialKey()) {
    try {
      const candidates = await searchOfficialCandidates(query);
      if (candidates.length) return NextResponse.json({ mode: "official", candidates });
    } catch (error) {
      console.error("Official apartment search failed", error);
    }
  }

  try {
    const candidates = await searchKaptPublicCandidates(query);
    return NextResponse.json({
      mode: "kapt",
      candidates,
      notice: candidates.length
        ? "K-apt 공개 조회 결과입니다. 단지를 선택해주세요."
        : "검색 결과가 없습니다. 단지명이나 주소를 다시 확인해주세요.",
    });
  } catch (error) {
    console.error("K-apt public search failed", error);
    return NextResponse.json({
      mode: "kapt",
      candidates: [],
      notice: "K-apt 조회가 일시적으로 지연되고 있습니다. 잠시 후 다시 시도해주세요.",
    }, { status: 502 });
  }
}

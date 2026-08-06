/**
 * GET /api/materials/debug-title?name=<파일명>&group=<운영사>
 *
 * 배포된 서버가 자료명을 실제로 어떻게 계산하는지 확인하기 위한 임시 진단용입니다.
 * 문자열 변환만 하며 저장소에는 접근하지 않습니다. 확인이 끝나면 삭제합니다.
 */
import { NextResponse } from 'next/server';
import { getMaterials } from '@/lib/materials';
import { parseDisplayTitle } from '@/lib/materials-meta';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name') ?? '';
  const group = url.searchParams.get('group') ?? undefined;

  // 페이지와 똑같은 경로(getMaterials)로도 계산해 비교합니다
  const { groups } = await getMaterials();
  const viaPage = groups
    .flatMap((g) => g.categories.flatMap((c) => c.files))
    .slice(0, 4)
    .map((f) => ({ title: f.title, docDate: f.docDate, fileName: f.fileName }));

  return NextResponse.json({
    input: { name, group },
    parsed: parseDisplayTitle(name, group),
    viaPage,
    build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
  });
}

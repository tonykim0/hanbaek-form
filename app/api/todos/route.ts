/**
 * GET /api/todos — 지금 내 차례인 현장.
 *
 * 저장하는 알림함이 아니다 — 보드가 쓰는 공 차례(court)에서 그때그때 유도한다.
 * 단계(stage)가 저장값이 아니라 유도값인 것과 같은 원칙: 상태가 바뀌면 할 일도
 * 저절로 맞고, 읽음 처리·묵은 알림 청소 같은 상태 관리가 아예 없다.
 *
 * 협력사는 자기 현장만 본다 — listProjects 가 viewer 로 이미 거른다.
 */
import { NextResponse } from 'next/server';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { boardColumnOf } from '@/lib/board';
import type { Role } from '@/lib/roles';
import type { Court } from '@/types/project';

export const dynamic = 'force-dynamic';

/**
 * 어느 차례가 내 것인가 — 턴키업체는 영업·시공 양쪽 다.
 *
 * 열람 전용은 빈 목록이다. 「내 차례」는 알림함이 아니라 할 일이라, 아무것도 할 수 없는
 * 눈에게는 차례가 오지 않는다 — 한백의 차례를 그대로 보여주면 처리할 수 없는 목록이
 * 영영 줄지 않는 배지로 남는다.
 */
const COURTS_OF_ROLE: Record<Role, Court[]> = {
  admin: ['한백'],
  viewer: [],
  sales: ['영업사'],
  cons: ['시공사'],
  salesCons: ['영업사', '시공사'],
};

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const mine = COURTS_OF_ROLE[session.role];
  const projects = await getRepository().listProjects(viewerOf(session));

  const items = projects
    // 멈춘 현장은 누구 차례도 아니다 — 보류 칸과 같은 판정
    .filter((p) => !p.holdState && mine.includes(p.court))
    .map((p) => ({
      id: p.id,
      name: p.name,
      what: whatOf(p),
      stalledDays: p.stalledDays,
    }))
    // 오래 멈춘 것이 위로 — 정체일이 곧 급한 순서다
    .sort((a, b) => b.stalledDays - a.stalledDays);

  return NextResponse.json({ items });
}

/** 그 현장에서 지금 할 일 — 보드 칸 판정을 그대로 쓴다(다시 계산하지 않는다) */
function whatOf(p: {
  stage: Parameters<typeof boardColumnOf>[0]['stage'];
  status: Parameters<typeof boardColumnOf>[0]['status'];
  holdState: Parameters<typeof boardColumnOf>[0]['holdState'];
  rejectedDocs: number;
  docsFilled: boolean;
}): string {
  const column = boardColumnOf(p);
  if (column === '계약보완') return `반려 ${p.rejectedDocs}건 보완`;
  if (column === '계약접수') return '필수 서류 제출';
  if (column === '계약검토') return '검수 · 계약 확인';
  return column; // 공정 칸 이름이 곧 지금 서 있는 일이다
}

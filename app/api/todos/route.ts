/**
 * GET /api/todos — 지금 내 차례인 것.
 *
 * 저장하는 알림함이 아니다 — 보드가 쓰는 공 차례(court)에서 그때그때 유도한다.
 * 단계(stage)가 저장값이 아니라 유도값인 것과 같은 원칙: 상태가 바뀌면 할 일도
 * 저절로 맞고, 읽음 처리·묵은 알림 청소 같은 상태 관리가 아예 없다.
 *
 * 현장의 공 차례에 더해, 협력사에게는 가확정 배치가 「세금계산서 발행」으로 뜬다 —
 * 가확정 뒤 1~2일 회전을 지키는 신호가 이것이다(한백 확인 2026-08-23). 배치가
 * 확정되거나 지급일이 지나면 저절로 사라진다(같은 유도 원칙).
 *
 * 협력사는 자기 것만 본다 — listProjects·listPayouts 가 viewer 로 이미 거른다.
 */
import { NextResponse } from 'next/server';
import { actorOf, getSessionUser, viewerOf } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { boardColumnOf } from '@/lib/board';
import { batchesOf, batchStateOf } from '@/lib/payout-board';
import { isHanbaek, type Role } from '@/lib/roles';
import { won } from '@/lib/format';
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
  /*
   * 발행은 협력사의 일이다 — 한백·열람 전용에게는 배치 읽기 자체를 안 건다.
   * 이 API 는 화면을 옮길 때마다 불리므로(TopBar) 세 읽기를 한꺼번에 시작한다 —
   * 현장 목록을 기다렸다 배치를 읽으면 걸리는 시간이 그대로 더해진다.
   */
  const wantsInvoices = !isHanbaek(session.role) && session.org !== null;
  const [projects, history, finals] = await Promise.all([
    getRepository().listProjects(viewerOf(session)),
    wantsInvoices ? getRepository().listPayouts(viewerOf(session)) : [],
    wantsInvoices ? getRepository().listBatchFinals(actorOf(session)) : [],
  ]);

  const items = projects
    // 멈춘 현장은 누구 차례도 아니다 — 보류 칸과 같은 판정
    .filter((p) => !p.holdState && mine.includes(p.court))
    .map((p) => ({
      id: p.id,
      href: `/projects/${p.id}`,
      name: p.name,
      what: whatOf(p),
      stalledDays: p.stalledDays,
    }))
    // 오래 멈춘 것이 위로 — 정체일이 곧 급한 순서다
    .sort((a, b) => b.stalledDays - a.stalledDays);

  /*
   * 가확정 배치 → 「세금계산서 발행」. 묶는 규칙·상태 판정은 명세서 화면과 같은
   * 정본(lib/payout-board)이다 — 두 벌이면 발행하라는 신호가 서로 어긋난다.
   * 하루 이틀의 일이라 맨 위에, 지급일이 급한 것부터.
   */
  const invoices = batchesOf(history, finals)
    .filter((b) => b.org && batchStateOf(b) === '가확정')
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
    .map((b) => ({
      id: `invoice|${b.paidAt}|${b.kind}`,
      href: '/statements',
      name: `세금계산서 발행 — ${b.kind}`,
      what: `공급가액 ${won(b.total)}원 · 지급일 ${b.paidAt}`,
      stalledDays: 0,
    }));

  return NextResponse.json({ items: [...invoices, ...items] });
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

/**
 * GET /api/todos — 지금 내 차례인 것.
 *
 * 저장하는 알림함이 아니다 — 보드가 쓰는 공 차례(court)에서 그때그때 유도한다.
 * 단계(stage)가 저장값이 아니라 유도값인 것과 같은 원칙: 상태가 바뀌면 할 일도
 * 저절로 맞고, 읽음 처리·묵은 알림 청소 같은 상태 관리가 아예 없다.
 *
 * 현장의 공 차례에 더해 배치의 할 일이 둘 얹힌다:
 *   협력사   가확정 배치 → 「세금계산서 발행」 — 가확정 뒤 1~2일 회전을 지키는 신호다
 *            (한백 확인 2026-08-23). 확정되거나 지급일이 지나면 저절로 사라진다.
 *   관리자   확정 누락 배치 → 「확정 누락」 — 확정은 지급의 전제인데(한백 확정 2026-08-24)
 *            건너뛴 채 지급일이 지난 것이다. 이 상태를 만든 이유가 「조용히 놓친 것을
 *            찾기」인데, 할 일에 안 얹으면 /statements 를 열어 본 사람만 안다.
 *
 * 협력사는 자기 것만 본다 — listProjects·listPayouts 가 viewer 로 이미 거른다.
 */
import { NextResponse } from 'next/server';
import { actorOf, getSessionUser, viewerOf } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { bandOfColumn, boardColumnOf } from '@/lib/board';
import { batchesOf, batchKey, batchStateOf } from '@/lib/payout-board';
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
  // 확정 누락은 관리자의 할 일이다 — 열람 전용은 여기서도 빈 목록(처리할 수 없는 배지를 만들지 않는다)
  const wantsMissed = session.role === 'admin';
  const wantsBatches = wantsInvoices || wantsMissed;
  const [projects, history, finals] = await Promise.all([
    getRepository().listProjects(viewerOf(session)),
    wantsBatches ? getRepository().listPayouts(viewerOf(session)) : [],
    wantsBatches ? getRepository().listBatchFinals(actorOf(session)) : [],
  ]);

  const items = projects
    // 멈춘 현장은 누구 차례도 아니다 — 보류 칸과 같은 판정
    .filter((p) => !p.holdState && mine.includes(p.court))
    .map((p) => {
      const column = boardColumnOf(p);
      return {
        id: p.id,
        href: `/projects/${p.id}`,
        name: p.name,
        what: whatOf(column, p),
        /*
         * 어느 국면의 일인가 — 계약·시공은 보드 띠(bandOfColumn) 그대로다. 멈춤 띠는
         * 위에서 걸렀으니 여기 안 온다. 배치 할 일은 정산이다. 상단 바가 이것으로 묶는다
         * (한백 요청 2026-08-25) — 국면이 섞인 한 줄 목록은 계약 반려와 계산서 발행이
         * 같은 무게로 늘어서서, 「지금 어느 일을 보고 있나」를 줄마다 다시 읽어야 했다.
         */
        group: bandOfColumn(column) as '계약' | '시공',
        stalledDays: p.stalledDays,
      };
    })
    // 오래 멈춘 것이 위로 — 정체일이 곧 급한 순서다
    .sort((a, b) => b.stalledDays - a.stalledDays);

  /*
   * 가확정 배치 → 「세금계산서 발행」. 묶는 규칙·상태 판정은 명세서 화면과 같은
   * 정본(lib/payout-board)이다 — 두 벌이면 발행하라는 신호가 서로 어긋난다.
   * 하루 이틀의 일이라 맨 위에, 지급일이 급한 것부터.
   */
  const batches = batchesOf(history, finals);
  const invoices = !wantsInvoices ? [] : batches
    .filter((b) => b.org && batchStateOf(b) === '가확정')
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
    .map((b) => ({
      /* 열쇠에 지급처까지 — 협력사는 지급처가 하나라 안 겹쳤지만, 열쇠는 배치의 세 축 그대로가 맞다 */
      id: `invoice|${batchKey(b.paidAt, b.org, b.kind)}`,
      href: '/statements',
      name: `세금계산서 발행 — ${b.kind}`,
      what: `공급가액 ${won(b.total)}원 · 지급일 ${b.paidAt}`,
      group: '정산' as const,
      stalledDays: 0,
    }));

  /* 오래 놓친 것이 위로 — 지급일이 이른 순 */
  const missed = !wantsMissed ? [] : batches
    .filter((b) => b.org && batchStateOf(b) === '확정 누락')
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
    .map((b) => ({
      id: `missed|${batchKey(b.paidAt, b.org, b.kind)}`,
      href: '/statements',
      name: `확정 누락 — ${b.org} ${b.kind}`,
      what: `공급가액 ${won(b.total)}원 · 지급일 ${b.paidAt} 지남`,
      group: '정산' as const,
      stalledDays: 0,
    }));

  return NextResponse.json({ items: [...missed, ...invoices, ...items] });
}

/** 그 현장에서 지금 할 일 — 보드 칸 판정을 그대로 쓴다(부르는 쪽이 한 번 계산해 넘긴다) */
function whatOf(column: ReturnType<typeof boardColumnOf>, p: {
  rejectedDocs: number;
  docsFilled: boolean;
}): string {
  if (column === '계약보완') return `반려 ${p.rejectedDocs}건 보완`;
  if (column === '계약접수') return '필수 서류 제출';
  if (column === '계약검토') return '검수 · 계약 확인';
  return column; // 공정 칸 이름이 곧 지금 서 있는 일이다
}

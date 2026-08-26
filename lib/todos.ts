/**
 * 할 일 조립 — 지금 내 차례인 것.
 *
 * 저장하는 알림함이 아니다 — 보드가 쓰는 공 차례(court)와 배치 상태에서 그때그때
 * 유도한다. 상태가 바뀌면 할 일도 저절로 맞고, 읽음 처리·묵은 알림 청소가 없다.
 *
 * 두 자리가 같이 쓴다: 상단 바의 드롭다운(/api/todos)과 할 일 대시보드(/todos).
 * 한쪽은 훑는 자리고 한쪽은 작업대다 — 조립이 두 벌이면 배지와 페이지가 다른 것을 센다.
 */
import { getRepository } from '@/lib/data';
import { bandOfColumn, boardColumnOf } from '@/lib/board';
import { batchesOf, batchKey, batchStateOf } from '@/lib/payout-board';
import { actorOf, viewerOf } from '@/lib/auth/session';
import { isHanbaek, type Role } from '@/lib/roles';
import { won } from '@/lib/format';
import { today } from '@/lib/date';
import type { SessionPayload } from '@/lib/auth/types';
import type { Court } from '@/types/project';
import { TODO_GROUPS, type TodoItem } from '@/lib/todo-types';

/* 타입은 lib/todo-types 에 있다 — 클라이언트 부품이 이 파일을 안 끌어오게(빌드가 깨졌다) */
export { TODO_GROUPS, type TodoGroup, type TodoItem } from '@/lib/todo-types';

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

export async function todosOf(session: SessionPayload): Promise<TodoItem[]> {
  const mine = COURTS_OF_ROLE[session.role];
  /*
   * 발행은 협력사의 일, 확정 누락은 관리자의 일이다 — 열람 전용은 배치 읽기 자체를 안 건다.
   * 화면을 옮길 때마다 불리므로(TopBar) 세 읽기를 한꺼번에 시작한다 —
   * 현장 목록을 기다렸다 배치를 읽으면 걸리는 시간이 그대로 더해진다.
   */
  const wantsInvoices = !isHanbaek(session.role) && session.org !== null;
  const wantsMissed = session.role === 'admin';
  const wantsBatches = wantsInvoices || wantsMissed;
  const [projects, history, finals] = await Promise.all([
    getRepository().listProjects(viewerOf(session)),
    wantsBatches ? getRepository().listPayouts(viewerOf(session)) : [],
    wantsBatches ? getRepository().listBatchFinals(actorOf(session)) : [],
  ]);

  const items: TodoItem[] = projects
    // 멈춘 현장은 누구 차례도 아니다 — 보류 칸과 같은 판정
    .filter((p) => !p.holdState && mine.includes(p.court))
    .map((p) => {
      const column = boardColumnOf(p);
      return {
        id: p.id,
        href: `/projects/${p.id}`,
        name: p.name,
        what: whatOf(column, p),
        // 계약·시공은 보드 띠 그대로다. 멈춤 띠는 위에서 걸렀으니 여기 안 온다.
        group: bandOfColumn(column) as '계약' | '시공',
        kind: column,
        stalledDays: p.stalledDays,
        /* 정체일이 곧 급함이다 — 하루 = 1. 정산의 날짜 급함과 같은 자에 올린다 */
        urgency: p.stalledDays,
        urgencyLabel: p.stalledDays > 0 ? `${p.stalledDays}일 정체` : null,
      };
    });

  /*
   * 배치의 할 일 둘 — 묶는 규칙·상태 판정은 명세서 화면과 같은 정본(lib/payout-board)이다.
   *   협력사   가확정 → 「세금계산서 발행」 (1~2일 회전을 지키는 신호, 한백 확인 2026-08-23)
   *   관리자   확정 누락 → 확정은 지급의 전제인데 건너뛴 채 지급일이 지난 것
   */
  const batches = batchesOf(history, finals);
  const invoices: TodoItem[] = !wantsInvoices ? [] : batches
    .filter((b) => b.org && batchStateOf(b) === '가확정')
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
    .map((b) => ({
      id: `invoice|${batchKey(b.paidAt, b.org, b.kind)}`,
      href: '/statements',
      name: `세금계산서 발행 — ${b.kind}`,
      what: `공급가액 ${won(b.total)}원`,
      group: '정산',
      kind: '세금계산서 발행',
      stalledDays: 0,
      /*
       * 지급일이 가까울수록 급하다 — 남은 날을 뒤집어 자에 올린다. 30일 뒤면 0,
       * 내일이면 29. 계약·시공의 정체일과 같은 크기로 견줄 수 있다.
       */
      urgency: Math.max(0, 30 - daysUntil(b.paidAt)),
      urgencyLabel: labelUntil(b.paidAt),
    }));

  /* 오래 놓친 것이 위로 — 지급일이 이른 순 */
  const missed: TodoItem[] = !wantsMissed ? [] : batches
    .filter((b) => b.org && batchStateOf(b) === '확정 누락')
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
    .map((b) => ({
      id: `missed|${batchKey(b.paidAt, b.org, b.kind)}`,
      href: '/statements',
      name: `확정 누락 — ${b.org} ${b.kind}`,
      what: `공급가액 ${won(b.total)}원`,
      group: '정산',
      kind: '확정 누락',
      stalledDays: 0,
      /*
       * 이미 지난 일이다 — 확정은 지급의 전제인데 건너뛴 채 돈이 나갔다.
       * 지난 날수에 30 을 얹어, 어떤 「발행 예정」보다 위에 선다.
       */
      urgency: 30 + Math.max(0, -daysUntil(b.paidAt)),
      urgencyLabel: labelUntil(b.paidAt),
    }));

  /* 급한 순 — 업무를 넘어 한 자로 잰다. 같으면 업무 순서(계약 → 시공 → 정산) */
  return [...missed, ...invoices, ...items].sort(
    (a, b) => b.urgency - a.urgency
      || TODO_GROUPS.indexOf(a.group) - TODO_GROUPS.indexOf(b.group)
  );
}

/** 오늘부터 그 날까지 남은 날 — 지났으면 음수 */
function daysUntil(day: string): number {
  const ms = new Date(`${day}T00:00:00+09:00`).getTime() - new Date(`${today()}T00:00:00+09:00`).getTime();
  return Math.round(ms / 86_400_000);
}

/** 지급일까지의 거리를 사람 말로 — 지난 것은 강하게 적는다 */
function labelUntil(day: string): string {
  const d = daysUntil(day);
  if (d < 0) return `지급일 ${-d}일 지남`;
  if (d === 0) return '지급일 오늘';
  return `지급일 ${d}일 남음`;
}

/** 그 현장에서 지금 할 일 — 보드 칸 판정을 그대로 쓴다(부르는 쪽이 한 번 계산해 넘긴다) */
function whatOf(column: ReturnType<typeof boardColumnOf>, p: {
  rejectedDocs: number;
  preRejected: boolean;
  docsFilled: boolean;
}): string {
  /*
   * 계약보완은 서류 반려와 기설치 조사 반려 둘 다로 선다 — 조사도 rejectedDocs 에
   * 한 건으로 세어지므로(lib/stage) 여기서 나눌 것이 없다. 무엇이 반려됐는지는
   * 보드·표의 꼬리표가 말한다.
   */
  if (column === '계약보완') return `반려 ${p.rejectedDocs}건 보완`;
  if (column === '계약접수') return '필수 서류 제출';
  if (column === '계약검토') return '검수 · 계약 확인';
  /*
   * 「계약완료」는 상태이지 일이 아니다 — 그 자리에서 할 일은 운영사에 계약서를 내는 것이고
   * 그것은 한백의 일이다(COURT_AFTER_STATUS). 칸 이름을 그대로 적으면 할 일 목록에
   * 「계약완료」라는 줄이 서서, 무엇을 하라는 것인지 알 수 없다.
   */
  if (column === '계약완료') return '운영사에 계약서 제출';
  return column; // 그 밖의 공정 칸 이름은 곧 지금 서 있는 일이다
}

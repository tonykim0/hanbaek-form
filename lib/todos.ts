/**
 * 할 일 조립 — 지금 내 차례인 것.
 *
 * 저장하는 알림함이 아니다 — 보드가 쓰는 담당(court)와 배치 상태에서 그때그때
 * 유도한다. 상태가 바뀌면 할 일도 저절로 맞고, 읽음 처리·묵은 알림 청소가 없다.
 *
 * 두 자리가 같이 쓴다: 상단 바의 드롭다운(/api/todos)과 할 일 대시보드(/todos).
 * 한쪽은 훑는 자리고 한쪽은 작업대다 — 조립이 두 벌이면 배지와 페이지가 다른 것을 센다.
 *
 * ★세 갈래가 들어온다★ 현장의 담당 · 지급 배치 · ★기성★(한백 지시 2026-08-28).
 * 기성은 운영사에게서 받을 돈이라 한백 관리자만의 일이다 — 협력사에게는 차례가 없고,
 * 열람 전용은 넣을 칸이 없다. 돈의 두 방향은 칸이 갈린다: 지급(→협력사) · 기성(운영사→).
 */
import { getRepository } from '@/lib/data';
import { bandOfColumn, boardColumnOf } from '@/lib/board';
import { batchesOf, batchKey, batchStateOf } from '@/lib/payout-board';
import { actorOf, viewerOf } from '@/lib/auth/session';
import { isHanbaek } from '@/lib/roles';
import { COURTS_OF_ROLE } from '@/lib/todo-types';
import { won } from '@/lib/format';
import { today } from '@/lib/date';
import type { SessionPayload } from '@/lib/auth/types';
import type { Court } from '@/types/project';
import { TODO_GROUPS, type TodoItem } from '@/lib/todo-types';
import { receivableTodos } from '@/lib/todo-receivables';

/* 타입은 lib/todo-types 에 있다 — 클라이언트 부품이 이 파일을 안 끌어오게(빌드가 깨졌다) */
export { TODO_GROUPS, type TodoGroup, type TodoItem } from '@/lib/todo-types';


export async function todosOf(session: SessionPayload): Promise<TodoItem[]> {
  const mine = COURTS_OF_ROLE[session.role];
  /*
   * 발행은 협력사의 일, 확정 누락은 한백의 일이다.
   * 화면을 옮길 때마다 불리므로(TopBar) 두 읽기를 한꺼번에 시작한다 —
   * 하나를 기다렸다 다음을 읽으면 걸리는 시간이 그대로 더해진다.
   */
  const wantsInvoices = !isHanbaek(session.role) && session.org !== null;
  /* 확정 누락도 한백의 눈이 보는 것이다 — 열람 전용은 확정을 못 할 뿐 봐야 안다 */
  const wantsMissed = isHanbaek(session.role);
  const wantsBatches = wantsInvoices || wantsMissed;
  /* 기성은 한백이 운영사에게서 받는 돈이다 — 한백의 눈(관리자·열람 전용)이 본다 */
  const wantsReceivables = isHanbaek(session.role);
  /*
   * 현장·지급 내역·기성을 한 번의 읽기로 받는다(listTodoSources) — 예전에는 현장 목록과
   * 지급 내역을 따로 불러 같은 현장을 두 번 읽었다. 여기에 기성까지 붙이면 세 번이 되고,
   * 이 조립은 화면을 옮길 때마다 돈다.
   */
  const [{ projects, history, settlements }, finals] = await Promise.all([
    getRepository().listTodoSources(viewerOf(session)),
    wantsBatches ? getRepository().listBatchFinals(actorOf(session)) : [],
  ]);

  const items: TodoItem[] = projects
    // 멈춘 현장은 누구 차례도 아니다 — 계약중단 칸과 같은 판정
    .filter((p) => !p.holdState && mine.includes(p.court))
    .map((p) => ({ p, column: boardColumnOf(p) }))
    /*
     * ★준공한 현장은 여기서 뺀다★ (2026-08-29 흐름 워크스루).
     *
     * 준공은 마지막 칸이고 담당은 한백이라, 다 끝난 현장이 「준공」이라는 줄로 영영
     * 목록에 남았다. 그 자리에 실제로 남은 일(준공마감 지정 · 기성 수금)은 기성 할 일이
     * 금액까지 적어 따로 세우고, 그것들은 끝나면 사라진다. 두 벌로 세울 이유가 없다.
     */
    .filter(({ column }) => column !== '준공완료')
    .map(({ p, column }) => {
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
  /*
   * ★계산서를 이미 올린 배치는 빠진다★ (2026-08-30). 협력사가 콘솔에서 직접 올리게
   * 되면서, 올린 뒤에도 「세금계산서 발행」이 남으면 처리해도 줄지 않는 할 일이 된다.
   */
  const invoices: TodoItem[] = !wantsInvoices ? [] : batches
    .filter((b) => b.org && !b.invoice && batchStateOf(b) === '가확정')
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
    .map((b) => ({
      id: `invoice|${batchKey(b.paidAt, b.org, b.kind)}`,
      href: '/statements',
      name: `세금계산서 발행 — ${b.kind}`,
      what: `공급가액 ${won(b.total)}원`,
      group: '지급',
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
      group: '지급',
      kind: '확정 누락',
      stalledDays: 0,
      /*
       * 이미 지난 일이다 — 확정은 지급의 전제인데 건너뛴 채 돈이 나갔다.
       * 지난 날수에 30 을 얹어, 어떤 「발행 예정」보다 위에 선다.
       */
      urgency: 30 + Math.max(0, -daysUntil(b.paidAt)),
      urgencyLabel: labelUntil(b.paidAt),
    }));

  /*
   * ★「운영사 계약서 제출」은 할 일에 세우지 않는다★ (한백 지시 2026-08-29).
   *
   * 잠시 세워 봤다가 걷어냈다. 그 자리에서 한백이 하는 일은 운영사 회신을 기다리는 것뿐이고,
   * 기다리는 것은 할 일이 아니다 — 목록에 있으면 매일 보면서 아무것도 못 하는 줄이 된다.
   * 대신 그 기다림은 ★보드에서 보인다★: 시공 보드 첫 칸 「환경부 승인 대기」(계약 보드에서는
   * 「운영사 계약서 제출」)에 카드가 서고 정체일이 붙는다(lib/board HANDOFF_STATUS).
   * 회신이 오면 환경부 승인일을 적고 다음 칸으로 넘긴다 — 그때부터가 할 일이다.
   */

  /*
   * 기성 — 멈춘 현장은 뺀다. 위 현장 카드와 같은 판정이다(계약중단은 누구 차례도
   * 아니다). 기성 요약에는 멈춤이 없으므로 현장 목록에서 가져와 건넨다.
   */
  const held = new Set(projects.filter((p) => p.holdState).map((p) => p.id));
  const receivables = !wantsReceivables
    ? []
    : receivableTodos(settlements.filter((s) => !held.has(s.id)));

  /* 급한 순 — 업무를 넘어 한 자로 잰다. 같으면 업무 순서(계약 → 시공 → 정산) */
  return [...missed, ...invoices, ...receivables, ...items].sort(
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
  docsFilled: boolean;
}): string {
  /* 기설치 조사 반려도 이 수에 든다 — 그 문을 걷고 서류 칸 반려로 합쳤다(2026-09-03) */
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

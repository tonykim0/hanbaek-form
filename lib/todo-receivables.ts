/**
 * 기성 할 일 규칙 — 저장소도 세션도 안 건드리는 순수 함수.
 *
 * ★lib/todos 와 갈라 둔 이유★ 저쪽은 조립이라 저장소·세션을 끌어오고, 세션은 React 의
 * cache 를 쓴다 — 시험에서 그 파일을 부르면 로그인 사슬이 딸려 들어와 못 돈다
 * (실제로 깨졌다, 2026-08-28). 타입을 lib/todo-types 로 갈라 둔 것과 같은 이유다:
 * ★판정은 시험할 수 있는 자리에 둔다★ (test/todo-receivables.test.ts).
 */
import { phaseOfProject } from '@/lib/board';
import { won } from '@/lib/format';
import { daysSince } from '@/lib/date';
import type { SettlementStep, SettlementSummary } from '@/types/project';
import type { TodoItem } from '@/lib/todo-types';

/**
 * 기성 할 일 셋 — 운영사에게서 받을 돈이 지금 어디서 걸려 있나.
 *
 *   기성 수금        조건이 찼는데 아직 안 들어온 차수 — ★이것이 본디 할 일이다★
 *   준공마감일 지정   공정은 끝났는데 마지막 기성이 열리지 않았다 (그 날짜가 트리거다)
 *   정산 규칙 미지정  규칙이 없어 기성이 계산조차 안 된다
 *
 * ★조건 대기는 넣지 않는다.★ 아직 안 찬 차수는 우리가 할 일이 없다 — 기다리는 것을
 * 할 일로 세우면 목록이 영영 줄지 않는다. 무엇을 기다리는지는 기성관리 화면이 말한다.
 *
 * 저장소·세션을 안 건드리는 순수 함수라 시험이 있다(test/todos.test.ts).
 */
export function receivableTodos(rows: SettlementSummary[], now: Date = new Date()): TodoItem[] {
  const items: TodoItem[] = [];

  for (const r of rows) {
    const open = r.steps.filter((s) => s.state === 'open');
    if (open.length > 0) {
      /*
       * 한 현장에 두 차수가 같이 열리면 카드도 하나다 — 같은 운영사에게 한 번에 청구하는
       * 일이고, 눌러서 가는 자리(기성 탭)도 하나다. 차수는 문구가 적는다.
       */
      const amount = open.reduce((n, s) => n + (s.planAmount ?? 0), 0);
      const priced = open.some((s) => s.planAmount !== null);
      /* 가장 오래 열려 있는 차수로 잰다 — 여러 차수가 걸렸으면 오래된 쪽이 급함이다 */
      const days = open.map((s) => (s.openedAt ? daysSince(s.openedAt, now) : null))
        .filter((n): n is number => n !== null);
      const waited = days.length > 0 ? Math.max(...days) : 0;
      items.push({
        id: `receive|${r.id}`,
        href: `/projects/${r.id}?tab=receivable`,
        name: r.name,
        what: `${nosOf(open)} ${priced ? `${won(amount)}원` : '금액 미정'} · ${triggersOf(open)} 충족`,
        group: '기성',
        kind: '기성 수금',
        stalledDays: 0,
        /* 받을 수 있게 된 뒤 지난 날 — 정체일과 같은 자다(하루 = 1) */
        urgency: waited,
        urgencyLabel: days.length === 0 ? null
          : waited > 0 ? `받을 수 있게 된 지 ${waited}일` : '오늘부터 받을 수 있음',
      });
    }

    /*
     * 마지막 기성이 준공마감일을 기다리는데 공정은 끝난 자리. 그 날짜는 운영사가 통보하고
     * 한백이 넣는다 — 안 왔으면 물어보는 것까지가 우리 일이다. 준공 전에는 세우지 않는다:
     * 아직 통보가 올 때가 아니라, 그때 띄우면 준공까지 내내 걸려 있다.
     */
    const closing = r.steps.filter((s) => s.trigger === '준공마감' && s.state === 'waiting');
    if (r.status === '준공완료' && closing.length > 0) {
      const amount = closing.reduce((n, s) => n + (s.planAmount ?? 0), 0);
      items.push({
        id: `close|${r.id}`,
        href: `/projects/${r.id}?tab=receivable`,
        name: r.name,
        what: `${nosOf(closing)} ${amount > 0 ? `${won(amount)}원` : '금액 미정'} · 준공마감일 없음`,
        group: '기성',
        kind: '준공마감일 지정',
        stalledDays: 0,
        /*
         * 공정이 다 끝났는데 마지막 기성이 열리지 않은 것은 ★이미 지난 일★이다 —
         * 확정 누락과 같은 자리(30)에 놓는다. 준공일을 요약이 들고 있지 않아 날수로는
         * 못 잰다: 잴 근거가 없을 때 날짜를 꾸미지 않고 자리만 준다.
         */
        urgency: 30,
        urgencyLabel: '준공 · 마지막 기성 대기',
      });
    }

    /*
     * 규칙이 없으면 차수도 금액도 없다 — 기성이 아예 계산되지 않는다. 계약 국면에는
     * 안 세운다: 그때는 아직 걸 때가 아니고, 그 현장에는 계약 쪽 할 일이 이미 서 있다.
     */
    if (r.ruleName === null && r.qty > 0
      && phaseOfProject({ stage: r.stage, status: r.status }) === '시공') {
      items.push({
        id: `norule|${r.id}`,
        href: `/projects/${r.id}?tab=receivable`,
        name: r.name,
        what: `${r.qty}대 · 기성 계산 안 됨`,
        group: '기성',
        kind: '정산 규칙 미지정',
        stalledDays: 0,
        /*
         * 날짜로 잴 근거가 없다. 밀림 문턱(7일)에 놓아 「밀린 것만」에는 걸리되, 날수로
         * 재어 온 것들 위로는 올라서지 않게 한다 — 꾸민 날짜로 순위를 만들지 않는다.
         */
        urgency: 7,
        urgencyLabel: null,
      });
    }
  }

  return items;
}

/** 「1차」 · 「1·2차」 — 차수를 사람 말로 */
const nosOf = (steps: SettlementStep[]): string => `${steps.map((s) => s.no).join('·')}차 기성`;

/** 무엇이 찼나 — 같은 트리거가 겹치면 한 번만 적는다 */
const triggersOf = (steps: SettlementStep[]): string =>
  [...new Set(steps.map((s) => s.trigger))].join('·');

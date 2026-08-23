import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { TODO_GROUPS, todosOf, type TodoItem } from '@/lib/todos';

export const metadata = { title: '할 일 — 한백 전기차사업관리' };
export const dynamic = 'force-dynamic';

/**
 * 할 일 대시보드 — 지금 내 차례인 것 전부, 국면(정산·계약·시공)이 칸으로 선다.
 *
 * ★칸반이다 (한백 요청 2026-08-25).★ 세로로 쌓은 구획은 첫 묶음이 길면 다음 묶음이
 * 화면 밖이라, 세 국면에 일이 몇 개씩 있는지 한눈에 안 잡혔다. 칸을 나란히 세우면
 * 그 분포가 곧 첫인상이다 — 현장 보드와 같은 칸 모양을 쓴다(다른 모양이면 같은
 * 것(칸)을 두 번 배운다). 빈 칸도 자리를 지킨다 — 「정산에 지금 일이 없다」도 정보다.
 *
 * 카드는 끌지 않는다 — 보드와 달리 여기 칸은 단계가 아니라 국면이라 옮길 수 있는
 * 것이 아니다. 카드가 곧 링크다(현장 상세 · 거래명세서).
 *
 * 상단 바의 드롭다운은 8건에서 잘리는 훑는 자리다 — 여기가 작업대다. 조립은
 * lib/todos 한 벌: 드롭다운의 배지 숫자와 이 페이지가 다른 것을 세면 안 된다.
 * 저장하는 알림함이 아니라 유도값이다 — 처리하면 저절로 사라지고 읽음 처리가 없다.
 */
export default async function TodosPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/todos');

  const items = await todosOf(session);

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[28rem] flex-col">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-h1 font-black text-slate-900">할 일</h1>
        <span className="text-small font-bold tabular-nums text-slate-400">{items.length}건</span>
      </div>

      <div className="-mx-5 min-h-0 flex-1 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
        <div
          className="grid h-full gap-3"
          style={{ gridTemplateColumns: `repeat(${TODO_GROUPS.length}, minmax(240px, 1fr))` }}
        >
          {TODO_GROUPS.map((g) => {
            const list = items.filter((t) => t.group === g);
            return (
              <section
                key={g}
                aria-label={g}
                className="flex min-h-0 min-w-0 flex-col rounded-panel border border-slate-200 bg-slate-50/60 p-2.5"
              >
                <header className="flex items-baseline justify-between gap-2 px-1.5 pb-2">
                  <h2 className="text-base font-black tracking-[-0.01em] text-slate-800">{g}</h2>
                  <span
                    className={`text-lead font-black tabular-nums ${
                      list.length > 0 ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    {list.length}
                  </span>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                  {list.map((t) => (
                    <TodoCard key={t.id} t={t} />
                  ))}
                  {list.length === 0 && (
                    <p className="flex h-full items-center justify-center rounded-box border border-dashed border-slate-200 text-tiny text-slate-300">
                      없음
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 카드 한 장 — 통째로 링크다. 이름 · 무엇을 · (정체일). 보드 카드와 같은 겉모양 */
function TodoCard({ t }: { t: TodoItem }) {
  return (
    <Link
      href={t.href}
      className="block rounded-box border border-slate-200 bg-white p-2.5 transition hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      <p className="truncate text-small font-bold text-slate-900">{t.name}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-tiny text-slate-500">
        {t.what}
        {t.stalledDays > 0 && (
          <span className={`ml-auto font-bold tabular-nums ${t.stalledDays >= 7 ? 'text-red-600' : 'text-slate-400'}`}>
            {t.stalledDays}일 정체
          </span>
        )}
      </p>
    </Link>
  );
}

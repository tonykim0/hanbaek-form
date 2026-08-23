import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { TODO_GROUPS, todosOf, type TodoItem } from '@/lib/todos';
import { Blank } from '@/components/ui';

export const metadata = { title: '할 일 — 한백 전기차사업관리' };
export const dynamic = 'force-dynamic';

/**
 * 할 일 대시보드 — 지금 내 차례인 것 전부, 국면(정산·계약·시공)으로 묶어서.
 *
 * 상단 바의 드롭다운은 8건에서 잘리는 훑는 자리다 — 여기가 작업대다(한백 요청 2026-08-25).
 * 조립은 lib/todos 한 벌: 드롭다운의 배지 숫자와 이 페이지가 다른 것을 세면 안 된다.
 *
 * 저장하는 알림함이 아니다 — 공 차례·배치 상태에서 그때그때 유도한다. 처리하면
 * 저절로 사라지고, 읽음 처리가 없다. 그래서 「비었음」이 곧 「내 차례 없음」이다.
 */
export default async function TodosPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/todos');

  const items = await todosOf(session);
  const groups = TODO_GROUPS
    .map((g) => ({ name: g, items: items.filter((t) => t.group === g) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-h1 font-black text-slate-900">할 일</h1>
        <span className="text-small font-bold tabular-nums text-slate-400">{items.length}건</span>
      </div>

      {groups.length === 0 ? (
        <Blank>지금 움직일 차례인 일 0건</Blank>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.name}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-h3 font-black text-slate-900">{g.name}</h2>
                <span className="text-tiny font-bold tabular-nums text-slate-400">{g.items.length}건</span>
              </div>
              <ul className="divide-y divide-slate-100 rounded-panel border border-slate-200 bg-white">
                {g.items.map((t) => (
                  <TodoRow key={t.id} t={t} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/** 한 줄이 통째로 링크다 — 이름 · 무엇을 · (정체일). 자잘한 단추를 늘어놓지 않는다 */
function TodoRow({ t }: { t: TodoItem }) {
  return (
    <li>
      <Link
        href={t.href}
        className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3 transition hover:bg-brand-50/40"
      >
        <span className="min-w-[220px] flex-1 truncate text-base font-bold text-slate-900">
          {t.name}
        </span>
        <span className="text-small text-slate-500">{t.what}</span>
        {t.stalledDays > 0 && (
          <span
            className={`ml-auto text-small font-bold tabular-nums ${
              t.stalledDays >= 7 ? 'text-red-600' : 'text-slate-400'
            }`}
          >
            {t.stalledDays}일 정체
          </span>
        )}
      </Link>
    </li>
  );
}

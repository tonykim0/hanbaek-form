import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { todosOf } from '@/lib/todos';
import TodoBoard from '@/components/TodoBoard';

export const metadata = { title: '할 일 — 한백 전기차사업관리시스템' };
export const dynamic = 'force-dynamic';

/**
 * 할 일 대시보드 — 지금 내 차례인 것 전부.
 *
 * 서버는 조립만 한다(lib/todos 한 벌 — 사이드바 배지와 같은 정본을 본다). 거르고 묶어
 * 그리는 것은 TodoBoard 다: 필터는 화면 상태라 서버가 쥐면 고를 때마다 왕복이 생긴다.
 *
 * 저장하는 알림함이 아니라 유도값이다 — 처리하면 저절로 사라지고 읽음 처리가 없다.
 */
export default async function TodosPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/todos');

  const items = await todosOf(session);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-h1 font-black text-slate-900">할 일</h1>
        <span className="text-small font-bold tabular-nums text-slate-400">{items.length}건</span>
      </div>
      <TodoBoard items={items} />
    </>
  );
}

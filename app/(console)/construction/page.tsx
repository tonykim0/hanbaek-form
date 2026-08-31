import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import ProjectsView from '@/components/ProjectsView';
import { showsOnBoard } from '@/lib/board';

export const metadata = { title: '시공관리 — 한백 전기차사업관리시스템' };

/**
 * 시공 화면 — 계약이 끝난 현장들. 보드와 표, 같은 자료의 두 가지 보기.
 *
 * 계약(/projects)과 페이지로 갈랐다 — 이유는 그쪽 주석에 적었다.
 * 시공 띠가 화면 전부를 쓰므로 단계를 더 쪼개도 칸이 들어간다.
 */
export default async function ConstructionPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/construction');
  const all = await getRepository().listProjects(viewerOf(session));
  // 충전기 발주부터가 시공이다 — 계약완료·운영사 계약서 제출은 계약 페이지에 있다(한백 확인)
  const projects = all.filter((p) => showsOnBoard(p, '시공'));

  return (
    <>
      <h1 className="mb-5 text-h1 font-black text-slate-900">시공관리</h1>

      <ProjectsView projects={projects} band="시공" canMove={session.role === 'admin'} />

    </>
  );
}

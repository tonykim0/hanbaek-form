import { getRepository, repositoryKind } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import ProjectsView from '@/components/ProjectsView';

export const metadata = { title: '프로젝트 — 한백 전기차사업관리' };

/**
 * 현장 화면 — 보드와 표, 같은 자료의 두 가지 보기.
 *
 * 축은 단계다 — 어떤 현장이 어디까지 왔는가. 공 차례(누가 손댈 차례인가)는
 * 화면에 넣지 않는다. 한 화면이 두 질문에 답하려 하면 둘 다 흐려진다.
 *
 * 거르는 일은 브라우저가 한다. 138건은 한 번에 다 보내도 되는 양이고, 필터를 서버에
 * 물으면 조건을 만질 때마다 화면이 멈춘다.
 */
export default async function ProjectsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/projects');
  const projects = await getRepository().listProjects(viewerOf(session));

  return (
    <>
      {/*
        건수는 필터 막대 아래에 이미 있다(ProjectsView) — 여기 또 적으면 두 곳이
        같은 말을 하고, 필터를 걸면 둘이 다른 숫자를 말한다.
      */}
      <h1 className="mb-5 text-h1 font-black text-slate-900">프로젝트</h1>

      <ProjectsView projects={projects} canMove={session.role === 'admin'} />

      {/* 설명글은 두지 않는다. 남기는 것은 「지금 보는 자료가 무엇인가」뿐이다. */}
      {repositoryKind() === 'file' && (
        <p className="mt-4 text-small text-slate-400">지금은 예시 데이터입니다 (로컬 파일 저장소).</p>
      )}
    </>
  );
}

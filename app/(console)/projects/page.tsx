import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import ProjectsView from '@/components/ProjectsView';
import { phaseOfProject } from '@/lib/board';

export const metadata = { title: '계약 — 한백 전기차사업관리' };

/**
 * 계약 화면 — 계약이 아직 안 끝난 현장들. 보드와 표, 같은 자료의 두 가지 보기.
 *
 * ★계약과 시공을 페이지로 가른다(한백 확인).★ 두 국면을 한 화면에 접어 넣으면 띠마다
 * 높이가 반쪽이고, 시공 단계를 더 쪼갤 자리가 없다. 계약완료·운영사 계약서 제출까지가
 * 계약이다 — 그 뒤(시공진행필요부터)는 시공(/construction)에 선다. 보류도 국면을 따른다.
 *
 * 축은 단계다 — 어떤 현장이 어디까지 왔는가. 차례(누가 손댈 차례인가)는
 * 화면에 넣지 않는다. 한 화면이 두 질문에 답하려 하면 둘 다 흐려진다.
 *
 * 거르는 일은 브라우저가 한다. 138건은 한 번에 다 보내도 되는 양이고, 필터를 서버에
 * 물으면 조건을 만질 때마다 화면이 멈춘다.
 */
export default async function ProjectsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/projects');
  const all = await getRepository().listProjects(viewerOf(session));
  const projects = all.filter((p) => phaseOfProject(p) === '계약');

  return (
    <>
      {/*
        건수는 필터 막대 아래에 이미 있다(ProjectsView) — 여기 또 적으면 두 곳이
        같은 말을 하고, 필터를 걸면 둘이 다른 숫자를 말한다.
      */}
      <h1 className="mb-5 text-h1 font-black text-slate-900">계약</h1>

      <ProjectsView projects={projects} band="계약" canMove={session.role === 'admin'} />

    </>
  );
}

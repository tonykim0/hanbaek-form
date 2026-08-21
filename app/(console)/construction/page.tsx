import { getRepository, repositoryKind } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import ProjectsView from '@/components/ProjectsView';

export const metadata = { title: '시공 — 한백 전기차사업관리' };

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
  // 정산 단계 현장도 시공 보드에 선다(준공 칸 등) — 계약 전만 아니면 시공 국면이다
  const projects = all.filter((p) => p.stage !== 'intake');

  return (
    <>
      <h1 className="mb-5 text-h1 font-black text-slate-900">시공</h1>

      <ProjectsView projects={projects} band="시공" canMove={session.role === 'admin'} />

      {repositoryKind() === 'file' && (
        <p className="mt-4 text-small text-slate-400">지금은 예시 데이터입니다 (로컬 파일 저장소).</p>
      )}
    </>
  );
}

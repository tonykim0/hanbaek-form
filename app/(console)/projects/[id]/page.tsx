import { notFound } from 'next/navigation';
import ProjectDetailView from '@/components/project/DetailView';
import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { effectiveVisibility } from '@/lib/roles';
import { matchingRules, type RuleOptions } from '@/lib/pricing-match';
import { knownOrgs } from '@/lib/orgs';
import { redirect } from 'next/navigation';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return { title: '현장 관리' };
  const detail = await getRepository().getProject(params.id, viewerOf(session));
  return { title: detail ? `${detail.project.name} — 한백 EV 콘솔` : '현장 관리' };
}

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=/projects/${params.id}`);

  // 권한 밖 현장은 「없음」과 구분되지 않게 404 로 돌려준다 — 존재 여부가 새지 않게
  const detail = await getRepository().getProject(params.id, viewerOf(session));
  if (!detail) notFound();

  const isAdmin = session.role === 'admin';
  /*
   * 단가 후보를 서버에서 계산해 넘긴다.
   * 후보에는 영업비·시공비·마진이 들어 있어서, 협력사에게 보내면 화면에서 가려도
   * 브라우저에 원본이 남는다. 한백일 때만 만든다.
   */
  /*
   * 업체 이름 후보 — 한백이 영업사·시공사를 고칠 때 골라 넣는다.
   * 협력사에게는 필요 없다(고칠 수 없다).
   */
  const orgs = isAdmin ? await knownOrgs(viewerOf(session)) : [];

  const ruleOptions: RuleOptions | null = isAdmin
    ? Object.fromEntries(detail.lines.map((l) => [l.id, matchingRules(detail.project, l)]))
    : null;

  return (
    <ProjectDetailView
      detail={detail}
      vis={effectiveVisibility(session.role, session.org, detail.project)}
      // 검수·공 차례는 한백만 한다. vis.cost 로 유추하지 않고 명시적으로 넘긴다.
      canReview={isAdmin}
      /*
       * 진행현황을 남길 때 붙는 이름. 서버(addNote)가 실제로 쓰는 값과 같은 규칙이다 —
       * 화면이 「한백으로 남깁니다」라고 하고 서버가 다른 이름을 적으면 기록을 믿을 수 없다.
       */
      noteAuthor={isAdmin ? '한백' : session.org ?? '협력사'}
      knownOrgs={orgs}
      ruleOptions={ruleOptions}
    />
  );
}

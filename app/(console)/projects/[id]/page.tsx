import { notFound } from 'next/navigation';
import ProjectDetailView, { type TabKey } from '@/components/project/DetailView';
import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser, viewerOf } from '@/lib/auth/session';
import { effectiveVisibility, normalizeOrg } from '@/lib/roles';
import type { ProcessEdit } from '@/lib/process';
import { matchingRules, type RuleOptions } from '@/lib/pricing-match';
import { SETTLEMENT_RULES } from '@/lib/data/seed/settlement-rules';
import type { SettlementRuleChoice } from '@/types/project';
import { knownOrgs } from '@/lib/orgs';
import { redirect } from 'next/navigation';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return { title: '현장 관리' };
  const detail = await getRepository().getProject(params.id, viewerOf(session));
  return { title: detail ? `${detail.project.name} — 한백 EV 콘솔` : '현장 관리' };
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=/projects/${params.id}`);

  // 기성·지급 화면에서 오는 길이 정산 탭을 바로 연다. 모르는 값은 단계가 정하는 대로.
  const initialTab: TabKey | null =
    searchParams.tab === 'intake' || searchParams.tab === 'construction' || searchParams.tab === 'settlement'
      ? searchParams.tab
      : null;

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

  /* 후보는 저장소의 케이스 표에서 고른다 — 시드 파일이 아니라 지금 등록된 것이 정본이다 */
  const rules = isAdmin ? await getRepository().listPricingRules(actorOf(session)) : [];
  const ruleOptions: RuleOptions | null = isAdmin
    ? Object.fromEntries(detail.lines.map((l) => [l.id, matchingRules(detail.project, l, rules)]))
    : null;

  /*
   * 정산 규칙 후보 — 규칙의 정본은 코드다(assemble 이 SETTLEMENT_RULE_BY_ID 로 읽는다).
   * 이름에 기성 모양이 들어 있어 한백일 때만 만든다. 클라이언트에서 시드 파일을 직접
   * import 하면 번들에 실려 협력사에게도 간다 — 그래서 서버에서 걸러 넘긴다.
   */
  const settlementRuleChoices: SettlementRuleChoice[] | null = isAdmin
    ? SETTLEMENT_RULES.filter((r) => r.active).map(({ id, name }) => ({ id, name }))
    : null;

  /*
   * 공정 입력 권한 — 한백은 전부, 그 현장의 시공사는 한백 전용 두 칸을 뺀 전부.
   * 실제 판정은 저장소(assertProcessWrite)가 다시 한다 — 여기 값은 화면이 칸을
   * 잠그는 데만 쓴다. 영업만(sales)은 공정을 적지 않는다.
   */
  const isGcHere =
    (session.role === 'cons' || session.role === 'salesCons') &&
    normalizeOrg(session.org) !== null &&
    normalizeOrg(session.org) === normalizeOrg(detail.project.gcOrg);
  const processEdit: ProcessEdit = isAdmin ? 'all' : isGcHere ? 'partner' : 'none';

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
      settlementRuleChoices={settlementRuleChoices}
      initialTab={initialTab}
      processEdit={processEdit}
    />
  );
}

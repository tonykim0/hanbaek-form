import { notFound } from 'next/navigation';
import ProjectDetailView, { type TabKey } from '@/components/project/DetailView';
import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser, viewerOf } from '@/lib/auth/session';
import { canWrite, effectiveVisibility, isHanbaek, normalizeOrg } from '@/lib/roles';
import { canChangeContractDocs, type ProcessEdit } from '@/lib/process';
import { matchingRules, type RuleOptions } from '@/lib/pricing-match';
import type { SettlementRuleChoice } from '@/types/project';
import { knownOrgs } from '@/lib/orgs';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { Role } from '@/lib/roles';

/**
 * 이 요청에서 상세를 한 번만 조립한다.
 *
 * generateMetadata 와 본문이 각각 getProject 를 불러 같은 현장을 두 벌 읽고 있었다 —
 * 상세 하나가 쿼리 열 개쯤이라 요청마다 그만큼이 두 번 돌았다. react cache 는 같은
 * 인자에 대해 요청 단위로 결과를 재사용한다. ★인자는 원시값이어야 한다★ —
 * viewer 객체를 그대로 넘기면 매번 새 객체라 키가 달라져 캐시가 듣지 않는다.
 */
const loadDetail = cache((id: string, role: Role, org: string | null) =>
  getRepository().getProject(id, { role, org })
);

export async function generateMetadata({ params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return { title: '현장 관리 — 한백 전기차사업관리시스템' };
  const detail = await loadDetail(params.id, session.role, session.org);
  return { title: detail ? `${detail.project.name} — 한백 전기차사업관리시스템` : '현장 관리 — 한백 전기차사업관리시스템' };
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

  // 기성·지급 화면에서 오는 길이 그 탭을 바로 연다. 모르는 값은 단계가 정하는 대로.
  const initialTab: TabKey | null =
    searchParams.tab === 'intake'
    || searchParams.tab === 'construction'
    || searchParams.tab === 'settlement'
    || searchParams.tab === 'receivable'
      ? searchParams.tab
      : null;

  // 권한 밖 현장은 「없음」과 구분되지 않게 404 로 돌려준다 — 존재 여부가 새지 않게
  // generateMetadata 가 이미 불렀으면 그 결과를 그대로 쓴다(위 loadDetail 주석)
  const detail = await loadDetail(params.id, session.role, session.org);
  if (!detail) notFound();

  /*
   * ★눈과 손을 가른다.★
   *   seesAll — 전 현장·원가·마진·기성을 보는 눈 (관리자 · 열람 전용)
   *   canEdit — 검수·계약 확인·단가 지정·공정 입력을 하는 손 (관리자만)
   * 예전에는 둘 다 isAdmin 하나였다. 단가 후보·정산 규칙 후보는 「보는 것」에 속한다 —
   * 정산 탭이 그 이름과 금액을 그리는 데 쓰기 때문이다. 고르는 단추만 손이 쥔다.
   */
  const seesAll = isHanbaek(session.role);
  const canEdit = session.role === 'admin';
  /*
   * 단가 후보를 서버에서 계산해 넘긴다.
   * 후보에는 영업비·시공비·마진이 들어 있어서, 협력사에게 보내면 화면에서 가려도
   * 브라우저에 원본이 남는다. 한백일 때만 만든다.
   */
  /*
   * 업체 이름 후보 — 한백이 영업사·시공사를 고칠 때 골라 넣는다.
   * 협력사에게는 필요 없다(고칠 수 없다).
   */
  const orgs = canEdit ? await knownOrgs(viewerOf(session)) : [];

  /* 후보는 저장소의 케이스 표에서 고른다 — 시드 파일이 아니라 지금 등록된 것이 정본이다 */
  const rules = seesAll ? await getRepository().listPricingRules(actorOf(session)) : [];
  const ruleOptions: RuleOptions | null = seesAll
    ? Object.fromEntries(detail.lines.map((l) => [l.id, matchingRules(detail.project, l, rules)]))
    : null;

  /*
   * 정산 규칙 후보 — 규칙의 정본은 저장소다(단가 케이스가 기성 단계로 정의해 쌓는다).
   * 이름에 기성 모양이 들어 있어 한백일 때만 만든다. 협력사에게는 조회 자체를 안 한다 —
   * 서버가 렌더한 값은 브라우저에 통째로 실린다.
   */
  const settlementRuleChoices: SettlementRuleChoice[] | null = seesAll
    ? (await getRepository().listSettlementRules(actorOf(session)))
        .filter((r) => r.active)
        .map(({ id, name }) => ({ id, name }))
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
  const processEdit: ProcessEdit = canEdit ? 'all' : isGcHere ? 'partner' : 'none';

  return (
    <ProjectDetailView
      detail={detail}
      vis={effectiveVisibility(session.role, session.org, detail.project)}
      // 검수·담당는 한백만 한다. vis.cost 로 유추하지 않고 명시적으로 넘긴다.
      canReview={canEdit}
      /*
       * 진행현황을 남길 때 붙는 이름. 서버(addNote)가 실제로 쓰는 값과 같은 규칙이다 —
       * 화면이 「한백으로 남깁니다」라고 하고 서버가 다른 이름을 적으면 기록을 믿을 수 없다.
       */
      noteAuthor={canEdit ? '한백' : session.org ?? '협력사'}
      knownOrgs={orgs}
      ruleOptions={ruleOptions}
      settlementRuleChoices={settlementRuleChoices}
      initialTab={initialTab}
      processEdit={processEdit}
      /*
       * 계약서 접수는 내는 쪽이 누른다 — 그 현장의 협력사와 한백. 이 화면에 들어온 것이
       * 이미 접근 판정을 지난 것이므로(저장소가 걸렀다) 열람 전용만 가른다.
       */
      canSubmit={canWrite(session.role)}
      /*
       * 계약 서류를 바꿀 수 있는가 — ★운영사에 낸 뒤로 협력사는 못 바꾼다★
       * (한백 지시 2026-08-29). 판정은 lib/process 한 곳이고, 저장소도 같은 것을 본다 —
       * 화면에서 단추만 감추면 주소를 직접 두드리는 길이 남는다.
       */
      canEditDocs={canChangeContractDocs(
        session.role,
        detail.process.status,
        detail.project.contractConfirmedAt !== null
      )}
      /*
       * 빈 칸 예외 — 잠긴 뒤에도 파일 0장인 칸은 채운다(canChangeContractDocs slotEmpty 주석).
       * ★착공 전까지만이다★ — 착공 뒤에는 협력사 손이 완전히 닫힌다(PARTNER_DOCS_CLOSED_AT,
       * 한백 지시 2026-09-05). 판정 함수가 그 구간을 안다.
       */
      canFillEmpty={canChangeContractDocs(
        session.role,
        detail.process.status,
        detail.project.contractConfirmedAt !== null,
        true
      )}
    />
  );
}

'use client';

/**
 * 현장 상세 — 계약 · 시공 · 정산이 탭으로 들어간다.
 *
 * 머리말(SiteHeader)은 탭과 무관하게 항상 보인다. 탭으로 나누면 「지금 어디에 있고 무엇이
 * 막혀 있나」가 눈에서 사라지기 때문에, 어느 탭에 있든 단계·공 차례·걸림돌은 계속 보인다.
 *
 * 단계 이름은 보드와 같은 말을 쓴다(lib/board). 같은 현장을 두 이름으로 부르면 「계약보완인데
 * 여기서는 진행 중이라고 나온다」는 물음이 생긴다.
 *
 * ★탭마다 파일이 갈려 있다.★ 한 파일에 2천 줄로 있었는데, 정산 한 줄을 고치려고 열면
 * 서류·공정·메모가 같이 딸려 왔다. 탭은 서로를 모른다 — 여기가 무엇을 넘겨주는지만 안다.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ProjectDetail } from '@/types/project';
import { buildDocContext, evaluateDocs, isPartyInferred, PROCESS_DOCS } from '@/lib/doc-rules';
import { bandOfColumn, boardColumnOf, type BoardBand } from '@/lib/board';
import type { Visibility } from '@/lib/roles';
import type { RuleOptions } from '@/lib/pricing-match';
import { ConstructionTab } from './ConstructionTab';
import { Fact } from './parts';
import { IntakeTab } from './IntakeTab';
import { OrgField } from './OrgField';
import { QueueField } from './QueueField';
import { ProgressLog } from './ProgressLog';
import { SettlementTab } from './SettlementTab';

type TabKey = 'intake' | 'construction' | 'settlement';

export default function ProjectDetailView({
  detail,
  vis,
  canReview,
  noteAuthor,
  knownOrgs,
  ruleOptions,
}: {
  detail: ProjectDetail;
  /** 세션에서 계산된 가시성. 화면에서 고를 수 있는 값이 아니다. */
  vis: Visibility;
  /** 검수·공 차례를 움직일 수 있는가 (한백만) */
  canReview: boolean;
  /** 진행현황을 남길 때 붙는 이름 (한백 · 협력사 이름) */
  noteAuthor: string;
  /** 이미 쓰이고 있는 업체 이름 — 영업사·시공사를 고칠 때 골라 넣는다 */
  knownOrgs: string[];
  /**
   * 라인별 단가 후보. 서버에서 계산해 넘긴다 —
   * 원가·마진이 들어 있어서 협력사 브라우저로 보내면 안 된다. 한백이 아니면 null.
   */
  ruleOptions: RuleOptions | null;
}) {
  const [tab, setTab] = useState<TabKey>(detail.stage);
  const { project, lines, documents, process, settlement } = detail;

  const docCtx = useMemo(
    () =>
      buildDocContext({
        cpo: project.cpo,
        contractParty: project.contractParty,
        bldgType: project.bldgType,
        projectPowerType: project.powerType,
        linePowerTypes: lines.map((l) => l.powerType),
        preInstall: project.preInstall,
      }),
    [project, lines]
  );

  const evaluated = useMemo(() => evaluateDocs(docCtx), [docCtx]);
  const byKind = useMemo(() => new Map(documents.map((d) => [d.kind, d])), [documents]);

  /*
   * 검수는 「예외를 걸러내는」 방식이다 — 통과 = 제출됐고 반려되지 않음.
   * 하나하나 승인하게 만들면 현장 138건 × 서류 16칸 = 2천 번을 눌러야 한다.
   * 판정 기준은 lib/stage.ts 의 deriveStage 와 같아야 한다.
   */
  const passes = (kind: string) => {
    const st = byKind.get(kind)?.status;
    return st === 'uploaded' || st === 'approved';
  };
  const required = evaluated.filter((d) => d.req === 'm');
  const satisfied = required.filter((d) => passes(d.key));
  const blocked = satisfied.length < required.length;
  /*
   * 단계(stage)는 서류 승인 + 단가 지정 둘 다 채워졌을 때 시공으로 넘어간다(deriveStage).
   * 그래서 「접수 완료」 판정도 서류만 보면 안 된다 — 서류만 보고 넘기면
   * 단가 미지정 현장이 시공으로 올라가 정산 계획이 비어버린다.
   */
  const allPriced = lines.length > 0 && lines.every((l) => l.rule !== null);
  /** 반려된 서류 수 — 보드가 「계약보완」으로 부르는 조건이다 */
  const rejectedCount = documents.filter((d) => d.status === 'rejected').length;
  const feeMissing = evaluated
    .filter((d) => d.fee && d.req === 'm' && !passes(d.key))
    .map((d) => d.label);

  const processDone = PROCESS_DOCS.filter((d) =>
    process.docs.find((x) => x.kind === d.key && x.status === 'approved')
  ).length;
  const settlementOpen = settlement.steps.filter((s) => s.state !== 'na').length;
  const settlementDone = settlement.steps.filter((s) => s.state === 'collected').length;

  /*
   * 계약이 끝나기 전에는 시공 탭을 잠근다.
   *
   * 서류가 덜 찼거나 단가가 없는데 시공 일정을 넣기 시작하면, 계약이 깨졌을 때
   * 지워야 할 것이 공정에까지 퍼진다. 단계는 유도값이라 조건이 채워지면 저절로 열린다.
   *
   * 정산은 잠그지 않는다 — 단가 케이스를 지급 화면에서 붙이는데, 그게 계약 완료의 조건이라
   * 여기까지 잠그면 계약을 끝낼 방법이 없어진다.
   */
  const constructionLocked = detail.stage === 'intake';

  const tabs: Array<{ key: TabKey; label: string; count: string; locked: boolean; why?: string }> = [
    { key: 'intake', label: '계약', count: `${satisfied.length}/${required.length}`, locked: false },
    {
      key: 'construction',
      label: '시공',
      count: `${processDone}/${PROCESS_DOCS.length}`,
      locked: constructionLocked,
      why: blocked ? '필수 서류 미충족' : !allPriced ? '단가 미지정' : undefined,
    },
    {
      key: 'settlement',
      label: '정산',
      // 기성 회수 진행은 한백만 본다 — 협력사에게 숫자만 보여주면 무슨 수인지 알 수 없다
      count: canReview ? `${settlementDone}/${settlementOpen}` : '',
      locked: false,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <SiteHeader
        detail={detail}
        rejectedCount={rejectedCount}
        blocked={blocked}
        allPriced={allPriced}
        canReview={canReview}
        noteAuthor={noteAuthor}
        knownOrgs={knownOrgs}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex gap-1 border-b border-slate-100 px-3 pt-3" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              disabled={t.locked}
              title={t.locked ? `계약 완료 후 열립니다${t.why ? ` — ${t.why}` : ''}` : undefined}
              onClick={() => !t.locked && setTab(t.key)}
              className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-bold transition ${
                t.locked
                  ? 'cursor-not-allowed border-transparent text-slate-300'
                  : tab === t.key
                    ? 'border-brand-600 text-brand-800'
                    : 'border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              {t.label}
              {t.locked ? (
                <span aria-label="잠김" className="ml-1.5 text-[11px]">🔒</span>
              ) : t.count ? (
                <span className="ml-1.5 text-[11px] font-semibold tabular-nums text-slate-400">
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-6">
          {tab === 'intake' && (
            <IntakeTab
              knownOrgs={knownOrgs}
              project={project}
              evaluated={evaluated}
              byKind={byKind}
              blocked={blocked}
              allPriced={allPriced}
              projectId={project.id}
              siteName={project.name}
              canReview={canReview}
              feeMissing={feeMissing}
              partyInferred={isPartyInferred(docCtx)}
              inferredParty={docCtx.bldgType === '공동주택' ? '입주자대표회의' : '관리단'}
            />
          )}
          {tab === 'construction' && <ConstructionTab detail={detail} canEdit={canReview} />}
          {tab === 'settlement' && (
            <SettlementTab
              detail={detail}
              vis={vis}
              canReview={canReview}
              ruleOptions={ruleOptions}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── 머리말 ──────────────────────────────────────────────────────
/**
 * 이 현장이 무엇이고 지금 어디에 있는가.
 *
 * ★단계는 보드와 같은 말을 쓴다.★ 예전에는 여기가 「계약·시공·정산 / 완료·진행 중·대기」
 * 였는데, 그것은 바로 아래 탭이 이미 하는 말이고, 정작 보드에서 부르는 이름
 * (계약보완·시공진행필요·준공서류 접수/검토…)과 달라서 같은 현장을 두 이름으로 부르게 됐다.
 *
 * 걸림돌은 여기 모은다. 무엇이 이 현장을 세우고 있는지는 탭을 열기 전에 보여야 한다.
 */
function SiteHeader({
  detail, rejectedCount, blocked, allPriced, canReview, noteAuthor, knownOrgs,
}: {
  detail: ProjectDetail;
  rejectedCount: number;
  blocked: boolean;
  allPriced: boolean;
  /** 한백인가 — 협력사에게는 한백이 할 일을 걸림돌로 보여주지 않는다 */
  canReview: boolean;
  noteAuthor: string;
  /** 이미 쓰이고 있는 업체 이름 — 영업사·시공사를 고칠 때 골라 넣는다 */
  knownOrgs: string[];
}) {
  const { project, lines, stage, process, stalledDays } = detail;
  const column = boardColumnOf({
    stage,
    status: process.status,
    holdState: project.holdState,
    rejectedDocs: rejectedCount,
  });
  const band = bandOfColumn(column);
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  const terms = [...new Set(lines.map((l) => l.termYears))];

  /** 이 현장을 지금 세우고 있는 것 */
  const blockers: Array<{ label: string; tone: string }> = [];
  if (project.holdState) {
    blockers.push({ label: `보류 — ${project.holdNote ?? project.holdState}`, tone: 'bg-slate-800 text-white' });
  }
  if (rejectedCount > 0) {
    blockers.push({ label: `반려 ${rejectedCount}건`, tone: 'bg-red-100 text-red-800' });
  }
  if (stage === 'intake' && blocked) {
    blockers.push({ label: '필수 서류 미충족', tone: 'bg-amber-100 text-amber-900' });
  }
  // 단가 지정은 한백이 하는 일이다 — 협력사에게 보이면 무엇을 하라는 말인지 알 수 없다
  if (canReview && stage === 'intake' && !allPriced) {
    blockers.push({ label: '단가 미지정', tone: 'bg-amber-100 text-amber-900' });
  }
  if (stalledDays >= 14) {
    blockers.push({
      label: `${stalledDays}일째 그대로`,
      tone: stalledDays >= 30 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900',
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <Link href="/projects" className="text-xs font-semibold text-slate-400 hover:text-brand-700">
        ← 현장 목록
      </Link>

      {/*
        * 단계를 이름 위에 둔다. 오른쪽 끝에 있으면 이름을 읽고 눈을 옮겨야 보이는데,
        * 이 화면에서 가장 먼저 알아야 하는 것이 「지금 어느 칸에 있나」다.
        */}
      <div className="mt-2">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-[13px] font-black ${BAND_TONE[band]}`}
          title="보드에서 이 현장이 서는 칸"
        >
          {column}
        </span>
      </div>
      <h1 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-900">
        {project.name}
      </h1>
      {project.addr && <p className="mt-1 text-sm text-slate-500">{project.addr}</p>}

      {/* 이 현장이 무엇인가 — 계약의 뼈대만. 나머지는 계약 탭의 「현장 정보」에 있다. */}
      <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
        <Fact label="운영사" value={project.cpo} />
        <Fact label="대수" value={`${qty}대`} />
        <Fact label="계약연수" value={terms.length ? `${terms.join('·')}년` : null} />
        <Fact label="수전방식" value={project.powerType} />
        <Fact label="사업구분" value={project.bizType} />
        <Fact label="접수" value={project.createdAt} />
      </dl>

      {blockers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {blockers.map((b) => (
            <span key={b.label} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${b.tone}`}>
              {b.label}
            </span>
          ))}
        </div>
      )}

      {/*
        * 영업사·시공사는 머리말에 둔다.
        *
        * 이 값은 표시용이 아니라 접근 키다 — 협력사가 자기 현장을 보는 판정이 이 문자열의
        * 일치다. 계약 탭 안쪽에 있으면 탭을 옮겨야 보이는데, 「누구 현장인가」는 이름·주소와
        * 같은 급의 사실이라 늘 보여야 한다. 비어 있으면 비어 있다고 보인다.
        */}
      <div className="mt-4 grid gap-x-6 border-t border-slate-100 pt-2 sm:grid-cols-2">
        <OrgField
          label="영업사"
          field="salesOrg"
          value={project.salesOrg}
          projectId={project.id}
          canEdit={canReview}
          knownOrgs={knownOrgs}
        />
        <OrgField
          label="시공사"
          field="gcOrg"
          value={project.gcOrg}
          projectId={project.id}
          canEdit={canReview}
          knownOrgs={knownOrgs}
        />
        {/* 협력사가 자주 물어보는 값이라 머리말에 둔다 — 한백이 넣고 협력사는 본다 */}
        <QueueField value={project.envQueueNo} projectId={project.id} canEdit={canReview} />
      </div>

      <ProgressLog projectId={project.id} notes={detail.notes} author={noteAuthor} />

    </div>
  );
}

/** 띠별 색 — 보드의 띠 색과 맞춘다 */
const BAND_TONE: Record<BoardBand, string> = {
  계약: 'bg-sky-100 text-sky-900',
  시공: 'bg-brand-100 text-brand-900',
  멈춤: 'bg-slate-800 text-white',
};

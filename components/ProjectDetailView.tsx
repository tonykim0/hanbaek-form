'use client';

/**
 * 현장 상세 — 계약 · 시공 · 정산이 탭으로 들어간다.
 *
 * 머리말(SiteHeader)은 탭과 무관하게 항상 보인다. 탭으로 나누면 「지금 어디에 있고 무엇이
 * 막혀 있나」가 눈에서 사라지기 때문에, 어느 탭에 있든 단계·공 차례·걸림돌은 계속 보인다.
 *
 * 단계 이름은 보드와 같은 말을 쓴다(lib/board). 같은 현장을 두 이름으로 부르면 「계약보완인데
 * 여기서는 진행 중이라고 나온다」는 물음이 생긴다.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  PreInstall, ProjectDetail, ProjectDocument, ProjectNote, SettlementStep,
} from '@/types/project';
import { buildDocContext, evaluateDocs, isPartyInferred, PROCESS_DOCS, type DocReq } from '@/lib/doc-rules';
import { triggerSource, recoveryRate, turnkeyUnit, payInstallments } from '@/lib/settlement';
import { canEnter, statusIndex, STATUS_GATES } from '@/lib/process';
import { PROCESS_STATUSES } from '@/types/project';
import { bandOfColumn, boardColumnOf, type BoardBand } from '@/lib/board';
import type { Visibility } from '@/lib/roles';
import { DocDelete, DocFileActions, DocUpload, DownloadAll } from '@/components/DocFiles';
import type { RuleMatch } from '@/lib/pricing-match';

/** 라인 id → 그 라인에 붙일 수 있는 단가 케이스 */
export type RuleOptions = Record<string, RuleMatch>;

const won = (n: number) => n.toLocaleString('ko-KR');

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
              court={detail.court}
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

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[11px] font-bold tracking-[0.04em] text-slate-400">{label}</dt>
      <dd className="font-bold text-slate-800">{value}</dd>
    </div>
  );
}

// ── 계약 탭 ─────────────────────────────────────────────────────
/** 서류를 세 묶음으로 가른다 — 접수 화면(components/IntakeForm)과 같은 말·같은 색 */
const DOC_GROUPS: Array<{ req: DocReq; label: string; rule: string; note?: string }> = [
  { req: 'm', label: '필수', rule: 'bg-red-400' },
  { req: 'c', label: '조건부', rule: 'bg-amber-400', note: '해당되는 현장만' },
  { req: 'o', label: '선택', rule: 'bg-slate-300', note: '있으면 함께' },
];

function docState(doc: ProjectDocument | undefined, req: DocReq) {
  if (req === 'o') return { label: '해당없음', tone: 'text-slate-400' };
  if (!doc || doc.status === 'none') {
    return req === 'm'
      ? { label: '미제출', tone: 'text-red-700' }
      : { label: '미제출', tone: 'text-slate-400' };
  }
  if (doc.status === 'rejected') return { label: '반려', tone: 'text-red-700' };
  // 제출된 것은 통과로 본다 — 반려하지 않는 한 계약 완료를 막지 않는다
  if (doc.status === 'uploaded') return { label: '제출됨', tone: 'text-brand-700' };
  return { label: '확인함', tone: 'text-brand-700' };
}

/**
 * 현장 정보 — 접수 때 받은 값을 그대로 보여준다.
 *
 * 예전에는 이 화면 어디에도 없었다. 협력사가 접수 때 적은 건축물유형·주차면수·수전방식·
 * 담당자 연락처·비고가 저장은 되는데 볼 자리가 없어서, 확인하려면 계약서 PDF 를 다시 열어야 했다.
 *
 * 고치는 자리는 아니다 — 값이 틀렸으면 서류가 정본이고, 고치는 일은 따로 만든다.
 */
function SiteFacts({ project }: { project: ProjectDetail['project'] }) {
  /*
   * 두 묶음으로 가른다.
   *
   * ★아파트에 딸린 값과 계약에 딸린 값은 성질이 다르다.★ 건축물유형·주차면수·계약주체·
   * 현장 담당자는 그 아파트를 설명하고, 사업구분·수전방식·교체유형·대기번호는 이 계약을
   * 설명한다. 한 판에 열두 칸을 늘어놓으면 무엇을 보고 있는지 흐려진다.
   *
   * 기설치는 여기 없다 — 위 「기설치 조사」 구역이 정본이다. 두 곳에 적으면 갈린다.
   * 영업사·시공사도 여기 없다 — 머리말로 올렸다(진행현황 바로 위).
   */
  const apt: Array<[string, string | null]> = [
    ['건축물유형', project.bldgType],
    ['총 주차면수', project.parkTotal ? `${project.parkTotal}면` : null],
    ['계약주체', project.contractParty],
    ['현장 담당자', project.mgr],
    ['연락처', project.tel],
    ['이메일', project.mail],
  ];
  const biz: Array<[string, string | null]> = [
    ['현장관리번호', project.mgmtNo],
    ['사업구분', project.bizType],
    ['수전방식', project.powerType],
    ['교체유형', project.replType ?? (project.bizType ? '라인별로 다름' : null)],
    ['환경부 대기번호', project.envQueueNo],
    ['접수일', project.createdAt],
  ];

  return (
    <section>
      <h2 className="mb-3 text-h3 font-black text-slate-900">현장 정보</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <FactGroup title="아파트" rows={apt} />
        <FactGroup title="사업·계약" rows={biz} />
      </div>

      {project.note && (
        <p className="mt-3 rounded-box border border-slate-200 px-4 py-3 text-base leading-relaxed text-slate-700">
          <b className="mr-2 text-tiny font-bold text-slate-400">비고</b>
          {project.note}
        </p>
      )}
    </section>
  );
}

/** 현장 정보 한 묶음 — 값이 없는 칸도 자리를 지킨다. 비어 있는 것이 보이는 것도 정보다. */
function FactGroup({ title, rows }: { title: string; rows: Array<[string, string | null]> }) {
  return (
    <div className="rounded-box border border-slate-200">
      <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-tiny font-black tracking-[0.06em] text-slate-500">
        {title}
      </p>
      <dl>
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline gap-3 border-b border-slate-100 px-4 py-2 last:border-b-0"
          >
            <dt className="w-24 shrink-0 text-small font-bold text-slate-400">{label}</dt>
            <dd className={`min-w-0 break-keep text-base font-semibold ${value ? 'text-slate-800' : 'text-slate-300'}`}>
              {value ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function IntakeTab({
  project, evaluated, byKind, blocked, allPriced, projectId, siteName, court, canReview,
  feeMissing, partyInferred, inferredParty, knownOrgs,
}: {
  knownOrgs: string[];
  project: ProjectDetail['project'];
  evaluated: ReturnType<typeof evaluateDocs>;
  byKind: Map<string, ProjectDocument>;
  blocked: boolean;
  allPriced: boolean;
  projectId: string;
  siteName: string;
  court: ProjectDetail['court'];
  canReview: boolean;
  feeMissing: string[];
  partyInferred: boolean;
  inferredParty: string;
}) {
  const rejected = evaluated
    .map((d) => ({ key: d.key, label: d.label, doc: byKind.get(d.key) }))
    .filter((x) => x.doc?.status === 'rejected')
    .map((x) => ({ key: x.key, label: x.label, reason: x.doc!.rejectReason }));

  return (
    <div className="flex flex-col gap-7">
      <SiteFacts project={project} />

      <PreInstall
        project={project}
        docs={evaluated.filter((d) => d.preinstall)}
        byKind={byKind}
        siteName={siteName}
        canReview={canReview}
      />

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">서류</h2>
          <div className="flex flex-wrap items-center gap-3">
            <DownloadAll
              docs={evaluated.map((d) => byKind.get(d.key)).filter((d): d is ProjectDocument => Boolean(d))}
              siteName={siteName}
              labelOf={(kind) => evaluated.find((d) => d.key === kind)?.label ?? kind}
            />
          </div>
        </div>

        {rejected.length > 0 && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
            <p className="text-sm font-black text-red-900">
              반려된 서류 {rejected.length}건{canReview ? '' : ' — 다시 올려주세요'}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {rejected.map((d) => (
                <li key={d.key} className="text-xs leading-relaxed text-red-800">
                  <b className="font-bold">{d.label}</b>
                  {d.reason ? ` — ${d.reason}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {partyInferred && (
          <p className="mb-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
            계약주체가 비어 있어 건축물유형으로 <b>{inferredParty}</b>로 추정했습니다. 회의록 종류가
            이 추정에 따라 정해집니다.
          </p>
        )}

        {/*
          * 16칸을 한 판에 늘어놓지 않는다.
          *
          * 필수만 계약을 막는다. 한 그리드에 다 펴놓으면 무엇이 막고 있는지 배지를 하나씩
          * 읽어야 알 수 있어서, 막는 것과 아닌 것을 자리로 가른다 — 접수 화면과 같은 문법이다.
          */}
        <div className="flex flex-col gap-5">
          {DOC_GROUPS.map((g) => {
            // 기설치 서류는 위 「기설치 조사」 구역에서 다룬다
            const list = evaluated.filter((d) => d.req === g.req && !d.preinstall);
            if (list.length === 0) return null;
            const done = list.filter((d) => {
              const st = byKind.get(d.key)?.status;
              return st === 'uploaded' || st === 'approved';
            }).length;

            return (
              <div key={g.req}>
                <div className="mb-2 flex items-baseline gap-2">
                  <span aria-hidden className={`h-[3px] w-5 rounded-full ${g.rule}`} />
                  <h3 className="text-[11px] font-black tracking-[0.1em] text-slate-500">{g.label}</h3>
                  <span className="text-[11px] font-bold tabular-nums text-slate-400">
                    {done}/{list.length}
                  </span>
                  {g.note && <span className="text-[11px] text-slate-400">{g.note}</span>}
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((d) => {
                    const doc = byKind.get(d.key);
                    const st = docState(doc, d.req);
                    const rejected = doc?.status === 'rejected';
                    return (
                      <div
                        key={d.key}
                        className={`flex flex-col rounded-xl border border-l-[3px] p-3 ${
                          rejected
                            ? 'border-slate-200 border-l-red-500 bg-red-50/40'
                            : doc?.blobUrl || doc?.status === 'uploaded' || doc?.status === 'approved'
                              ? 'border-slate-200 border-l-brand-500 bg-white'
                              : d.req === 'm'
                                ? 'border-slate-200 border-l-red-300 bg-white'
                                : 'border-dashed border-slate-200 border-l-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="break-keep text-sm font-bold leading-snug text-slate-800">
                            {d.label}
                            {/* 확장자는 남긴다 — 무슨 형식으로 내야 하는지는 협력사가 알아야 한다 */}
                            {d.ext && (
                              <span className="ml-1.5 text-[10px] font-bold text-slate-400">{d.ext}</span>
                            )}
                          </p>
                          <span className={`shrink-0 text-[11px] font-black ${st.tone}`}>
                            {st.label}
                          </span>
                        </div>

                        {/*
                          * 올린 사람 이름은 적지 않는다 — 회사마다 계정이 하나라 이름이 늘 같다.
                          * 「영업비 조건」 배지도 달지 않는다 — 칸마다 붙어 있어도 할 일이 달라지지
                          * 않는다. 조건이 실제로 미달일 때만 아래 한 줄로 알린다(feeMissing).
                          */}
                        {doc?.uploadedAt && (
                          <p className="mt-1 text-[11px] text-slate-400">{doc.uploadedAt}</p>
                        )}

                        {doc?.rejectReason && (
                          <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] leading-snug text-red-800">
                            {doc.rejectReason}
                          </p>
                        )}

                        {/*
                          * 조작은 카드 아래에 모은다. 예전에는 미리보기·올리기·검수·삭제가
                          * 세로로 네 줄 쌓여서 카드마다 높이가 달랐다.
                          *
                          * 반려는 사유를 받아야 해서 한 줄을 통째로 쓴다 — 위 줄에 끼우면
                          * 사유 칸이 눌린다.
                          */}
                        <div className="mt-auto pt-2">
                          <div className="flex flex-wrap items-center gap-x-3">
                            {doc?.blobUrl && (
                              <DocFileActions doc={doc} siteName={siteName} label={d.label} />
                            )}
                            {d.req !== 'o' && (
                              <DocUpload
                                projectId={projectId}
                                kind={d.key}
                                rejected={rejected}
                                hasFile={Boolean(doc?.blobUrl)}
                              />
                            )}
                            {/* 삭제는 한백만. 협력사는 다시 올려서 덮는 길이 있다. */}
                            {canReview && doc && doc.status !== 'none' && (
                              <DocDelete
                                projectId={projectId}
                                kind={d.key}
                                label={d.label}
                                filename={doc.filename}
                              />
                            )}
                          </div>
                          {canReview && doc && doc.status !== 'none' && (
                            <DocReview projectId={projectId} kind={d.key} status={doc.status} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {feeMissing.length > 0 && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
            영업비 지급조건 미달 — {feeMissing.join(' · ')}
          </p>
        )}

        {canReview && (
          <CompleteIntake
            projectId={projectId}
            blocked={blocked}
            allPriced={allPriced}
            court={court}
          />
        )}
      </section>

    </div>
  );
}

/**
 * 계약 라인 · 단가 — 정산 탭 맨 위.
 *
 * 계약 탭에 있었는데 정산으로 옮겼다. 여기 적힌 금액이 아래 지급·기성의 뿌리이므로,
 * 그 금액을 보는 자리에서 가장 먼저 보여야 한다.
 *
 * 읽는 자리다. 케이스를 고르는 것은 아래 「지급」에서 한다 — 고르는 자리를 두 곳에 두면
 * 어느 쪽이 정본인지 알 수 없게 된다.
 */
function ContractLines({ lines, vis }: { lines: ProjectDetail['lines']; vis: Visibility }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-black tracking-[-0.02em] text-slate-900">계약 라인 · 단가</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left">라인</th>
              <th className="px-4 py-2.5 text-left">적용 단가 케이스</th>
              <th className="px-4 py-2.5 text-right">영업비/대</th>
              <th className="px-4 py-2.5 text-right">시공비/대</th>
              {vis.cost && <th className="px-4 py-2.5 text-right">턴키/대</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-800">
                  {l.termYears}년 × {l.qty}대
                  {l.powerType && (
                    <span className="ml-1.5 text-[11px] font-semibold text-slate-400">
                      {l.powerType}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {l.rule ? (
                    <>
                      {l.rule.caseName}
                      <span className="ml-1.5 text-[11px] text-slate-400">
                        {l.pricedAt} 확정
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400">미지정 — 아래 「지급」에서 고릅니다</span>
                  )}
                </td>
                <Money show={vis.sales} value={l.rule?.salesUnit ?? null} />
                <Money show={vis.cons} value={l.rule?.consUnit ?? null} />
                {vis.cost && <Money show value={l.rule ? turnkeyUnit(l.rule) : null} />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Money({ show, value }: { show: boolean; value: number | null }) {
  if (!show) {
    return (
      <td className="px-4 py-3 text-right">
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
          권한 없음
        </span>
      </td>
    );
  }
  return (
    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
      {value === null ? <span className="text-slate-300">—</span> : won(value)}
    </td>
  );
}

// ── 검수 조작 (한백 전용) ─────────────────────────────────────────
/**
 * 서류 하나의 승인·반려.
 *
 * 반려는 사유를 받는다 — 사유 없이 반려하면 협력사가 무엇을 고쳐야 할지 알 수 없다.
 * 서버에서도 같은 검사를 한다(422). 여기서 막는 것은 왕복을 줄이기 위한 것이고,
 * 최종 판정은 서버가 한다.
 */
function DocReview({
  projectId,
  kind,
  status,
}: {
  projectId: string;
  kind: string;
  status: ProjectDocument['status'];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function send(next: 'approved' | 'rejected' | 'uploaded', why?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${kind}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, reason: why ?? null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? '처리에 실패했습니다.');
        return;
      }
      setRejecting(false);
      setReason('');
      // 서버 컴포넌트를 다시 렌더해 단계·정체일·공 차례까지 함께 갱신한다
      router.refresh();
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  if (rejecting) {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          placeholder="반려 사유 — 협력사가 이 문장을 보고 고칩니다"
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[11px] leading-snug focus:border-brand-500 focus:outline-none"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() => send('rejected', reason)}
            className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
          >
            {busy ? '처리 중' : '반려 확정'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setRejecting(false); setReason(''); setError(null); }}
            className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-600"
          >
            취소
          </button>
        </div>
        {error && <p className="text-[11px] font-semibold text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex gap-1.5">
        {/*
          승인 버튼은 없다. 제출된 서류는 기본이 통과라서 누를 일이 없다 —
          한백이 하는 일은 문제 있는 것을 골라내는 것뿐이다.
        */}
        {status === 'rejected' ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => send('uploaded')}
              className="rounded-lg bg-brand-700 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-brand-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              반려 해제
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(true)}
              className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-700 transition hover:bg-red-50 disabled:text-slate-400"
            >
              사유 수정
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejecting(true)}
            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-700 transition hover:bg-red-50 disabled:text-slate-400"
          >
            반려
          </button>
        )}
      </div>
      {error && <p className="text-[11px] font-semibold text-red-700">{error}</p>}
    </div>
  );
}

/**
 * 계약 완료 — 공을 시공사로 넘긴다.
 *
 * 단계(stage)를 여기서 저장하지 않는다. 단계는 서류·단가에서 유도되므로,
 * 조건이 채워지면 이 버튼을 누르지 않아도 이미 시공 단계다.
 * 이 버튼이 바꾸는 것은 「지금 누가 손을 대야 하는가」뿐이다.
 */
function CompleteIntake({
  projectId,
  blocked,
  allPriced,
  court,
}: {
  projectId: string;
  blocked: boolean;
  allPriced: boolean;
  court: ProjectDetail['court'];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = blocked
    ? '필수 서류 미충족'
    : !allPriced
      ? '단가 미지정'
      : null;

  async function handOff() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/court`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ court: '시공사' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? '처리에 실패했습니다.');
        return;
      }
      router.refresh();
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <button
        type="button"
        disabled={busy || reason !== null || court === '시공사'}
        onClick={handOff}
        className="self-start rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        {/*
          미충족 사유를 공 차례보다 먼저 보여준다.
          넘긴 뒤에 서류가 반려되는 일이 있는데, 그때 「시공사로 넘어간 상태」만 보이면
          지금 뭐가 문제인지가 화면에서 사라진다.
        */}
        {reason
          ? `${reason} — 계약 완료 불가`
          : court === '시공사'
            ? '시공사로 넘어간 상태'
            : busy
              ? '처리 중'
              : '계약 완료 — 시공사로 넘기기'}
      </button>
      {reason === '단가 미지정' && (
        <p className="text-xs text-slate-500">
          서류는 모두 승인됐습니다. 계약 라인에 단가 케이스를 지정하면 넘길 수 있습니다.
        </p>
      )}
      {reason && court === '시공사' && (
        <p className="text-xs text-amber-700">
          이미 시공사로 넘긴 현장인데 조건이 다시 깨졌습니다 — 공을 되돌릴지 확인하세요.
        </p>
      )}
      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}

// ── 시공 탭 ─────────────────────────────────────────────────────
/**
 * 시공 진행현황 8단계.
 *
 * 지나온 단계·현재·앞으로를 한 줄로 보여주고, 다음 단계로 넘어가는 데 필요한 것을 함께 적는다.
 * 조건을 화면에 적어두지 않으면 「왜 안 넘어가지」를 매번 사람에게 물어야 한다.
 */
function StatusFlow({ process }: { process: ProjectDetail['process'] }) {
  const now = statusIndex(process.status);

  return (
    <section>
      <h2 className="mb-3 text-base font-black tracking-[-0.02em] text-slate-900">진행현황</h2>
      <ol className="flex flex-wrap gap-1.5">
        {PROCESS_STATUSES.map((st, i) => {
          const gate = STATUS_GATES[st];
          const entry = canEnter(st, process);
          const past = i < now;
          const current = i === now;
          return (
            <li key={st} className="flex items-center gap-1.5">
              <div
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${
                  current
                    ? 'bg-brand-700 text-white'
                    : past
                      ? 'bg-brand-50 text-brand-800'
                      : 'bg-slate-100 text-slate-400'
                }`}
                title={gate ? `조건: ${gate.need}` : undefined}
              >
                {st}
                {gate && !entry.ok && !past && !current && (
                  <span className="ml-1 text-slate-400">🔒</span>
                )}
              </div>
              {i < PROCESS_STATUSES.length - 1 && (
                <span aria-hidden className="text-slate-300">›</span>
              )}
            </li>
          );
        })}
      </ol>

      <ul className="mt-3 flex flex-col gap-1 text-xs text-slate-500">
        {PROCESS_STATUSES.filter((st) => STATUS_GATES[st] && statusIndex(st) > now).map((st) => {
          const entry = canEnter(st, process);
          return (
            <li key={st} className="flex gap-2">
              <span className={entry.ok ? 'text-brand-700' : 'text-slate-400'}>
                {entry.ok ? '준비됨' : '대기'}
              </span>
              <span>
                <b className="font-bold text-slate-700">{st}</b> — {STATUS_GATES[st]!.need}
                {entry.ok ? ' 확인됨' : ' 필요'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 고칠 수 있는 날짜 칸 — 이름은 서버(ProcessPatch)와 같아야 한다 */
type DateField =
  | 'envApprovalDate' | 'cpoApprovalDate' | 'chargerOrderDate' | 'chargerRecvDate'
  | 'startPlanDate' | 'startActualDate' | 'installDoneDate' | 'commDoneDate';

function ConstructionTab({ detail, canEdit }: { detail: ProjectDetail; canEdit: boolean }) {
  const router = useRouter();
  const p = detail.process;
  const [busy, setBusy] = useState<DateField | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveDate(field: DateField, value: string) {
    setBusy(field);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${detail.project.id}/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // 빈 칸은 「지운다」는 뜻이다. 잘못 적은 날짜를 되돌릴 길이 있어야 한다.
        body: JSON.stringify({ [field]: value === '' ? null : value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? '저장하지 못했습니다.');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const milestones: Array<{
    label: string;
    field: DateField;
    value: string | null;
    trigger?: string;
    /** 이 날짜가 무엇을 여는지 — 왜 적어야 하는지 알려준다 */
    opens?: string;
  }> = [
    { label: '환경부 승인일', field: 'envApprovalDate', value: p.envApprovalDate, trigger: '환경부 승인' },
    {
      label: '운영사 시공승인일', field: 'cpoApprovalDate', value: p.cpoApprovalDate,
      trigger: '시공진행필요', opens: '시공진행필요',
    },
    { label: '충전기 발주일', field: 'chargerOrderDate', value: p.chargerOrderDate },
    { label: '충전기 수령일', field: 'chargerRecvDate', value: p.chargerRecvDate },
    { label: '착공예정일', field: 'startPlanDate', value: p.startPlanDate },
    { label: '실착공일', field: 'startActualDate', value: p.startActualDate, trigger: '착공' },
    { label: '설치완료일', field: 'installDoneDate', value: p.installDoneDate },
    { label: '통신완료일', field: 'commDoneDate', value: p.commDoneDate },
  ];

  return (
    <div className="flex flex-col gap-7">
      <StatusFlow process={p} />

      {error && (
        <p
          role="alert"
          className="rounded-xl border-l-[3px] border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">마일스톤</h2>
          {canEdit && (
            <p className="text-[11px] text-slate-400">
              날짜를 넣으면 조건이 열립니다. 단계는 보드나 표에서 옮깁니다.
            </p>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">
          {milestones.map((m) => (
            <div key={m.field} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-32 shrink-0 text-slate-500">{m.label}</span>
              {canEdit ? (
                <input
                  type="date"
                  aria-label={m.label}
                  defaultValue={m.value ?? ''}
                  disabled={busy === m.field}
                  onChange={(e) => void saveDate(m.field, e.target.value)}
                  className={`w-[150px] rounded-lg border px-2 py-1 font-semibold tabular-nums transition focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                    m.value
                      ? 'border-slate-200 text-slate-800'
                      : 'border-dashed border-slate-300 text-slate-400'
                  } ${busy === m.field ? 'opacity-50' : 'hover:border-brand-300'}`}
                />
              ) : (
                <span
                  className={`w-[150px] font-semibold tabular-nums ${m.value ? 'text-slate-800' : 'text-slate-300'}`}
                >
                  {m.value ?? '비어 있음'}
                </span>
              )}
              <span className="flex-1" />
              {m.opens && !m.value && (
                <span className="text-[11px] font-semibold text-slate-400">
                  넣으면 {m.opens} 로 넘길 수 있습니다
                </span>
              )}
              {m.trigger && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    m.value ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {m.trigger} 트리거
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">공정 서류</h2>
          <DownloadAll
            docs={p.docs}
            siteName={detail.project.name}
            labelOf={(kind) => PROCESS_DOCS.find((x) => x.key === kind)?.name ?? kind}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS_DOCS.map((d) => {
            const doc = p.docs.find((x) => x.kind === d.key);
            /*
             * 「제출됨」이 통과다. 승인 도장을 기다리지 않는다 —
             * 공정 게이트(lib/process.ts)도 uploaded 를 통과로 보므로 표시를 그와 맞춘다.
             * 여기서 approved 만 통과로 그리면 올렸는데 대기로 보이고, 왜 넘어가는지 알 수 없다.
             */
            const done = doc?.status === 'uploaded' || doc?.status === 'approved';
            return (
              <div
                key={d.key}
                className={`rounded-xl border p-3 ${done ? 'border-brand-200 bg-brand-50/60' : 'border-slate-200 bg-white'}`}
              >
                <p className="text-sm font-bold text-slate-800">{d.name}</p>
                <p className={`mt-1 text-[11px] font-black ${done ? 'text-brand-700' : 'text-slate-400'}`}>
                  {done ? '제출됨' : '대기'}
                </p>
                {doc?.uploadedAt && (
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {doc.uploadedAt}
                  </p>
                )}
                {doc && (
                  <DocFileActions doc={doc} siteName={detail.project.name} label={d.name} />
                )}
                <DocUpload
                  projectId={detail.project.id}
                  kind={d.key}
                  rejected={false}
                  hasFile={Boolean(doc?.blobUrl)}
                />
                {canEdit && doc && doc.status !== 'none' && (
                  <DocDelete
                    projectId={detail.project.id}
                    kind={d.key}
                    label={d.name}
                    filename={doc.filename}
                  />
                )}
              </div>
            );
          })}
        </div>
        {p.memo && (
          <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">{p.memo}</p>
        )}
      </section>

      <p className="rounded-xl border-l-[3px] border-brand-500 bg-brand-50/50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        진행 단계(계약완료 → 시공진행필요 → 설치완료 → 준공서류 접수/검토 → 준공보완 → 준공)는
        노션 공정 마스터에 없습니다. 거기엔 메모 필드뿐이라, 이 축은 옮겨오는 게 아니라 이 앱이
        새로 세웁니다.
      </p>
    </div>
  );
}

// ── 정산 탭 ─────────────────────────────────────────────────────
const STEP_STYLE: Record<SettlementStep['state'], string> = {
  na: 'border-l-slate-200 bg-white',
  waiting: 'border-l-slate-300 bg-white',
  open: 'border-l-amber-500 bg-amber-50/70',
  collected: 'border-l-brand-500 bg-brand-50/60',
};
const STEP_LABEL: Record<SettlementStep['state'], string> = {
  na: '해당없음',
  waiting: '트리거 대기',
  open: '청구 가능',
  collected: '회수 완료',
};

function SettlementTab({
  detail, vis, canReview, ruleOptions,
}: {
  detail: ProjectDetail;
  vis: Visibility;
  canReview: boolean;
  ruleOptions: RuleOptions | null;
}) {
  const { settlement, lines } = detail;
  const rate = recoveryRate(settlement.steps);

  return (
    <div className="flex flex-col gap-7">
      {/* 금액의 뿌리가 여기다 — 지급·기성보다 먼저 본다 */}
      <ContractLines lines={lines} vis={vis} />

      <PaymentSection
        projectId={detail.project.id}
        lines={lines}
        settlement={settlement}
        vis={vis}
        canReview={canReview}
        ruleOptions={ruleOptions}
      />

      {/*
        * 기성은 한백만 본다 — 운영사에게서 받는 돈이라 협력사가 볼 자리가 아니다.
        * 예전에는 구역을 그려놓고 「한백 관리자만 볼 수 있습니다」로 막았는데,
        * 볼 수 없는 것을 자리까지 만들어 보여줄 이유가 없다.
        */}
      {vis.cost && (
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">기성</h2>
            <div className="flex flex-wrap items-baseline gap-3">
              {rate !== null && (
                <span className="text-xs font-bold text-slate-500">
                  회수율 <span className="tabular-nums text-slate-800">{rate}%</span>
                </span>
              )}
              <span className="text-xs font-bold text-slate-500">
                준공마감{' '}
                {settlement.cpoCloseDate ? (
                  <span className="tabular-nums text-slate-800">{settlement.cpoCloseDate}</span>
                ) : (
                  <span className="text-amber-700">통보 없음</span>
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {settlement.steps.map((s) => (
              <div
                key={s.no}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 border-l-[3px] px-4 py-3 ${STEP_STYLE[s.state]}`}
              >
                <span className="w-10 shrink-0 text-xs font-bold text-slate-400">{s.no}차</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800">
                    {s.trigger === '해당없음' ? '해당없음' : `${s.trigger} · ${s.basisLabel}`}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {s.state === 'na' ? '해당 차수 없음' : triggerSource(s.trigger)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    s.state === 'open'
                      ? 'bg-amber-200 text-amber-900'
                      : s.state === 'collected'
                        ? 'bg-brand-200 text-brand-900'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {STEP_LABEL[s.state]}
                </span>
                <span className="w-28 shrink-0 text-right text-sm font-black tabular-nums text-slate-800">
                  {s.planAmount === null ? <span className="text-slate-300">—</span> : won(s.planAmount)}
                </span>
              </div>
            ))}
          </div>

          {!detail.settlementRule && (
            <p className="mt-3 rounded-xl border-l-[3px] border-amber-500 bg-amber-50/60 px-4 py-2.5 text-xs font-semibold text-amber-900">
              정산 규칙 미적용 — 기성 단계와 금액이 계산되지 않습니다
            </p>
          )}
        </section>
      )}
    </div>
  );
}

// ── 지급 ────────────────────────────────────────────────────────
/**
 * 지급 — 한백이 협력사에게 주는 돈.
 *
 * 금액을 사람이 적지 않는다. 계약 라인에 단가 케이스를 붙이면 영업비·시공비가 정해지고,
 * 여기에 대수와 회차 비율(70:30)을 곱해 나온다. 손으로 적게 두면 매트릭스와 어긋난 금액이
 * 남고, 나중에 어느 쪽이 맞는지 판단할 근거가 없어진다.
 *
 * 사람이 정하는 것은 셋뿐이다 — 어느 케이스인가 · 언제 줬는가 · 무슨 사정이 있었는가.
 */
function PaymentSection({
  projectId, lines, settlement, vis, canReview, ruleOptions,
}: {
  projectId: string;
  lines: ProjectDetail['lines'];
  settlement: ProjectDetail['settlement'];
  vis: Visibility;
  canReview: boolean;
  ruleOptions: RuleOptions | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [dates, setDates] = useState({
    salesPay1Date: settlement.salesPay1Date ?? '',
    salesPay2Date: settlement.salesPay2Date ?? '',
    consPay1Date: settlement.consPay1Date ?? '',
    consPay2Date: settlement.consPay2Date ?? '',
  });
  const [note, setNote] = useState(settlement.payNote ?? '');

  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const salesTotal = lines.reduce((s, l) => s + (l.rule?.salesUnit ?? 0) * l.qty, 0);
  const consTotal = lines.reduce((s, l) => s + (l.rule?.consUnit ?? 0) * l.qty, 0);
  const unpriced = lines.filter((l) => !l.rule).length;

  const dirty =
    note !== (settlement.payNote ?? '')
    || (Object.keys(dates) as Array<keyof typeof dates>).some(
      (k) => dates[k] !== (settlement[k] ?? '')
    );

  async function pickRule(lineId: string, ruleId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricingRuleId: ruleId || null }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? '단가 지정에 실패했습니다.');
        return;
      }
      router.refresh();
    } catch {
      setError('네트워크 오류입니다.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dates, payNote: note }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? '저장에 실패했습니다.');
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('네트워크 오류입니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">지급</h2>
        <span className="text-xs text-slate-400">계약 {totalQty}대 기준</span>
      </div>

      {/* 적용 단가 — 여기서 고른 케이스가 아래 금액을 정한다 */}
      {canReview && ruleOptions && (
        <div className="mb-4 flex flex-col gap-2">
          {lines.map((l) => {
            const opts = ruleOptions[l.id];
            const list = opts ? [...opts.exact, ...opts.others] : [];
            return (
              <div key={l.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-bold text-slate-800">
                    {l.termYears}년 × {l.qty}대
                  </span>
                  {l.powerType && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                      {l.powerType}
                    </span>
                  )}
                  {opts && (
                    <span className="text-[11px] text-slate-400">
                      {opts.usedAxes.join(' · ')}(으)로 후보 {opts.exact.length}건
                    </span>
                  )}
                </div>

                <select
                  value={l.pricingRuleId ?? ''}
                  disabled={busy}
                  onChange={(e) => pickRule(l.id, e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-slate-50"
                >
                  <option value="">단가 케이스 선택 —</option>
                  {opts && opts.exact.length > 0 && (
                    <optgroup label="조건이 맞는 케이스">
                      {opts.exact.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.caseName} · 영업 {won(r.salesUnit)} / 시공 {won(r.consUnit)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {opts && opts.others.length > 0 && (
                    <optgroup label="같은 운영사의 다른 케이스">
                      {opts.others.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.caseName} · 영업 {won(r.salesUnit)} / 시공 {won(r.consUnit)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {(() => {
                  const turnkey = l.rule ? turnkeyUnit(l.rule) : null;
                  if (turnkey === null) return null;
                  return (
                    <p className="mt-1.5 text-xs tabular-nums text-slate-500">
                      턴키 {won(turnkey)}/대 · 이 라인 {won(turnkey * l.qty)}
                    </p>
                  );
                })()}
                {list.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    이 운영사의 단가 케이스가 없습니다 — 매트릭스를 확인해주세요.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unpriced > 0 && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
          단가 미지정 라인 {unpriced}건 — 지급액이 계산되지 않습니다.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-left">항목</th>
              <th className="px-4 py-2.5 text-left">비율</th>
              <th className="px-4 py-2.5 text-right">금액</th>
              <th className="px-4 py-2.5 text-right">지급일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <PayRow show={vis.sales} label="영업비 1차" ratio="70%" amount={payInstallments(salesTotal)[0]}
              date={dates.salesPay1Date} editable={canReview} busy={busy}
              onChange={(v) => setDates((d) => ({ ...d, salesPay1Date: v }))} />
            <PayRow show={vis.sales} label="영업비 2차" ratio="30%" amount={payInstallments(salesTotal)[1]}
              date={dates.salesPay2Date} editable={canReview} busy={busy}
              onChange={(v) => setDates((d) => ({ ...d, salesPay2Date: v }))} />
            <PayRow show={vis.cons} label="시공비 1차" ratio="70%" amount={payInstallments(consTotal)[0]}
              date={dates.consPay1Date} editable={canReview} busy={busy}
              onChange={(v) => setDates((d) => ({ ...d, consPay1Date: v }))} />
            <PayRow show={vis.cons} label="시공비 2차" ratio="30%" amount={payInstallments(consTotal)[1]}
              date={dates.consPay2Date} editable={canReview} busy={busy}
              onChange={(v) => setDates((d) => ({ ...d, consPay2Date: v }))} />
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <label htmlFor="payNote" className="text-xs font-bold text-slate-500">비고</label>
        {canReview ? (
          <textarea
            id="payNote"
            value={note}
            rows={2}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder="감액·보류 사유 등 금액만으로 설명되지 않는 것"
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm leading-relaxed focus:border-brand-500 focus:outline-none disabled:bg-slate-50"
          />
        ) : (
          <p className="mt-1 text-sm text-slate-600">
            {settlement.payNote || <span className="text-slate-300">없음</span>}
          </p>
        )}
      </div>

      {canReview && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={save}
            className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {busy ? '저장 중' : dirty ? '지급일·비고 저장' : '변경 없음'}
          </button>
          {saved && !dirty && <span className="text-xs font-bold text-brand-700">저장됨</span>}
          {error && <span className="text-xs font-semibold text-red-700">{error}</span>}
        </div>
      )}
    </section>
  );
}

function PayRow({
  show, label, ratio, amount, date, editable, busy, onChange,
}: {
  show: boolean;
  label: string;
  ratio: string;
  amount: number;
  date: string;
  editable: boolean;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-800">{label}</td>
      <td className="px-4 py-3 text-slate-500">{ratio}</td>
      {show ? (
        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
          {amount > 0 ? won(Math.round(amount)) : <span className="text-slate-300">단가 미지정</span>}
        </td>
      ) : (
        <td className="px-4 py-3 text-right">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
            권한 없음
          </span>
        </td>
      )}
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-500">
        {editable ? (
          <input
            type="date"
            value={date}
            disabled={busy}
            aria-label={`${label} 지급일`}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm tabular-nums focus:border-brand-500 focus:outline-none disabled:bg-slate-50"
          />
        ) : (
          date || <span className="text-slate-300">—</span>
        )}
      </td>
    </tr>
  );
}

/**
 * 진행현황 — 한백과 협력사가 이 현장의 특이사항을 남기는 자리.
 *
 * ★어느 칸에도 안 들어가는 사정이 여기 온다.★ 관리사무소가 공사를 미뤘다, 한전 불입이
 * 지연됐다, 운영사 승인이 늦다 — 날짜 칸이나 서류 칸으로는 적을 수 없고, 그렇다고
 * 전화로만 오가면 다음 사람이 알 수 없는 것들이다.
 *
 * 감사로그와 다르다. 감사로그는 「무슨 값이 무엇으로 바뀌었나」를 기계가 남기고,
 * 여기는 「무슨 일이 있었나」를 사람이 남긴다.
 *
 * 자기가 쓴 것은 고칠 수 있다(고친 흔적이 남는다). 남의 글은 못 고치고, 지우는 길은 없다.
 * 사람 이름은 안 적는다 — 회사마다 계정이 하나라 이름이 늘 같다. 대신 어느 쪽이 썼는지 남긴다.
 */
function ProgressLog({
  projectId, notes, author,
}: {
  projectId: string;
  notes: ProjectNote[];
  /** 지금 남기면 붙을 이름 — 서버가 적는 값과 같다 */
  author: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHanbaek = author === '한백';

  async function save() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? '남기지 못했습니다.');
        return;
      }
      setBody('');
      router.refresh();
    } catch {
      setError('네트워크 오류입니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-sm font-black tracking-[-0.01em] text-slate-900">진행현황 및 메모</h2>
        <span className="text-[11px] font-bold tabular-nums text-slate-400">{notes.length}건</span>
      </div>

      {/*
        * 입력칸을 늘 펴 둔다. 「특이사항 남기기」 버튼을 한 번 눌러야 칸이 나오게 했더니,
        * 적을 자리가 있다는 것 자체가 안 보였다 — 적게 만들려면 칸이 먼저 있어야 한다.
        */}
      <div className="rounded-xl border border-slate-200 bg-white p-2.5">
        {/* 조사(「~으로/로」)를 피해 앞에 붙인다 — 회사 이름 끝 글자에 따라 조사가 갈린다 */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400">작성자</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
              isHanbaek ? 'bg-slate-900 text-white' : 'bg-brand-600 text-white'
            }`}
          >
            {author}
          </span>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="예) 관리사무소 요청으로 착공 2주 연기 — 3월 첫째 주 재협의"
          className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            disabled={busy || !body.trim()}
            onClick={save}
            className="rounded-lg bg-brand-700 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {busy ? '남기는 중…' : '남기기'}
          </button>
          {error && <span className="text-[11px] font-semibold text-red-700">{error}</span>}
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="mt-3 text-center text-[12px] text-slate-400">아직 남긴 것이 없습니다</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {notes.map((n) => (
            <NoteItem key={n.id} projectId={projectId} note={n} author={author} />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * 진행현황 한 줄.
 *
 * 누가 남겼는지가 내용보다 먼저 읽혀야 한다 — 같은 현장에서 한백과 협력사가 번갈아 적으므로
 * 이름표만으로는 훑을 때 구분되지 않는다. 왼쪽 색 띠로 가른다(한백 검정 · 협력사 초록).
 *
 * 자기가 쓴 것만 고칠 수 있다. 고치면 「수정됨」이 붙는다 — 조용히 바뀌면 옛 내용을 기억하는
 * 사람이 무엇이 맞는지 알 수 없다.
 */
function NoteItem({
  projectId, note, author,
}: {
  projectId: string;
  note: ProjectNote;
  /** 보고 있는 쪽의 이름 — 이것과 같으면 자기 글이다 */
  author: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byHanbaek = note.author === '한백';
  const mine = note.author === author;

  async function save() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: note.id, body }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? '고치지 못했습니다.');
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError('네트워크 오류입니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`rounded-lg border border-l-[3px] bg-white px-3 py-2 ${
        byHanbaek ? 'border-slate-200 border-l-slate-800' : 'border-slate-200 border-l-brand-500'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
            byHanbaek ? 'bg-slate-900 text-white' : 'bg-brand-100 text-brand-900'
          }`}
        >
          {note.author}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{note.at}</span>
        {note.editedAt && (
          <span className="shrink-0 text-[11px] text-slate-400" title={`${note.editedAt} 에 고침`}>
            수정됨
          </span>
        )}
        <span className="flex-1" />
        {mine && !editing && (
          <button
            type="button"
            onClick={() => { setBody(note.body); setEditing(true); }}
            className="shrink-0 text-[11px] font-bold text-slate-400 underline decoration-slate-300 transition hover:text-brand-800"
          >
            수정
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            autoFocus
            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[13px] leading-relaxed text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy || !body.trim()}
              onClick={save}
              className="rounded-lg bg-brand-700 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400"
            >
              {busy ? '고치는 중…' : '저장'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setEditing(false); setBody(note.body); setError(null); }}
              className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 transition hover:text-slate-600"
            >
              취소
            </button>
            {error && <span className="text-[11px] font-semibold text-red-700">{error}</span>}
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap break-keep text-[13px] leading-relaxed text-slate-700">
          {note.body}
        </p>
      )}
    </li>
  );
}

/**
 * 영업사·시공사 한 칸.
 *
 * ★고칠 수 있어야 하는 이유★
 * 한백이 계정 없는 업체의 건을 대신 접수할 때 이 이름을 손으로 적는다. 그런데 이 문자열은
 * 협력사가 자기 현장을 보는 판정에 그대로 쓰이므로(문자열 일치), 오타 하나면 그 업체에게
 * 그 현장이 영구히 안 보인다. 고치는 자리가 없으면 DB 를 직접 만지는 수밖에 없다.
 *
 * 이미 쓰이는 이름을 눌러 넣게 한다 — 손으로 적으면 「에코일렉」과 「에코일렉 」이 갈린다.
 */
function OrgField({
  label, field, value, projectId, canEdit, knownOrgs,
}: {
  label: string;
  field: 'salesOrg' | 'gcOrg';
  value: string | null;
  projectId: string;
  canEdit: boolean;
  knownOrgs: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/orgs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next.trim() === '' ? null : next }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? '고치지 못했습니다.');
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError('네트워크 오류입니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
      <dt className="w-24 shrink-0 text-small font-bold text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-col gap-1.5 pb-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              placeholder="비우면 어느 업체도 아닌 현장"
              className="w-full rounded-ctl border border-slate-200 px-2.5 py-1.5 text-base text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            {knownOrgs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {knownOrgs.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setDraft(o)}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-micro font-bold text-slate-500 transition hover:border-brand-300 hover:text-brand-800"
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(draft)}
                className="rounded-ctl bg-brand-700 px-3 py-1 text-tiny font-bold text-white transition hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400"
              >
                {busy ? '고치는 중…' : '저장'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setEditing(false); setDraft(value ?? ''); setError(null); }}
                className="rounded-ctl px-2 py-1 text-tiny font-bold text-slate-400 transition hover:text-slate-600"
              >
                취소
              </button>
              {error && <span className="text-tiny font-semibold text-red-700">{error}</span>}
            </div>
          </div>
        ) : (
          <span className="flex flex-wrap items-baseline gap-2">
            <span className={value ? 'font-semibold text-slate-800' : 'font-semibold text-amber-700'}>
              {value ?? '미지정'}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => { setDraft(value ?? ''); setEditing(true); }}
                className="text-tiny font-bold text-slate-400 underline decoration-slate-300 transition hover:text-brand-800"
              >
                {value ? '고치기' : '지정'}
              </button>
            )}
          </span>
        )}
      </dd>
    </div>
  );
}

/**
 * 기설치 조사.
 *
 * ★서류 목록에서 빼내 자기 구역으로 옮겼다.★
 * 환경부 사업은 현장마다 기설치 충전기를 조사해야 하는데, 그 증빙이 서류 열여섯 칸 사이에
 * 섞여 있으면 「이 현장은 조사가 됐나」를 알 수 없다. 조사 여부·알아낸 것·증빙을 한자리에 둔다.
 *
 * ★'없음' 과 「아직 안 봤음」을 가른다.★ 접수 기본값이 '없음' 이라, 확인 표시가 없으면
 * 조사를 안 한 것으로 본다 — 노션의 「기설치 확인여부」와 같은 자리다.
 *
 * 조사는 현장에 가는 쪽(협력사)이 하고 한백이 확인한다. 그래서 양쪽이 쓴다.
 */
function PreInstall({
  project, docs, byKind, siteName, canReview,
}: {
  project: ProjectDetail['project'];
  docs: ReturnType<typeof evaluateDocs>;
  byKind: Map<string, ProjectDocument>;
  siteName: string;
  canReview: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(project.preNote ?? '');
  const [editing, setEditing] = useState(false);

  const STATES: PreInstall[] = ['없음', '있음'];

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/preinstall`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? '저장하지 못했습니다.');
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError('네트워크 오류입니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-h3 font-black text-slate-900">기설치 조사</h2>
        {project.preChecked ? (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-tiny font-bold text-brand-900">
            조사함
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-tiny font-bold text-amber-900">
            조사 필요
          </span>
        )}
      </div>

      <div className="rounded-box border border-slate-200">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3">
          <span className="text-small font-bold text-slate-400">기설치</span>
          <div className="flex gap-1">
            {STATES.map((v) => (
              <button
                key={v}
                type="button"
                disabled={busy}
                onClick={() => void save({ preInstall: v, preChecked: true })}
                className={`rounded-ctl border px-2.5 py-1 text-tiny font-bold transition ${
                  project.preInstall === v
                    ? 'border-brand-500 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          {project.preChecked && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ preChecked: false })}
              className="text-tiny font-bold text-slate-400 underline decoration-slate-300 transition hover:text-slate-700"
            >
              조사 표시 풀기
            </button>
          )}
        </div>

        <div className="border-b border-slate-100 px-4 py-3">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-small font-bold text-slate-400">현황 조사</span>
            {!editing && (
              <button
                type="button"
                onClick={() => { setNote(project.preNote ?? ''); setEditing(true); }}
                className="text-tiny font-bold text-slate-400 underline decoration-slate-300 transition hover:text-brand-800"
              >
                {project.preNote ? '고치기' : '적기'}
              </button>
            )}
          </div>
          {editing ? (
            <div className="flex flex-col gap-1.5">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                autoFocus
                placeholder="예) 지하 2층에 A사 완속 2기 (2023년 설치) — 계약 만료 미확인"
                className="w-full rounded-ctl border border-slate-200 px-3 py-2 text-base text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save({ preNote: note, preChecked: true })}
                  className="rounded-ctl bg-brand-700 px-3 py-1 text-tiny font-bold text-white transition hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {busy ? '저장 중…' : '저장'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setEditing(false); setNote(project.preNote ?? ''); setError(null); }}
                  className="rounded-ctl px-2 py-1 text-tiny font-bold text-slate-400 transition hover:text-slate-600"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className={`whitespace-pre-wrap break-keep text-base leading-relaxed ${project.preNote ? 'text-slate-700' : 'text-slate-300'}`}>
              {project.preNote ?? '아직 적힌 것이 없습니다'}
            </p>
          )}
        </div>

        {/* 증빙 — 서류 목록에 있던 두 칸을 여기로 옮겼다 */}
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          {docs.map((d) => {
            const doc = byKind.get(d.key);
            const st = docState(doc, d.req);
            return (
              <div key={d.key} className="rounded-ctl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="break-keep text-base font-bold leading-snug text-slate-800">
                    {d.label}
                    {d.ext && <span className="ml-1.5 text-micro font-bold text-slate-400">{d.ext}</span>}
                  </p>
                  <span className={`shrink-0 text-tiny font-black ${st.tone}`}>{st.label}</span>
                </div>
                {doc?.uploadedAt && <p className="mt-1 text-tiny text-slate-400">{doc.uploadedAt}</p>}
                {doc?.rejectReason && (
                  <p className="mt-2 rounded-ctl bg-red-50 px-2 py-1.5 text-tiny leading-snug text-red-800">
                    {doc.rejectReason}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3">
                  {doc?.blobUrl && <DocFileActions doc={doc} siteName={siteName} label={d.label} />}
                  <DocUpload
                    projectId={project.id}
                    kind={d.key}
                    rejected={doc?.status === 'rejected'}
                    hasFile={Boolean(doc?.blobUrl)}
                  />
                  {canReview && doc && doc.status !== 'none' && (
                    <DocDelete projectId={project.id} kind={d.key} label={d.label} filename={doc.filename} />
                  )}
                </div>
                {canReview && doc && doc.status !== 'none' && (
                  <DocReview projectId={project.id} kind={d.key} status={doc.status} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="mt-2 text-tiny font-semibold text-red-700">{error}</p>}
    </section>
  );
}

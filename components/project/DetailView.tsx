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
import type { ContractState, ProjectDetail, SettlementRuleChoice } from '@/types/project';
import { useAction } from '@/lib/use-action';
import { today } from '@/lib/date';
import { DatePicker } from '@/components/DatePicker';
import { Btn, Empty, Err, Val } from '@/components/ui';
import { buildDocContext, evaluateDocs, isPartyInferred, PROCESS_DOCS } from '@/lib/doc-rules';
import { bandOfColumn, boardColumnOf, type BoardBand } from '@/lib/board';
import type { ProcessEdit } from '@/lib/process';
import type { Visibility } from '@/lib/roles';
import type { RuleOptions } from '@/lib/pricing-match';
import { ConstructionTab } from './ConstructionTab';
import { Fact } from './parts';
import { IntakeTab } from './IntakeTab';
import { EditableFact } from './EditableFact';
import { ProgressLog } from './ProgressLog';
import { SettlementTab } from './SettlementTab';

export type TabKey = 'intake' | 'construction' | 'settlement';

export default function ProjectDetailView({
  detail,
  vis,
  canReview,
  noteAuthor,
  knownOrgs,
  ruleOptions,
  settlementRuleChoices,
  initialTab,
  processEdit,
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
  /** 정산 규칙 후보 — 이름에 기성 모양이 들어 있어 한백이 아니면 null (단가 후보와 같은 이유) */
  settlementRuleChoices: SettlementRuleChoice[] | null;
  /**
   * URL(?tab=)로 열 탭 — 기성·지급 화면이 「정산 탭에서 지정해야 합니다」라고 말하므로,
   * 거기서 오는 링크는 그 탭을 바로 연다. 없으면 단계가 정한다.
   */
  initialTab: TabKey | null;
  /** 공정 입력 권한 — 한백 전부(all) · 그 현장의 시공사(partner) · 보기만(none) */
  processEdit: ProcessEdit;
}) {
  // 잠긴 시공 탭은 URL 로도 못 연다 — 화면에서 못 누르는 것은 주소로도 안 된다
  const [tab, setTab] = useState<TabKey>(
    initialTab && !(initialTab === 'construction' && detail.stage === 'intake')
      ? initialTab
      : detail.stage
  );
  /**
   * 탭을 주소에 남긴다 — 새로고침해도, 링크를 보내도 보던 탭이 열린다.
   * replaceState 라 서버를 다시 부르지 않고 뒤로가기 이력도 안 쌓인다(ProjectsView 와 같은 방식).
   */
  const changeTab = (next: TabKey) => {
    setTab(next);
    const p = new URLSearchParams(window.location.search);
    p.set('tab', next);
    window.history.replaceState(null, '', `?${p.toString()}`);
  };

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
        bizType: project.bizType,
      }),
    [project, lines]
  );

  const evaluated = useMemo(() => evaluateDocs(docCtx), [docCtx]);
  const byKind = useMemo(() => new Map(documents.map((d) => [d.kind, d])), [documents]);

  /*
   * 계약 판정은 서버가 이미 했다(lib/stage.ts contractStateOf → detail.contract).
   * 여기서 다시 세지 않는다 — 예전에는 이 자리에서 required.every(...) 로 또 셌고,
   * 조건을 하나 바꿀 때(반려를 필수 여부와 무관하게 보기로 한 것) 화면과 저장소가 갈렸다.
   */
  const contract = detail.contract;

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
    { key: 'intake', label: '계약', count: `${contract.satisfied}/${contract.requiredTotal}`, locked: false },
    {
      key: 'construction',
      label: '시공',
      count: `${processDone}/${PROCESS_DOCS.length}`,
      locked: constructionLocked,
      why: !contract.docsFilled
        ? '필수 서류 미충족'
        : !contract.allPriced
          ? '단가 미지정'
          : undefined,
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
        contract={contract}
        canReview={canReview}
        noteAuthor={noteAuthor}
        knownOrgs={knownOrgs}
        processEdit={processEdit}
      />

      <div className="overflow-hidden rounded-panel border border-slate-200 bg-white">
        <div className="flex gap-1 border-b border-slate-100 px-3 pt-3" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              disabled={t.locked}
              title={t.locked ? `계약 완료 후 열립니다${t.why ? ` — ${t.why}` : ''}` : undefined}
              onClick={() => !t.locked && changeTab(t.key)}
              className={`-mb-px rounded-t-ctl border-b-2 px-4 py-2.5 text-lead font-bold transition ${
                t.locked
                  ? 'cursor-not-allowed border-transparent text-slate-300'
                  : tab === t.key
                    ? 'border-brand-600 text-brand-800'
                    : 'border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              {t.label}
              {t.locked ? (
                <span aria-label="잠김" className="ml-1.5 text-tiny">🔒</span>
              ) : t.count ? (
                <span className="ml-1.5 text-tiny font-semibold tabular-nums text-slate-400">
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
              contract={contract}
              projectId={project.id}
              siteName={project.name}
              canReview={canReview}
              partyInferred={isPartyInferred(docCtx)}
              inferredParty={docCtx.bldgType === '공동주택' ? '입주자대표회의' : '관리단'}
            />
          )}
          {tab === 'construction' && <ConstructionTab detail={detail} edit={processEdit} />}
          {tab === 'settlement' && (
            <SettlementTab
              detail={detail}
              vis={vis}
              canReview={canReview}
              ruleOptions={ruleOptions}
              settlementRuleChoices={settlementRuleChoices}
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
  detail, contract, canReview, noteAuthor, knownOrgs, processEdit,
}: {
  detail: ProjectDetail;
  contract: ContractState;
  /** 한백인가 — 협력사에게는 한백이 할 일을 걸림돌로 보여주지 않는다 */
  canReview: boolean;
  noteAuthor: string;
  /** 이미 쓰이고 있는 업체 이름 — 영업사·시공사를 고칠 때 골라 넣는다 */
  knownOrgs: string[];
  processEdit: ProcessEdit;
}) {
  const { project, lines, stage, process, stalledDays } = detail;
  const column = boardColumnOf({
    stage,
    status: process.status,
    holdState: project.holdState,
    rejectedDocs: contract.rejected,
    docsFilled: contract.docsFilled,
  });
  const band = bandOfColumn(column);
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  const terms = [...new Set(lines.map((l) => l.termYears))];

  /** 이 현장을 지금 세우고 있는 것 */
  const blockers: Array<{ label: string; tone: string }> = [];
  if (project.holdState) {
    blockers.push({ label: `보류 — ${project.holdNote ?? project.holdState}`, tone: 'bg-slate-800 text-white' });
  }
  if (contract.rejected > 0) {
    blockers.push({ label: `반려 ${contract.rejected}건`, tone: 'bg-red-100 text-red-800' });
  }
  if (stage === 'intake' && !contract.docsFilled) {
    blockers.push({ label: '필수 서류 미충족', tone: 'bg-amber-100 text-amber-900' });
  }
  // 단가 미지정은 머리말에 안 띄운다(한백 확인) — 정산 탭의 지정 자리가 그 말을 한다
  if (stalledDays >= 14) {
    blockers.push({
      label: `${stalledDays}일째 그대로`,
      tone: stalledDays >= 30 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900',
    });
  }

  return (
    <div className="rounded-panel border border-slate-200 bg-white p-5 sm:p-6">
      {/*
        * 왼쪽은 현장의 사실, 오른쪽은 진행현황 및 메모(한백 확인). 세로로 쌓으면 머리말이
        * 길어지고 넓은 화면의 오른쪽이 놀았다. 좁은 화면에서는 다시 아래로 접힌다.
        * 뒤로가기·차례 칩은 걷어냈다 — 목록은 사이드바로 가고, 차례는 보드 카드가 민다.
        */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-8">
      <div className="min-w-0">
      {/*
        * 단계를 이름 위에 둔다. 오른쪽 끝에 있으면 이름을 읽고 눈을 옮겨야 보이는데,
        * 이 화면에서 가장 먼저 알아야 하는 것이 「지금 어느 칸에 있나」다.
        */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-base font-black ${BAND_TONE[band]}`}
          title="보드에서 이 현장이 서는 칸"
        >
          {column}
        </span>
      </div>
      <h1 className="mt-2 text-h1 font-black text-slate-900">
        {project.name}
      </h1>
      {project.addr && <p className="mt-1 text-base text-slate-500">{project.addr}</p>}

      {/*
        * 네 줄로 나눈다 (한백 확인 2026-08-21). 선 없이 여백만으로 줄을 가른다.
        *
        *   1줄 — 누구의 일인가: 사업연도 · 운영사 · 영업사 · 시공사
        *   2줄 — 계약의 뼈대: 사업구분 · 계약대수 · 계약연수 · 수전방식 · 계약접수일
        *   3·4줄 — 승인 흐름 (ApprovalFacts): 제출 · 대기번호 / 승인일 · 시공승인일
        *
        * 아홉 칸을 한 줄에 늘어놓으면 어디까지가 무엇인지 눈이 못 찾는다.
        * 나머지 현장 정보는 계약 탭의 「현장 정보」에 있다.
        */}
      <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-base">
        {/* 접수 연도가 기본값 — 이월 현장(작년 사업이 올해 접수)만 고친다 */}
        <EditableFact
          label="사업연도"
          value={project.bizYear === null ? null : String(project.bizYear)}
          canEdit={canReview}
          url={`/api/projects/${project.id}/biz-year`}
          field="value"
          method="POST"
          empty="미지정"
          placeholder="2026"
        />
        <Fact label="운영사" value={project.cpo} />
        <EditableFact
          label="영업사"
          value={project.salesOrg}
          canEdit={canReview}
          url={`/api/projects/${project.id}/orgs`}
          field="salesOrg"
          empty="미지정"
          placeholder="비우면 어느 업체도 아닌 현장"
          suggestions={knownOrgs}
        />
        <EditableFact
          label="시공사"
          value={project.gcOrg}
          canEdit={canReview}
          url={`/api/projects/${project.id}/orgs`}
          field="gcOrg"
          empty="미지정"
          placeholder="비우면 어느 업체도 아닌 현장"
          suggestions={knownOrgs}
        />
      </dl>

      <dl className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-base">
        <Fact label="사업구분" value={project.bizType} />
        <Fact label="계약대수" value={`${qty}대`} />
        <Fact label="계약연수" value={terms.length ? `${terms.join('·')}년` : null} />
        <Fact label="수전방식" value={project.powerType} />
        <Fact label="계약접수일" value={project.createdAt} />
      </dl>

      <ApprovalFacts
        projectId={project.id}
        process={process}
        edit={processEdit}
        envQueueNo={project.envQueueNo}
        isSelfInvest={project.bizType === '자체투자'}
        canReview={canReview}
      />

      {blockers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {blockers.map((b) => (
            <span key={b.label} className={`rounded-full px-2.5 py-1 text-tiny font-bold ${b.tone}`}>
              {b.label}
            </span>
          ))}
        </div>
      )}
      </div>

      <div className="mt-5 min-w-0 border-t border-slate-100 pt-4 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <ProgressLog projectId={project.id} notes={detail.notes} author={noteAuthor} />
      </div>
      </div>
    </div>
  );
}

/** 띠별 색 — 보드의 띠 색과 맞춘다 */
const BAND_TONE: Record<BoardBand, string> = {
  계약: 'bg-sky-100 text-sky-900',
  시공: 'bg-brand-100 text-brand-900',
  멈춤: 'bg-slate-800 text-white',
};

/**
 * 승인 흐름 두 줄 — 머리말 3·4줄이다 (한백 확인 2026-08-21).
 *
 *   3줄: 운영사 계약서 제출 · 환경부 대기번호   (제출 체크는 한백만 — 몰라도 되는 값)
 *   4줄: 환경부 승인일 · 운영사 시공승인일
 *
 * 환경부 승인일과 제출 체크는 한백이 적고, 시공승인일은 그 현장의 시공사도 적는다 —
 * 판정은 저장소(assertProcessWrite)가 다시 한다.
 */
function ApprovalFacts({
  projectId, process, edit, envQueueNo, isSelfInvest, canReview,
}: {
  projectId: string;
  process: ProjectDetail['process'];
  edit: ProcessEdit;
  envQueueNo: string | null;
  /** 자체투자는 환경부 보조금을 받지 않는다 — 받을 대기번호가 없다 */
  isSelfInvest: boolean;
  canReview: boolean;
}) {
  const { busyKey, error, run } = useAction();
  const save = (field: string, value: string | null) =>
    void run({
      url: `/api/projects/${projectId}/process`,
      body: { [field]: value },
      fail: '저장하지 못했습니다.',
      key: field,
    });

  return (
    <>
    <dl className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-base">
      {edit === 'all' && (
        <div className="flex items-baseline gap-1.5">
          <dt className="text-tiny font-bold tracking-[0.04em] text-slate-400">운영사 계약서 제출</dt>
          <dd>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                aria-label="운영사 계약서 제출"
                checked={Boolean(process.cpoSubmitDate)}
                disabled={busyKey === 'cpoSubmitDate'}
                onChange={(e) => save('cpoSubmitDate', e.target.checked ? today() : null)}
              />
              <span className={`font-bold ${process.cpoSubmitDate ? 'text-slate-800' : 'text-amber-700'}`}>
                {process.cpoSubmitDate ? '제출됨' : '미제출'}
              </span>
            </label>
          </dd>
        </div>
      )}
      <EditableFact
        label="환경부 대기번호"
        value={envQueueNo}
        canEdit={canReview}
        url={`/api/projects/${projectId}/env-queue`}
        field="value"
        method="POST"
        empty="미지정"
        placeholder="2026-595"
        na={isSelfInvest}
      />
    </dl>

    <dl className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-base">
      <DateFact
        label="환경부 승인일"
        value={process.envApprovalDate}
        canEdit={edit === 'all'}
        busy={busyKey === 'envApprovalDate'}
        onSave={(v) => save('envApprovalDate', v)}
        hint="기성 「환경부 승인」 트리거가 이 날짜로 열립니다"
      />
      <DateFact
        label="운영사 시공승인일"
        value={process.cpoApprovalDate}
        canEdit={edit !== 'none'}
        busy={busyKey === 'cpoApprovalDate'}
        onSave={(v) => save('cpoApprovalDate', v)}
        hint="넣으면 「시공진행필요」로 넘길 수 있습니다"
      />
      <Err>{error}</Err>
    </dl>
    </>
  );
}

/** 머리말의 날짜 사실 — 평소엔 글자, 고칠 때만 달력(화면 규칙 4). EditableFact 의 날짜판. */
function DateFact({
  label, value, canEdit, busy, onSave, hint,
}: {
  label: string;
  value: string | null;
  canEdit: boolean;
  busy: boolean;
  onSave: (v: string | null) => void;
  hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex items-baseline gap-1.5" title={hint}>
      <dt className="text-tiny font-bold tracking-[0.04em] text-slate-400">{label}</dt>
      {editing && canEdit ? (
        <dd className="flex items-center gap-1.5">
          <DatePicker
            ariaLabel={label}
            value={value}
            disabled={busy}
            onChange={(v) => {
              onSave(v);
              setEditing(false);
            }}
          />
          <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setEditing(false)}>취소</Btn>
        </dd>
      ) : (
        <>
          {/* 승인일은 기다리는 값이다 — 비어 있음은 「아직 올 때가 아님」(—) */}
          <dd>{value ? <Val value={value} /> : <Empty kind="wait" />}</dd>
          {canEdit && (
            <Btn size="sm" kind="quiet" onClick={() => setEditing(true)}>
              {value ? '수정' : '입력'}
            </Btn>
          )}
        </>
      )}
    </div>
  );
}

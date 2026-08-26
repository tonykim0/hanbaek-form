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
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ContractState, ProjectDetail, SettlementRuleChoice } from '@/types/project';
import { subsidized } from '@/types/project';
import { useAction } from '@/lib/use-action';
import { DatePicker } from '@/components/DatePicker';
import { Badge, Btn, Confirm, Empty, Err, FIELD, Tag, type Tone, Val } from '@/components/ui';
import { buildDocContext, evaluateDocs, PROCESS_DOCS } from '@/lib/doc-rules';
import { BAND_TONE, bandOfColumn, boardColumnOf, phaseOfProject } from '@/lib/board';
import type { BoardBand, BoardColumn } from '@/lib/board';
import { statusIndex, type ProcessEdit } from '@/lib/process';
import type { Visibility } from '@/lib/roles';
import type { RuleOptions } from '@/lib/pricing-match';
import { ConstructionTab } from './ConstructionTab';
import { StopControl } from './StopControl';
import { Fact } from './parts';
import { IntakeTab } from './IntakeTab';
import { EditableFact } from './EditableFact';
import { ProgressLog } from './ProgressLog';
import { ReceivableTab, SettlementTab } from './SettlementTab';

/** settlement = 협력사 지급(주소가 이미 퍼져 있어 키는 안 바꾼다) · receivable = 기성(한백만) */
export type TabKey = 'intake' | 'construction' | 'settlement' | 'receivable';

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
  canSubmit,
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
  /** 「계약서 접수하기」를 누를 수 있는가 — 내는 쪽(협력사·한백), 열람 전용은 아니다 */
  canSubmit: boolean;
}) {
  /*
   * 주소에 탭이 없으면 국면이 정한다 — stage 를 그대로 쓰지 않는다.
   *
   * 계약완료·운영사 계약서 제출은 stage 가 construction 이지만 ★계약 국면★이다
   * (보드에서도 계약 페이지의 칸이다, BAND_OF_STATUS). stage 로 탭을 정하면 운영사
   * 제출을 기다리는 현장을 눌렀을 때 시공 탭이 열려서, 아직 아무 일도 없는 공정
   * 스테퍼를 본다(한백 지적 2026-08-24). 판정은 보드와 같은 함수를 쓴다.
   */
  const byPhase: TabKey =
    phaseOfProject({ stage: detail.stage, status: detail.process.status }) === '계약'
      ? 'intake'
      : detail.stage;

  // 잠긴 시공 탭은 URL 로도 못 연다 — 화면에서 못 누르는 것은 주소로도 안 된다.
  // 기성 탭도 같다 — 한백이 아니면 탭이 없으므로 주소로도 안 열린다.
  const [tab, setTab] = useState<TabKey>(() => {
    if (!initialTab) return byPhase;
    if (initialTab === 'construction' && detail.stage === 'intake') return byPhase;
    if (initialTab === 'receivable' && !canReview) return byPhase;
    return initialTab;
  });
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
  // 기성 차수는 한백 전용 묶음에 있다 — 협력사 응답에는 admin 키가 아예 없다
  const steps = detail.admin?.steps ?? [];
  const settlementOpen = steps.filter((s) => s.state !== 'na').length;
  const settlementDone = steps.filter((s) => s.state === 'collected').length;

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

  const tabs: TabDef[] = [
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
      label: '협력사 정산관리',
      count: '',
      locked: false,
    },
    // 기성은 한백만 — 운영사에게서 받는 돈이라 협력사에게는 탭 자체가 없다
    ...(canReview
      ? [{
          key: 'receivable' as TabKey,
          label: '운영사 기성관리',
          count: `${settlementDone}/${settlementOpen}`,
          locked: false,
        }]
      : []),
  ];

  /* 보드에서 이 현장이 서는 칸 — 머리말과 고정 띠가 같은 값을 본다 */
  const column = boardColumnOf({
    stage: detail.stage,
    status: process.status,
    holdState: project.holdState,
    rejectedDocs: contract.rejected,
    preRejected: contract.preRejected,
    docsFilled: contract.docsFilled,
    submitted: project.contractSubmittedAt !== null,
    fixAsked: project.contractFixAskedAt !== null,
  });
  const band = bandOfColumn(column);

  /*
   * 큰 현장명이 상단 바 밑으로 사라졌는가 — 그때만 고정 띠를 세운다.
   *
   * 스크롤 위치를 세지 않고 이름 자체를 지켜본다: 창 크기·사이드바·대행 띠에 따라
   * 이름이 사라지는 지점이 달라지는데, 픽셀로 못 박으면 그때마다 어긋난다.
   * rootMargin 위쪽을 상단 바(48px)만큼 밀어 그 바 뒤로 들어가는 순간을 경계로 삼는다.
   */
  const titleRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const el = titleRef.current;
    // 옛 브라우저에는 없다 — 없으면 띠가 안 뜰 뿐 화면은 그대로 돈다
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { rootMargin: '-48px 0px 0px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/*
        * 스크롤을 내려도 현장명과 탭은 남는다 (한백 2026-08-27).
        *
        * 이 화면은 아래로 길다 — 서류·공정·기성을 훑다 보면 「어느 현장을 보고 있나」가
        * 눈에서 사라지고, 다른 탭으로 넘어가려면 맨 위까지 되올라가야 했다.
        *
        * ★같은 값이 한 화면에 두 번 서지 않는다★(화면 규칙 5) — 큰 이름과 탭 줄이 화면
        * 밖으로 나간 뒤에야 이 띠가 뜬다. 탭은 아래 줄과 ★같은 부품★이다(TabStrip):
        * 두 벌로 그리면 잠김·건수·고른 표시가 두 곳에서 갈린다.
        *
        * 붙박이라 자리를 밀지 않는다 — 뜰 때 본문이 덜컥 내려가면 읽던 줄을 놓친다.
        * 위·왼쪽 자리는 껍데기가 물려준 값을 쓴다(--console-top/left).
        */}
      {pinned && (
        <div
          /* 자리는 클래스가 아니라 여기서 준다 — 껍데기가 물려주는 변수라 Tailwind 가 값을 모른다 */
          style={{ top: 'var(--console-top, 3rem)', left: 'var(--console-left, 0px)' }}
          className="fixed right-0 z-10 border-b border-slate-200/80 bg-[#f7f8f4]/95 backdrop-blur transition-[left] duration-150 print:hidden"
        >
          <div className="flex min-w-0 items-center gap-2.5 px-5 pt-2 sm:px-7">
            <Badge tone={BAND_TONE[band]}>{column}</Badge>
            <span className="truncate text-lead font-black text-slate-900">{project.name}</span>
          </div>
          <TabStrip tabs={tabs} current={tab} onPick={changeTab} className="px-3" />
        </div>
      )}

      <SiteHeader
        detail={detail}
        contract={contract}
        canReview={canReview}
        noteAuthor={noteAuthor}
        knownOrgs={knownOrgs}
        processEdit={processEdit}
        column={column}
        band={band}
        titleRef={titleRef}
      />

      <div className="overflow-hidden rounded-panel border border-slate-200 bg-white">
        <TabStrip tabs={tabs} current={tab} onPick={changeTab} className="border-b border-slate-100 px-3 pt-3" />

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
              canSubmit={canSubmit}
              status={process.status}
            />
          )}
          {tab === 'construction' && <ConstructionTab detail={detail} edit={processEdit} />}
          {tab === 'settlement' && (
            <SettlementTab
              detail={detail}
              vis={vis}
              canReview={canReview}
              ruleOptions={ruleOptions}
            />
          )}
          {tab === 'receivable' && canReview && (
            <ReceivableTab
              detail={detail}
              canReview={canReview}
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
 * (계약보완·충전기 발주·준공서류 접수/검토…)과 달라서 같은 현장을 두 이름으로 부르게 됐다.
 *
 * 걸림돌은 여기 모은다. 무엇이 이 현장을 세우고 있는지는 탭을 열기 전에 보여야 한다.
 */
/**
 * 머리말 사실의 격자 — 네 묶음이 전부 같은 열을 쓴다.
 *
 * 한 묶음마다 열 수를 따로 주면(4칸 묶음은 4열, 5칸 묶음은 5열) 위아래 값이 어긋나서
 * 격자로 만든 뜻이 없어진다. 다섯 열로 서면 사업연도·사업구분이, 운영사·계약대수가
 * 같은 열에 선다 — 네 칸짜리 묶음의 마지막 열은 비워 둔다.
 *
 * ★열 너비를 못으로 박는다 (한백 2026-08-27).★ 1fr 로 두면 열이 패널 폭을 나눠 갖는데,
 * 「2026」·「3대」처럼 짧은 값이 200px 칸 왼쪽에 하나씩 떨어져 서서 사실 사이가 휑했다.
 * 9rem 으로 묶으면 값들이 왼쪽에 모여 서고, 남는 폭은 오른쪽에 한 번만 남는다.
 * 좁은 화면만 1fr 두 열이다 — 거기서는 나눠 갖는 것이 맞다.
 *
 * 값이 없어 칸이 빠지면(Fact 는 null 이면 자리를 비운다) 뒤 칸이 한 칸씩 당겨진다.
 * 접수 직후처럼 사업구분·계약연수가 아직 없는 현장에서 그렇다.
 */
interface TabDef {
  key: TabKey;
  label: string;
  count: string;
  locked: boolean;
  /** 왜 잠겼나 — 못 하는 이유를 그 자리에 적는다(화면 규칙 3) */
  why?: string;
}

/**
 * 탭 줄 — 카드 머리와 고정 띠가 ★같은 부품★을 쓴다 (2026-08-27).
 *
 * 스크롤을 내리면 카드 머리의 탭 줄이 화면 밖으로 나가서, 다른 탭으로 넘어가려면 맨
 * 위까지 되올라가야 했다. 고정 띠에 같은 줄을 얹어 그 왕복을 없앤다.
 *
 * 두 벌로 그리지 않는다 — 잠김·건수·고른 표시가 두 곳에서 갈리면 「위에서는 잠겼는데
 * 아래서는 눌린다」가 된다. 다른 것은 바깥 여백뿐이라 그것만 받는다.
 */
function TabStrip({
  tabs, current, onPick, className = '',
}: {
  tabs: TabDef[];
  current: TabKey;
  onPick: (k: TabKey) => void;
  className?: string;
}) {
  return (
    /* 좁은 화면에서는 탭이 접히지 않고 옆으로 흐른다 — 접히면 띠 높이가 들쭉날쭉해진다 */
    <div
      className={`flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      role="tablist"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={current === t.key}
          disabled={t.locked}
          title={t.locked ? `계약 완료 후 열립니다${t.why ? ` — ${t.why}` : ''}` : undefined}
          onClick={() => !t.locked && onPick(t.key)}
          className={`-mb-px shrink-0 whitespace-nowrap rounded-t-ctl border-b-2 px-4 py-2.5 text-lead font-bold transition ${
            t.locked
              ? 'cursor-not-allowed border-transparent text-slate-300'
              : current === t.key
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
  );
}

const FACT_GRID =
  'grid grid-cols-2 gap-x-4 gap-y-3 text-base'
  + ' sm:grid-cols-[repeat(4,minmax(0,9rem))] lg:grid-cols-[repeat(5,minmax(0,9rem))]';

function SiteHeader({
  detail, contract, canReview, noteAuthor, knownOrgs, processEdit, column, band, titleRef,
}: {
  detail: ProjectDetail;
  contract: ContractState;
  /** 한백인가 — 협력사에게는 한백이 할 일을 걸림돌로 보여주지 않는다 */
  canReview: boolean;
  noteAuthor: string;
  /** 이미 쓰이고 있는 업체 이름 — 영업사·시공사를 고칠 때 골라 넣는다 */
  knownOrgs: string[];
  processEdit: ProcessEdit;
  /*
   * 보드에서 이 현장이 서는 칸 — 부모가 세어 넘긴다. 고정 띠도 같은 값을 쓰는데,
   * 두 곳에서 각자 세면 같은 현장이 두 칸으로 보일 자리가 생긴다.
   */
  column: BoardColumn;
  band: BoardBand;
  /** 큰 이름이 화면 밖으로 나갔는지 부모가 지켜본다(고정 띠) — 여기서는 자리만 내준다 */
  titleRef: RefObject<HTMLDivElement>;
}) {
  const { project, lines, process } = detail;
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  const terms = [...new Set(lines.map((l) => l.termYears))];


  /** 이 현장을 지금 세우고 있는 것 */
  const blockers: Array<{ label: string; tone: Tone }> = [];
  if (project.holdState) {
    blockers.push({
      label: `${project.holdState}${project.holdNote ? ` — ${project.holdNote}` : ''}`,
      tone: 'hold',
    });
  }
  if (contract.rejected > 0) {
    blockers.push({ label: `반려 ${contract.rejected}건`, tone: 'stop' });
  }
  /*
   * 「필수 서류 미충족」은 서류 옆으로 옮겼다(한백 지시 2026-08-25) — 머리말에서는
   * 무슨 서류가 모자란지 알 수 없고, 그것을 보려면 어차피 서류 구역까지 내려간다.
   * 여기 남는 것은 서류 구역이 답할 수 없는 것들이다(보류·반려·멈춘 날수).
   */
  // 단가 미지정은 머리말에 안 띄운다(한백 확인) — 정산 탭의 지정 자리가 그 말을 한다
  /*
   * ★「N일째 미해결」은 상세에 없다★ (한백 지시 2026-08-25 — 머리말에서 진행현황 머리로
   * 옮겼다가 아예 걷었다).
   *
   * 상세는 한 현장을 붙잡고 일하는 화면이라 「며칠 됐나」로 할 일이 갈리지 않는다. 그 값이
   * 쓰이는 곳은 138건에서 어느 것부터 볼지 고르는 자리다 — 보드 카드(14일부터)와 표의
   * 정체일 칸이 그 말을 하고, 정렬도 그것으로 한다(byStalled).
   */

  return (
    <div className="rounded-panel border border-slate-200 bg-white p-5 sm:p-6">
      {/*
        * 위는 현장의 사실, 아래가 진행현황 및 메모다. 한때 좌우 2열이었는데(오른쪽이 노는
        * 화면 때문) 승인 흐름과 메모가 좌우로 떨어져 「승인일 적고 메모 남기는」 동선이
        * 끊겼다 — 진행현황을 승인일 줄 아래로 내렸다(한백 지시 2026-08-23).
        * 뒤로가기·차례 칩은 걷어냈다 — 목록은 사이드바로 가고, 차례는 보드 카드가 민다.
        */}
      <div className="min-w-0">
      {/*
        * 단계를 이름 위에 둔다. 오른쪽 끝에 있으면 이름을 읽고 눈을 옮겨야 보이는데,
        * 이 화면에서 가장 먼저 알아야 하는 것이 「지금 어느 칸에 있나」다.
        */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 이 화면에서 가장 먼저 읽는 값이라 큰 배지다 — 크기도 부품이 쥔다 */}
        <span title="보드에서 이 현장이 서는 칸">
          <Badge tone={BAND_TONE[band]} size="lg">{column}</Badge>
        </span>
        {/* 멈춤·재개는 한백만 — 여는 자리는 글자만이고 사유를 적어야 확정된다 */}
        {canReview && <StopControl projectId={project.id} held={project.holdState} />}
        {/* 삭제는 반대쪽 끝 — 자주 누르는 것과 붙여 두지 않는다(화면 규칙 8) */}
        {canReview && <DeleteProject projectId={project.id} name={project.name} />}
      </div>
      <div ref={titleRef}>
        <NameTitle projectId={project.id} name={project.name} canEdit={canReview} />
      </div>
      {project.addr && <p className="mt-1 text-base text-slate-500">{project.addr}</p>}

      {/*
        * 네 줄로 나눈다 (한백 확인 2026-08-21).
        *
        *   1줄 — 누구의 일인가: 사업연도 · 운영사 · 영업사 · 시공사
        *   2줄 — 계약의 뼈대: 사업구분 · 계약대수 · 계약연수 · 수전방식 · 계약접수일
        *   3·4줄 — 승인 흐름 (ApprovalFacts): 운영사 계약서 제출 / 대기번호 · 환경부 승인일
        *
        * ★구성은 그대로 두고 읽히는 꼴만 고쳤다 (2026-08-27).★ 전에는 네 줄이 다
        * flex-wrap 이었는데, 줄 안 간격(gap-y-1.5)과 줄 사이 간격(mt-2)이 거의 같아서
        * 창이 좁거나 업체 이름이 길어 한 줄이 접히는 순간 네 묶음이 한 덩어리로 뭉쳤다.
        * 지금은 넷 다 같은 격자(FACT_GRID)를 쓴다 — 값이 열에 서고, 묶음 사이는 여백이,
        * 승인 흐름 앞은 얇은 선이 가른다(화면 규칙 1: 여백 → 얇은 선 → 배경 → 테두리).
        *
        * 나머지 현장 정보는 계약 탭의 「현장 정보」에 있다.
        */}
      <dl className={`mt-4 ${FACT_GRID}`}>
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

      <dl className={`mt-5 ${FACT_GRID}`}>
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
        isSelfInvest={!subsidized(project.bizType)}
        canReview={canReview}
      />

      {blockers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {blockers.map((b) => (
            <Tag key={b.label} tone={b.tone}>{b.label}</Tag>
          ))}
        </div>
      )}
      </div>

      <div className="mt-5 min-w-0 border-t border-slate-100 pt-4">
        <ProgressLog projectId={project.id} notes={detail.notes} author={noteAuthor} />
      </div>
    </div>
  );
}

/**
 * 승인 흐름 두 줄 — 머리말 3·4줄이다 (한백 확인 2026-08-21, 2026-08-27 개정).
 *
 *   3줄: 운영사 계약서 제출   (한백만 본다 — 협력사는 몰라도 되는 값이라 줄을 안 그린다)
 *   4줄: 환경부 대기번호 · 환경부 승인일
 *
 * ★승인 날짜는 한 칸이다 (한백 2026-08-27).★ 전에는 「환경부 승인일」과 「운영사 시공승인일」
 * 두 칸이었는데, 한백은 그 둘을 같은 날로 본다 — 프로덕션 76건에서 둘 다 적힌 두 건이
 * 날짜가 같았고, 다른 건은 한 건도 없었다. 두 칸이면 같은 날을 두 번 적어야 하고
 * (화면 규칙 5), 한 쪽만 적힌 현장은 「승인이 났나 안 났나」가 갈린다.
 *
 * 남는 칸은 envApprovalDate 다 — 기성 「환경부 승인」 트리거의 근거이고 한백 전용이다.
 * 「충전기 발주」 조건도 이 날짜를 본다(lib/process). cpoApprovalDate 는 DB 에 남아 있지만
 * 더는 읽지도 쓰지도 않는다: 마이그레이션이 배포보다 먼저 돌아서, 지우면 아직 바뀌기 전
 * 배포가 그 칸을 찾다 터진다(promo_extend_deduct 와 같은 이유).
 *
 * 제출 여부는 적는 자리가 아니다 — 보드에서 넘길 때 찍히고 여기는 읽기만 한다.
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

  // 낸 것은 그 칸에 들어섰다는 뜻이다 — 날짜는 언제 냈는지일 뿐 여부가 아니다
  const cpoSubmitted = statusIndex(process.status) >= statusIndex('운영사 계약서 제출');

  return (
    /*
     * 승인 흐름은 얇은 선으로 가른다 (2026-08-27). 위는 굳은 사실이고 여기는 기다리는
     * 값이다 — 「아직 안 왔다(—)」가 대부분이고, 오면 그 자리에서 적는다. 같은 모양으로
     * 이어 붙여 두면 「미제출」·「—」가 운영사·대수와 같은 무게로 읽혀 눈이 안 멈춘다.
     * 상자를 하나 더 두르지 않는다 — 층을 나눌 때는 약한 것부터다(화면 규칙 1).
     */
    <div className="mt-5 border-t border-slate-100 pt-4">
      {/*
        * 적는 자리가 아니라 보는 자리다 — 보드에서 「운영사 계약서 제출 로 넘기기」를
        * 누르면 저장소가 옮기면서 찍고(pg-store setProcessStatus), 여기는 그 결과만 읽는다.
        * 체크칸이던 동안은 같은 사실을 두 번 말해야 했다: 여기서 체크해야 보드에 단추가
        * 뜨고, 그걸 또 눌러야 옮겨졌다(화면 규칙 5, 한백 지시 2026-08-25).
        *
        * ★여부는 단계가 말하고, 날짜는 곁들인다.★ 그 칸을 건너뛰어 지나간 현장(옛 데이터·
        * 스테퍼 점프)은 날짜가 없어도 제출된 것이다 — 날짜로만 판정하면 착공한 현장이
        * 「미제출」로 보인다.
        *
        * 제 줄을 통째로 쓴다 (한백 2026-08-27) — 라벨이 길어 옆 칸을 밀고, 이것만
        * 여부이고 나머지는 값이다.
        */}
      {edit === 'all' && (
        <dl className={FACT_GRID}>
          <div className="min-w-0">
            <dt className="text-tiny font-bold tracking-[0.04em] text-slate-400">운영사 계약서 제출</dt>
            <dd className={`mt-0.5 break-keep font-bold ${cpoSubmitted ? 'text-slate-800' : 'text-amber-700'}`}>
              {cpoSubmitted
                ? process.cpoSubmitDate ? `제출됨 · ${process.cpoSubmitDate}` : '제출됨'
                : '미제출'}
            </dd>
          </div>
        </dl>
      )}

    <dl className={`${edit === 'all' ? 'mt-4' : ''} ${FACT_GRID}`}>
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
      {/*
        * 「환경부 승인일」 한 칸 — 운영사 시공승인도 같은 날로 본다(한백 2026-08-27).
        * 이름은 원래 쓰던 그대로다(한백 2026-08-27) — 한백이 이 날짜를 부르는 말이
        * 「환경부 승인일」이라, 줄여 적으면 현장에서 쓰는 말과 화면이 갈린다.
        */}
      <DateFact
        label="환경부 승인일"
        value={process.envApprovalDate}
        canEdit={edit === 'all'}
        busy={busyKey === 'envApprovalDate'}
        onSave={(v) => save('envApprovalDate', v)}
        hint="기성 「환경부 승인」 트리거와 「충전기 발주」 조건이 이 날짜로 열립니다"
      />
      {/* 실패 문구는 누른 칸 옆이 아니라 그 줄 끝이다 — 격자 한 칸에 들어가면 잘린다 */}
      <Err className="col-span-full self-center">{error}</Err>
    </dl>
    </div>
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
  const open = editing && canEdit;
  return (
    // 달력이 열리면 격자의 한 칸으로는 좁다 — 그때만 한 줄을 쓴다(EditableFact 와 같다)
    <div className={`min-w-0 ${open ? 'col-span-full' : ''}`} title={hint}>
      <dt className="text-tiny font-bold tracking-[0.04em] text-slate-400">{label}</dt>
      {open ? (
        <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
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
        <dd className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
          {/* 승인일은 기다리는 값이다 — 비어 있음은 「아직 올 때가 아님」(—) */}
          {value ? <Val value={value} /> : <Empty kind="wait" />}
          {canEdit && (
            <Btn size="sm" kind="quiet" onClick={() => setEditing(true)}>
              {value ? '수정' : '입력'}
            </Btn>
          )}
        </dd>
      )}
    </div>
  );
}

/**
 * 현장명 — 평소엔 제목 글자, 수정을 눌러야 입력칸(화면 규칙 4). [한백 전용 동작]
 * 접수 때 협력사가 적는 값이라 오타가 흔한데 고칠 길이 없었다(규칙 7).
 */
function NameTitle({
  projectId, name, canEdit,
}: {
  projectId: string;
  name: string;
  canEdit: boolean;
}) {
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (!editing) {
    return (
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <h1 className="text-h1 font-black text-slate-900">{name}</h1>
        {canEdit && (
          <Btn size="sm" kind="quiet" onClick={() => { setDraft(name); setEditing(true); }}>
            수정
          </Btn>
        )}
      </div>
    );
  }

  const save = async () => {
    const ok = await run({
      url: `/api/projects/${projectId}/name`,
      body: { value: draft },
      fail: '현장명을 바꾸지 못했습니다.',
    });
    if (ok) setEditing(false);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') setEditing(false);
        }}
        className={`${FIELD} max-w-[420px] text-lead font-bold`}
      />
      <Btn size="sm" busy={busy} busyLabel="저장 중…" disabled={!draft.trim()} onClick={() => void save()}>
        저장
      </Btn>
      <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setEditing(false)}>
        취소
      </Btn>
      <Err>{error}</Err>
    </div>
  );
}

/**
 * 현장 삭제 — 잘못 만든 현장(중복 접수·시험 입력)을 지운다. [한백 전용 동작]
 *
 * 계약이 무산된 현장은 지우지 않고 계약중단으로 세운다 — 그건 기록이다.
 * 여는 자리는 글자만이고, 확정만 빨강이다(화면 규칙 12). 지우면 목록으로 돌아간다.
 */
function DeleteProject({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [confirming, setConfirming] = useState(false);

  const remove = async () => {
    const ok = await run({
      url: `/api/projects/${projectId}`,
      method: 'DELETE',
      fail: '삭제하지 못했습니다.',
    });
    if (ok) {
      router.push('/projects');
      // push 만으로는 방금 본 보드가 라우터 캐시에서 그대로 나와 지운 카드가 남는다
      router.refresh();
    }
  };

  return (
    <span className="ml-auto">
      <Btn size="sm" kind="undo" onClick={() => setConfirming(true)}>
        삭제
      </Btn>

      <Confirm
        open={confirming}
        title={`「${name}」 현장을 삭제하시겠습니까?`}
        detail="서류·공정·정산·메모가 함께 지워지고 되돌릴 수 없습니다."
        /* 잘못 누르는 것을 막는 말 — 대신 무엇을 해야 하는지 적는다 */
        hint={<>삭제는 잘못 만든 현장(중복 접수·시험 입력)을 지우는 자리입니다. 계약이 무산된 현장은 삭제하지 말고 <b>「계약중단」</b>으로 세워 기록을 남기세요.</>}
        confirmLabel="예, 삭제합니다"
        busy={busy}
        busyLabel="삭제 중…"
        error={error}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </span>
  );
}

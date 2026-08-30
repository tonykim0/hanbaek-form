'use client';

/**
 * 계약 탭 — 현장정보 · 기설치 · 서류.
 *
 * 서류는 필수·조건부·선택 세 묶음으로 나눈다. 「해당없음」칸도 지우지 않는다 —
 * 빠뜨린 것과 원래 필요 없는 것을 구별해야 한다(lib/doc-rules).
 */
import { useState } from 'react';
import type { ContractState, ProcessStatus, ProjectDetail, ProjectDocument } from '@/types/project';
import { PROCESS_STATUSES, replLabel } from '@/types/project';
import { CONTRACT_DOCS_LOCKED_WHY, statusIndex } from '@/lib/process';
import { evaluateDocs, needsPreInstallCheck, type DocReq } from '@/lib/doc-rules';
import { DocDelete, DocFileActions, DocUpload, DownloadAll } from '@/components/DocFiles';
import { useAction } from '@/lib/use-action';
import { DocReview } from './DocReview';
import { PreInstall } from './PreInstall';
import { docState } from './parts';
import { Btn, Err, FIELD, Note, Tag } from '@/components/ui';

// ── 계약 탭 ─────────────────────────────────────────────────────
/**
 * 서류를 세 묶음으로 가른다 — 접수 화면(components/IntakeForm)과 같은 말.
 *
 * 색 띠(3px 짧은 줄)는 걷어냈다(한백 지시 2026-08-25). 칸을 색으로 채우게 되면서 그 줄이
 * 같은 말을 한 번 더 하는 자리가 됐고, 5px 짜리 줄로는 애초에 무엇을 가리키는지 읽히지도
 * 않았다 — 묶음을 가르는 것은 여백과 글자다.
 */
const DOC_GROUPS: Array<{ req: DocReq; label: string; note?: string }> = [
  { req: 'm', label: '필수' },
  { req: 'c', label: '조건부', note: '해당되는 현장만' },
  { req: 'o', label: '선택', note: '있으면 함께' },
];

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
   * 환경부 대기번호도 여기 없다 — 머리말로 올렸다(한백이 넣고 협력사가 본다).
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
    // 안 가르는 운영사는 괄호를 떼고 「자체투자」 — 다른 화면과 같은 함수를 본다(replLabel)
    ['교체유형', project.replType
      ? replLabel(project.cpo, project.replType)
      : project.bizType ? '라인별로 다름' : null],
    /*
     * 세 날짜가 순서대로 선다 — 계약서를 받은 날 · 협력사가 다 냈다고 누른 날 ·
     * 한백이 확인한 날. 한 칸에 뭉치면 「누가 언제 무엇을 했나」가 사라진다.
     * 이관 현장은 접수일과 확인일이 같은 값이다(노션에는 수령일만 있었다).
     */
    ['계약서 수령일', project.createdAt],
    /*
     * 보완요청을 받은 계약에서는 이 날짜가 「접수」가 아니라 「재검토 요청」이다
     * (한백 지시 2026-08-25) — 협력사가 누른 단추 이름과 같아야 한다.
     */
    [project.contractFixAskedAt ? '재검토 요청' : '계약서 접수', project.contractSubmittedAt],
    ['계약 확인', project.contractConfirmedAt],
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

/**
 * 현장 정보 한 묶음 — 값이 없는 칸도 자리를 지킨다. 비어 있는 것이 보이는 것도 정보다.
 * 줄마다 한 칸이던 것을 두 칸씩 접었다 — 열두 값에 상자가 화면 반을 먹었다(한백 지적).
 */
function FactGroup({ title, rows }: { title: string; rows: Array<[string, string | null]> }) {
  return (
    <div className="rounded-box border border-slate-200 px-3.5 py-2.5">
      <p className="mb-1.5 text-tiny font-black tracking-[0.06em] text-slate-500">{title}</p>
      <dl className="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="w-20 shrink-0 text-tiny font-bold text-slate-400">{label}</dt>
            <dd className={`min-w-0 break-keep text-small font-semibold ${value ? 'text-slate-800' : 'text-slate-300'}`}>
              {value ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function IntakeTab({
  project, evaluated, byKind, contract, projectId, siteName, canReview, canSubmit, canEditDocs,
  knownOrgs, status,
}: {
  knownOrgs: string[];
  project: ProjectDetail['project'];
  evaluated: ReturnType<typeof evaluateDocs>;
  byKind: Map<string, ProjectDocument>;
  /** 계약 판정 — 서버가 한 것을 그대로 쓴다(lib/stage.ts contractStateOf) */
  contract: ContractState;
  projectId: string;
  siteName: string;
  canReview: boolean;
  /** 계약서 접수를 누를 수 있는가 — 내는 쪽(협력사·한백) */
  canSubmit: boolean;
  /**
   * 계약 서류를 올리고 뺄 수 있는가 — ★운영사에 낸 뒤로 협력사는 못 바꾼다★
   * (한백 지시 2026-08-29). 한백은 그 뒤에도 바꾼다: 운영사가 반려해 다시 내는 길이 있어야 한다.
   * 판정은 lib/process 의 canChangeContractDocs 한 곳이고 저장소도 같은 것을 본다.
   */
  canEditDocs: boolean;
  /** 지금 서 있는 진행 단계 — 계약완료면 여기서 다음 걸음을 민다 */
  status: ProcessStatus;
}) {
  /*
   * 「서류」 옆에 붙는 필수 수 — ★화면에 보이는 카드로 센다.★
   *
   * contract.satisfied 를 쓰지 않는다. 그쪽은 기설치 서류까지 넣어 세는데 그 서류는 위
   * 「기설치 조사」 구역에서 다뤄 이 구역에 카드가 없다 — 그 수를 여기 적으면 세어지는
   * 칸과 보이는 칸이 어긋나서, 다 채운 것처럼 보이는데 접수가 막히거나 그 반대가 된다.
   */
  /*
   * 확인 뒤의 다음 걸음 — 계약완료에서 운영사 계약서 제출로.
   *
   * 미는 자리가 보드 카드뿐이었다(한백 지시 2026-08-26). 상세에서 서류를 열여섯 칸 보고
   * 확인을 누른 사람이 그 걸음을 하려고 보드로 돌아가야 했다. 시공 탭에도 없다 —
   * 그 두 칸은 ★계약 국면★이라 시공 스테퍼가 행위신고부터 그린다(ConstructionTab).
   *
   * 계약완료일 때만이다. 그 앞(접수·검토)은 확인이 먼저고, 그 뒤는 시공 탭 스테퍼가
   * 민다 — 한 걸음을 두 자리에서 밀면 어느 것이 정본인지 알 수 없다(화면 규칙 5).
   * 이름은 PROCESS_STATUSES 에서 뽑는다: 손으로 적으면 순서가 바뀔 때 여기만 옛말이 된다.
   */
  const nextStep = status === '계약완료' ? PROCESS_STATUSES[statusIndex(status) + 1] : null;

  const requiredHere = evaluated.filter((d) => d.req === 'm' && !d.preinstall);
  const requiredDone = requiredHere.filter((d) => {
    const st = byKind.get(d.key)?.status;
    return st === 'uploaded' || st === 'approved';
  }).length;
  /*
   * 「미충족」은 ★안 낸 것★을 말한다 — 반려는 칸이 차 있고, 그것은 위 반려 띠가 말한다.
   * 둘을 한 태그로 묶으면 반려 하나에 「미충족」과 「반려 1건」이 같이 떠서 무엇을 해야
   * 하는지 흐려진다.
   *
   * 확인된 뒤에는 띄우지 않는다. 이관 현장은 서류가 콘솔에 없는 채로 확인된 상태라
   * (lib/stage docsOutsideConsole) 이 태그가 영구히 붙어 있게 된다 — 끝난 계약에
   * 「모자란다」고 적는 것은 할 일이 아니라 잡음이다.
   */
  const requiredMissing =
    project.contractConfirmedAt === null &&
    requiredHere.some((d) => (byKind.get(d.key)?.status ?? 'none') === 'none');

  /*
   * 「누락 서류 보완요청」이 겨냥하는 칸 — 필수인데 ★파일이 없는★ 칸이다.
   *
   * 기설치 서류(설치이력·증빙)도 센다 — 화면 구역이 다른 것과 필수 여부는 별개다.
   * 판정 규칙은 저장소와 같다(lib/data/assemble.ts missingRequiredDocs) — 목록을 보내지
   * 않고 서버가 다시 세므로 「단추는 눌리는데 저장이 거절되는」 일이 없다.
   */
  const missing = evaluated.filter((d) => d.req === 'm' && !byKind.get(d.key)?.blobUrl);
  /* 지금 서 있는 보완요청 — 파일 없이 반려로 세워진 칸 (되돌릴 수 있어야 한다) */
  const asked = evaluated.filter((d) => {
    const doc = byKind.get(d.key);
    return doc?.status === 'rejected' && !doc.blobUrl;
  });

  /*
   * 기설치 조사 내역을 서류 묶음에 같이 넣는다 (한백 지시 2026-08-25).
   *
   * 조사 결과(있음/없음 · 대수·kW·운영사)는 올린 파일이 아니라 입력값이라 zip 에 들어갈
   * 것이 없었다 — 서류를 전부 받아도 이 내역만 화면에 남아 사람이 옮겨 적어야 했다.
   * 설치이력·증빙 파일은 이미 들어간다(아래 DownloadAll 이 evaluated 전체를 본다).
   *
   * 자체투자는 조사를 하지 않으므로 넣을 것이 없다 — 「해당없음」인 구역의 빈 파일을
   * 묶음에 끼우면 받는 쪽이 조사를 빠뜨린 것으로 읽는다.
   */
  const surveyText = needsPreInstallCheck(project.bizType)
    ? [
        `${siteName} — 기설치 조사`,
        '',
        `기설치: ${project.preChecked ? project.preInstall : '미조사'}`,
        ...(project.preRejectReason ? [`조사 반려: ${project.preRejectReason}`] : []),
        '',
        '조사 내역',
        project.preNote?.trim() || '(비어 있음)',
      ].join('\n')
    : null;

  /* 반려된 것은 사유까지 보여줘야 해서 목록으로 따로 모은다 — 개수는 contract.rejected 다 */
  const rejected = evaluated
    .map((d) => ({ key: d.key, label: d.label, doc: byKind.get(d.key) }))
    .filter((x) => x.doc?.status === 'rejected')
    .map((x) => ({ key: x.key, label: x.label, reason: x.doc!.rejectReason }));

  return (
    <div className="flex flex-col gap-7">
      {/*
        * 끝난 일은 맨 위에서 말한다 (한백 지시 2026-08-25). 서류 열여섯 칸을 지나 맨 아래에
        * 두면 「이 계약이 어디까지 갔나」를 알려고 화면을 끝까지 내려야 했다.
        *
        * ★올라오는 것은 상태뿐이고 단추는 서류 아래에 남는다.★ 「접수하기」·「계약 확인
        * 완료」는 서류를 보고 누르는 것이고, 막힐 때 그 이유를 단추 이름에 적는다
        * (화면 규칙 3) — 그 이름이 가리키는 서류에서 멀어지면 무엇을 말하는지 알 수 없다.
        */}
      <ContractStatus
        projectId={projectId}
        submittedAt={project.contractSubmittedAt}
        confirmedAt={project.contractConfirmedAt}
        fixAsked={project.contractFixAskedAt !== null}
        canSubmit={canSubmit}
        canReview={canReview}
      />

      <SiteFacts project={project} />

      <PreInstall
        project={project}
        docs={evaluated.filter((d) => d.preinstall)}
        byKind={byKind}
        siteName={siteName}
        canReview={canReview}
        canRemove={canEditDocs}
      />

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-h3 font-black text-slate-900">서류</h2>
            {/*
              * 필수 수와 막는 태그를 제목 옆에 붙인다 (한백 지시 2026-08-25). 머리말에
              * 있던 「필수 서류 미충족」은 무슨 서류가 모자란지 말하지 못했고, 그것을 보려면
              * 어차피 이 구역까지 내려온다 — 막는 말은 막힌 자리에 있어야 한다.
              */}
            <span className="text-small font-bold tabular-nums text-slate-400">
              필수 {requiredDone}/{requiredHere.length}
            </span>
            {requiredMissing && <Tag tone="warn">필수 서류 미충족</Tag>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DownloadAll
              docs={evaluated.map((d) => byKind.get(d.key)).filter((d): d is ProjectDocument => Boolean(d))}
              siteName={siteName}
              labelOf={(kind) => evaluated.find((d) => d.key === kind)?.label ?? kind}
              extra={surveyText ? [{ name: '기설치 조사내역', text: surveyText }] : []}
            />
          </div>
        </div>

        {/*
          * 잠긴 이유는 한 번만 적는다 — 칸마다 「못 바꿉니다」를 달면 열여섯 번 같은 말을
          * 하게 된다. 단추가 사라진 자리의 까닭을 여기서 말하고, 대신 무엇을 하라는 것까지
          * 적는다(화면 규칙 3). 쓸 수 있는 사람인데 못 바꾸는 경우만이다 — 열람 전용은
          * 애초에 바꿀 것이 없어서 이 말이 오해가 된다.
          */}
        {canSubmit && !canEditDocs && (
          <Note tone="mute" className="mb-3">
            {CONTRACT_DOCS_LOCKED_WHY}
          </Note>
        )}

        {rejected.length > 0 && (
          <Note tone="stop" className="mb-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="font-black">
                반려된 서류 {rejected.length}건{canReview ? '' : ' — 다시 올려주세요'}
              </p>
              {/*
                * 보완요청을 되돌리는 자리 — 그 상태가 적힌 자리 옆, 반대쪽 끝이다
                * (화면 규칙 7·8). 파일이 올라온 반려는 칸마다 「반려 해제」가 있고,
                * 파일 없이 세운 칸은 여기서 한 번에 되돌린다.
                */}
              {canReview && asked.length > 0 && (
                <AskMissingDocs projectId={projectId} labels={[]} standing={asked.length} />
              )}
            </div>
            <ul className="mt-1.5 flex flex-col gap-1">
              {rejected.map((d) => (
                <li key={d.key} className="text-small leading-relaxed">
                  <b className="font-bold">{d.label}</b>
                  {d.reason ? ` — ${d.reason}` : ''}
                </li>
              ))}
            </ul>
          </Note>
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
                  <h3 className="text-tiny font-black tracking-[0.1em] text-slate-500">{g.label}</h3>
                  {/* 필수의 수는 「서류」 옆이 말한다 — 같은 값을 두 번 두지 않는다(화면 규칙 5) */}
                  {g.req !== 'm' && (
                    <span className="text-tiny font-bold tabular-nums text-slate-400">
                      {done}/{list.length}
                    </span>
                  )}
                  {g.note && <span className="text-tiny text-slate-400">{g.note}</span>}
                </div>

                {/* 칸을 넷으로 — 서류 하나가 손바닥만 하던 것을 줄인다(한백 지적) */}
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {list.map((d) => {
                    const doc = byKind.get(d.key);
                    const st = docState(doc, d.req);
                    const rejected = doc?.status === 'rejected';
                    return (
                      <div
                        key={d.key}
                        /*
                         * 칸 전체를 물들인다 (한백 지시 2026-08-25). 왼쪽 3px 선만으로는 넷씩
                         * 늘어선 카드 사이에서 안 보였다 — 화면 규칙 1 의 층 순서도 배경색이
                         * 테두리보다 앞이다. 선과 배경을 같이 쓰지 않는다: 한 뜻에 장치 하나다.
                         *
                         *   초록 — 냈다            (더 볼 것 없다)
                         *   빨강 — 필수인데 안 냈다  (접수를 막는다)
                         *   주황 — 반려, 보완할 차례 (냈는데 문제가 있다)
                         *   무색 — 조건부·선택      (해당되는 현장만이라 색을 줄 이유가 없다)
                         *
                         * 옅은 색(50)으로 채운다. 화면 규칙 12 는 짙은 빨강을 되돌릴 수 없는 것을
                         * 확정하는 자리에만 두라고 한다 — 여기는 상태이고, 반려 확정 단추가
                         * 그 짙은 빨강을 쓴다. 톤은 components/ui.tsx 의 stop·warn·ok 와 같다.
                         */
                        /* relative — 끌어다 놓는 덮개가 이 칸을 덮는다(DocFiles 의 DocUpload) */
                        className={`relative flex flex-col rounded-box border p-2.5 ${
                          rejected
                            ? 'border-amber-300 bg-amber-50'
                            : doc?.blobUrl || doc?.status === 'uploaded' || doc?.status === 'approved'
                              ? 'border-brand-200 bg-brand-50'
                              : d.req === 'm'
                                ? 'border-red-200 bg-red-50'
                                : 'border-dashed border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="break-keep text-small font-bold leading-snug text-slate-800">
                            {d.label}
                            {/* 확장자는 남긴다 — 무슨 형식으로 내야 하는지는 협력사가 알아야 한다 */}
                            {d.ext && (
                              <span className="ml-1.5 text-micro font-bold text-slate-400">{d.ext}</span>
                            )}
                          </p>
                          <span className={`shrink-0 text-micro font-black ${st.tone}`}>
                            {st.label}
                          </span>
                        </div>

                        {/*
                          * 올린 사람 이름은 적지 않는다 — 회사마다 계정이 하나라 이름이 늘 같다.
                          * 여러 장이면 마지막으로 올린 날이다(파일마다의 날짜는 두지 않는다 —
                          * 칸 넷이 늘어선 화면에서 줄마다 날짜가 붙으면 이름을 읽을 자리가 없다).
                          */}
                        {doc?.uploadedAt && (
                          <p className="mt-1 text-tiny text-slate-400">{doc.uploadedAt}</p>
                        )}

                        {/* 주황 카드 위에서는 red-50 이 묻힌다 — 흰 바탕에 붉은 글씨로 띄운다 */}
                        {doc?.rejectReason && (
                          <p className="mt-2 rounded-ctl bg-white px-2 py-1.5 text-tiny leading-snug text-red-800">
                            {doc.rejectReason}
                          </p>
                        )}

                        {/*
                          * ★카드를 세 구역으로 나눈다★ (한백 지시 2026-08-25 — 조작 UI 가 엉망이었다).
                          *
                          *   사실     이름 · 상태 · 날짜 · 반려 사유
                          *   ─────    파일 목록 (한 줄에 한 장: 이름 · 받기 · 빼기)
                          *   ─────    조작 줄 (파일 추가 … 반려 · 삭제)
                          *
                          * 파일 목록이 조작 단추들과 같은 flex 줄에 있었다. 한 칸에 여러 장이
                          * 붙게 되면서(migrations/0021) 파일 이름·받기·빼기가 「파일 추가」·「반려」·
                          * 「삭제」와 한 줄에서 서로 밀었고, 카드마다 줄바꿈이 달라 높이가 튀었다.
                          *
                          * 구역은 얇은 선으로만 가른다 — 상자 안에 상자를 넣지 않는다(화면 규칙 1).
                          * 선 색은 반투명 먹으로: 카드 배경이 초록·빨강·주황·흰색 넷이라 어느 바탕에서도
                          * 같은 세기로 보인다.
                          *
                          * 조작 줄은 왼쪽이 자주 누르는 것(파일 추가), 오른쪽 끝이 되돌리기 어려운
                          * 것(반려·삭제)이다(화면 규칙 8). 사유를 받을 때는 반려가 줄을 통째로 쓴다.
                          */}
                        {doc && doc.files.length > 0 && (
                          <div className="mt-2 border-t border-slate-900/[0.07] pt-2">
                            <DocFileActions
                              doc={doc}
                              siteName={siteName}
                              label={d.label}
                              projectId={projectId}
                              canRemove={canEditDocs}
                            />
                          </div>
                        )}

                        {/*
                          * 조작 줄은 담을 것이 있을 때만 그린다 — 「해당없음」 칸(선택 서류)은
                          * 올릴 것도 검수할 것도 없다. 빈 줄에 선만 그으면 카드마다 쓸모없는
                          * 층이 하나 늘어난다(화면 규칙 1).
                          */}
                        {((d.req !== 'o' && canEditDocs) || (canReview && doc && doc.status !== 'none')) && (
                        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-900/[0.07] pt-2">
                          {d.req !== 'o' && canEditDocs && (
                            <DocUpload
                              projectId={projectId}
                              kind={d.key}
                              rejected={rejected}
                              hasFile={doc ? doc.files.length > 0 : false}
                            />
                          )}
                          {/* 남는 자리를 밀어 반려·삭제를 반대쪽 끝으로 보낸다 */}
                          <span className="flex-1" />
                          {canReview && doc && doc.status !== 'none' && (
                            <DocReview
                              projectId={projectId}
                              kind={d.key}
                              status={doc.status}
                              hasFile={doc.files.length > 0}
                            />
                          )}
                          {/*
                            * 삭제는 한백만 — 협력사는 파일을 빼거나 다시 올린다.
                            * 반려(붉은 테두리 칩) 뒤 맨 끝에 회색 글자로 — 색과 모양으로 가른다.
                            */}
                          {canReview && doc && doc.status !== 'none' && (
                            <DocDelete
                              projectId={projectId}
                              kind={d.key}
                              label={d.label}
                              filename={doc.filename}
                              count={doc.files.length}
                            />
                          )}
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/*
          * 「영업비 지급조건 미달」을 여기 적지 않는다 (한백 지시 2026-08-25). 계약 탭이
          * 답할 질문은 「계약이 되나」이고 지급 조건은 그 질문이 아니다 — 서류 칸이 이미
          * 무엇이 없는지 말하고 있는데 그 아래 같은 서류 이름을 다시 적으면 두 번 말하는
          * 것이다(화면 규칙 5).
          *
          * 정보는 안 사라진다. 막는 자리인 지급관리가 그대로 적는다
          * (lib/settlement payoutPrerequisiteBlockersOf → PayoutWorkBoard).
          */}

        {/*
          * 두 단추가 순서대로 선다 — 내는 쪽이 접수하고, 한백이 확인한다.
          * 계약이 확인된 뒤에는 접수 단추를 두지 않는다(끝난 일을 되돌리는 자리는 확인 취소다).
          * 이미 끝낸 것은 단추를 두지 않는다 — 그 상태와 되돌리는 자리는 맨 위에 있다.
          */}
        {canSubmit && !project.contractConfirmedAt && !project.contractSubmittedAt && (
          <SubmitContract
            projectId={projectId}
            contract={contract}
            fixAsked={project.contractFixAskedAt !== null}
          />
        )}

        {/*
          * ★검토의 두 갈래를 한 줄에 나란히 둔다★ (한백 지시 2026-08-25).
          * 계약 확인이냐 보완요청이냐 — 서류를 다 보고 나서 고르는 것이 이 둘이고,
          * 아래위로 떨어져 있으면 한쪽만 보인다. 색으로 가른다: 확인은 주 단추(brand),
          * 보완요청은 붉은 테두리(kind="warn") — 배경 빨강은 확정에만 쓴다(화면 규칙 12).
          */}
        <div className="mt-4 flex flex-wrap items-start gap-2">
        {canReview && !project.contractConfirmedAt && (
          <ConfirmContract projectId={projectId} contract={contract} />
        )}

        {/*
          * 확인이 끝나면 같은 자리에서 다음 걸음을 민다(한백 지시 2026-08-26).
          *
          * 처음에는 맨 위 상태 줄에 붙였는데, 확인을 누르는 자리는 여기다 — 서류를 다
          * 보고 나서 판정하는 줄이고, 그 판정의 다음 걸음도 같은 자리에서 이어져야
          * 눈이 옮겨 다니지 않는다. 확인 단추가 사라지면 그 자리를 이 단추가 잇는다.
          */}
        {canReview && project.contractConfirmedAt && nextStep && (
          <AdvanceStage projectId={projectId} next={nextStep} />
        )}

        {canReview
          && !project.contractConfirmedAt
          && asked.length === 0
          && missing.length > 0
          /*
           * 검토에 올라온 계약만 — 모으는 중인 계약(계약접수)에 걸면 협력사가 다 냈다고
           * 말하기도 전에 「안 냈다」고 반려하는 것이 된다. 저장소도 같은 값을 본다.
           */
          && (project.contractSubmittedAt !== null || project.contractFixAskedAt !== null) && (
          /*
           * ★노션 이관 현장도 대상이다★ (한백 지적 2026-08-25 — 단추가 안 보였다).
           * 처음에는 막아뒀다: 이관분은 서류가 콘솔에 0건이라(docsExempt) 「있을 수 없는
           * 증거를 요구하는 것」으로 봤다. 그런데 이관 140건이 전부 계약검토에 서 있고
           * (migrations/0019) 지금 보완요청이 필요한 것이 바로 그 현장들이다 —
           * 노션에 있는 서류를 콘솔로 받아오는 것이 이관의 방향이라, 요구할 수 있는 증거다.
           * 다만 무엇을 요구하는지는 상자에서 말한다.
           */
          <AskMissingDocs
            projectId={projectId}
            labels={missing.map((d) => d.label)}
            standing={0}
            docsExempt={contract.docsExempt}
          />
        )}
        </div>
      </section>

    </div>
  );
}

/**
 * 계약서 접수 — 내는 쪽이 누른다(그 현장의 협력사 · 한백).
 *
 * ★이 단추가 계약검토로 넘긴다★ (한백 지시 2026-08-24). 예전에는 필수 서류 칸이 차는
 * 순간 저절로 넘어갔는데, 그러면 협력사가 아직 고치는 중인 것이 한백의 검토 칸에 서고
 * 협력사에게는 「다 냈다」고 말할 자리가 없었다.
 *
 * 되돌릴 수 있다 — 잘못 눌렀거나 뺄 서류가 생기면 접수를 취소하고 다시 모은다.
 */
function SubmitContract({
  projectId,
  contract,
  fixAsked,
}: {
  projectId: string;
  contract: ContractState;
  /** 한백이 보완요청을 한 적이 있는가 — 그 뒤로 이것은 접수가 아니라 재검토 요청이다 */
  fixAsked: boolean;
}) {
  const { busy, error, run } = useAction();

  const send = () =>
    void run({
      url: `/api/projects/${projectId}/contract-submit`,
      body: { submitted: true },
      fail: '처리에 실패했습니다.',
    });

  /*
   * 막는 것을 단추 이름에 적는다 — 반려는 다시 올리면 풀리므로 여기서 막지 않는다.
   * ★세는 것과 막는 것이 같아야 한다★ — 예전에는 satisfied 로 세고 docsFilled 로 막아서
   * 「0건 남음 — 접수 불가」가 나왔다(2026-08-29 흐름 워크스루).
   */
  const missing = contract.filesMissing;
  /*
   * 보완요청을 받은 뒤부터는 「접수」가 아니라 「재검토 요청」이다 (한백 지시 2026-08-25).
   * 접수는 처음 서류를 모아 내는 일이고, 이것은 고친 것을 다시 봐 달라고 하는 일이다 —
   * 같은 이름을 쓰면 협력사에게 처음으로 되돌아간 것처럼 읽힌다.
   */
  const act = fixAsked ? '재검토 요청' : '접수';
  /*
   * 이관 현장은 서류 조건을 면제한다 — 필수 서류가 콘솔 밖에 있어서(한백이 나중에 채운다)
   * 여기서 막으면 한 칸을 고쳐 올린 협력사가 「다 고쳤다」고 말할 자리가 영영 없다
   * (한백 지시 2026-08-26). 서버도 같은 판정을 한다(pg-store submitContract).
   */
  const ready = contract.docsFilled || contract.docsExempt;
  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <Btn
        disabled={!ready}
        busy={busy}
        busyLabel={`${act} 중…`}
        onClick={send}
        className="self-start"
      >
        {ready
          ? (fixAsked ? '계약 재검토 요청하기' : '계약서 접수하기')
          : `필수 서류 ${missing}건 남음 — ${act} 불가`}
      </Btn>
      <Err>{error}</Err>
    </div>
  );
}

/**
 * 끝난 계약 상태 — 화면 맨 위.
 *
 * 접수와 확인은 서류를 보고 누르는 일이라 단추는 서류 아래에 있다. 그러나 ★끝난 뒤에는
 * 그것이 상태★이고, 상태는 맨 위에서 말해야 한다 — 열여섯 칸을 지나 맨 아래까지 내려야
 * 「이 계약이 어디까지 갔나」를 알 수 있으면 그 정보는 없는 것과 같다.
 *
 * 되돌리는 자리를 그 상태 옆에 둔다. 되돌리기는 상태를 지우는 일이라 상태가 있는 자리에
 * 있어야 하고, 자주 누르는 것과 붙지 않게 반대쪽 끝으로 밀어낸다(화면 규칙 8).
 *
 * 확인된 뒤에는 접수 상태를 적지 않는다 — 계약이 끝난 현장에서 「접수됨」은 이미 지나간
 * 말이고, 되돌리는 자리도 확인 취소 하나로 모인다(화면 규칙 5).
 */
function ContractStatus({
  projectId, submittedAt, confirmedAt, fixAsked, canSubmit, canReview,
}: {
  projectId: string;
  submittedAt: string | null;
  confirmedAt: string | null;
  /** 보완요청을 받은 적이 있는가 — 접수 선언의 이름이 재검토 요청으로 바뀐다 */
  fixAsked: boolean;
  canSubmit: boolean;
  canReview: boolean;
}) {
  const submit = useAction();
  const confirm = useAction();

  const showConfirmed = canReview && confirmedAt !== null;
  const showSubmitted = canSubmit && confirmedAt === null && submittedAt !== null;
  if (!showConfirmed && !showSubmitted) return null;

  return (
    <div className="flex flex-col gap-2">
      {showConfirmed && (
        <Note tone="ok" className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-bold">계약 확인 완료 · {confirmedAt}</span>
          <Btn
            kind="undo"
            busy={confirm.busy}
            busyLabel="되돌리는 중…"
            className="ml-auto"
            onClick={() => void confirm.run({
              url: `/api/projects/${projectId}/contract-confirm`,
              body: { confirmed: false },
              fail: '처리에 실패했습니다.',
            })}
          >
            확인 취소
          </Btn>
          <Err className="w-full">{confirm.error}</Err>
        </Note>
      )}

      {showSubmitted && (
        <Note tone="ok" className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-bold">
            {fixAsked ? '재검토 요청 완료' : '계약서 접수 완료'} · {submittedAt}
          </span>
          <Btn
            kind="undo"
            busy={submit.busy}
            busyLabel="되돌리는 중…"
            className="ml-auto"
            onClick={() => void submit.run({
              url: `/api/projects/${projectId}/contract-submit`,
              body: { submitted: false },
              fail: '처리에 실패했습니다.',
            })}
          >
            {fixAsked ? '요청 취소' : '접수 취소'}
          </Btn>
          <Err className="w-full">{submit.error}</Err>
        </Note>
      )}
    </div>
  );
}

/**
 * 계약 확인 완료 — 한백만.
 *
 * ★이 버튼이 계약을 넘긴다.★ 예전에는 서류와 단가가 채워지는 순간 저절로 계약완료로
 * 갔다. 그러면 한백이 보기 전에 시공으로 가 있고 「누가 확인한 계약인가」에 답할 수 없다.
 * 지금은 확인한 날이 저장되고(project.contractConfirmedAt) 그것이 단계의 조건이다.
 *
 * 되돌릴 수 있다. 잘못 눌렀을 때 길이 없으면 DB 를 직접 만져야 한다 —
 * 되돌리면 담당도 한백으로 돌아온다.
 */
function ConfirmContract({
  projectId,
  contract,
}: {
  projectId: string;
  contract: ContractState;
}) {
  const { busy, error, run } = useAction();

  /*
   * 무엇이 막고 있는지 버튼 이름에 그대로 적는다 — 안내문을 따로 두지 않는다.
   * 눌릴 수 있는지는 contract.ready 하나로 판정한다. 저장소도 같은 값을 보므로
   * 「버튼은 눌리는데 저장이 거절되는」 일이 없다.
   */
  /*
   * 기설치 조사 반려도 확인을 막는다(한백 지적 2026-08-26) — 서류와 같은 이치로 만든
   * 자리인데 정작 막지 않아서, 반려해 두고도 확인이 눌렸다. 조사 반려만 있는 현장은
   * rejected 가 1이라(lib/stage) 아래 첫 줄에서 「반려 1건」으로 잡힌다.
   */
  const reason = contract.rejected > 0
    ? `반려 ${contract.rejected}건`
    /*
     * 서류가 콘솔 밖에 있는 현장(노션 이관분)은 서류로 막지 않는다 — ready 가 열려 있는데
     * 이름만 「계약 확인 불가」로 두면 눌리는 단추가 못 한다고 말한다. 판정은 lib/stage 가
     * 하고 여기는 그 값을 본다.
     */
    : !contract.docsExempt && contract.satisfied < contract.requiredTotal
      ? '필수 서류 미충족'
      /* 단가를 붙이는 자리는 이 탭이 아니다 — 막는 것만 적으면 어디로 갈지 모른다 */
      : !contract.allPriced
        ? '단가 미지정 (협력사 정산관리 탭)'
        : null;

  const send = () =>
    void run({
      url: `/api/projects/${projectId}/contract-confirm`,
      body: { confirmed: true },
      fail: '처리에 실패했습니다.',
    });

  /* 여백은 줄을 쥔 쪽(위 flex)이 준다 — 나란히 서는 단추가 자기 mt 를 갖고 있으면 어긋난다 */
  return (
    <div className="flex flex-col gap-1.5">
      <Btn
        disabled={!contract.ready}
        busy={busy}
        onClick={send}
        className="self-start"
      >
        {/* 막는 것을 단추 이름에 적는다 — 흐린 단추만으로는 왜 안 되는지 알 수 없다 */}
        {reason ? `${reason} — 계약 확인 불가` : '계약 확인 완료'}
      </Btn>
      <Err>{error}</Err>
    </div>
  );
}

/**
 * 확인된 계약을 다음 단계로 — 한백만.
 *
 * 「계약 확인 완료」가 서 있던 자리를 그대로 잇는다. 모양도 같다(주 단추 + 그 밑 실패
 * 문구) — 같은 줄에서 이어지는 걸음이라 크기가 달라지면 다른 종류의 일로 읽힌다.
 *
 * 막는 것을 이름에 적지 않는다 — 이 걸음에는 조건이 없다(STATUS_GATES 의 운영사 계약서
 * 제출은 null). 넘기는 것이 곧 「우리가 냈다」는 선언이고, 낸 날은 저장소가 찍는다.
 */
function AdvanceStage({ projectId, next }: { projectId: string; next: ProcessStatus }) {
  const { busy, error, run } = useAction();

  /* 여백은 줄을 쥔 쪽(위 flex)이 준다 — ConfirmContract 와 같은 규칙이다 */
  return (
    <div className="flex flex-col gap-1.5">
      <Btn
        busy={busy}
        busyLabel="넘기는 중…"
        className="self-start"
        onClick={() => void run({
          url: `/api/projects/${projectId}/status`,
          body: { status: next },
          fail: '넘기지 못했습니다.',
        })}
      >
        {next} 로 넘기기 →
      </Btn>
      <Err>{error}</Err>
    </div>
  );
}

/**
 * 누락 서류 보완요청 — 한백만.
 *
 * ★안 낸 서류는 칸마다 반려할 수 없다.★ 반려는 올라온 파일에 대한 판정이고, 저장소는
 * 미제출 검수를 거절한다(「제출되지 않은 서류는 검수할 수 없습니다」). 그래서 필수 서류가
 * 여러 칸 빈 채로 검토에 올라온 계약을 계약보완으로 내릴 길이 없었다(한백 지시 2026-08-25) —
 * 한백이 할 수 있는 일은 계약 확인을 안 누르고 두는 것뿐이었고, 그 현장은 검토 칸에
 * 그대로 서서 협력사에게는 아무 말도 가지 않았다.
 *
 * 여기서 그 칸들을 한 번에 반려로 세운다. 그러면 반려 한 장과 같은 일이 일어난다 —
 * 계약보완으로 내려가고, 공이 영업사로 넘어가고, 협력사 화면의 반려 띠에 무엇이 없는지
 * 서류 이름으로 적힌다.
 *
 * 목록은 서버에 보내지 않는다 — 저장소가 필수·미제출을 다시 판정한다. 여기 보이는 이름은
 * 「무엇이 반려될지」를 누르기 전에 보여주기 위한 것이다.
 *
 * 되돌릴 수 있다(화면 규칙 7) — 파일 없이 세운 칸은 한 번에 미제출로 돌아간다.
 */
function AskMissingDocs({
  projectId, labels, standing, docsExempt = false,
}: {
  projectId: string;
  /** 반려될 서류 이름들 — 누르기 전에 보여준다 */
  labels: string[];
  /** 이미 서 있는 보완요청 칸 수. 0 이 아니면 이 자리는 되돌리는 자리다. */
  standing: number;
  /** 노션 이관 현장인가 — 서류가 콘솔에 없다. 요구하는 것이 무엇인지 달라진다. */
  docsExempt?: boolean;
}) {
  const { busy, error, setError, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const send = (ask: boolean, why?: string) =>
    void run({
      url: `/api/projects/${projectId}/docs-missing`,
      body: { ask, reason: why?.trim() || null },
      fail: ask ? '보완요청에 실패했습니다.' : '되돌리지 못했습니다.',
    }).then((ok) => {
      if (ok) { setOpen(false); setReason(''); }
    });

  /* 되돌리는 자리 — 글자 단추다(확정이 아니다, 화면 규칙 12) */
  if (standing > 0) {
    return (
      <span className="ml-auto flex flex-col items-end gap-1">
        <Btn
          kind="undo"
          size="sm"
          busy={busy}
          busyLabel="되돌리는 중…"
          onClick={() => send(false)}
        >
          보완요청 취소 ({standing})
        </Btn>
        <Err>{error}</Err>
      </span>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1.5">
        {/*
          * 계약 확인 옆에 같은 크기로 선다 — 붉은 테두리 단추다(kind="warn").
          * 글자 단추였을 때는 주 단추 옆에서 배경으로 읽혀 못 찾았다(한백 지적).
          * 배경 빨강은 아래 「보완요청 확정」에만 쓴다(화면 규칙 12).
          */}
        <Btn kind="warn" disabled={busy} onClick={() => setOpen(true)}>
          누락 서류 {labels.length}건 보완요청
        </Btn>
        <Err>{error}</Err>
      </div>
    );
  }

  /* 열면 줄을 통째로 쓴다(w-full) — 확인 단추 옆에 끼면 서류 이름을 읽을 자리가 없다 */
  return (
    <div className="flex w-full max-w-xl flex-col gap-2 rounded-box border border-red-200 bg-red-50 px-3.5 py-3">
      <p className="text-small font-black text-red-900">
        아래 {labels.length}건을 반려하고 계약보완으로 내립니다
      </p>
      {/*
        * 이관 현장에서는 「없다」가 아니라 「콘솔에 없다」다 — 노션에 있는 서류를 콘솔로
        * 올려달라는 요구다. 그 말을 안 적으면 협력사가 이미 낸 서류를 다시 만들려 한다.
        */}
      {docsExempt && (
        <p className="text-tiny font-bold leading-snug text-red-800">
          노션 이관 현장입니다 — 이 서류들은 콘솔에 없습니다. 협력사에게 콘솔로 다시
          올려달라는 요청이 됩니다.
        </p>
      )}
      {/* 무엇이 반려될지 이름으로 보여준다 — 개수만으로는 눌러도 되는지 알 수 없다 */}
      <ul className="flex flex-wrap gap-1.5">
        {labels.map((l) => (
          <li key={l} className="rounded-tag bg-white px-2 py-0.5 text-tiny font-bold text-red-800">
            {l}
          </li>
        ))}
      </ul>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="사유 — 비우면 「미제출 — 제출해주세요」로 갑니다"
        className={`${FIELD} leading-snug`}
      />
      <div className="flex flex-wrap gap-1.5">
        <Btn size="sm" kind="stop" busy={busy} busyLabel="처리 중…" onClick={() => send(true, reason)}>
          보완요청 확정
        </Btn>
        <Btn size="sm" kind="side" disabled={busy} onClick={() => { setOpen(false); setReason(''); setError(null); }}>
          취소
        </Btn>
      </div>
      <Err>{error}</Err>
    </div>
  );
}

'use client';

/**
 * 계약 탭 — 현장정보 · 기설치 · 서류.
 *
 * 서류는 필수·조건부·선택 세 묶음으로 나눈다. 「해당없음」칸도 지우지 않는다 —
 * 빠뜨린 것과 원래 필요 없는 것을 구별해야 한다(lib/doc-rules).
 */
import type { ContractState, ProjectDetail, ProjectDocument } from '@/types/project';
import { evaluateDocs, type DocReq } from '@/lib/doc-rules';
import { DocDelete, DocFileActions, DocUpload, DownloadAll } from '@/components/DocFiles';
import { useAction } from '@/lib/use-action';
import { DocReview } from './DocReview';
import { PreInstall } from './PreInstall';
import { docState } from './parts';
import { Btn, Err, Note } from '@/components/ui';

// ── 계약 탭 ─────────────────────────────────────────────────────
/** 서류를 세 묶음으로 가른다 — 접수 화면(components/IntakeForm)과 같은 말·같은 색 */
const DOC_GROUPS: Array<{ req: DocReq; label: string; rule: string; note?: string }> = [
  { req: 'm', label: '필수', rule: 'bg-red-400' },
  { req: 'c', label: '조건부', rule: 'bg-amber-400', note: '해당되는 현장만' },
  { req: 'o', label: '선택', rule: 'bg-slate-300', note: '있으면 함께' },
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
    ['교체유형', project.replType ?? (project.bizType ? '라인별로 다름' : null)],
    /*
     * 세 날짜가 순서대로 선다 — 계약서를 받은 날 · 협력사가 다 냈다고 누른 날 ·
     * 한백이 확인한 날. 한 칸에 뭉치면 「누가 언제 무엇을 했나」가 사라진다.
     * 이관 현장은 접수일과 확인일이 같은 값이다(노션에는 수령일만 있었다).
     */
    ['계약서 수령일', project.createdAt],
    ['계약서 접수', project.contractSubmittedAt],
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
  project, evaluated, byKind, contract, projectId, siteName, canReview, canSubmit,
  knownOrgs,
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
}) {
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
      />

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3 font-black text-slate-900">서류</h2>
          <div className="flex flex-wrap items-center gap-3">
            <DownloadAll
              docs={evaluated.map((d) => byKind.get(d.key)).filter((d): d is ProjectDocument => Boolean(d))}
              siteName={siteName}
              labelOf={(kind) => evaluated.find((d) => d.key === kind)?.label ?? kind}
            />
          </div>
        </div>

        {rejected.length > 0 && (
          <Note tone="stop" className="mb-3">
            <p className="font-black">
              반려된 서류 {rejected.length}건{canReview ? '' : ' — 다시 올려주세요'}
            </p>
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
                  <span aria-hidden className={`h-[3px] w-5 rounded-full ${g.rule}`} />
                  <h3 className="text-tiny font-black tracking-[0.1em] text-slate-500">{g.label}</h3>
                  <span className="text-tiny font-bold tabular-nums text-slate-400">
                    {done}/{list.length}
                  </span>
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
                        className={`flex flex-col rounded-box border p-2.5 ${
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
                          * 「영업비 조건」 배지도 달지 않는다 — 칸마다 붙어 있어도 할 일이 달라지지
                          * 않는다. 조건이 실제로 미달일 때만 아래 한 줄로 알린다(feeMissing).
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
                          * 조작은 카드 아래에 모은다. 예전에는 미리보기·올리기·검수·삭제가
                          * 세로로 네 줄 쌓여서 카드마다 높이가 달랐다.
                          *
                          * 반려는 같은 줄의 오른쪽 끝으로 밀어낸다(DocReview 안의 ml-auto).
                          * 자주 누르는 것(미리보기·올리기)과 되돌리기 어려운 것을 나란히 두면
                          * 잘못 누른다. 사유를 받을 때는 아래로 한 줄 내려간다.
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
                            {canReview && doc && doc.status !== 'none' && (
                              <DocReview projectId={projectId} kind={d.key} status={doc.status} />
                            )}
                            {/*
                              * 삭제는 한백만 — 협력사는 다시 올려서 덮는 길이 있다.
                              * 반려(빨간 글자) 뒤 맨 끝에 회색 글자로 — 색과 자리로 가른다(한백 지적).
                              */}
                            {canReview && doc && doc.status !== 'none' && (
                              <DocDelete
                                projectId={projectId}
                                kind={d.key}
                                label={d.label}
                                filename={doc.filename}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {contract.feeMissing.length > 0 && (
          <Note tone="warn" className="mt-3 font-semibold">
            영업비 지급조건 미달 — {contract.feeMissing.join(' · ')}
          </Note>
        )}

        {/*
          * 두 단추가 순서대로 선다 — 내는 쪽이 접수하고, 한백이 확인한다.
          * 계약이 확인된 뒤에는 접수 단추를 두지 않는다(끝난 일을 되돌리는 자리는 확인 취소다).
          * 이미 끝낸 것은 단추를 두지 않는다 — 그 상태와 되돌리는 자리는 맨 위에 있다.
          */}
        {canSubmit && !project.contractConfirmedAt && !project.contractSubmittedAt && (
          <SubmitContract projectId={projectId} contract={contract} />
        )}

        {canReview && !project.contractConfirmedAt && (
          <ConfirmContract projectId={projectId} contract={contract} />
        )}
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
}: {
  projectId: string;
  contract: ContractState;
}) {
  const { busy, error, run } = useAction();

  const send = () =>
    void run({
      url: `/api/projects/${projectId}/contract-submit`,
      body: { submitted: true },
      fail: '처리에 실패했습니다.',
    });

  /* 막는 것을 단추 이름에 적는다 — 반려는 다시 올리면 풀리므로 여기서 막지 않는다 */
  const missing = contract.requiredTotal - contract.satisfied;
  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <Btn
        disabled={!contract.docsFilled}
        busy={busy}
        busyLabel="접수 중…"
        onClick={send}
        className="self-start"
      >
        {contract.docsFilled ? '계약서 접수하기' : `필수 서류 ${missing}건 남음 — 접수 불가`}
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
  projectId, submittedAt, confirmedAt, canSubmit, canReview,
}: {
  projectId: string;
  submittedAt: string | null;
  confirmedAt: string | null;
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
          <span className="font-bold">계약서 접수 완료 · {submittedAt}</span>
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
            접수 취소
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
 * 되돌리면 공 차례도 한백으로 돌아온다.
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
  const reason = contract.rejected > 0
    ? `반려 ${contract.rejected}건`
    /*
     * 서류가 콘솔 밖에 있는 현장(노션 이관분)은 서류로 막지 않는다 — ready 가 열려 있는데
     * 이름만 「계약 확인 불가」로 두면 눌리는 단추가 못 한다고 말한다. 판정은 lib/stage 가
     * 하고 여기는 그 값을 본다.
     */
    : !contract.docsExempt && contract.satisfied < contract.requiredTotal
      ? '필수 서류 미충족'
      : !contract.allPriced
        ? '단가 미지정'
        : null;

  const send = () =>
    void run({
      url: `/api/projects/${projectId}/contract-confirm`,
      body: { confirmed: true },
      fail: '처리에 실패했습니다.',
    });

  return (
    <div className="mt-4 flex flex-col gap-1.5">
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

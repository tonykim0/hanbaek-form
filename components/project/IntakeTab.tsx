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

export function IntakeTab({
  project, evaluated, byKind, contract, projectId, siteName, canReview,
  partyInferred, inferredParty, knownOrgs,
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
  partyInferred: boolean;
  inferredParty: string;
}) {
  /* 반려된 것은 사유까지 보여줘야 해서 목록으로 따로 모은다 — 개수는 contract.rejected 다 */
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
                  <h3 className="text-tiny font-black tracking-[0.1em] text-slate-500">{g.label}</h3>
                  <span className="text-tiny font-bold tabular-nums text-slate-400">
                    {done}/{list.length}
                  </span>
                  {g.note && <span className="text-tiny text-slate-400">{g.note}</span>}
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
                              <span className="ml-1.5 text-micro font-bold text-slate-400">{d.ext}</span>
                            )}
                          </p>
                          <span className={`shrink-0 text-tiny font-black ${st.tone}`}>
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

                        {doc?.rejectReason && (
                          <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-tiny leading-snug text-red-800">
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
                            {/* 삭제는 한백만. 협력사는 다시 올려서 덮는 길이 있다. */}
                            {canReview && doc && doc.status !== 'none' && (
                              <DocDelete
                                projectId={projectId}
                                kind={d.key}
                                label={d.label}
                                filename={doc.filename}
                              />
                            )}
                            {canReview && doc && doc.status !== 'none' && (
                              <DocReview projectId={projectId} kind={d.key} status={doc.status} />
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
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
            영업비 지급조건 미달 — {contract.feeMissing.join(' · ')}
          </p>
        )}

        {canReview && (
          <ConfirmContract
            projectId={projectId}
            contract={contract}
            confirmedAt={project.contractConfirmedAt}
          />
        )}
      </section>

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
  confirmedAt,
}: {
  projectId: string;
  contract: ContractState;
  confirmedAt: string | null;
}) {
  const { busy, error, run } = useAction();

  /*
   * 무엇이 막고 있는지 버튼 이름에 그대로 적는다 — 안내문을 따로 두지 않는다.
   * 눌릴 수 있는지는 contract.ready 하나로 판정한다. 저장소도 같은 값을 보므로
   * 「버튼은 눌리는데 저장이 거절되는」 일이 없다.
   */
  const reason = contract.rejected > 0
    ? `반려 ${contract.rejected}건`
    : contract.satisfied < contract.requiredTotal
      ? '필수 서류 미충족'
      : !contract.allPriced
        ? '단가 미지정'
        : null;

  const send = (confirmed: boolean) =>
    void run({
      url: `/api/projects/${projectId}/contract-confirm`,
      body: { confirmed },
      fail: '처리에 실패했습니다.',
    });

  if (confirmedAt) {
    return (
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="rounded-xl bg-brand-50 px-3.5 py-2 text-sm font-bold text-brand-900">
          계약 확인 완료 · {confirmedAt}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => send(false)}
          className="text-tiny font-bold text-slate-400 underline decoration-slate-300 transition hover:text-slate-700 disabled:text-slate-300"
        >
          {busy ? '되돌리는 중…' : '확인 취소'}
        </button>
        {error && <p className="w-full text-xs font-semibold text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <button
        type="button"
        disabled={busy || !contract.ready}
        onClick={() => send(true)}
        className="self-start rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        {reason
          ? `${reason} — 계약 확인 불가`
          : busy
            ? '처리 중'
            : '계약 확인 완료'}
      </button>
      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}

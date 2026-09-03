'use client';

/**
 * 기설치 조사 — 조사 결과(있음/없음 + 내역)와 서류 두 칸(설치이력·증빙).
 *
 * 한때 조사 입력을 걷어내고 「파일이 곧 조사 결과」로 뒀는데, 파일만으로는 몇 대·몇 kW·
 * 어느 운영사인지가 화면에 남지 않아 조사 내역 입력을 되살렸다(한백 지시 2026-08-23).
 * 저장 경로는 원래 있던 것이다 — PATCH /preinstall 이 있음/없음·내역·조사 표시를 받고,
 * 조사를 다시 저장하면 한백의 조사 반려가 풀린다(저장소 규칙).
 *
 * 서류 목록에서 빼내 자기 구역에 두는 것은 유지한다 — 현장마다 해야 하는 일이라
 * 증빙이 서류 열여섯 칸 사이에 섞여 있으면 조사가 됐는지 보이지 않는다.
 */
import { useState } from 'react';
import type { PreInstall as PreInstallState, ProjectDetail, ProjectDocument } from '@/types/project';
import { evaluateDocs, needsPreInstallCheck } from '@/lib/doc-rules';
import { DocDelete, DocFileActions, DocUpload, DownloadAll } from '@/components/DocFiles';
import { useAction } from '@/lib/use-action';
import { Badge, Btn, Choice, Empty, Err, FIELD, Tag } from '@/components/ui';
import { DocReview } from './DocReview';
import { docState } from './parts';
import { useShardLoader } from '@/components/ChargerHistoryLookup';
import {
  DATA_BASE, isSubsidized, lookupChargerHistory, summarize, type LookupResult, type SiteRecord,
} from '@/lib/charger-history';
import {
  lookupSubsidyHistory, SUBSIDY_DATA_BASE, summarizeSubsidy, type SubsidyRecord,
} from '@/lib/subsidy-history';

export function PreInstall({
  project, docs, byKind, siteName, canReview, canRemove = false, surveyText,
}: {
  project: ProjectDetail['project'];
  docs: ReturnType<typeof evaluateDocs>;
  byKind: Map<string, ProjectDocument>;
  siteName: string;
  canReview: boolean;
  /** 파일 한 장을 뺄 수 있는가 — 내는 쪽(협력사)과 한백 (열람 전용은 아니다) */
  canRemove?: boolean;
  /**
   * 조사 내역을 글자로 — 묶음에 .txt 로 같이 들어간다.
   *
   * ★파일이 아니라 입력값이라 빠뜨리기 쉽다★ (2026-08-25 에 서류 묶음에서 겪은 것과
   * 같은 자리다): 대수·kW·운영사가 적힌 조사 결과는 올린 파일이 아니어서, 파일만 받으면
   * 그 내역이 화면에만 남아 사람이 옮겨 적어야 했다. 만드는 자리는 IntakeTab 한 곳이다 —
   * 여기서 다시 만들면 두 묶음의 글이 갈린다.
   */
  surveyText?: string | null;
}) {
  /*
   * 자체투자는 기설치 조사를 하지 않는다 — 환경부 보조금이 기설치 여부로 갈리기 때문에
   * 하는 조사이고, 보조금을 안 받으면 조사할 이유가 없다(2026-08-20 한백 확인).
   * 구역을 없애지 않는다 — 「안 올림」과 「해당없음」은 다른 것이다.
   */
  if (!needsPreInstallCheck(project.bizType)) {
    return (
      <section>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-h3 font-black text-slate-900">기설치 조사</h2>
          <Badge>해당없음</Badge>
        </div>
      </section>
    );
  }

  return (
    <section>
      {/*
        ★받는 단추는 제목 옆이다★ (한백 지시 2026-08-31) — 오른쪽 끝으로 밀면 넓은 화면에서
        제목과 떨어져 무엇을 받는 것인지 눈이 가로질러 이어야 한다. 서류 구역과 같은 꼴이다.
        계약 서류의 「전체 다운로드」에도 기설치 파일이 들어가지만, 그것은 열여섯 칸을
        통째로 받는 자리다. 기설치만 따로 받을 일이 따로 있다(운영사 제출·조사 재확인).
      */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
        <h2 className="text-h3 font-black text-slate-900">기설치 조사</h2>
        {project.preRejectReason ? (
          <Tag tone="warn">조사 반려</Tag>
        ) : project.preChecked ? (
          <Badge tone="ok">기설치 {project.preInstall}</Badge>
        ) : (
          <Tag tone="warn">조사 필요</Tag>
        )}
        {/* 테두리 있는 단추는 baseline 에서 조금 내려앉는다 — 글자 줄이 아니라 가운데에 맞춘다 */}
        <span className="self-center">
          <DownloadAll
            docs={docs.map((d) => byKind.get(d.key)).filter((d): d is ProjectDocument => Boolean(d))}
            siteName={siteName}
            labelOf={(kind) => docs.find((d) => d.key === kind)?.label ?? kind}
            extra={surveyText ? [{ name: '기설치 조사내역', text: surveyText }] : []}
          />
        </span>
      </div>

      <Survey project={project} />

      {/*
        * 조사도 보완이 필요하다(한백 지시 2026-08-24) — 서류와 같은 이치다. 조사 내역이
        * 부실하면 「다시 조사해라」를 사유와 함께 돌려보낸다. 조사한 적이 없으면 되돌릴
        * 것도 없으니 단추를 두지 않는다. 협력사가 조사를 다시 저장하면 반려가 풀린다.
        */}
      {/*
        * 반려된 뒤에도 단추가 서 있어야 한다 — 반려가 preChecked 를 false 로 만들기 때문에
        * preChecked 만 보면 반려한 순간 되돌릴 자리가 사라졌다(2026-08-26 발견, 화면 규칙 7).
        */}
      {canReview && (project.preChecked || project.preRejectReason !== null) && (
        <SurveyReview
          projectId={project.id}
          rejected={project.preRejectReason !== null}
          current={project.preRejectReason}
        />
      )}

      <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {docs.map((d) => {
          const doc = byKind.get(d.key);
          const st = docState(doc, d.req);
          return (
            /* relative — 끌어다 놓는 덮개가 이 칸을 덮는다(DocFiles 의 DocUpload) */
            <div key={d.key} className="relative flex flex-col rounded-box border border-slate-200 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="break-keep text-small font-bold leading-snug text-slate-800">
                  {d.label}
                  {d.ext && <span className="ml-1.5 text-micro font-bold text-slate-400">{d.ext}</span>}
                </p>
                <span className={`shrink-0 text-micro font-black ${st.tone}`}>{st.label}</span>
              </div>
              {doc?.uploadedAt && <p className="mt-1 text-tiny text-slate-400">{doc.uploadedAt}</p>}
              {doc?.rejectReason && (
                <p className="mt-2 rounded-ctl bg-red-50 px-2 py-1.5 text-tiny leading-snug text-red-800">
                  {doc.rejectReason}
                </p>
              )}

              {/*
                * 서류 칸과 같은 세 구역이다 — 사실 · 파일 목록 · 조작 (IntakeTab 의 카드 주석 참조).
                * 같은 서류를 두 구역에서 다른 모양으로 보여주면 어느 쪽이 맞는지 물어야 한다.
                */}
              {doc && doc.files.length > 0 && (
                <div className="mt-2 border-t border-slate-900/[0.07] pt-2">
                  <DocFileActions
                    doc={doc}
                    siteName={siteName}
                    label={d.label}
                    projectId={project.id}
                    canRemove={canRemove}
                  />
                </div>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-900/[0.07] pt-2">
                <DocUpload
                  projectId={project.id}
                  kind={d.key}
                  rejected={doc?.status === 'rejected'}
                  hasFile={doc ? doc.files.length > 0 : false}
                />
                <span className="flex-1" />
                {canReview && doc && doc.status !== 'none' && (
                  <DocReview
                    projectId={project.id}
                    kind={d.key}
                    status={doc.status}
                    hasFile={doc.files.length > 0}
                  />
                )}
                {canReview && doc && doc.status !== 'none' && (
                  <DocDelete
                    projectId={project.id}
                    kind={d.key}
                    label={d.label}
                    filename={doc.filename}
                    count={doc.files.length}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}


/**
 * 조사 반려 — 한백 전용. 서류 반려(DocReview)와 같은 모양이다.
 *
 * 승인 단추는 없다 — 제출된 조사는 기본이 통과이고, 한백이 하는 일은 부실한 것을
 * 골라내는 것뿐이다(검수 규칙). 사유를 받는다: 사유 없이 되돌리면 협력사가 무엇을
 * 다시 조사해야 할지 알 수 없다. 서버도 같은 검사를 한다(preinstall 라우트).
 */
/**
 * 조사 반려의 기본 사유 — 열면 이 문장이 적혀 있다 (한백 지시 2026-08-26).
 *
 * 열 번 중 아홉 번이 같은 말이라 매번 다시 치고 있었다. 빈 칸으로 두면 「보완해주세요」
 * 같은 한 마디만 가서 협력사가 무엇을 내야 하는지 모른다 — 기본값이 곧 그 답이다.
 * 고칠 수 있다: 다른 이유면 지우고 쓴다.
 */
const DEFAULT_SURVEY_REJECT = '기설치 이력엑셀 파일/증빙자료 필요';

function SurveyReview({
  projectId, rejected, current,
}: {
  projectId: string;
  rejected: boolean;
  /** 지금 걸려 있는 반려 사유 — 「사유 수정」으로 열면 이것이 들어온다 */
  current: string | null;
}) {
  const { busy, error, setError, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  /*
   * 여는 순간 칸을 채운다. 고칠 때는 지금 사유, 처음이면 기본 사유다 —
   * 수정을 누르고 빈 칸이 나오면 원래 뭐라고 적었는지 보려고 화면을 다시 봐야 한다.
   */
  const openWith = () => {
    setReason(current ?? DEFAULT_SURVEY_REJECT);
    setOpen(true);
  };

  async function send(why: string | null) {
    const ok = await run({
      url: `/api/projects/${projectId}/preinstall`,
      method: 'PATCH',
      body: { preRejectReason: why },
      fail: '처리에 실패했습니다.',
    });
    if (!ok) return;
    setOpen(false);
    setReason('');
  }

  if (open) {
    return (
      <div className="mt-2 flex max-w-xl flex-col gap-1.5">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          placeholder="보완 사유 — 협력사가 이 문장을 보고 다시 조사합니다"
          className={`${FIELD} leading-snug`}
        />
        <div className="flex gap-1.5">
          <Btn size="sm" kind="stop" disabled={!reason.trim()} busy={busy} onClick={() => void send(reason)}>
            조사 반려 확정
          </Btn>
          <Btn size="sm" kind="side" disabled={busy} onClick={() => { setOpen(false); setReason(''); setError(null); }}>
            취소
          </Btn>
        </div>
        <Err>{error}</Err>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      {rejected ? (
        <>
          <Btn size="sm" busy={busy} onClick={() => void send(null)}>
            반려 해제
          </Btn>
          <Btn size="sm" kind="undo" disabled={busy} onClick={openWith}>
            사유 수정
          </Btn>
        </>
      ) : (
        /* 여는 자리는 글자만 — 확정만 빨강 배경이다(화면 규칙 12) */
        <button
          type="button"
          disabled={busy}
          onClick={openWith}
          className="text-tiny font-bold text-red-700 underline decoration-red-300 transition hover:text-red-900 disabled:text-slate-300"
        >
          조사 반려
        </button>
      )}
      <Err>{error}</Err>
    </div>
  );
}

/*
 * 조사 결과 — 있음/없음과 조사 내역(대수·kW·운영사·보조금 이력 등).
 * 평소엔 글자로 굳히고 「수정」을 눌러야 열린다(화면 규칙 4번). 저장에 preChecked 를
 * 같이 실어 「조사했다」가 되고, 반려 상태였다면 저장이 반려를 푼다(저장소 규칙).
 * 열람 전용의 쓰기는 서버(write-route)가 막는다.
 */
function Survey({ project }: { project: ProjectDetail['project'] }) {
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<PreInstallState>(project.preInstall);
  const [note, setNote] = useState(project.preNote ?? '');

  /*
   * 1차 조사 = /lookup 과 같은 이력 조회 — 실무 순서가 「이력 조회로 1차 확인 → 영업자가
   * 고객사·현장에서 재확인」이라(한백 확인 2026-08-23), 그 1차를 이 자리에서 현장 주소로
   * 돌려 초안을 만들어 준다. 자동 저장하지 않는다 — 조회는 초안이고, 저장은 사람이
   * 재확인을 거쳐 누르는 것이다. 조회 로직·데이터는 /lookup 과 같은 것을 그대로 쓴다.
   */
  const loadCharger = useShardLoader<SiteRecord>(DATA_BASE);
  const loadSubsidy = useShardLoader<SubsidyRecord>(SUBSIDY_DATA_BASE);
  const [looking, setLooking] = useState(false);
  /* 조회 결과 — 글자만 든다. 기설치 있음/없음 판정은 사람이 하므로 여기서 들 것이 없다 */
  const [draft, setDraft] = useState<string | null>(null);
  const [lookErr, setLookErr] = useState<string | null>(null);

  async function firstLook() {
    if (!project.addr) return;
    setLooking(true);
    setLookErr(null);
    try {
      const input = { road: project.addr, jibun: '' };
      const [charger, subsidy] = await Promise.all([
        lookupChargerHistory(input, loadCharger),
        lookupSubsidyHistory(input, loadSubsidy),
      ]);
      setDraft(draftOf(charger, subsidy));
    } catch (e) {
      setLookErr((e as Error).message);
    } finally {
      setLooking(false);
    }
  }

  async function save() {
    const ok = await run({
      url: `/api/projects/${project.id}/preinstall`,
      method: 'PATCH',
      body: { preInstall: state, preNote: note.trim() || null, preChecked: true },
      fail: '조사 내역을 저장하지 못했습니다.',
    });
    if (ok) setEditing(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {project.preRejectReason && (
        <p className="max-w-xl rounded-ctl bg-red-50 px-3 py-2 text-tiny leading-snug text-red-800">
          {project.preRejectReason}
        </p>
      )}

      {/*
        ★이력 조회는 편집 밖에 있다★ (한백 지시 2026-09-03 「조사결과 작성하지 않아도
        조회가능하게」). 그전에는 「조사 내역 적기」를 눌러 편집으로 들어가야만 조회 단추가
        나왔다 — 그런데 조회는 ★읽는 일★이다: 이 현장에 기설치가 있나만 보고 끝낼 때가 많고,
        그때마다 편집을 열었다 취소해야 했다. 편집을 열어 두면 실수로 저장할 자리도 생긴다.
        (같은 조회가 상단바의 「기설치 이력조회」에도 있지만 거기서는 주소를 다시 쳐야 한다.)

        조회는 그대로 초안일 뿐이다 — 「조사 내역 채우기」를 누르면 그때 편집이 열리고
        칸이 채워진다. 저장은 여전히 사람이 재확인을 거쳐 누른다.
      */}
      <div className="flex flex-col gap-2">
        <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">이력 조회</span>
        <div className="flex flex-wrap items-center gap-2">
          <Btn
            size="sm"
            kind="side"
            busy={looking}
            busyLabel="조회 중…"
            disabled={!project.addr}
            onClick={() => void firstLook()}
          >
            {project.addr ? '주소로 이력 조회' : '주소 미지정 — 이력 조회 불가'}
          </Btn>
          <Err>{lookErr}</Err>
        </div>
        {draft && (
          /*
            ★조회 결과는 읽기만 한다★ (한백 지시 2026-09-03 「조사내역 채우기 필요없어」).
            결과를 조사 내역 칸에 옮겨 적어 주는 단추가 있었는데, 그러면 ★조회한 것이
            조사한 것처럼★ 저장된다 — 이력은 원본 등록분이고 조사는 현장에서 확인한 것이라
            같은 글일 수 없다(바로 아래 경고가 그 말이다). 옮겨 적는 편함보다 그 둘이
            섞이지 않는 것이 낫다. 조사 내역은 사람이 「조사 내역 적기」에서 쓴다.
          */
          <div className="max-w-2xl rounded-ctl bg-slate-50 px-3 py-2.5">
            <p className="whitespace-pre-line break-keep text-tiny leading-snug text-slate-700">{draft}</p>
            {/* 이력은 원본 등록분일 뿐, 대수 확정은 현장이 한다 (한백 문구) */}
            <p className="mt-2 text-tiny font-semibold leading-snug text-amber-700">
              현장별로 실제 기설치 대수 반드시 확인 필요 — 보조금 불가 시 추후 보조금 환수 및 패널티 적용 예정
            </p>
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex max-w-2xl flex-col gap-4">
          {/*
            현장 확인 결과 — 여기 적힌 것이 확정이고, 저장이 「조사했다」가 된다.
            번호(①·②)는 걷었다: 조회가 편집 밖으로 나가면서 둘이 나란한 단계가 아니게 됐다 —
            조회는 아무 때나 하는 읽기이고, 이것은 적을 때만 여는 자리다.
          */}
          <div className="flex flex-col gap-2">
            <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">현장 확인 결과</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-tiny font-bold text-slate-500">기설치</span>
              {(['없음', '있음'] as const).map((v) => (
                <Choice key={v} on={state === v} onClick={() => setState(v)}>{v}</Choice>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder="조사에서 알아낸 것 — 대수 · kW · 운영사 · 설치 시기 · 보조금 수령 여부 등"
              className={FIELD}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <Btn busy={busy} busyLabel="저장 중…" onClick={() => void save()}>
              조사 결과 저장
            </Btn>
            <Btn
              kind="quiet"
              disabled={busy}
              onClick={() => { setEditing(false); setState(project.preInstall); setNote(project.preNote ?? ''); }}
            >
              취소
            </Btn>
            <Err>{error}</Err>
          </div>
        </div>
      ) : (
        /*
         * 안내문을 두지 않는다(화면 규칙 2, 한백 지시 2026-08-26).
         *
         * 「조사 결과가 아직 없다 — 현장 확인 후 적는다」가 적혀 있었다. 같은 말을 세 번
         * 하고 있었던 셈이다: 제목 옆의 「조사 필요」 태그, 이 문장, 그리고 「조사 내역
         * 적기」 단추. 빈 값은 종류로 말한다 — 넣어야 하는데 안 넣은 것은 「미지정」이다
         * (화면 규칙 10). 무엇을 하라는 말은 단추 이름이 한다.
         */
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {project.preChecked ? (
            <p className="max-w-xl whitespace-pre-line break-keep text-small text-slate-700">
              {/* 조사는 했는데 적은 글이 없다 — 파일만 온 현장이다. 담담한 회색이다 */}
              {project.preNote ?? <Empty kind="wait" label="내역 없음" />}
            </p>
          ) : (
            <Empty kind="miss" />
          )}
          <Btn size="sm" kind="quiet" onClick={() => setEditing(true)}>
            {project.preChecked ? '조사 내역 수정' : '조사 내역 적기'}
          </Btn>
        </div>
      )}
    </div>
  );
}


/*
 * 조회 결과를 조사 내역 초안으로 — /lookup 과 같은 두 자료(DB1 충전소 이력 · DB2 보조금
 * 신청 이력)를 같은 라벨로 각각 적는다(한 문장에 우겨넣으니 못 읽었다 — 한백 지적).
 * 보조금 이력이 있으면 ★사업연도·대기번호★를 줄마다 적고, 기설치가 있는데 이력이 없으면
 * ★미수령 증빙 필요★를 적는다. 무매칭도 적는다 — 「이력 없음」은 조사 결과다.
 */
function draftOf(
  charger: LookupResult,
  subsidy: LookupResult<SubsidyRecord>
): string {
  const lines: string[] = [];
  /* 기설치가 있는가 — DB2 문구를 고르는 데만 쓴다(판정은 사람이 한다) */
  let found = false;

  /* DB1 — 충전소 이력. /lookup 과 같은 라벨을 쓴다: 두 화면이 같은 말을 해야 대조가 된다 */
  if (charger.status === '매칭') {
    const sum = summarize(charger.record);
    found = sum.slow + sum.fast > 0;
    const ops = sum.operators.map((o) => `${o.name} ${o.qty}기`).join(' · ');
    lines.push(`[DB1 충전소 이력] 완속 ${sum.slow}기 · 급속 ${sum.fast}기${ops ? ` — ${ops}` : ''}`);
    if (sum.subsidized > 0 || sum.ownFunded > 0) {
      // 보조금 설치분의 신청번호 — 신청 이력 자료(DB2)에 없는 현장에서도 번호가 남는 자리다
      const applyNos = [...new Set(
        charger.record.h.filter(([, , , code, no]) => isSubsidized(code) && no).map(([, , , , no]) => no)
      )];
      lines.push(
        `  - 보조금 설치 ${sum.subsidized}기 · 자부담 ${sum.ownFunded}기`
        + (applyNos.length ? ` — 신청번호 ${applyNos.join(' · ')}` : '')
      );
    }
  } else if (charger.status === '시군구불일치') {
    lines.push('[DB1 충전소 이력] 같은 주소가 다른 지역에 있음 — 주소 표기 확인 필요');
  } else {
    lines.push('[DB1 충전소 이력] 등록 이력 없음');
  }

  /* DB2 — 보조금 신청 이력. 사업연도·대기번호는 환경부 신청 때 그대로 옮겨 적는 값이라 줄마다 다 적는다 */
  if (subsidy.status === '매칭' && subsidy.record.q > 0) {
    found = true;
    const sum = summarizeSubsidy(subsidy.record);
    lines.push(`[DB2 보조금 신청 이력] ${sum.count}건 ${sum.units}기`);
    for (const [year, waitNo, qty, type, doneAt] of sum.rows) {
      lines.push(
        `  - ${year || '연도 미상'}년 · 대기번호 ${waitNo || '미상'} · ${type ? `${type} ` : ''}${qty}기`
        + (doneAt ? ` · 공사완료 ${doneAt}` : '')
      );
    }
  } else {
    // 기설치가 있는데 신청 이력이 없으면 미수령 증빙이 필요하다 — 그 서류가 이 구역의 증빙 칸이다
    lines.push(
      found
        ? '[DB2 보조금 신청 이력] 없음 — 기설치분 보조금 미수령 증빙 필요'
        : '[DB2 보조금 신청 이력] 없음'
    );
  }

  return `[이력 조회 1차 — 현장 재확인 전]\n${lines.join('\n')}`;
}

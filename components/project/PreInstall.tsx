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
import { DocDelete, DocFileActions, DocUpload } from '@/components/DocFiles';
import { useAction } from '@/lib/use-action';
import { Badge, Btn, Choice, Err, FIELD, Tag } from '@/components/ui';
import { DocReview } from './DocReview';
import { docState } from './parts';

export function PreInstall({
  project, docs, byKind, siteName, canReview,
}: {
  project: ProjectDetail['project'];
  docs: ReturnType<typeof evaluateDocs>;
  byKind: Map<string, ProjectDocument>;
  siteName: string;
  canReview: boolean;
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
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-h3 font-black text-slate-900">기설치 조사</h2>
        {project.preRejectReason ? (
          <Tag tone="warn">조사 반려</Tag>
        ) : project.preChecked ? (
          <Badge tone="ok">기설치 {project.preInstall}</Badge>
        ) : (
          <Tag tone="warn">조사 필요</Tag>
        )}
      </div>

      <Survey project={project} />

      <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {docs.map((d) => {
          const doc = byKind.get(d.key);
          const st = docState(doc, d.req);
          return (
            <div key={d.key} className="rounded-box border border-slate-200 p-2.5">
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
              <div className="mt-2 flex flex-wrap items-center gap-x-3">
                {doc?.blobUrl && <DocFileActions doc={doc} siteName={siteName} label={d.label} />}
                <DocUpload
                  projectId={project.id}
                  kind={d.key}
                  rejected={doc?.status === 'rejected'}
                  hasFile={Boolean(doc?.blobUrl)}
                />
                {canReview && doc && doc.status !== 'none' && (
                  <DocReview projectId={project.id} kind={d.key} status={doc.status} />
                )}
                {canReview && doc && doc.status !== 'none' && (
                  <DocDelete projectId={project.id} kind={d.key} label={d.label} filename={doc.filename} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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

      {editing ? (
        <div className="flex max-w-xl flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(['없음', '있음'] as const).map((v) => (
              <Choice key={v} on={state === v} onClick={() => setState(v)}>기설치 {v}</Choice>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="조사에서 알아낸 것 — 대수 · kW · 운영사 · 설치 시기 · 보조금 수령 여부 등"
            className={FIELD}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Btn size="sm" busy={busy} busyLabel="저장 중…" onClick={() => void save()}>
              조사 결과 저장
            </Btn>
            <Btn
              size="sm"
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
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {project.preChecked ? (
            <p className="max-w-xl break-keep text-small text-slate-700">
              {project.preNote ?? <span className="text-slate-400">조사 내역 없음 — 파일만 있음</span>}
            </p>
          ) : (
            <p className="text-small text-slate-400">조사 결과가 아직 없다 — 현장 확인 후 적는다</p>
          )}
          <Btn size="sm" kind="quiet" onClick={() => setEditing(true)}>
            {project.preChecked ? '조사 내역 수정' : '조사 내역 적기'}
          </Btn>
        </div>
      )}
    </div>
  );
}

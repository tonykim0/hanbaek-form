'use client';

/**
 * 기설치 조사.
 *
 * 서류 목록에서 빼내 자기 구역으로 옮긴 부분이다 — 현장마다 조사해야 하는 일이라
 * 증빙이 서류 열여섯 칸 사이에 섞여 있으면 조사 여부가 보이지 않는다.
 */
import { useState } from 'react';
import type { PreInstall, ProjectDetail, ProjectDocument } from '@/types/project';
import { evaluateDocs, needsPreInstallCheck } from '@/lib/doc-rules';
import { DocDelete, DocFileActions, DocUpload } from '@/components/DocFiles';
import { useAction } from '@/lib/use-action';
import { Badge, Btn, Err, FIELD } from '@/components/ui';
import { DocReview } from './DocReview';
import { docState } from './parts';

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
export function PreInstall({
  project, docs, byKind, siteName, canReview,
}: {
  project: ProjectDetail['project'];
  docs: ReturnType<typeof evaluateDocs>;
  byKind: Map<string, ProjectDocument>;
  siteName: string;
  canReview: boolean;
}) {
  const { busy, error, setError, run } = useAction();
  const [note, setNote] = useState(project.preNote ?? '');
  const [editing, setEditing] = useState(false);
  /** 조사 반려 — 여는 것과 확정을 가른다(화면 규칙 12). 사유 없는 반려는 저장소가 거절한다. */
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const STATES: PreInstall[] = ['없음', '있음'];

  /*
   * 자체투자는 기설치 조사를 하지 않는다 — 환경부 보조금이 기설치 여부로 갈리기 때문에
   * 하는 조사이고, 보조금을 안 받으면 조사할 이유가 없다(2026-08-20 한백 확인).
   *
   * 구역을 없애지 않는다. 「조사 안 함」과 「해당없음」은 다른 것이고, 구역이 사라지면
   * 둘이 같은 모양이 된다 — 서류 목록에서 해당없음 칸을 남기는 것과 같은 이유다.
   * 딸린 서류 두 칸(설치이력·증빙)도 해당없음이 되므로 여기 보여줄 것이 없다.
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

  async function save(patch: Record<string, unknown>) {
    const ok = await run({
      url: `/api/projects/${project.id}/preinstall`,
      method: 'PATCH',
      body: patch,
      fail: '저장하지 못했습니다.',
    });
    if (ok) setEditing(false);
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-h3 font-black text-slate-900">기설치 조사</h2>
        {project.preRejectReason ? (
          <Badge tone="stop">조사 반려</Badge>
        ) : project.preChecked ? (
          <Badge tone="ok">조사함</Badge>
        ) : (
          <Badge tone="warn">조사 필요</Badge>
        )}
        {/* 반려는 되돌리기 어려운 판정이 아니라 「다시 조사해라」다 — 여는 단추는 글자만 */}
        {canReview && project.preChecked && !rejecting && (
          <button
            type="button"
            disabled={busy}
            onClick={() => { setRejecting(true); setRejectReason(''); }}
            className="ml-auto text-tiny font-bold text-red-700 underline decoration-red-300 transition hover:text-red-900"
          >
            조사 반려
          </button>
        )}
      </div>

      {/* 반려 사유 — 협력사가 무엇을 다시 봐야 하는지 그 자리에 적힌다 */}
      {project.preRejectReason && (
        <p className="mb-3 rounded-ctl bg-red-50 px-3 py-2 text-small leading-snug text-red-800">
          {project.preRejectReason}
        </p>
      )}

      {rejecting && (
        <div className="mb-3 flex flex-col gap-1.5">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            autoFocus
            placeholder="무엇을 다시 조사해야 하나 — 예) 지하 2층 확인 안 됨, 사진 다시"
            className={FIELD}
          />
          <div className="flex items-center gap-1.5">
            <Btn
              kind="stop"
              size="sm"
              busy={busy}
              busyLabel="반려 중…"
              disabled={!rejectReason.trim()}
              onClick={async () => {
                const ok = await run({
                  url: `/api/projects/${project.id}/preinstall`,
                  method: 'PATCH',
                  body: { preRejectReason: rejectReason.trim() },
                  fail: '반려하지 못했습니다.',
                });
                if (ok) setRejecting(false);
              }}
            >
              반려 확정
            </Btn>
            <Btn size="sm" kind="quiet" disabled={busy} onClick={() => { setRejecting(false); setError(null); }}>
              취소
            </Btn>
          </div>
        </div>
      )}

      {/*
        * 상자를 겹치지 않는다(CLAUDE.md 화면 규칙 1). 감싸는 판넬 안에 증빙 카드가
        * 또 상자였다 — 두 겹이다. 줄은 얇은 선으로만 가르고, 테두리는 증빙 카드 자기 것만 남긴다.
        */}
      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 py-2.5">
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

        <div className="border-b border-slate-100 py-2.5">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-small font-bold text-slate-400">현황 조사</span>
            {!editing && (
              <button
                type="button"
                onClick={() => { setNote(project.preNote ?? ''); setEditing(true); }}
                className="text-tiny font-bold text-slate-400 underline decoration-slate-300 transition hover:text-brand-800"
              >
                {project.preNote ? '수정' : '적기'}
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
                className={FIELD}
              />
              <div className="flex items-center gap-1.5">
                <Btn size="sm" busy={busy} busyLabel="저장 중…" onClick={() => void save({ preNote: note, preChecked: true })}>
                  저장
                </Btn>
                <Btn
                  size="sm"
                  kind="quiet"
                  disabled={busy}
                  onClick={() => { setEditing(false); setNote(project.preNote ?? ''); setError(null); }}
                >
                  취소
                </Btn>
              </div>
            </div>
          ) : (
            <p className={`whitespace-pre-wrap break-keep text-base leading-relaxed ${project.preNote ? 'text-slate-700' : 'text-slate-300'}`}>
              {project.preNote ?? '—'}
            </p>
          )}
        </div>

        {/* 증빙 — 서류 목록에 있던 두 칸을 여기로 옮겼다 */}
        <div className="grid gap-2 pt-3 sm:grid-cols-2">
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
                  {canReview && doc && doc.status !== 'none' && (
                    <DocReview projectId={project.id} kind={d.key} status={doc.status} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Err className="mt-2 block">{error}</Err>
    </section>
  );
}

'use client';

/**
 * 기설치 조사 — 서류 두 칸(설치이력·증빙)이 전부다.
 *
 * 조사 여부 표시·있음/없음 선택·현황 메모를 걷어냈다(한백 확인) — 조사는 필수라서
 * 「했는가」를 따로 물을 것이 없고, 설치이력 파일이 곧 조사 결과다. 파일을 올리면
 * 조사한 것으로 본다(uploadDocument 가 preChecked 를 켠다). 반려도 서류 반려로 한다.
 *
 * 서류 목록에서 빼내 자기 구역에 두는 것은 유지한다 — 현장마다 해야 하는 일이라
 * 증빙이 서류 열여섯 칸 사이에 섞여 있으면 조사가 됐는지 보이지 않는다.
 */
import type { ProjectDetail, ProjectDocument } from '@/types/project';
import { evaluateDocs, needsPreInstallCheck } from '@/lib/doc-rules';
import { DocDelete, DocFileActions, DocUpload } from '@/components/DocFiles';
import { Badge } from '@/components/ui';
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
      <h2 className="mb-3 text-h3 font-black text-slate-900">기설치 조사</h2>

      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

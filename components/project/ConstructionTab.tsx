'use client';

/**
 * 시공 탭 — 진행현황 8단계와 날짜.
 *
 * 단계는 누적으로 열린다(lib/process). 앞 조건이 안 채워지면 다음 칸이 눌리지 않는다 —
 * 못 하는 이유를 문장으로 적는 대신 버튼을 잠그는 방식이다.
 */
import type { ProjectDetail } from '@/types/project';
import { PROCESS_DOCS } from '@/lib/doc-rules';
import { canEnter, statusIndex, STATUS_GATES } from '@/lib/process';
import { PROCESS_STATUSES } from '@/types/project';
import { DocDelete, DocFileActions, DocUpload, DownloadAll } from '@/components/DocFiles';
import { useAction } from '@/lib/use-action';

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
      <h2 className="mb-3 text-h3 font-black text-slate-900">진행현황</h2>
      <ol className="flex flex-wrap gap-1.5">
        {PROCESS_STATUSES.map((st, i) => {
          const gate = STATUS_GATES[st];
          const entry = canEnter(st, process);
          const past = i < now;
          const current = i === now;
          return (
            <li key={st} className="flex items-center gap-1.5">
              <div
                className={`rounded-lg px-2.5 py-1.5 text-tiny font-bold ${
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
  | 'envApprovalDate' | 'cpoSubmitDate' | 'cpoApprovalDate' | 'chargerOrderDate' | 'chargerRecvDate'
  | 'startPlanDate' | 'startActualDate' | 'installDoneDate' | 'commDoneDate';

export function ConstructionTab({ detail, canEdit }: { detail: ProjectDetail; canEdit: boolean }) {
  const p = detail.process;
  // 칸이 여덟 개라 어느 칸이 저장 중인지 알아야 한다 — 그 칸만 잠근다
  const { busyKey, error, run } = useAction();

  const saveDate = (field: DateField, value: string) =>
    void run({
      url: `/api/projects/${detail.project.id}/process`,
      // 빈 칸은 「지운다」는 뜻이다. 잘못 적은 날짜를 되돌릴 길이 있어야 한다.
      body: { [field]: value === '' ? null : value },
      fail: '저장하지 못했습니다.',
      key: field,
    });

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
      /*
       * 우리가 계약서를 낸 날이다. 내면 운영사가 승인·접수하고(형식이다) 환경부 대기번호가
       * 나오기를 기다린다 — 이 칸이 비어 있으면 우리가 안 낸 것인지 환경부를 기다리는
       * 것인지 알 수 없다.
       */
      label: '운영사 계약서 제출일', field: 'cpoSubmitDate', value: p.cpoSubmitDate,
      opens: '운영사 계약서 제출',
    },
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
          <h2 className="text-h3 font-black text-slate-900">마일스톤</h2>
          {canEdit && (
            <p className="text-tiny text-slate-400">
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
                  disabled={busyKey === m.field}
                  onChange={(e) => void saveDate(m.field, e.target.value)}
                  className={`w-[150px] rounded-lg border px-2 py-1 font-semibold tabular-nums transition focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                    m.value
                      ? 'border-slate-200 text-slate-800'
                      : 'border-dashed border-slate-300 text-slate-400'
                  } ${busyKey === m.field ? 'opacity-50' : 'hover:border-brand-300'}`}
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
                <span className="text-tiny font-semibold text-slate-400">
                  넣으면 {m.opens} 로 넘길 수 있습니다
                </span>
              )}
              {m.trigger && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-tiny font-bold ${
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
          <h2 className="text-h3 font-black text-slate-900">공정 서류</h2>
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
                <p className={`mt-1 text-tiny font-black ${done ? 'text-brand-700' : 'text-slate-400'}`}>
                  {done ? '제출됨' : '대기'}
                </p>
                {doc?.uploadedAt && (
                  <p className="mt-0.5 text-micro text-slate-400">
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

'use client';

/**
 * 시공 탭 — 진행현황 8단계와 날짜.
 *
 * 단계는 누적으로 열린다(lib/process). 앞 조건이 안 채워지면 다음 칸이 눌리지 않는다 —
 * 못 하는 이유를 문장으로 적는 대신 버튼을 잠그는 방식이다.
 */
import { Fragment } from 'react';
import type { ProcessStatus, ProjectDetail } from '@/types/project';
import { PROCESS_DOCS } from '@/lib/doc-rules';
import {
  canEnter, isHanbaekOnlyProcessField, statusIndex, STATUS_GATES, type ProcessEdit,
} from '@/lib/process';
import { PROCESS_STATUSES } from '@/types/project';
import { DocDelete, DocFileActions, DocUpload, DownloadAll } from '@/components/DocFiles';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { Note } from '@/components/ui';

// ── 시공 탭 ─────────────────────────────────────────────────────
/**
 * 시공 진행현황 8단계.
 *
 * 지나온 단계·현재·앞으로를 한 줄로 보여주고, 다음 단계로 넘어가는 데 필요한 것을 함께 적는다.
 * 조건을 화면에 적어두지 않으면 「왜 안 넘어가지」를 매번 사람에게 물어야 한다.
 *
 * ★옮기는 자리가 여기다★ — 날짜·서류가 보이는 자리에서 판단하고 옮긴다(한백만).
 * 조건이 찬 단계만 눌리고, 지난 단계를 누르면 되돌아간다(조건은 누적이라 뒤로는 늘 열려
 * 있다). 보드에서 끌어 옮기던 것은 걷어냈다 — 스치는 끌기에 단계가 바뀐다.
 */
function StatusFlow({
  process, onMove, busy,
}: {
  process: ProjectDetail['process'];
  /** 있으면 단계를 눌러 옮긴다 (한백) */
  onMove?: (s: ProcessStatus) => void;
  busy: boolean;
}) {
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
          const clickable = Boolean(onMove) && !current && entry.ok;
          const tone = current
            ? 'bg-brand-700 text-white'
            : past
              ? 'bg-brand-50 text-brand-800'
              : 'bg-slate-100 text-slate-400';
          return (
            <li key={st} className="flex items-center gap-1.5">
              {clickable ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMove!(st)}
                  title={past ? '이 단계로 되돌립니다' : '이 단계로 옮깁니다'}
                  className={`rounded-ctl px-2.5 py-1.5 text-tiny font-bold transition hover:ring-2 hover:ring-brand-300 ${tone} ${busy ? 'opacity-50' : ''}`}
                >
                  {st}
                </button>
              ) : (
                <div
                  className={`rounded-ctl px-2.5 py-1.5 text-tiny font-bold ${tone}`}
                  title={gate ? `조건: ${gate.need}` : undefined}
                >
                  {st}
                  {gate && !entry.ok && !past && !current && (
                    <span className="ml-1 text-slate-400">🔒</span>
                  )}
                </div>
              )}
              {i < PROCESS_STATUSES.length - 1 && (
                <span aria-hidden className="text-slate-300">›</span>
              )}
            </li>
          );
        })}
      </ol>

      <ul className="mt-3 flex flex-col gap-1 text-small text-slate-500">
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
  | 'envApprovalDate' | 'cpoSubmitDate' | 'cpoApprovalDate' | 'chargerOrderDate' | 'chargerShipDate'
  | 'chargerRecvDate' | 'startActualDate' | 'installDoneDate' | 'commDoneDate';

export function ConstructionTab({ detail, edit }: { detail: ProjectDetail; edit: ProcessEdit }) {
  const p = detail.process;
  /** 설치 실적 옆에 두는 비교 기준 — 계약과 실제가 다른 것은 흔하다 */
  const contractQty = detail.lines.reduce((s, l) => s + l.qty, 0);
  // 칸이 여덟 개라 어느 칸이 저장 중인지 알아야 한다 — 그 칸만 잠근다
  const { busyKey, error, run } = useAction();

  /*
   * 시공사는 한백 전용 두 칸(환경부 승인일·충전기 발주일)을 뺀 전부를 직접 적는다 —
   * 노션 공정관리처럼 단계별 일자·파일을 협력사가 올린다. 저장소가 같은 판정을
   * 다시 하므로(assertProcessWrite) 여기는 칸을 잠그는 것뿐이다.
   */
  const canEditField = (field: DateField) =>
    edit === 'all' || (edit === 'partner' && !isHanbaekOnlyProcessField(field));
  const canEdit = edit !== 'none';

  const saveDate = (field: DateField, value: string) =>
    void run({
      url: `/api/projects/${detail.project.id}/process`,
      // 빈 칸은 「지운다」는 뜻이다. 잘못 적은 날짜를 되돌릴 길이 있어야 한다.
      body: { [field]: value === '' ? null : value },
      fail: '저장하지 못했습니다.',
      key: field,
    });

  /** 단계 옮기기 — 진행현황의 단계를 눌러 옮긴다. 판정은 저장소가 다시 한다. */
  const moveStatus = (status: string) =>
    void run({
      url: `/api/projects/${detail.project.id}/status`,
      body: { status },
      fail: '단계를 옮기지 못했습니다.',
      key: 'status',
    });

  /** 설치 실적 — 숫자는 키를 누를 때마다가 아니라 칸을 떠날 때 저장한다 */
  const saveCount = (field: 'installedSpots' | 'installedUnits', raw: string, before: number | null) => {
    const value = raw === '' ? null : Number(raw);
    if (value !== null && (!Number.isInteger(value) || value < 0)) return;
    if (value === before) return;
    void run({
      url: `/api/projects/${detail.project.id}/process`,
      body: { [field]: value },
      fail: '저장하지 못했습니다.',
      key: field,
    });
  };

  const milestones: Array<{
    label: string;
    field: DateField;
    value: string | null;
    trigger?: string;
    /** 이 날짜가 무엇을 여는지 — 왜 적어야 하는지 알려준다 */
    opens?: string;
    /** 날짜가 아니라 했다/안 했다 — 체크로 적고, 체크한 날이 저장된다 */
    flag?: boolean;
  }> = [
    { label: '환경부 승인일', field: 'envApprovalDate', value: p.envApprovalDate, trigger: '환경부 승인' },
    {
      /*
       * 우리가 운영사에 계약서를 냈는가 — 낸 날은 따로 기록할 필요가 없다(한백 확인).
       * 이 줄이 없으면 「안 낸 현장」과 「내고 환경부를 기다리는 현장」이 구분되지 않는다.
       * 한백이 하는 일이고 협력사는 몰라도 되는 값이라, 협력사 화면에는 줄 자체를 안 그린다.
       */
      label: '운영사 계약서 제출', field: 'cpoSubmitDate', value: p.cpoSubmitDate,
      opens: '운영사 계약서 제출', flag: true,
    },
    {
      label: '운영사 시공승인일', field: 'cpoApprovalDate', value: p.cpoApprovalDate,
      trigger: '시공진행필요', opens: '시공진행필요',
    },
    { label: '충전기 발주일', field: 'chargerOrderDate', value: p.chargerOrderDate },
    { label: '충전기 출고일', field: 'chargerShipDate', value: p.chargerShipDate },
    { label: '충전기 수령일', field: 'chargerRecvDate', value: p.chargerRecvDate },
    /*
     * 착공예정일과 실착공일을 구분하지 않는다 — 시공팀이 착공일 하나만 적는다(한백 확인).
     * startPlanDate 칸은 저장소에 남아 있지만 화면에 그리지 않는다.
     */
    { label: '착공일', field: 'startActualDate', value: p.startActualDate, trigger: '착공' },
    { label: '설치완료일', field: 'installDoneDate', value: p.installDoneDate },
    { label: '통신완료일', field: 'commDoneDate', value: p.commDoneDate },
  ];

  /*
   * 공정을 실제 일 순서대로 묶는다 — 마일스톤과 서류가 단계별로 함께 선다 (한백 확인).
   *   승인 → 행위신고(공사 발주 뒤 시공팀이 접수, 1~2주 — 행위신고 이후 착공) → 착공 →
   *   설치 → 개통(전기사용신청 → 점검 → 개통) → 준공(준공서류 → 한백 검토 → CPO 전달).
   * 충전기 발주·수령은 행위신고와 별개의 줄기라 따로 묶는다(한백 확인).
   */
  const GROUPS: Array<{ title: string; fields: DateField[]; docs: string[] }> = [
    { title: '승인', fields: ['envApprovalDate', 'cpoSubmitDate', 'cpoApprovalDate'], docs: [] },
    { title: '행위신고', fields: [], docs: ['notify'] },
    { title: '충전기', fields: ['chargerOrderDate', 'chargerShipDate', 'chargerRecvDate'], docs: [] },
    { title: '착공', fields: ['startActualDate'], docs: [] },
    { title: '설치', fields: ['installDoneDate'], docs: ['photoDone'] },
    { title: '개통', fields: ['commDoneDate'], docs: ['elecapply', 'kepcofee', 'safety', 'comm'] },
    { title: '준공', fields: [], docs: ['completion'] },
  ];

  return (
    <div className="flex flex-col gap-7">
      <StatusFlow
        process={p}
        onMove={edit === 'all' ? moveStatus : undefined}
        busy={busyKey === 'status'}
      />

      {error && (
        <p
          role="alert"
          className="rounded-box border-l-[3px] border-red-500 bg-red-50 px-4 py-3 text-base font-semibold text-red-800"
        >
          {error}
        </p>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3 font-black text-slate-900">공정</h2>
          <div className="flex flex-wrap items-baseline gap-3">
            {canEdit && (
              <p className="text-tiny text-slate-400">
                날짜를 넣으면 조건이 열립니다. 단계는 보드나 표에서 옮깁니다.
              </p>
            )}
            <DownloadAll
              docs={p.docs}
              siteName={detail.project.name}
              labelOf={(kind) => PROCESS_DOCS.find((x) => x.key === kind)?.name ?? kind}
            />
          </div>
        </div>

        {/*
          * 마일스톤과 서류를 일 순서대로 한 묶음씩 — 「행위신고는 발주 다음, 개통 서류는
          * 시공완료 다음」이 목록 구조로 보인다. 마일스톤 표와 서류 그리드로 나눠 두면
          * 어느 서류가 어느 시점의 일인지 매번 사람이 이어 읽어야 한다.
          */}
        <div className="flex flex-col gap-5">
        {GROUPS.map((g) => {
          // 여부 줄(운영사 계약서 제출)은 한백만 본다 — 협력사는 몰라도 되는 값이다
          const rows = milestones.filter(
            (m) => g.fields.includes(m.field) && (!m.flag || edit === 'all')
          );
          const groupDocs = PROCESS_DOCS.filter((d) => (g.docs as readonly string[]).includes(d.key));
          if (rows.length === 0 && groupDocs.length === 0) return null;
          return (
          <div key={g.title}>
          <h3 className="mb-1.5 text-tiny font-bold tracking-[0.06em] text-slate-400">{g.title}</h3>
          {rows.length > 0 && (
          <div className="overflow-hidden rounded-box border border-slate-200 divide-y divide-slate-100">
          {rows.map((m) => (
            <Fragment key={m.field}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-base">
              <span className="w-32 shrink-0 text-slate-500">{m.label}</span>
              {m.flag ? (
                <label className="flex w-[150px] cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={m.label}
                    checked={Boolean(m.value)}
                    disabled={busyKey === m.field}
                    onChange={(e) => void saveDate(m.field, e.target.checked ? today() : '')}
                  />
                  <span className={`font-semibold ${m.value ? 'text-slate-800' : 'text-slate-400'}`}>
                    {m.value ? '제출됨' : '미제출'}
                  </span>
                </label>
              ) : canEditField(m.field) ? (
                <input
                  type="date"
                  aria-label={m.label}
                  defaultValue={m.value ?? ''}
                  disabled={busyKey === m.field}
                  onChange={(e) => void saveDate(m.field, e.target.value)}
                  className={`w-[150px] rounded-ctl border px-2 py-1 font-semibold tabular-nums transition focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                    m.value
                      ? 'border-slate-200 text-slate-800'
                      : 'border-dashed border-slate-300 text-slate-400'
                  } ${busyKey === m.field ? 'opacity-50' : 'hover:border-brand-300'}`}
                />
              ) : (
                <span
                  className={`w-[150px] font-semibold tabular-nums ${m.value ? 'text-slate-800' : 'text-slate-300'}`}
                  /* 시공사에게 잠긴 칸 — 왜 입력칸이 아닌지 그 자리에서 말한다 */
                  title={canEdit && isHanbaekOnlyProcessField(m.field) ? '한백이 적는 칸입니다' : undefined}
                >
                  {m.value ?? (canEdit && isHanbaekOnlyProcessField(m.field) ? '한백 입력 대기' : '비어 있음')}
                </span>
              )}
              <span className="flex-1" />
              {m.opens && !m.value && (
                <span className="text-tiny font-semibold text-slate-400">
                  {m.flag ? '체크하면' : '넣으면'} {m.opens} 로 넘길 수 있습니다
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

            {/* 설치 실적 — 몇 거점에 몇 기를 세웠나. 설치완료일 바로 아래, 시공사가 적는다. */}
            {m.field === 'installDoneDate' && (
              <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-base">
                <span className="w-32 shrink-0 text-slate-500">설치 실적</span>
                {canEditField('installDoneDate') ? (
                  <span className="flex items-center gap-1.5">
                    {([
                      { field: 'installedSpots', unit: '거점', value: p.installedSpots },
                      { field: 'installedUnits', unit: '기', value: p.installedUnits },
                    ] as const).map((c) => (
                      <span key={c.field} className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          aria-label={`설치 ${c.unit} 수`}
                          defaultValue={c.value ?? ''}
                          disabled={busyKey === c.field}
                          onBlur={(e) => saveCount(c.field, e.target.value, c.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className={`w-16 rounded-ctl border px-2 py-1 text-right font-semibold tabular-nums transition focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                            c.value !== null
                              ? 'border-slate-200 text-slate-800'
                              : 'border-dashed border-slate-300 text-slate-400'
                          } ${busyKey === c.field ? 'opacity-50' : 'hover:border-brand-300'}`}
                        />
                        <span className="text-slate-500">{c.unit}</span>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span
                    className={`font-semibold tabular-nums ${
                      p.installedSpots !== null || p.installedUnits !== null ? 'text-slate-800' : 'text-slate-300'
                    }`}
                  >
                    {p.installedSpots !== null || p.installedUnits !== null
                      ? `${p.installedSpots ?? '—'}거점 · ${p.installedUnits ?? '—'}기`
                      : '비어 있음'}
                  </span>
                )}
                <span className="flex-1" />
                {/* 계약과 다르면 그 자리에서 보인다 — 맞는지 물으러 갈 곳이 따로 없어야 한다 */}
                <span
                  className={`text-tiny font-semibold ${
                    p.installedUnits !== null && p.installedUnits !== contractQty
                      ? 'text-amber-700'
                      : 'text-slate-400'
                  }`}
                >
                  계약 {contractQty}대
                </span>
              </div>
            )}
            </Fragment>
          ))}
          </div>
          )}

          {groupDocs.length > 0 && (
          <div className={`grid gap-2 sm:grid-cols-2 lg:grid-cols-4 ${rows.length > 0 ? 'mt-2' : ''}`}>
          {groupDocs.map((d) => {
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
                className={`rounded-box border p-3 ${done ? 'border-brand-200 bg-brand-50/60' : 'border-slate-200 bg-white'}`}
              >
                <p className="text-lead font-bold text-slate-800">{d.name}</p>
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
                {/* 지우기는 한백만 — 협력사는 다시 올리는 것으로 고친다(덮어쓴다) */}
                {edit === 'all' && doc && doc.status !== 'none' && (
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
          )}
          </div>
          );
        })}
        </div>

        {p.memo && (
          <Note tone="mute" className="mt-3">{p.memo}</Note>
        )}
      </section>

      {/*
        * 진행 단계(계약완료 → 시공진행필요 → 설치완료 → 준공서류 접수/검토 → 준공보완 → 준공)는
        * 이 앱이 새로 세운 축이다. 예전에는 이 문장이 화면 아래 띠로 붙어 있었는데,
        * 쓰는 사람에게는 아무 소용이 없는 말이라 걷어냈다(화면 규칙 2번).
        */}
    </div>
  );
}

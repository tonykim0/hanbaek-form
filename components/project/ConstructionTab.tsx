'use client';

/**
 * 시공 탭 — 세로 타임라인 하나.
 *
 * 예전에는 진행현황 칩(단계)과 공정 묶음(일)이 두 벌로 쌓여 있어서, 「시공진행필요
 * 상태」와 「착공·설치 묶음」을 사람이 머릿속에서 이어야 했다. 단계 노드 사이에 그
 * 구간의 일(날짜·서류·완료 체크)이 끼워지는 타임라인 하나로 합친다.
 *
 * ★단계마다 완료 체크(Y/N)★ — 파일이 있다는 것과 일이 끝났다는 것은 다른 말이다
 * (한백 확인). 시공사가 「완료」를 선언해야 다음 단계가 열린다. 판정은
 * lib/process.ts STATUS_GATES 한 곳이고 저장소가 다시 확인한다.
 *
 * 단계 이동은 한백이 노드를 눌러서 한다 — 조건이 찬 노드만 눌리고, 지난 노드를
 * 누르면 되돌아간다(조건은 누적이라 뒤로는 늘 열려 있다).
 */
import { useEffect, useState } from 'react';
import type { ProcessStatus, ProjectDetail } from '@/types/project';
import { PROCESS_STATUSES } from '@/types/project';
import { PROCESS_DOCS } from '@/lib/doc-rules';
import {
  canEnter, isHanbaekOnlyProcessField, statusIndex, STATUS_GATES, type ProcessEdit,
} from '@/lib/process';
import { DocDelete, DocFileActions, DocUpload, DownloadAll } from '@/components/DocFiles';
import { DatePicker } from '@/components/DatePicker';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { Note } from '@/components/ui';

/** 고칠 수 있는 날짜 칸 — 이름은 서버(ProcessPatch)와 같아야 한다 */
type DateField =
  | 'notifyDate' | 'chargerOrderDate' | 'chargerShipDate' | 'chargerRecvDate'
  | 'startActualDate' | 'installDoneDate' | 'commDoneDate';

/** 묶음별 완료 체크 칸 */
type CheckField =
  | 'notifyDoneAt' | 'chargerDoneAt' | 'installConfirmedAt' | 'openDoneAt' | 'completionSubmitAt';

/** 수량 칸 — 설치 실적(거점·기)과 수령 수량(충전기·모뎀) */
type CountField = 'installedSpots' | 'installedUnits' | 'chargerQty' | 'modemQty';

interface MilestoneRow {
  label: string;
  field: DateField;
  value: string | null;
  trigger?: string;
}

interface Group {
  title: string;
  rows: MilestoneRow[];
  docs: string[];
  /** 이 묶음을 끝냈다는 사람의 선언 — 조건(ready)이 차야 체크할 수 있다 */
  check?: { field: CheckField; label: string; ready: boolean; blocked: string };
}

export function ConstructionTab({ detail, edit }: { detail: ProjectDetail; edit: ProcessEdit }) {
  const p = detail.process;
  /** 설치 실적 옆에 두는 비교 기준 — 계약과 실제가 다른 것은 흔하다 */
  const contractQty = detail.lines.reduce((s, l) => s + l.qty, 0);
  const { busyKey, error, run } = useAction();
  /** 지난 구간 펼침 상태 — 기본은 요약 한 줄로 접힌다 */
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const canEditField = (field: DateField) =>
    edit === 'all' || (edit === 'partner' && !isHanbaekOnlyProcessField(field));
  const canEdit = edit !== 'none';

  const save = (field: string, value: string | number | null, key: string) =>
    void run({
      url: `/api/projects/${detail.project.id}/process`,
      body: { [field]: value },
      fail: '저장하지 못했습니다.',
      key,
    });

  // 빈 칸은 「지운다」는 뜻이다. 잘못 적은 날짜를 되돌릴 길이 있어야 한다.
  const saveDate = (field: DateField, value: string) =>
    save(field, value === '' ? null : value, field);

  const saveCheck = (field: CheckField, checked: boolean) =>
    save(field, checked ? today() : null, field);

  /** 수량 — 숫자는 키를 누를 때마다가 아니라 칸을 떠날 때 저장한다 */
  const saveCount = (field: CountField, raw: string, before: number | null) => {
    const value = raw === '' ? null : Number(raw);
    if (value !== null && (!Number.isInteger(value) || value < 0)) return;
    if (value === before) return;
    save(field, value, field);
  };

  /** 단계 옮기기 — 노드를 눌러 옮긴다. 판정은 저장소가 다시 한다. */
  const moveStatus = (status: ProcessStatus) =>
    void run({
      url: `/api/projects/${detail.project.id}/status`,
      body: { status },
      fail: '단계를 옮기지 못했습니다.',
      key: 'status',
    });

  const uploaded = (kind: string): boolean => {
    const d = p.docs.find((x) => x.kind === kind);
    return d?.status === 'uploaded' || d?.status === 'approved';
  };

  /*
   * 단계 구간마다 그 구간의 일. 승인 값(환경부 승인일·계약서 제출·시공승인일)은
   * 머리말에 있다 — 같은 값을 두 곳에 두지 않는다(화면 규칙 5).
   * 행위신고는 계약완료 직후 — 승인을 기다리는 동안 미리 해놓는다(1~2주, 한백 확인).
   */
  const GROUPS_BY_STATUS: Partial<Record<ProcessStatus, Group[]>> = {
    '행위신고': [
      {
        title: '행위신고',
        // 신고일은 파일을 올리면 그 날로 들어간다(비어 있을 때만) — 다르면 여기서 고친다
        rows: [{ label: '행위신고일', field: 'notifyDate', value: p.notifyDate }],
        docs: ['notify'],
        check: {
          field: 'notifyDoneAt', label: '행위신고 완료',
          ready: uploaded('notify'), blocked: '서류 미제출 — 완료 불가',
        },
      },
    ],
    // 시공 준비 — 충전기가 오고 착공일이 정해지면 「착공」이 열린다
    '시공진행필요': [
      {
        title: '충전기',
        rows: [
          { label: '충전기 발주일', field: 'chargerOrderDate', value: p.chargerOrderDate },
          { label: '충전기 출고일', field: 'chargerShipDate', value: p.chargerShipDate },
          { label: '충전기 수령일', field: 'chargerRecvDate', value: p.chargerRecvDate },
        ],
        docs: [],
        check: {
          field: 'chargerDoneAt', label: '수령 완료',
          // 수령 완료 = 무엇이 몇 개 왔는지 세었다는 말이다 — 날짜만으로는 완료가 아니다
          ready: Boolean(p.chargerRecvDate) && p.chargerQty !== null && p.modemQty !== null,
          blocked: '수령일·수량 미입력 — 완료 불가',
        },
      },
    ],
    // 충전기가 현장에 있다 — 착공일이 적히면 「착공」이 열린다
    '충전기 수령': [
      {
        /*
         * 착공예정일과 실착공일을 구분하지 않는다 — 시공팀이 착공일 하나만 적는다(한백 확인).
         * startPlanDate 칸은 저장소에 남아 있지만 화면에 그리지 않는다.
         */
        title: '착공',
        rows: [{ label: '착공일', field: 'startActualDate', value: p.startActualDate, trigger: '착공' }],
        docs: [],
      },
    ],
    // 공사 중 — 설치가 끝나고 완료 체크가 되면 「설치완료」가 열린다
    '착공': [
      {
        title: '설치',
        rows: [{ label: '설치완료일', field: 'installDoneDate', value: p.installDoneDate }],
        docs: ['photoDone'],
        check: {
          field: 'installConfirmedAt', label: '설치 완료',
          ready: Boolean(p.installDoneDate) && uploaded('photoDone'),
          blocked: '설치완료일·사진 필요 — 완료 불가',
        },
      },
    ],
    // 개통 절차 — 통신까지 끝나고 완료 체크가 되면 「개통완료」가 열린다
    '설치완료': [
      {
        title: '개통',
        rows: [{ label: '통신완료일', field: 'commDoneDate', value: p.commDoneDate }],
        docs: ['elecapply', 'kepcofee', 'safety', 'comm'],
        check: {
          field: 'openDoneAt', label: '개통 완료',
          ready: Boolean(p.commDoneDate), blocked: '통신완료일 미입력 — 완료 불가',
        },
      },
    ],
    // 준공서류 준비 — 제출을 끝냈다고 선언하면 검토(접수/검토)로 넘어갈 수 있다
    '개통완료': [
      {
        title: '준공',
        rows: [],
        docs: ['completion'],
        check: {
          field: 'completionSubmitAt', label: '준공서류 제출 완료',
          ready: uploaded('completion'), blocked: '준공서류 미제출 — 완료 불가',
        },
      },
    ],
  };

  const now = statusIndex(p.status);

  /** 접힌 지난 구간의 요약 한 줄 — 묶음마다 완료 여부 하나씩 */
  const summarize = (groups: Group[]): string =>
    groups
      .map((g) => {
        if (g.check) return `${g.title} ${p[g.check.field] ? '✓' : '미완'}`;
        const first = g.rows[0];
        return `${g.title} ${first?.value ?? '—'}`;
      })
      .join(' · ');

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p
          role="alert"
          className="rounded-box border-l-[3px] border-red-500 bg-red-50 px-4 py-3 text-base font-semibold text-red-800"
        >
          {error}
        </p>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3 font-black text-slate-900">공정</h2>
          <DownloadAll
            docs={p.docs}
            siteName={detail.project.name}
            labelOf={(kind) => PROCESS_DOCS.find((x) => x.key === kind)?.name ?? kind}
          />
        </div>

        <ol className="flex flex-col">
          {PROCESS_STATUSES.map((st, i) => {
            const groups = GROUPS_BY_STATUS[st] ?? [];
            const gate = STATUS_GATES[st];
            const entry = canEnter(st, p);
            const state = i < now ? 'past' : i === now ? 'current' : 'future';
            const clickable = edit === 'all' && state !== 'current' && entry.ok;
            const busy = busyKey === 'status';
            const last = i === PROCESS_STATUSES.length - 1;

            const dot =
              state === 'current'
                ? 'bg-brand-600 ring-4 ring-brand-100'
                : state === 'past'
                  ? 'bg-brand-400'
                  : 'bg-slate-200';
            const rail =
              state === 'past' ? 'border-brand-200'
              : state === 'current' ? 'border-brand-400'
              : 'border-slate-200';
            const chip =
              state === 'current'
                ? 'bg-brand-700 text-white'
                : state === 'past'
                  ? 'bg-brand-50 text-brand-800'
                  : entry.ok
                    ? 'border border-slate-200 bg-white text-slate-600'
                    : 'bg-slate-100 text-slate-400';

            const collapsed = state === 'past' && groups.length > 0 && !openMap[st];

            return (
              <li key={st}>
                {/* 단계 노드 */}
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden className={`h-3 w-3 shrink-0 rounded-full ${dot}`} />
                  {clickable ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => moveStatus(st)}
                      title={state === 'past' ? '이 단계로 되돌립니다' : '이 단계로 옮깁니다'}
                      className={`rounded-ctl px-2.5 py-1 text-small font-bold transition hover:ring-2 hover:ring-brand-300 ${chip} ${busy ? 'opacity-50' : ''}`}
                    >
                      {st}
                    </button>
                  ) : (
                    <span className={`rounded-ctl px-2.5 py-1 text-small font-bold ${chip}`}>
                      {st}
                    </span>
                  )}
                  {/* 잠긴 미래 단계 — 막는 것을 그 자리에 적는다 */}
                  {state === 'future' && gate && !entry.ok && (
                    <span className="text-tiny font-semibold text-slate-400">
                      🔒 {gate.need} 필요
                    </span>
                  )}
                  {state === 'future' && entry.ok && edit === 'all' && (
                    <span className="text-tiny font-semibold text-brand-700">준비됨</span>
                  )}
                </div>

                {/* 구간 몸통 — 왼쪽 선이 노드를 잇는다. 마지막 노드 뒤에는 선이 없다. */}
                {(groups.length > 0 || !last) && (
                  <div className={`ml-[5px] border-l-2 ${rail} ${groups.length > 0 ? 'my-1.5 flex flex-col gap-3 py-2 pl-5' : 'h-4'}`}>
                    {collapsed ? (
                      <button
                        type="button"
                        onClick={() => setOpenMap((m) => ({ ...m, [st]: true }))}
                        className="w-fit text-left text-tiny font-semibold text-slate-500 transition hover:text-slate-800"
                        title="펼쳐서 값을 보거나 고칩니다"
                      >
                        {summarize(groups)} <span className="text-slate-400">— 펼치기</span>
                      </button>
                    ) : (
                      groups.map((g) => (
                        <div key={g.title} className={state === 'future' ? 'opacity-70' : ''}>
                          {/* 묶음 이름이 단계 이름과 같으면 안 적는다 — 바로 위 노드가 이미 그 말이다 */}
                          {g.title !== st && (
                            <h3 className="mb-1.5 text-tiny font-bold tracking-[0.06em] text-slate-400">
                              {g.title}
                            </h3>
                          )}
                          <div className="max-w-2xl overflow-hidden rounded-box border border-slate-200 bg-white divide-y divide-slate-100">
                            {g.rows.map((m) => (
                              <DateRow
                                key={m.field}
                                m={m}
                                canEdit={canEditField(m.field)}
                                lockedForPartner={canEdit && isHanbaekOnlyProcessField(m.field)}
                                busy={busyKey === m.field}
                                onSave={saveDate}
                              />
                            ))}

                            {/* 수령 수량 — 무엇이 몇 개 왔는지 센다. 수령 완료 체크의 조건이다. */}
                            {g.title === '충전기' && (
                              <CountsRow
                                label="수령 수량"
                                items={[
                                  { field: 'chargerQty', prefix: '충전기', unit: '대', value: p.chargerQty },
                                  { field: 'modemQty', prefix: '모뎀', unit: '개', value: p.modemQty },
                                ]}
                                canEdit={canEditField('chargerRecvDate')}
                                busyKey={busyKey}
                                onSave={saveCount}
                                compare={{
                                  label: `계약 ${contractQty}대`,
                                  mismatch: p.chargerQty !== null && p.chargerQty !== contractQty,
                                }}
                              />
                            )}
                            {/* 설치 실적 — 설치완료일 바로 아래, 시공사가 적는다 */}
                            {g.title === '설치' && (
                              <CountsRow
                                label="설치 실적"
                                items={[
                                  { field: 'installedSpots', unit: '거점', value: p.installedSpots },
                                  { field: 'installedUnits', unit: '기', value: p.installedUnits },
                                ]}
                                canEdit={canEditField('installDoneDate')}
                                busyKey={busyKey}
                                onSave={saveCount}
                                compare={{
                                  label: `계약 ${contractQty}대`,
                                  mismatch: p.installedUnits !== null && p.installedUnits !== contractQty,
                                }}
                              />
                            )}

                            {g.docs.map((kind) => {
                              const spec = PROCESS_DOCS.find((x) => x.key === kind);
                              if (!spec) return null;
                              return (
                                <DocRow
                                  key={kind}
                                  projectId={detail.project.id}
                                  siteName={detail.project.name}
                                  spec={spec}
                                  doc={p.docs.find((x) => x.kind === kind)}
                                  canDelete={edit === 'all'}
                                />
                              );
                            })}

                            {g.check && (
                              <CheckRow
                                check={g.check}
                                value={p[g.check.field]}
                                canEdit={canEdit}
                                busy={busyKey === g.check.field}
                                onToggle={saveCheck}
                              />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    {!collapsed && state === 'past' && groups.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOpenMap((m) => ({ ...m, [st]: false }))}
                        className="w-fit text-tiny font-semibold text-slate-400 transition hover:text-slate-700"
                      >
                        접기
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {p.memo && (
          <Note tone="mute" className="mt-3">{p.memo}</Note>
        )}
      </section>
    </div>
  );
}

/**
 * 수량 한 줄 — 수령 수량(충전기·모뎀)과 설치 실적(거점·기)이 같은 모양을 쓴다.
 * 숫자는 칸을 떠날 때 저장한다. 오른쪽 끝의 비교 기준(계약 N대)이 다르면 노랗게 —
 * 맞는지 물으러 갈 곳이 따로 없어야 한다.
 */
function CountsRow({
  label, items, canEdit, busyKey, onSave, compare,
}: {
  label: string;
  items: Array<{ field: CountField; unit: string; prefix?: string; value: number | null }>;
  canEdit: boolean;
  busyKey: string | null;
  onSave: (field: CountField, raw: string, before: number | null) => void;
  compare?: { label: string; mismatch: boolean };
}) {
  const any = items.some((c) => c.value !== null);
  return (
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 text-slate-500">{label}</span>
      {canEdit ? (
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {items.map((c) => (
            <span key={c.field} className="flex items-center gap-1">
              {c.prefix && <span className="text-small text-slate-500">{c.prefix}</span>}
              <input
                type="number"
                min={0}
                inputMode="numeric"
                aria-label={`${c.prefix ?? label} ${c.unit} 수`}
                defaultValue={c.value ?? ''}
                disabled={busyKey === c.field}
                onBlur={(e) => onSave(c.field, e.target.value, c.value)}
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
        <span className={`font-semibold tabular-nums ${any ? 'text-slate-800' : 'text-slate-300'}`}>
          {any
            ? items.map((c) => `${c.prefix ? `${c.prefix} ` : ''}${c.value ?? '—'}${c.unit}`).join(' · ')
            : '비어 있음'}
        </span>
      )}
      <span className="flex-1" />
      {compare && (
        <span className={`text-tiny font-semibold ${compare.mismatch ? 'text-amber-700' : 'text-slate-400'}`}>
          {compare.label}
        </span>
      )}
    </div>
  );
}

/** 날짜 한 줄 — 시공사 칸은 입력칸, 한백 전용 칸은 시공사에게 글자로 굳는다 */
function DateRow({
  m, canEdit, lockedForPartner, busy, onSave,
}: {
  m: MilestoneRow;
  canEdit: boolean;
  /** 볼 수는 있는 사람에게 잠긴 칸인가 — 왜 입력칸이 아닌지 그 자리에서 말한다 */
  lockedForPartner: boolean;
  busy: boolean;
  onSave: (field: DateField, value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 text-slate-500">{m.label}</span>
      {canEdit ? (
        <DatePicker
          ariaLabel={m.label}
          value={m.value}
          disabled={busy}
          onChange={(v) => onSave(m.field, v ?? '')}
        />
      ) : (
        <span
          className={`w-[150px] font-semibold tabular-nums ${m.value ? 'text-slate-800' : 'text-slate-300'}`}
          title={lockedForPartner ? '한백이 적는 칸입니다' : undefined}
        >
          {m.value ?? (lockedForPartner ? '한백 입력 대기' : '비어 있음')}
        </span>
      )}
      <span className="flex-1" />
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
  );
}

/**
 * 서류 한 줄 — 이름·상태·날짜·액션이 한 줄에 선다.
 * 카드였을 때는 서류 하나가 화면 한 칸을 통째로 먹었다.
 * 「제출됨」이 통과다 — 공정 게이트(lib/process.ts)도 uploaded 를 통과로 본다.
 */
function DocRow({
  projectId, siteName, spec, doc, canDelete,
}: {
  projectId: string;
  siteName: string;
  spec: { key: string; name: string };
  doc: ProjectDetail['process']['docs'][number] | undefined;
  canDelete: boolean;
}) {
  const done = doc?.status === 'uploaded' || doc?.status === 'approved';
  return (
    /*
     * 이름·상태·버튼이 붙어 앉는다 — 예전엔 버튼을 오른쪽 끝으로 밀어서(ml-auto)
     * 넓은 화면에서 이름과 버튼이 양쪽 끝에 떨어져 있었다(한백 지적). 되돌리기 어려운
     * 삭제만 끝으로 민다(화면 규칙 8).
     */
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 text-slate-500">{spec.name}</span>
      <span className={`text-tiny font-black ${done ? 'text-brand-700' : 'text-slate-400'}`}>
        {done ? '제출됨' : '대기'}
      </span>
      {doc?.uploadedAt && <span className="text-tiny tabular-nums text-slate-400">{doc.uploadedAt}</span>}
      {/* 파일 실체가 없는 기록 — 옛 데이터에 있다. 제출됨으로만 보이면 볼 수도 없는 서류를 믿게 된다 */}
      {done && !doc?.blobUrl && (
        <span className="text-tiny font-bold text-amber-700" title="기록만 있고 파일이 없습니다 — 다시 올려주세요">
          파일 없음
        </span>
      )}
      {/* 부품(DocFiles)은 카드용 여백(mt-2)을 갖고 있다 — 줄에서는 지운다 */}
      <span className="flex flex-wrap items-center gap-1.5 [&>div]:mt-0">
        {doc && <DocFileActions doc={doc} siteName={siteName} label={spec.name} />}
        <DocUpload projectId={projectId} kind={spec.key} rejected={false} hasFile={Boolean(doc?.blobUrl)} />
      </span>
      <span className="flex-1" />
      {/* 지우기는 한백만 — 협력사는 다시 올리는 것으로 고친다(덮어쓴다) */}
      {canDelete && doc && doc.status !== 'none' && (
        <span className="[&>div]:mt-0">
          <DocDelete projectId={projectId} kind={spec.key} label={spec.name} filename={doc.filename} />
        </span>
      )}
    </div>
  );
}

/**
 * 완료 체크 한 줄 — 이 묶음의 일을 끝냈다는 사람의 선언.
 *
 * 조건이 차기 전에는 체크가 잠기고 못 하는 이유가 그 자리에 적힌다(화면 규칙 3).
 * 이미 체크된 것은 조건과 무관하게 해제할 수 있다 — 되돌릴 길(규칙 7).
 */
function CheckRow({
  check, value, canEdit, busy, onToggle,
}: {
  check: NonNullable<Group['check']>;
  value: string | null;
  canEdit: boolean;
  busy: boolean;
  onToggle: (field: CheckField, checked: boolean) => void;
}) {
  /*
   * 낙관적 표시 — 누르는 즉시 표시가 바뀐다.
   *
   * 체크박스가 서버 값만 보면, 누르고 서버가 다시 그려줄 때까지(왕복 1초쯤) 화면이
   * 안 움직인다. 안 눌린 줄 알고 한 번 더 누르면 해제 요청이 나가 도로 풀린다 —
   * 한백이 실제로 겪은 「잘 안 먹히는」 증상. 서버 값이 따라오면 그것을 믿는다.
   */
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [value]);
  const checked = optimistic ?? Boolean(value);
  const disabled = busy || (!checked && !check.ready);

  return (
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 font-bold text-slate-700">{check.label}</span>
      {canEdit ? (
        <label className={`flex items-center gap-1.5 ${disabled ? '' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            aria-label={check.label}
            checked={checked}
            disabled={disabled}
            onChange={(e) => {
              setOptimistic(e.target.checked);
              onToggle(check.field, e.target.checked);
            }}
          />
          <span
            className={`font-bold ${
              checked ? 'text-brand-800' : check.ready ? 'text-slate-700' : 'text-slate-400'
            }`}
          >
            {checked ? `완료${value ? ` · ${value}` : ' 처리 중…'}` : check.ready ? '완료로 표시' : check.blocked}
          </span>
        </label>
      ) : (
        <span className={`font-bold ${checked ? 'text-brand-800' : 'text-slate-400'}`}>
          {checked ? `완료 · ${value}` : '미완'}
        </span>
      )}
    </div>
  );
}

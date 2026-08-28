'use client';

/**
 * 시공 탭 — 세로 타임라인 하나.
 *
 * 예전에는 진행현황 칩(단계)과 공정 묶음(일)이 두 벌로 쌓여 있어서, 「충전기 발주
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
import { Fragment, useEffect, useState } from 'react';
import type {
  ProcessStatus, ProjectDetail,
} from '@/types/project';
import { PROCESS_STATUSES } from '@/types/project';
import {
  PROCESS_DOCS, processDocsFor,
} from '@/lib/doc-rules';
import { bandOfColumn } from '@/lib/board';
import { advanceBlockers,
  canEnter, gateContextOf, isHanbaekOnlyProcessField, statusIndex, STATUS_GATES,
  type ProcessEdit,
} from '@/lib/process';
import {
  DownloadAll,
} from '@/components/DocFiles';

import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import {
  Badge, Btn, Note,
} from '@/components/ui';
import {
  groupsByStatus, type CheckField, type CountField, type DateField, type GroupExtra,
} from './construction/milestones';
import {
  AdvanceRow, CheckRow, CompletionReview, CountsRow, DateRow, DocRow, ModelRow, NeedRow,
} from './construction/rows';

export function ConstructionTab({ detail, edit }: { detail: ProjectDetail; edit: ProcessEdit }) {
  const p = detail.process;
  /* 게이트가 보는 현장 사정 — 자체투자에는 환경부 승인이 없다(gateContextOf) */
  const gate = gateContextOf(detail.project);
  /** 설치 실적 옆에 두는 비교 기준 — 계약과 실제가 다른 것은 흔하다 */
  const contractQty = detail.lines.reduce((s, l) => s + l.qty, 0);
  /** 조건부 서류가 보는 것 — 그 현장에 그 서류가 필요한가(doc-rules 의 only) */
  const docCtx = { powerType: detail.project.powerType, bizType: detail.project.bizType };
  const { busyKey, error, run } = useAction();

  /*
   * 스테퍼는 행위신고부터 그린다 — 계약완료·운영사 계약서 제출은 계약 국면(계약 페이지의
   * 칸)이라 시공 공정에 다시 세우지 않는다(한백 확인). 현장이 아직 그 구간이면
   * 행위신고가 전부 미래로 보이고, 첫 구간이 선택된다.
   */
  const STEPS = PROCESS_STATUSES.filter((st) => statusIndex(st) >= statusIndex('행위신고'));
  const anchor: ProcessStatus =
    statusIndex(p.status) >= statusIndex('행위신고') ? p.status : '행위신고';
  /** 스테퍼에서 보고 있는 구간 — 단계가 바뀌면 그 구간을 따라간다 */
  const [selected, setSelected] = useState<ProcessStatus>(anchor);
  useEffect(() => setSelected(anchor), [anchor]);

  /** 그 칸을 이 사람이 적을 수 있나 — 이름으로 판정한다(서버와 같은 목록을 본다) */
  const canEditField = (field: DateField | CountField | 'chargerModelId') =>
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

  /**
   * 딸림 줄 하나를 그린다 — 무엇을 그릴지는 그룹의 `extras` 가 정한다(상자 이름이 아니라).
   * 새 종류를 GroupExtra 에 더하고 여기 case 를 안 적으면 컴파일이 깨진다 — 조용히
   * 안 그려지는 일(2026-08-26 실사고)이 다시 나지 않게 하는 자리다.
   */
  function extraRow(x: GroupExtra) {
    switch (x) {
      case 'chargerModel':
        /* 어느 모델이 들어가는가 — 발주 전에 정해지고, 수령 때 실물과 맞춰 본다 */
        return (
          <ModelRow
            key={x}
            value={p.chargerModelId}
            /*
             * ★모델은 한백만 정한다★ (한백 지시 2026-08-26) — 운영사와의 계약에 딸린
             * 값이라 현장에서 고를 것이 아니다. 서버도 한백 전용 칸으로 못 박았다.
             */
            canEdit={canEditField('chargerOrderDate')}
            canRegister={edit === 'all'}
            busy={busyKey === 'chargerModelId'}
            onSave={(id) => save('chargerModelId', id, 'chargerModelId')}
          />
        );
      case 'orderQty':
        return (
          <CountsRow
            key={x}
            label="발주 수량"
            items={[
              { field: 'chargerOrderQty', prefix: '충전기', unit: '대', value: p.chargerOrderQty },
              { field: 'modemOrderQty', prefix: '모뎀', unit: '개', value: p.modemOrderQty },
            ]}
            canEdit={canEditField('chargerOrderDate')}
            busyKey={busyKey}
            onSave={saveCount}
            compare={{
              label: `계약 ${contractQty}대`,
              mismatch: p.chargerOrderQty !== null && p.chargerOrderQty !== contractQty,
            }}
          />
        );
      case 'recvQty':
        /* 무엇이 몇 개 왔는지 센다 — 발주와 한 칸에 담으면 부분 입고 때 어느 숫자가 남는지 모른다 */
        return (
          <CountsRow
            key={x}
            label="수령 수량"
            items={[
              { field: 'chargerQty', prefix: '충전기', unit: '대', value: p.chargerQty },
              { field: 'modemQty', prefix: '모뎀', unit: '개', value: p.modemQty },
            ]}
            canEdit={canEditField('chargerRecvDate')}
            busyKey={busyKey}
            onSave={saveCount}
            /* 견주는 기준은 발주다 — 계약대수는 발주 줄이 이미 본다 */
            compare={{
              label: p.chargerOrderQty !== null ? `발주 ${p.chargerOrderQty}대` : `계약 ${contractQty}대`,
              mismatch: p.chargerQty !== null
                && p.chargerQty !== (p.chargerOrderQty ?? contractQty),
            }}
          />
        );
      case 'installedQty':
        /* 설치 실적 — 설치완료일 바로 아래, 시공사가 적는다 */
        return (
          <CountsRow
            key={x}
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
        );
      default: {
        // 목록에 더하고 여기를 안 적으면 여기서 컴파일이 깨진다
        const missing: never = x;
        return missing;
      }
    }
  }

  /** 단계 옮기기 — 노드를 눌러 옮긴다. 판정은 저장소가 다시 한다. */
  const moveStatus = (status: ProcessStatus) =>
    void run({
      url: `/api/projects/${detail.project.id}/status`,
      body: { status },
      fail: '단계를 옮기지 못했습니다.',
      key: 'status',
    });

  /**
   * 준공서류 보완 처리 — 사유를 진행현황에 남기고 「준공보완」으로 보낸다.
   * 보완 전달 채널이 정해질 때까지 진행현황 메모가 그 자리다(CLAUDE.md 다음 할 일 2).
   */
  const sendToFix = async (reason: string) => {
    const ok = await run({
      url: `/api/projects/${detail.project.id}/notes`,
      body: { body: `준공 보완 요청 — ${reason}` },
      fail: '보완 요청을 남기지 못했습니다.',
      key: 'completionFix',
    });
    if (ok) moveStatus('준공보완');
  };

  /*
   * 단계 구간마다 그 구간의 일. 승인 값(환경부 승인일·계약서 제출)은
   * 머리말에 있다 — 같은 값을 두 곳에 두지 않는다(화면 규칙 5).
   * 행위신고는 계약완료 직후 — 승인을 기다리는 동안 미리 해놓는다(1~2주, 한백 확인).
   */
  const GROUPS_BY_STATUS = groupsByStatus(p);

  const now = statusIndex(p.status);

  /*
   * 시공의 첫 칸에서 계약으로 되돌리는 길 (한백 지시 2026-08-25).
   *
   * 지난 칩을 누르면 되돌아가지만, ★행위신고에 서 있으면 되돌릴 칩이 없다★ —
   * 그 앞 칸(운영사 계약서 제출)은 계약 국면이라 이 스테퍼에 그리지 않는다.
   * 그래서 잘못 넘긴 현장이 시공 보드의 첫 칸에 갇혔다(휴먼서희스타힐스 2026-08-25):
   * 표의 단계 칸에서 고르는 것 말고는 길이 없었다. 넘기는 자리에 되돌리는 자리를
   * 같이 둔다(화면 규칙 7).
   *
   * 판정은 띠(lib/board)로 한다 — '행위신고' 를 여기 적으면 첫 칸이 바뀔 때
   * (계약 칸이 늘거나 줄면) 이 자리가 조용히 어긋난다.
   */
  const prevStatus = PROCESS_STATUSES[now - 1] ?? null;
  const backToContract =
    prevStatus && bandOfColumn(prevStatus) === '계약' ? prevStatus : null;

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

        {/*
          * 가로 스테퍼 — 단계가 왼쪽에서 오른쪽으로 흐른다(한백 확인). 세로 타임라인은
          * 단계가 늘수록 화면이 길어졌다. 칩을 누르면 그 구간의 일이 아래 패널에 나온다.
          * ★보는 것(칩 선택)과 옮기는 것(패널의 넘기기 단추)을 가른다★ — 스치는 클릭에
          * 단계가 바뀌면 안 된다(보드 끌기를 걷어낸 것과 같은 이유).
          */}
        {/*
          * 스크롤 컨테이너는 세로도 자른다(overflow-x 를 주면 y 가 auto 가 된다) —
          * 칩의 ring 이 위에서 잘려 흰 띠가 칩을 자르는 것처럼 보였다. 위아래 여백을
          * ring 폭보다 넉넉히 준다.
          */}
        <div className="flex items-center gap-1 overflow-x-auto px-0.5 pb-2 pt-1.5" role="tablist" aria-label="공정 단계">
          {STEPS.map((st, i) => {
            // 자리 비교는 전역 순서(statusIndex)로 — STEPS 는 행위신고부터라 i 가 어긋난다
            const idx = statusIndex(st);
            const state = idx < now ? 'past' : idx === now ? 'current' : 'future';
            const entry = canEnter(st, p, gate);
            const tone =
              state === 'current'
                ? 'bg-brand-700 text-white'
                : state === 'past'
                  ? 'bg-brand-50 text-brand-800'
                  : entry.ok
                    ? 'border border-slate-200 bg-white text-slate-600'
                    : 'bg-slate-100 text-slate-400';
            return (
              <Fragment key={st}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected === st}
                  onClick={() => setSelected(st)}
                  className={`shrink-0 whitespace-nowrap rounded-ctl px-3 py-1.5 text-small font-bold transition ${tone} ${
                    selected === st ? 'ring-2 ring-brand-400' : 'hover:ring-2 hover:ring-brand-200'
                  }`}
                >
                  {state === 'past' && <span aria-hidden className="mr-1 opacity-70">✓</span>}
                  {st}
                  {state === 'future' && !entry.ok && <span aria-label="잠김" className="ml-1 opacity-70">🔒</span>}
                </button>
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className={`h-[2px] w-3 shrink-0 rounded-full ${idx < now ? 'bg-brand-300' : 'bg-slate-200'}`}
                  />
                )}
              </Fragment>
            );
          })}
        </div>

        {/* 보고 있는 구간의 일 */}
        {(() => {
          const selIdx = statusIndex(selected);
          const selState = selIdx < now ? 'past' : selIdx === now ? 'current' : 'future';
          const selEntry = canEnter(selected, p, gate);
          const selGroups = GROUPS_BY_STATUS[selected] ?? [];
          // 지금 구간의 다음 걸음 — 무엇이 차면 어디로 가는지 이 자리에 보여야 한다
          const nextStatus = PROCESS_STATUSES[now + 1] ?? null;
          const nextEntry = nextStatus ? canEnter(nextStatus, p, gate) : null;
          /*
           * 지금 보고 있는 구간 다음의 구간 — 상자 이름에 쓴다.
           *
           * ★이 화면은 「지금 구간 패널에 다음 구간을 여는 일」을 담는다.★ 그래서 「충전기
           * 수령」 패널에 착공일이 있고, 상자 이름이 「착공」이었다 — 패널 제목과 상자 이름이
           * 어긋나 보인다(한백 지적 2026-08-26). 구조는 그대로 두고 이름이 관계를 말하게 한다.
           * p.status 기준(nextStatus)이 아니라 고른 구간 기준이다 — 지난 구간을 열어 봐도
           * 그 상자가 무엇을 열었는지는 같아야 한다.
           */
          const selNext = PROCESS_STATUSES[statusIndex(selected) + 1] ?? null;
          return (
            <div className="mt-1 flex flex-col gap-4">
              {/* 구간 머리 — 무엇을 보고 있고, 그 구간으로 옮길 수 있으면 단추가 여기 선다 */}
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black text-slate-900">{selected}</h3>
                <Badge tone={selState === 'current' ? 'ok' : 'mute'}>
                  {selState === 'current' ? '지금 구간' : selState === 'past' ? '지난 구간' : '오지 않은 구간'}
                </Badge>
                {/*
                  * ★계약 국면에 서 있는 현장은 여기서 못 옮긴다★ (한백 지시 2026-08-26).
                  * 이 스테퍼는 행위신고부터 그리므로, 계약완료 현장에서 「이 구간으로
                  * 넘기기」를 누르면 「운영사 계약서 제출」을 통째로 건너뛰었다 —
                  * 그러면 제출일이 영영 안 남고 담당도 운영사를 거치지 않는다.
                  * 그 걸음은 계약 탭과 보드 카드에서 한다.
                  */}
                {edit === 'all' && selState !== 'current' && bandOfColumn(p.status) !== '계약' && (
                  selEntry.ok ? (
                    <button
                      type="button"
                      disabled={busyKey === 'status'}
                      onClick={() => moveStatus(selected)}
                      className={`rounded-ctl border px-3 py-1 text-small font-bold transition disabled:opacity-50 ${
                        selState === 'past'
                          ? 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                          : 'border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100'
                      }`}
                    >
                      {selState === 'past' ? `← 이 구간으로 되돌리기` : `이 구간으로 넘기기 →`}
                    </button>
                  ) : (
                    <p className="text-tiny font-semibold text-slate-400">
                      🔒 {(STATUS_GATES[selected]?.(p, gate) ?? []).map((b) => b.label).join(' · ')} 필요
                    </p>
                  )
                )}
              </div>

              {/*
                * 계약으로 되돌리기 — 지금 구간이 시공의 첫 칸일 때만 선다.
                *
                * ★단계 이름 바로 밑이다★ (한백 지적 2026-08-25). 머리줄 오른쪽 끝에 글자
                * 단추로 뒀더니 안 보였다 — 그 줄은 이름과 배지가 있는 자리라 눈이 왼쪽에서
                * 멈추고, 밑줄 글자는 그 옆에서 배경으로 읽힌다. 되돌리기는 드물게 눌러도
                * 「할 수 있다」가 보여야 하는 일이라 테두리 단추로 세운다.
                *
                * 넘기는 단추(다음 — … 로 넘기기)는 패널 맨 아래다 — 여기서 멀다
                * (화면 규칙 8). 지난 구간의 「← 이 구간으로 되돌리기」와 같은 모양이다.
                */}
              {edit === 'all' && selState === 'current' && backToContract && (
                <div>
                  <Btn
                    kind="side"
                    size="sm"
                    busy={busyKey === 'status'}
                    busyLabel="되돌리는 중…"
                    title="이 현장은 계약 페이지에 섭니다"
                    onClick={() => moveStatus(backToContract)}
                  >
                    ← 계약으로 되돌리기 — {backToContract}
                  </Btn>
                </div>
              )}

              {selGroups.map((g) => (
                <div key={g.title}>
                  {/* 묶음 이름이 단계 이름과 같으면 안 적는다 — 위 칩이 이미 그 말이다 */}
                  {g.title !== selected && (
                    <h3 className="mb-1.5 text-tiny font-bold tracking-[0.06em] text-slate-400">
                      {/*
                        * 준공서류 검토는 뺀다 — 그 다음은 「준공보완」이라, 상자 이름에 적으면
                        * 보완이 예정된 것처럼 읽힌다. 거기는 검토 판정이 다음 걸음이다.
                        */}
                      {g.opensNext && selNext && selected !== '준공서류 접수/검토'
                        ? `다음 — ${selNext}`
                        : g.title}
                    </h3>
                  )}
                  <div className="max-w-2xl overflow-hidden rounded-box border border-slate-200 bg-white divide-y divide-slate-100">
                    {/*
                      * ★필요한지부터 정한다★ (한백 지시 2026-08-26) — 행위신고가
                      * 필요 없는 현장이 있어서, 날짜·파일을 먼저 보여주면 안 낼 서류를
                      * 내라고 재촉하는 화면이 된다. 불필요를 고르면 아래 줄은 잠긴다.
                      */}
                    {g.need && (
                      <NeedRow
                        need={g.need}
                        requiredAt={p[g.need.field]}
                        skippedAt={p[g.need.skipField]}
                        canEdit={canEdit && selState !== 'future'}
                        busy={busyKey === g.need.field || busyKey === g.need.skipField}
                        onPick={saveCheck}
                      />
                    )}

                    {/* 대상 여부를 고르기 전에는 아래를 펴지 않는다 — 대상이 아니면 낼 것이 없다 */}
                    {(!g.need || Boolean(p[g.need.field])) && g.rows.map((m) => (
                      <DateRow
                        key={m.field}
                        m={m}
                        canEdit={canEditField(m.field)}
                        lockedForPartner={canEdit && isHanbaekOnlyProcessField(m.field)}
                        busy={busyKey === m.field}
                        onSave={saveDate}
                      />
                    ))}

                    {/*
                      * 발주 칸 — 한백의 일이다. 칸이 발주·수령으로 갈렸으니(2026-08-26)
                      * 한 상자 안에서 누가 적는지 띠로 가를 필요가 없어졌다: 칸이 곧 차례다.
                      *
                      * ★조건은 lib/process 의 「충전기 수령」 게이트와 같은 목록이어야 한다★ —
                      * 화면이 활성인데 서버가 거절하면 왜 안 넘어가는지 알 수 없다.
                      */}
                    {g.extras?.map((x) => extraRow(x))}

                    {(!g.need || Boolean(p[g.need.field]))
                      && processDocsFor(g.docs, docCtx).map((spec) => {
                      const kind = spec.key;
                      return (
                        <DocRow
                          key={kind}
                          projectId={detail.project.id}
                          siteName={detail.project.name}
                          spec={spec}
                          doc={p.docs.find((x) => x.kind === kind)}
                          canDelete={edit === 'all'}
                          canRemove={edit !== 'none'}
                        />
                      );
                    })}

                    {/*
                      * 다음으로 미는 단추 — 언제나 이 자리에 있다. 조건이 안 찼으면 흐린 채로
                      * 무엇이 없는지 이름에 적는다(화면 규칙 3). 누르면 이 구간을 끝냈다는
                      * 선언이 저장되고 다음 단계가 열린다(lib/process CHECK_ADVANCES).
                      */}
                    {g.advance && selState === 'current' && (
                      <AdvanceRow
                        label={g.advance.label}
                        blockers={advanceBlockers(g.advance.target, g.advance.field ?? null, p, gate)}
                        /*
                         * 선언 칸(체크)이 있는 구간은 그 현장의 시공사도 누른다 — 체크가
                         * 곧 전이다. 선언 칸이 없는 발주 칸은 단계를 직접 옮기므로 한백만이다
                         * (status 라우트가 한백 전용이다).
                         */
                        canEdit={g.advance.field ? canEdit : edit === 'all'}
                        busy={busyKey === (g.advance.field ?? 'status')}
                        onGo={() => {
                          if (g.advance?.field) saveCheck(g.advance.field, true);
                          else if (g.advance?.move) moveStatus(g.advance.move);
                        }}
                      />
                    )}

                    {g.check && (!g.need || Boolean(p[g.need.field])) && (
                      <CheckRow
                        check={g.check}
                        value={p[g.check.field]}
                        /*
                         * 오지 않은 구간의 체크는 못 누른다 — 체크가 곧 지급 트리거라
                         * (설치완료·개통완료) 미래 구간에서 누르면 착공도 안 한 현장의
                         * 지급이 열렸다(2026-08-26). 서버도 같은 판정을 한다.
                         */
                        canEdit={canEdit && selState !== 'future'}
                        busy={busyKey === g.check.field}
                        onToggle={saveCheck}
                      />
                    )}

                  </div>
                </div>
              ))}

              {/*
                * 다음 걸음 — 지금 구간을 볼 때, 무엇이 차면 어디로 가는지 그 자리에 보인다.
                * 완료 체크를 했는데 딴 조건(환경부 승인일 등)이 비어 못 넘어가던 것이
                * 아무 말 없이 지나갔다 — 그 이유가 여기 적힌다.
                * 접수/검토 구간은 뺀다 — 거기는 검토 판정 상자가 다음 걸음이다.
                */}
              {/*
                * 묶음 안에 진행 단추가 있으면 여기 두지 않는다 — 같은 걸음을 두 자리에 두면
                * 어느 것이 그 일인지 알 수 없다(화면 규칙 5).
                */}
              {selState === 'current' && nextStatus && selected !== '준공서류 접수/검토' && nextEntry
                && !selGroups.some((g) => g.advance) && (
                nextEntry.ok ? (
                  edit === 'all' ? (
                    <button
                      type="button"
                      disabled={busyKey === 'status'}
                      onClick={() => moveStatus(nextStatus)}
                      className="w-fit rounded-ctl border border-brand-300 bg-brand-50 px-3 py-1.5 text-small font-bold text-brand-800 transition hover:bg-brand-100 disabled:opacity-50"
                    >
                      다음 — {nextStatus} 로 넘기기 →
                    </button>
                  ) : (
                    /*
                     * ★「준비됨」은 안 적는다(한백 지시 2026-08-26).★ 보드 카드에서 지운
                     * 것과 같은 말이고 같은 이유다 — 단계를 옮기는 것은 한백이라, 단추가
                     * 없는 쪽에는 그 말로 할 수 있는 일이 없다. 조건이 없어서 열려 있다는
                     * 것은 우리 사정이지 그쪽의 다음 걸음이 아니다.
                     * 아래 「… 필요」는 남는다 — 안 찬 조건은 대개 그쪽이 할 일이다.
                     */
                    null
                  )
                ) : edit === 'all' ? (
                  /*
                   * ★조건이 안 차도 단추는 자리에 둔다★ (한백 지시 2026-08-26) — 흐린 단추에
                   * 무엇이 없는지 적으면 그 줄만 보고 남은 일을 안다. 글자만 두면 「넘기는
                   * 자리가 어디였나」를 다시 찾아야 한다.
                   */
                  <button
                    type="button"
                    disabled
                    className="w-fit cursor-not-allowed rounded-ctl border border-slate-200 bg-slate-50 px-3 py-1.5 text-small font-bold text-slate-400"
                  >
                    다음 — {nextStatus} · {(nextEntry as { blockedBy: string }).blockedBy} 필요
                  </button>
                ) : (
                  <p className="text-small font-semibold text-amber-700">
                    다음: {nextStatus} — {(nextEntry as { blockedBy: string }).blockedBy} 필요
                  </p>
                )
              )}

              {/* 준공서류 검토 판정 — 한백이 보고, 이상 없으면 준공·아니면 보완으로 */}
              {selected === '준공서류 접수/검토' &&
                p.status === '준공서류 접수/검토' &&
                edit === 'all' &&
                Boolean(p.completionSubmitAt) && (
                  <CompletionReview
                    busy={busyKey === 'status' || busyKey === 'completionFix'}
                    onApprove={() => moveStatus('준공')}
                    onFix={(reason) => void sendToFix(reason)}
                  />
                )}
            </div>
          );
        })()}

        {p.memo && (
          <Note tone="mute" className="mt-3">{p.memo}</Note>
        )}
      </section>
    </div>
  );
}


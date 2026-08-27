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
import type { ChargerModel, ProcessStatus, ProjectDetail } from '@/types/project';
import { PROCESS_STATUSES } from '@/types/project';
import { PROCESS_DOCS } from '@/lib/doc-rules';
import { bandOfColumn } from '@/lib/board';
import { advanceBlockers,
  canEnter, isHanbaekOnlyProcessField, statusIndex, STATUS_GATES, type ProcessEdit,
} from '@/lib/process';
import { DocDelete, DocFileActions, DocUpload, DownloadAll } from '@/components/DocFiles';
import { DatePicker } from '@/components/DatePicker';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { Badge, Btn, Empty, Err, FIELD, FIELD_CELL, Note } from '@/components/ui';

/** 고칠 수 있는 날짜 칸 — 이름은 서버(ProcessPatch)와 같아야 한다 */
type DateField =
  | 'notifyDate' | 'chargerOrderDate' | 'chargerShipDate' | 'chargerRecvDate'
  | 'startActualDate' | 'installDoneDate' | 'commDoneDate' | 'openDate';

/** 묶음별 완료 체크 칸 */
type CheckField =
  | 'notifyDoneAt' | 'notifySkippedAt' | 'notifyRequiredAt'
  | 'chargerDoneAt' | 'installConfirmedAt' | 'openDoneAt'
  | 'completionSubmitAt';

/** 수량 칸 — 설치 실적(거점·기) · 발주 수량(한백) · 수령 수량(협력사) */
type CountField =
  | 'installedSpots' | 'installedUnits'
  | 'chargerOrderQty' | 'modemOrderQty'
  | 'chargerQty' | 'modemQty';

/**
 * 상자가 그리는 딸림 줄 — 날짜·서류 말고 그 상자에만 있는 것들.
 *
 * ★이름으로 분기하지 않는다★ (2026-08-27) — 예전에는 `g.title === '충전기'` 로 그렸다.
 * 상자 이름을 「충전기 발주」로 바꾸는 순간 모델·발주 수량 줄이 화면에서 통째로 사라졌고,
 * 양쪽 다 문자열이라 타입 검사도 통과했다(한백 지적 2026-08-26). 이름은 라벨일 뿐이고,
 * 무엇을 그릴지는 이 목록이 정한다 — 목록에 없는 값을 적으면 컴파일이 깨진다.
 */
type GroupExtra = 'chargerModel' | 'orderQty' | 'recvQty' | 'installedQty';

interface MilestoneRow {
  label: string;
  field: DateField;
  value: string | null;
  trigger?: string;
}

/** 사람의 선언 한 줄 — 조건(ready)이 차야 체크할 수 있고, 막히면 그 이유를 적는다 */
interface GroupCheck {
  field: CheckField;
  label: string;
  ready: boolean;
  blocked: string;
}

interface Group {
  title: string;
  rows: MilestoneRow[];
  docs: string[];
  /** 이 묶음을 끝냈다는 사람의 선언 */
  check?: GroupCheck;
  /**
   * 이 묶음을 할지 말지 먼저 고르는 자리 — 「필요」·「불필요」 두 단추다.
   *
   * 안 하는 일을 「했다」고 체크하게 두지 않기 위한 자리이고(화면 규칙 10), 고르기
   * 전에는 아래 줄(날짜·서류·완료)을 펴지 않는다 — 안 낼 서류를 내라고 재촉하지 않는다.
   * 불필요를 고르면 완료와 같은 걸음이 열린다(lib/process CHECK_ADVANCES).
   */
  need?: { field: CheckField; skipField: CheckField; label: string; yes: string; no: string };
  /**
   * 다음 단계로 미는 단추 — ★언제나 자리에 있고 활성/비활성으로 검증을 보인다★
   * (한백 지시 2026-08-26). 조건이 안 찼으면 흐린 채로 무엇이 없는지 이름에 적는다
   * (화면 규칙 3) — 단추가 사라지면 무엇을 더 해야 다음으로 가는지 알 수 없다.
   */
  /**
   * 다음 칸으로 미는 단추.
   *
   * ★조건을 여기 적지 않는다★ (2026-08-27) — 무엇이 없어 못 넘어가는지는 lib/process 의
   * advanceBlockers 가 정한다. 화면에도 적었더니 두 벌이 되어 어긋났다(모뎀 발주 수량을
   * 화면 쪽에만 빠뜨렸다, 2026-08-26). 화면은 그 목록의 첫 항목을 단추 이름에 적을 뿐이다.
   */
  advance?: {
    label: string;
    /** 이 단추가 여는 칸 — 게이트를 그 칸으로 묻는다 */
    target: ProcessStatus;
    /** 누르면 찍히는 완료 선언 — 저장소가 다음 칸을 연다(CHECK_ADVANCES) */
    field?: CheckField;
    /** 선언 칸이 없는 구간은 단계를 바로 옮긴다 — 발주처럼 한백이 넘기는 자리다 */
    move?: ProcessStatus;
  };
  /** 이 상자가 담은 일이 「다음 구간」의 것인가 — 이름을 「다음 — …」으로 적는다 */
  opensNext?: boolean;
  /** 날짜·서류 말고 이 상자가 그리는 줄 — 적힌 순서대로 rows 아래에 선다 */
  extras?: GroupExtra[];
}

export function ConstructionTab({ detail, edit }: { detail: ProjectDetail; edit: ProcessEdit }) {
  const p = detail.process;
  /** 설치 실적 옆에 두는 비교 기준 — 계약과 실제가 다른 것은 흔하다 */
  const contractQty = detail.lines.reduce((s, l) => s + l.qty, 0);
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

  const uploaded = (kind: string): boolean => {
    const d = p.docs.find((x) => x.kind === kind);
    return d?.status === 'uploaded' || d?.status === 'approved';
  };

  /*
   * 단계 구간마다 그 구간의 일. 승인 값(환경부 승인일·계약서 제출)은
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
        /*
         * 둘은 서로를 막는다 — 한 현장이 「했다」와 「필요 없다」를 같이 말할 수는 없다.
         * 막는 이유를 그 자리에 적는다(화면 규칙 3): 완료가 켜져 있으면 불필요가
         * 「완료로 표시됨」으로 잠기고, 반대도 같다. 풀려면 켠 것을 끄면 된다.
         */
        /*
         * 완료는 ★신고일과 파일이 다 있어야★ 누를 수 있다 (한백 지시 2026-08-26).
         * 예전에는 파일만 봤다 — 파일이 있는데 신고일이 비어 있으면 언제 신고했는지
         * 모르는 채로 다음 단계가 열렸다.
         */
        /*
         * 「행위신고 완료」 체크는 없앴다 — 넘어가는 단추가 그 선언을 겸한다.
         * 신고일과 파일이 다 있으면 활성화되고, 누르면 완료로 찍히며 다음 단계가 열린다.
         */
        advance: {
          label: '다음 단계로 진행',
          target: '충전기 발주',
          field: p.notifySkippedAt ? 'notifySkippedAt' : 'notifyDoneAt',
        },
        /*
         * ★필요여부를 먼저 고른다★ (한백 지시 2026-08-26) — 「필요」·「불필요」 두 단추다.
         * 서류로 확인할 수 있는 일이 아니라 사람이 내리는 판정이라 조건을 두지 않는다.
         * 불필요를 고르면 그 자리에서 「충전기 발주」가 열리고(lib/process CHECK_ADVANCES),
         * 필요를 고르면 아래 줄(신고일·서류·완료)이 열린다.
         *
         * 예전에는 「행위신고 불필요」라는 이름의 체크 한 줄이었다 — 이름과 단추가 같은 말을
         * 두 번 해서, 무엇을 고르는 자리인지 읽히지 않았다(한백 지적).
         */
        need: {
          field: 'notifyRequiredAt', skipField: 'notifySkippedAt',
          label: '행위신고 대상 여부', yes: '대상', no: '대상 아님',
        },
      },
    ],
    /*
     * ★발주 칸은 한백의 일만 담는다★ (한백 지시 2026-08-26) — 발주와 수령이 한 칸에 있으면
     * 차례를 넘길 자리가 없다. 여기를 다 채우면 수령 칸으로 넘기고, 차례가 현장으로 간다.
     */
    '충전기 발주': [
      {
        title: '충전기 발주',
        rows: [
          { label: '충전기 발주일', field: 'chargerOrderDate', value: p.chargerOrderDate },
          { label: '충전기 출고일', field: 'chargerShipDate', value: p.chargerShipDate },
        ],
        extras: ['chargerModel', 'orderQty'],
        docs: [],
        advance: { label: '다음 단계로 진행', target: '충전기 수령', move: '충전기 수령' },
      },
    ],
    // 충전기가 현장에 왔다 — 받은 것을 세고 넘긴다(현장 차례)
    '충전기 수령': [
      {
        title: '충전기 수령',
        rows: [{ label: '충전기 수령일', field: 'chargerRecvDate', value: p.chargerRecvDate }],
        extras: ['recvQty'],
        docs: [],
        advance: { label: '다음 단계로 진행', target: '착공', field: 'chargerDoneAt' },
      },
    ],
    // 공사 중 — 착공일을 여기서 적는다(수령 칸에 있던 것을 옮겼다). 설치가 끝나면 넘어간다
    '착공': [
      {
        /*
         * 착공예정일과 실착공일을 구분하지 않는다 — 시공팀이 착공일 하나만 적는다(한백 확인).
         * startPlanDate 칸은 저장소에 남아 있지만 화면에 그리지 않는다.
         */
        title: '착공',
        rows: [{ label: '착공일', field: 'startActualDate', value: p.startActualDate, trigger: '착공' }],
        docs: [],
      },
      {
        title: '설치',
        opensNext: true,
        /* 설치완료일이 곧 시공일자다 — 운영사 시스템의 「공통」 묶음에서 그 값이다 */
        rows: [{ label: '설치완료일', field: 'installDoneDate', value: p.installDoneDate }],
        extras: ['installedQty'],
        /*
         * 사진 뒤에 설치완료 때 같이 내는 것들을 둔다 (한백 지시 2026-08-26).
         * 전기사용신청 접수증은 개통 상자에 있었는데, 신청은 설치 무렵의 일이라 여기로 옮겼다.
         */
        docs: ['photoDone', 'installReport', 'installNotice', 'elecapply'],
        advance: { label: '다음 단계로 진행', target: '설치완료', field: 'installConfirmedAt' },
      },
    ],
    // 개통 절차 — 통신·개통까지 끝나고 완료 체크가 되면 「개통완료」가 열린다
    '설치완료': [
      {
        title: '개통',
        opensNext: true,
        rows: [
          { label: '통신완료일', field: 'commDoneDate', value: p.commDoneDate },
          { label: '개통완료일', field: 'openDate', value: p.openDate },
        ],
        docs: ['kepcofee', 'comm'],
        advance: { label: '다음 단계로 진행', target: '개통완료', field: 'openDoneAt' },
      },
    ],
    /*
     * 준공서류는 「준공서류 접수/검토」 구간의 일이다 — 개통완료 구간에 있었는데
     * 구간 이름과 내용이 어긋나 옮겼다(한백 확인 2026-08-21). 제출을 끝냈다고
     * 선언하면 준공보완·준공으로 넘어갈 수 있다.
     */
    '준공서류 접수/검토': [
      {
        title: '준공서류 접수/검토',
        rows: [],
        /*
         * 준공에 받는 서류 (한백 2026-08-27) — 환경부 제출분 둘, 대관서류 넷.
         * 「준공서류」 칸은 그대로 둔다: 이 구간에 들어오는 조건이 그 칸이다(STATUS_GATES).
         * 전기안전관리자 선임신고증명서는 한전불입 현장에만 낸다 — 혼용도 한전불입을 쓴다.
         */
        docs: [
          /*
           * 옛 「준공서류」 칸 — ★이미 올린 파일이 있는 현장에만 남긴다★. 칸을 없애면
           * 그 파일이 화면에서 사라진다(상자가 그리는 종류만 보인다). 새 현장은 아래
           * 세부 칸에 낸다. 이 구간에 들어오는 조건도 설치완료확인서로 옮겼다.
           */
          ...(uploaded('completion') ? ['completion'] : []),
          'completeConfirm',
          'costSurvey',
          'safety',
          ...(detail.project.powerType?.includes('한전불입') ? ['safetyMgr'] : []),
          'useInspect',
          'asBuilt',
        ],
        check: {
          field: 'completionSubmitAt', label: '준공서류 제출 완료',
          ready: uploaded('completion'), blocked: '준공서류 미제출 — 완료 불가',
        },
      },
    ],
  };

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
            const entry = canEnter(st, p);
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
          const selEntry = canEnter(selected, p);
          const selGroups = GROUPS_BY_STATUS[selected] ?? [];
          // 지금 구간의 다음 걸음 — 무엇이 차면 어디로 가는지 이 자리에 보여야 한다
          const nextStatus = PROCESS_STATUSES[now + 1] ?? null;
          const nextEntry = nextStatus ? canEnter(nextStatus, p) : null;
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
                      🔒 {(STATUS_GATES[selected]?.(p) ?? []).map((b) => b.label).join(' · ')} 필요
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

                    {(!g.need || Boolean(p[g.need.field])) && g.docs.map((kind) => {
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
                        blockers={advanceBlockers(g.advance.target, g.advance.field ?? null, p)}
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

/**
 * 수량 한 줄 — 수령 수량(충전기·모뎀)과 설치 실적(거점·기)이 같은 모양을 쓴다.
 * 숫자는 칸을 떠날 때 저장한다. 오른쪽 끝의 비교 기준(계약 N대)이 다르면 노랗게 —
 * 맞는지 물으러 갈 곳이 따로 없어야 한다.
 */
/**
 * 충전기 모델 — 등록된 목록에서 고른다 (한백 지시 2026-08-26).
 *
 * 이름을 손으로 적지 않는 이유: 같은 모델이 「BAS1007.D1.1」·「BAS1007-D1-1」로 갈리면
 * 나중에 모델별로 세지 못한다. 목록에 없으면 한백이 그 자리에서 등록한다 —
 * 등록하러 다른 화면으로 보내면 고르던 일이 끊긴다.
 *
 * 내린 모델(active=false)도 고른 값이면 보여준다 — 옛 현장의 값이 사라지면 안 된다.
 */
function ModelRow({
  value, canEdit, canRegister, busy, onSave,
}: {
  value: string | null;
  canEdit: boolean;
  /** 목록에 없는 모델을 그 자리에서 등록할 수 있는가 — 한백만 */
  canRegister: boolean;
  busy: boolean;
  onSave: (id: string | null) => void;
}) {
  const [models, setModels] = useState<ChargerModel[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch('/api/charger-models')
      .then((r) => (r.ok ? (r.json() as Promise<{ models: ChargerModel[] }>) : null))
      .then((d) => { if (alive && d) setModels(d.models); })
      .catch(() => { /* 목록이 안 뜰 뿐 — 화면을 막지 않는다 */ });
    return () => { alive = false; };
  }, []);

  const chosen = models?.find((m) => m.id === value) ?? null;
  /* 고를 수 있는 것은 살아 있는 모델 + 이미 고른 것(내려간 모델이어도 남긴다) */
  const options = (models ?? []).filter((m) => m.active || m.id === value);

  async function register() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/charger-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) { setError(body.error ?? '등록하지 못했습니다.'); return; }
      setModels((prev) => [...(prev ?? []), { id: body.id!, name: trimmed, maker: null, note: null, active: true }]);
      onSave(body.id);           // 등록한 것을 바로 고른 상태로 — 두 번 누르게 하지 않는다
      setAdding(false);
      setName('');
    } catch {
      setError('등록 중 오류가 났습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 text-slate-500">충전기 모델</span>
      {!canEdit ? (
        chosen ? <span className="font-semibold text-slate-800">{chosen.name}</span> : <Empty kind="miss" />
      ) : adding ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void register(); }}
            placeholder="모델명 — 예: BAS1007.D1.1"
            className={`${FIELD_CELL} w-56`}
          />
          <Btn size="sm" busy={saving} busyLabel="등록 중…" disabled={!name.trim()} onClick={() => void register()}>
            등록하고 고르기
          </Btn>
          <Btn size="sm" kind="quiet" disabled={saving} onClick={() => { setAdding(false); setName(''); setError(null); }}>
            취소
          </Btn>
          <Err>{error}</Err>
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <select
            aria-label="충전기 모델"
            value={value ?? ''}
            disabled={busy || models === null}
            onChange={(e) => onSave(e.target.value || null)}
            className={`${FIELD_CELL} w-56`}
          >
            <option value="">{models === null ? '불러오는 중…' : '미지정'}</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.active ? '' : ' (중지)'}</option>
            ))}
          </select>
          {/* 목록에 없는 모델은 여기서 등록한다 — 다른 화면으로 보내면 고르던 일이 끊긴다 */}
          {canRegister && (
            <Btn size="sm" kind="quiet" onClick={() => setAdding(true)}>새 모델</Btn>
          )}
        </span>
      )}
    </div>
  );
}

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
      {/* 날짜가 들어오면 기성 트리거가 열린다 — 사람이 봐야 하는 것이라 노랑이다 */}
      {m.trigger && (
        <Badge tone={m.value ? 'warn' : 'mute'}>{m.trigger} 트리거</Badge>
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
  projectId, siteName, spec, doc, canDelete, canRemove,
}: {
  projectId: string;
  siteName: string;
  spec: { key: string; name: string };
  doc: ProjectDetail['process']['docs'][number] | undefined;
  canDelete: boolean;
  /** 파일 한 장을 뺄 수 있는가 — 올리는 쪽(한백·그 현장 시공사)이면 뺄 수도 있다 */
  canRemove: boolean;
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
      {/* 부품은 자기 여백을 갖지 않는다 — 자리는 이 줄이 정한다(gap) */}
      <span className="flex flex-wrap items-center gap-1.5">
        {doc && (
          <DocFileActions
            doc={doc}
            siteName={siteName}
            label={spec.name}
            projectId={projectId}
            canRemove={canRemove}
          />
        )}
        <DocUpload projectId={projectId} kind={spec.key} rejected={false} hasFile={Boolean(doc?.blobUrl)} />
      </span>
      <span className="flex-1" />
      {/* 지우기는 한백만 — 협력사는 다시 올리는 것으로 고친다(덮어쓴다) */}
      {canDelete && doc && doc.status !== 'none' && (
        <span>
          <DocDelete
            projectId={projectId}
            kind={spec.key}
            label={spec.name}
            filename={doc.filename}
            count={doc.files.length}
          />
        </span>
      )}
    </div>
  );
}

/**
 * 완료 선언 한 줄 — 이 묶음의 일을 끝냈다는 사람의 선언.
 *
 * ★체크박스가 아니라 단추다★ (한백 지시 2026-08-26). 이 선언은 단계를 넘기는 일이라
 * (CHECK_ADVANCES) 스치는 클릭으로 일어나서는 안 되고, 무엇이 모자라 못 누르는지
 * 이름에 적혀야 한다(화면 규칙 3). 체크박스는 눌러 봐야 되는지 알 수 있었다.
 *
 * 끝낸 뒤에는 날짜와 함께 굳고, 되돌리는 단추가 반대쪽 끝에 선다(규칙 7·8).
 */
/**
 * 다음 단계로 미는 줄 — 단추는 언제나 있고, 조건이 안 찼으면 흐리다.
 *
 * ★단추를 없애지 않는 이유★ (한백 지시 2026-08-26) — 조건이 찰 때만 단추가 나타나면,
 * 무엇을 더 채워야 다음으로 가는지 화면에 없다. 자리에 두고 이름에 이유를 적으면
 * 그 줄만 보고도 남은 일을 안다(화면 규칙 3).
 */
function AdvanceRow({
  label, blockers, canEdit, busy, onGo,
}: {
  label: string;
  /** 없는 것들 — 비어 있으면 단추가 열린다. 판정은 lib/process 가 한다 */
  blockers: string[];
  canEdit: boolean;
  busy: boolean;
  onGo: () => void;
}) {
  if (!canEdit) return null;
  const ready = blockers.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
      <Btn disabled={!ready} busy={busy} busyLabel="넘기는 중…" onClick={onGo}>
        {ready ? `${label} →` : `${blockers[0]} 필요`}
      </Btn>
      {/* 둘 이상 비었으면 남은 것도 적는다 — 하나 채우고 또 막히는 일을 줄인다 */}
      {blockers.length > 1 && (
        <span className="text-tiny font-semibold text-slate-400">
          그리고 {blockers.slice(1).join(' · ')}
        </span>
      )}
    </div>
  );
}

/**
 * 할지 말지 먼저 고르는 줄 — 「필요」·「불필요」 두 단추.
 *
 * 예전에는 「행위신고 불필요」라는 체크 한 줄이었다. 이름과 단추가 같은 말을 두 번 해서
 * 무엇을 고르는 자리인지 읽히지 않았고, 「필요」라고 정한 것을 남길 곳도 없었다
 * (한백 지적 2026-08-26). 고르면 글자로 굳고, 되돌리는 자리는 반대쪽 끝이다(화면 규칙 4·8).
 */
function NeedRow({
  need, requiredAt, skippedAt, canEdit, busy, onPick,
}: {
  need: { field: CheckField; skipField: CheckField; label: string; yes: string; no: string };
  requiredAt: string | null;
  skippedAt: string | null;
  canEdit: boolean;
  busy: boolean;
  onPick: (field: CheckField, checked: boolean) => void;
}) {
  const picked = requiredAt ? need.yes : skippedAt ? need.no : null;
  const at = requiredAt ?? skippedAt;

  return (
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 font-bold text-slate-700">{need.label}</span>
      {picked ? (
        <>
          <span className={`font-bold ${requiredAt ? 'text-brand-800' : 'text-slate-500'}`}>
            {picked} · {at}
          </span>
          {canEdit && (
            <Btn
              kind="quiet"
              size="sm"
              busy={busy}
              busyLabel="되돌리는 중…"
              onClick={() => onPick(requiredAt ? need.field : need.skipField, false)}
              className="ml-auto"
            >
              되돌리기
            </Btn>
          )}
        </>
      ) : canEdit ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {/* 대상을 고르면 아래 줄(신고일·서류)이 열리고, 아니면 진행 단추만 남는다 */}
          <Btn size="sm" busy={busy} busyLabel="처리 중…" onClick={() => onPick(need.field, true)}>
            {need.yes}
          </Btn>
          <Btn size="sm" kind="quiet" busy={busy} busyLabel="처리 중…" onClick={() => onPick(need.skipField, true)}>
            {need.no}
          </Btn>
        </span>
      ) : (
        <Empty kind="miss" />
      )}
    </div>
  );
}

function CheckRow({
  check, value, canEdit, busy, onToggle,
}: {
  check: GroupCheck;
  value: string | null;
  canEdit: boolean;
  busy: boolean;
  onToggle: (field: CheckField, checked: boolean) => void;
}) {
  const done = Boolean(value);

  return (
    <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-base">
      <span className="w-32 shrink-0 font-bold text-slate-700">{check.label}</span>
      {done ? (
        <>
          <span className="font-bold text-brand-800">완료 · {value}</span>
          {/* 되돌리기는 반대쪽 끝 — 자주 누르는 것과 붙여 두지 않는다(규칙 8) */}
          {canEdit && (
            <Btn
              kind="quiet"
              size="sm"
              busy={busy}
              busyLabel="되돌리는 중…"
              onClick={() => onToggle(check.field, false)}
              className="ml-auto"
            >
              되돌리기
            </Btn>
          )}
        </>
      ) : canEdit ? (
        <Btn
          size="sm"
          disabled={!check.ready}
          busy={busy}
          busyLabel="처리 중…"
          onClick={() => onToggle(check.field, true)}
        >
          {/* 막는 것을 이름에 적는다 — 흐린 단추만으로는 왜 안 되는지 알 수 없다 */}
          {check.ready ? check.label : check.blocked}
        </Btn>
      ) : (
        <span className="font-bold text-slate-400">미완</span>
      )}
    </div>
  );
}

/**
 * 준공서류 검토 판정 — 한백만, 제출 완료 선언 뒤에만 선다.
 *
 * 이상 없으면 준공으로 확정하고, 아니면 사유와 함께 「준공보완」으로 보낸다.
 * 보완은 사유가 필수다 — 사유 없는 보완은 시공사가 무엇을 고칠지 모른다(반려와 같은 규칙).
 * 사유는 진행현황 메모로 남는다 — 보완 전달 채널이 정해질 때까지의 자리.
 */
function CompletionReview({
  busy, onApprove, onFix,
}: {
  busy: boolean;
  onApprove: () => void;
  onFix: (reason: string) => void;
}) {
  const [fixing, setFixing] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <div className="max-w-2xl rounded-box border border-brand-200 bg-brand-50/40 px-3.5 py-3">
      <p className="text-tiny font-bold tracking-[0.06em] text-slate-500">검토 판정</p>
      {fixing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            rows={2}
            placeholder="보완할 내용 — 진행현황에 남아 시공사가 봅니다"
            className={FIELD}
          />
          <div className="flex items-center gap-2">
            <Btn
              size="sm"
              kind="side"
              busy={busy}
              busyLabel="보내는 중…"
              disabled={!reason.trim()}
              onClick={() => onFix(reason.trim())}
            >
              보완으로 보내기
            </Btn>
            <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setFixing(false)}>
              취소
            </Btn>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Btn size="sm" busy={busy} busyLabel="처리 중…" onClick={onApprove}>
            이상 없음 — 준공으로
          </Btn>
          <Btn size="sm" kind="quiet" disabled={busy} onClick={() => setFixing(true)}>
            보완 필요
          </Btn>
        </div>
      )}
    </div>
  );
}

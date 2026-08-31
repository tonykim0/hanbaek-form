'use client';

/**
 * 시공 구간마다 무엇을 하는가 — 날짜·서류·완료 선언의 정의.
 *
 * 그리는 코드에서 떼어 둔다. 여기 있는 것은 「무엇이 어느 구간에 속하는가」뿐이고,
 * 어떻게 보이는지는 시공 탭이 정한다. 조건(무엇이 없어 못 넘어가나)은 여기 적지 않는다 —
 * 그것은 lib/process 의 advanceBlockers 한 곳이다.
 */

import type {
  ProcessStatus, ProjectDetail,
} from '@/types/project';

import {
  processDocsFor, type ProcessDocKey,
} from '@/lib/doc-rules';

import {
  advanceBlockers, missingCompletionDocs, type GateContext,
} from '@/lib/process';

/** 고칠 수 있는 날짜 칸 — 이름은 서버(ProcessPatch)와 같아야 한다 */
export type DateField =
  | 'notifyDate' | 'chargerOrderDate' | 'chargerShipDate' | 'chargerRecvDate'
  | 'startActualDate' | 'installDoneDate' | 'commDoneDate' | 'openDate';

/** 묶음별 완료 체크 칸 */
export type CheckField =
  | 'notifyDoneAt' | 'notifySkippedAt' | 'notifyRequiredAt'
  | 'chargerDoneAt' | 'installConfirmedAt' | 'openDoneAt'
  | 'completionSubmitAt';

/** 수량 칸 — 설치 실적(거점·기) · 발주 수량(한백) · 수령 수량(협력사) */
export type CountField =
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
export type GroupExtra = 'chargerModel' | 'orderQty' | 'recvQty' | 'installedQty';

export interface MilestoneRow {
  label: string;
  field: DateField;
  value: string | null;
  trigger?: string;
}

/** 사람의 선언 한 줄 — 조건(ready)이 차야 체크할 수 있고, 막히면 그 이유를 적는다 */
export interface GroupCheck {
  field: CheckField;
  label: string;
  ready: boolean;
  blocked: string;
}

export interface Group {
  title: string;
  rows: MilestoneRow[];
  /** 이 상자가 그리는 서류 — 타입이라 오타가 컴파일에서 걸린다(옛 string[] 은 조용히 없었다) */
  docs: ProcessDocKey[];
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

/** 구간마다의 묶음 — 화면이 이 정의를 받아 그린다 */
export function groupsByStatus(
  p: ProjectDetail['process'],
  /** 게이트가 보는 현장 사정 — 준공서류가 현장마다 갈린다(한전불입만 받는 것이 있다) */
  ctx: GateContext
): Partial<Record<ProcessStatus, Group[]>> {
  /** 그 칸에 파일이 올라와 있는가 — 옛 칸을 남길지, 완료를 열지 정한다 */
  const uploaded = (kind: string): boolean => {
    const d = p.docs.find((x) => x.kind === kind);
    return d?.status === 'uploaded' || d?.status === 'approved';
  };

  /* 준공서류 중 아직 안 온 것 — 완료 선언을 막는 것과 같은 판정을 쓴다 */
  const missingDocs = missingCompletionDocs(p, ctx);

  return {
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
        /*
         * 발주 때 같이 받는 둘 (한백 지시 2026-08-31). 설치 신고서는 설치 상자에 있었는데,
         * 신고는 설치 전에 하는 일이라 그 묶음에 있을 자리가 아니었다.
         */
        docs: ['orderQuote', 'installNotice'],
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
        /* 착공일 아래에 선다 — 착공 전에 갖추는 안전서류다(한백 지시 2026-08-31) */
        docs: ['preStartDocs'],
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
        /* installNotice(충전시설 설치 신고서)는 발주 상자로 옮겼다 (2026-08-31) */
        docs: ['photoDone', 'installReport', 'elecapply'],
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
        /* 「개통완료」 칸을 걷었다(2026-08-31) — 개통을 마치면 곧바로 준공서류 칸이 열린다 */
        advance: { label: '다음 단계로 진행', target: '준공서류 접수/검토', field: 'openDoneAt' },
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
         * 조건부 서류(전기안전관리자 선임신고증명서 = 한전불입만)는 여기 적지 않는다 —
         * 조건은 정의 옆에 있고(doc-rules 의 only), processDocsFor 가 걸러 준다.
         */
        docs: [
          /*
           * 옛 「준공서류」 칸 — ★이미 올린 파일이 있는 현장에만 남긴다★. 칸을 없애면
           * 그 파일이 화면에서 사라진다(상자가 그리는 종류만 보인다). 새 현장은 아래
           * 세부 칸에 낸다. 이 구간에 들어오는 조건도 설치완료확인서로 옮겼다.
           */
          ...(uploaded('completion') ? (['completion'] as const) : []),
          'completeConfirm',
          'costSurvey',
          'safety',
          'safetyMgr',
          'useInspect',
          'asBuilt',
        ],
        /*
         * ★조건은 세부 칸이다★ (2026-08-29 흐름 워크스루) — 옛 「준공서류」 한 칸을
         * 보고 있어서, 세부 칸을 다 채운 새 현장이 「준공서류 미제출」에서 멈췄다.
         * 판정은 lib/process 한 곳이고(missingCompletionDocs) 여기는 그 답을 적는다.
         */
        check: {
          field: 'completionSubmitAt', label: '준공서류 제출 완료',
          ready: missingDocs.length === 0,
          blocked: `${missingDocs[0] ?? '준공서류'} 미제출 — 완료 불가`,
        },
      },
    ],
  };
}

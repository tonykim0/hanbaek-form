/**
 * 현장 보드의 칸.
 *
 * 축은 「누구 차례」가 아니라 「어느 단계」다. 이 화면이 답할 질문은
 * "어떤 현장이 어디까지 왔나" 하나뿐이다.
 *
 * 칸은 두 축을 이어 붙인 한 줄이다:
 *
 *   계약(유도값 stage) → 공정 8단계(저장값 process.status)
 *
 * 계약이 끝나지 않은 현장은 '계약완료' 칸에 넣지 않는다. 섞으면 「계약이 안 끝난 현장」과
 * 「계약은 끝났는데 아직 공정이 안 도는 현장」이 한 칸에서 구분되지 않는다.
 * 138건이 되면 그 칸만 봐도 무엇을 해야 하는지 알 수 없게 된다.
 *
 * 정산은 칸이 아니다. 기성은 공정과 나란히 도는 축이라(환경부 승인·착공에서 열린다)
 * 이 줄에 끼워 넣으면 한 현장이 두 칸에 있어야 한다.
 */
import type { HoldState, ProcessStatus, Stage } from '@/types/project';
import { PROCESS_STATUSES } from '@/types/project';

/** 공정에 들어가기 전(계약)과 흐름에서 빠진 것(계약중단)은 공정 상태로 표현할 수 없어 따로 둔다 */
export type BoardColumn = '계약접수' | '계약검토' | '계약보완' | ProcessStatus | '계약중단';

/** 칸을 묶는 띠 — 11칸이 한 줄로 늘어서면 눈이 구역을 못 찾는다 */
export type BoardBand = '계약' | '시공' | '멈춤';

/**
 * 띠의 말투 — 배지 색은 부품(components/ui)의 Tone 이름으로 부른다.
 *
 * 여기 한 곳에 두는 이유: 같은 띠 색을 보드·표·현장 상세가 각자 적고 있었고,
 * 현장 상세만 생클래스(bg-slate-800)여서 뜻이 아니라 색으로 굳어 있었다.
 * 색을 바꿀 일이 생기면 여기만 고친다.
 */
export const BAND_TONE = {
  계약: 'stage',
  시공: 'ok',
  멈춤: 'hold',
} as const satisfies Record<BoardBand, string>;

export interface BoardColumnDef {
  key: BoardColumn;
  label: string;
  band: BoardBand;
  /** 카드를 끌어다 놓을 수 있는 칸인가 */
  droppable: boolean;
  /** 놓을 수 없는 칸에 왜 그런지 */
  why?: string;
  /**
   * 다른 보드에도 서는 칸 — 그쪽에서 부르는 이름과 함께.
   *
   * ★계약의 끝이 곧 시공의 시작인 칸이 하나 있다★ (한백 지시 2026-08-29):
   * 「운영사 계약서 제출」. 계약 쪽에서는 「우리가 냈다」는 뜻이고, 시공 쪽에서는
   * 「환경부 승인을 기다리는 중」이다 — 같은 자리를 양쪽에서 다르게 본다.
   * 한 칸만 세워 두면 한쪽 보드에서는 현장이 통째로 사라진다.
   */
  alsoOn?: { band: BoardBand; label: string };
}

/**
 * 계약완료·운영사 계약서 제출까지가 계약이다(한백 확인) — 운영사에 내는 것은 계약 일의
 * 끝이고, 시공은 환경부 승인·운영사 시공승인 뒤에 시작한다. 페이지를 가르는 판정
 * (phaseOfProject)도 이 매핑을 따른다 — stage 로만 가르면 계약완료 현장이 시공 페이지로
 * 넘어가 버린다.
 */
const BAND_OF_STATUS: Record<ProcessStatus, BoardBand> = {
  '계약완료': '계약',
  '운영사 계약서 제출': '계약',
  '행위신고': '시공',   // 시공팀의 첫 일 — 시공 보드의 첫 칸이다
  '충전기 발주': '시공',
  '충전기 수령': '시공',
  '착공': '시공',
  '설치완료': '시공',
  '준공서류 접수/검토': '시공',
  '준공보완': '시공',
  '준공완료': '시공',
};

/**
 * 이 현장이 계약·시공 어느 국면인가 — 계약/시공 페이지가 이걸로 인구를 가른다.
 * 멈춘 현장도 국면을 따라간다(계약중단 칸은 양쪽 페이지에 각자 선다).
 */
export function phaseOfProject(p: { stage: Stage; status: ProcessStatus }): '계약' | '시공' {
  if (p.stage === 'intake') return '계약';
  return BAND_OF_STATUS[p.status] === '계약' ? '계약' : '시공';
}

/**
 * 계약과 시공이 맞물리는 칸 — 양쪽 보드에 선다.
 *
 * 우리가 운영사에 계약서를 낸 뒤의 일은 우리 손 밖이다: 운영사가 환경부에 접수하고,
 * 환경부가 승인해 운영사에 알리고, 운영사가 승인일과 함께 우리에게 알려준다(한백 설명).
 * 그 기다림이 계약 보드의 마지막 칸이자 시공 보드의 첫 칸이다.
 */
export const HANDOFF_STATUS = '운영사 계약서 제출' as const;

/** 시공 쪽에서 부르는 이름 — 냈다(계약)와 기다린다(시공)는 같은 자리의 두 얼굴이다 */
const CONSTRUCTION_LABEL: Record<typeof HANDOFF_STATUS, string> = {
  '운영사 계약서 제출': '환경부 승인 대기',
};

/** 시공 화면에서 부르는 칸 이름 — 스테퍼도 보드도 같은 말을 쓴다 */
export function constructionLabelOf(status: ProcessStatus): string {
  return status === HANDOFF_STATUS ? CONSTRUCTION_LABEL[status] : status;
}

/**
 * 이 현장이 그 보드에 서는가 — 사는 국면 하나에, 맞물리는 칸이면 양쪽에.
 *
 * 예전에는 국면 하나로만 갈랐다. 그래서 계약서를 낸 현장이 시공 보드에서 통째로 사라지고,
 * 시공 탭을 열면 첫 구간이 「오지 않은 구간」이라 무엇을 기다리는지 화면에 없었다
 * (2026-08-29 흐름 워크스루).
 */
export function showsOnBoard(p: { stage: Stage; status: ProcessStatus }, band: '계약' | '시공'): boolean {
  if (phaseOfProject(p) === band) return true;
  return p.status === HANDOFF_STATUS && band === '시공' && p.stage !== 'intake';
}

export const BOARD_COLUMNS: BoardColumnDef[] = [
  {
    key: '계약접수',
    label: '계약접수',
    band: '계약',
    droppable: false,
    // 화면에서 옮길 수 있게 만들면 실제 서류와 어긋난 단계가 생긴다
    why: '필수 서류가 다 차면 검토로 넘어갑니다',
  },
  {
    key: '계약검토',
    label: '계약검토',
    band: '계약',
    droppable: false,
    why: '한백이 계약 확인을 누르면 넘어갑니다',
  },
  {
    key: '계약보완',
    label: '계약보완',
    band: '계약',
    droppable: false,
    why: '반려를 풀면 저절로 빠집니다',
  },
  ...PROCESS_STATUSES.map((s): BoardColumnDef => ({
    key: s,
    label: s,
    band: BAND_OF_STATUS[s],
    droppable: true,
    ...(s === HANDOFF_STATUS
      ? { alsoOn: { band: '시공' as const, label: CONSTRUCTION_LABEL[s] } }
      : {}),
  })),
  /*
   * 계약이 무산된 현장 — 맨 끝 칸이다. 지우지 않고 여기 세워 둔다(기록이 남아야 한다).
   * ★멈춤 칸은 이 하나다★ (한백 2026-08-31) — 「보류」 칸을 걷었다. 두 칸이 하는 일이
   * 같았다: 흐름에서 빼고, 할 일에서 지우고, 보드 끝에 세운다.
   */
  {
    key: '계약중단',
    label: '계약중단',
    band: '멈춤',
    droppable: false,
    why: '계약중단은 카드의 「중단」이나 현장 상세에서 겁니다',
  },
];

/** 그 칸이 어느 띠에 속하는가 (계약 · 시공 · 멈춤) */
export function bandOfColumn(key: BoardColumn): BoardBand {
  return BOARD_COLUMNS.find((c) => c.key === key)?.band ?? '계약';
}

/**
 * 이 현장이 서는 칸. 반드시 한 칸이다 — 두 칸에 걸치면 세는 순간 합이 안 맞는다.
 *
 * 순서가 곧 우선순위다. 멈춘 현장은 진행 칸에 두지 않고, 계약이 안 끝났으면
 * 저장된 공정 상태가 무엇이든 계약 칸에 둔다(계약이 먼저다).
 */
export function boardColumnOf(p: {
  stage: Stage;
  status: ProcessStatus;
  holdState: HoldState | null;
  rejectedDocs: number;
  /** 기설치 조사 반려 — 서류 반려와 같은 뜻이라 같은 칸으로 보낸다 */
  preRejected: boolean;
  docsFilled: boolean;
  /** 협력사가 「계약서 접수하기」·「계약 재검토 요청하기」를 눌렀는가 */
  submitted: boolean;
  /** 한백이 보완요청을 한 적이 있는가 — 접수와 재검토요청을 가른다 */
  fixAsked: boolean;
}): BoardColumn {
  if (p.holdState) return p.holdState; // 계약중단이 곧 칸 이름이다
  if (p.stage === 'intake') {
    /*
     * 계약 안에서 세 칸으로 갈린다. 순서가 곧 우선순위다.
     *
     *   반려가 있으면                    → 계약보완  (협력사가 고칠 차례)
     *     ★서류 반려와 기설치 조사 반려를 같이 본다★ — 조사 반려는 서류가 아니라
     *     rejectedDocs 에 안 잡힌다. 안 보면 반려해 놓고도 현장이 제자리에 서 있다
     *     (한백 지적 2026-08-26 — 전주태평에스케이뷰).
     *   접수했거나 보완요청을 받은 적 있으면 → 계약검토  (한백이 볼 차례 — 단가·계약 확인)
     *   그 외(처음 모으는 중)             → 계약접수
     *
     * ★검토로 넘기는 것은 협력사의 선언이다★ (한백 지시 2026-08-24). 예전에는 필수
     * 서류 칸이 차는 순간(docsFilled) 저절로 넘어갔는데, 그러면 협력사가 아직 고치는
     * 중인 것이 한백의 검토 칸에 서고 「다 냈다」고 말할 자리가 없었다.
     *
     * ★접수는 처음 모으는 동안만 서는 자리다★ (한백 지시 2026-08-25). 반려를 다 풀면
     * 접수로 떨어져서, 계약완료까지 갔던 현장이 처음 접수하는 현장과 한 칸에 섰다.
     * 보완요청을 받은 적이 있으면(contractFixAskedAt) 접수 선언이 없어도 검토에 선다 —
     * 칸을 새로 만들지 않는다(한백 지시): 보완이 풀린 계약을 볼 사람은 한백이고,
     * 한백이 보는 자리는 계약검토다. 협력사가 내는 행위의 이름만 「재검토 요청」으로
     * 갈린다(components/project/IntakeTab.tsx).
     */
    if (p.rejectedDocs > 0 || p.preRejected) return '계약보완';
    return p.submitted || p.fixAsked ? '계약검토' : '계약접수';
  }
  return p.status;
}

/**
 * 협력사가 볼 다음 걸음 — 내 차례가 아닐 때는 조작이 아니라 기다리는 대상을 적는다.
 *
 * 「다음: 제출 체크」는 한백이 자기 화면에서 누를 것의 이름이다(한백 지시 2026-08-24).
 * 협력사에게 그 말을 보여주면 자기가 무엇을 체크해야 하는 줄 읽는다 — 실제로 할 일이
 * 없는 구간이라, 무엇을 기다리는 중인지가 맞는 말이다.
 *
 * null 이면 그 단계는 협력사의 일이다 — 그때는 게이트의 need 를 그대로 보여준다.
 */
const PARTNER_WAITING: Partial<Record<ProcessStatus, string>> = {
  /*
   * 계약완료에 서 있는 현장의 다음 걸음이다 — 그 제출은 ★한백이 한다★.
   * 「운영사 접수 대기 중」이라고 적어 두었는데, 아직 내지도 않은 것을 운영사가 받기를
   * 기다린다고 말하는 셈이었다(한백 지시 2026-08-25 — 계약완료면 협력사는 할 게 없다).
   */
  '운영사 계약서 제출': '한백 제출 대기 중',
  '준공서류 접수/검토': '한백 검토 대기 중',
  '준공완료': '한백 준공마감 대기 중',
};

export function partnerWaitingOf(next: ProcessStatus): string | null {
  return PARTNER_WAITING[next] ?? null;
}

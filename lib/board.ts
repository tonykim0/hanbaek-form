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

/** 공정에 들어가기 전(계약)과 흐름에서 빠진 것(보류)은 공정 상태로 표현할 수 없어 따로 둔다 */
export type BoardColumn = '계약접수' | '계약검토' | '계약보완' | ProcessStatus | '보류';

/** 칸을 묶는 띠 — 11칸이 한 줄로 늘어서면 눈이 구역을 못 찾는다 */
export type BoardBand = '계약' | '시공' | '멈춤';

export interface BoardColumnDef {
  key: BoardColumn;
  label: string;
  band: BoardBand;
  /** 카드를 끌어다 놓을 수 있는 칸인가 */
  droppable: boolean;
  /** 놓을 수 없는 칸에 왜 그런지 */
  why?: string;
  /** 칸이 하는 일 — 머리글에 그대로 나간다 */
}

/*
 * 공정 상태는 전부 시공 띠다.
 *
 * 예전에는 계약완료·운영사 계약서 제출을 계약 띠에 뒀다(사람이 계약의 끝으로 읽어서).
 * 계약·시공을 페이지로 가른 뒤에는 그러면 안 된다 — 시공 페이지는 시공 띠만 그리므로,
 * 계약 띠로 매핑된 상태의 현장이 어느 보드에도 안 선다. 계약이 끝난 현장의 상태 칸은
 * 전부 시공 페이지의 칸이고, 「계약완료」는 그 보드의 진입 칸(시공 대기)이다.
 */
const BAND_OF_STATUS: Record<ProcessStatus, BoardBand> = {
  '계약완료': '시공',
  '운영사 계약서 제출': '시공',
  '시공진행필요': '시공',
  '착공': '시공',
  '설치완료': '시공',
  '개통완료': '시공',
  '준공서류 접수/검토': '시공',
  '준공보완': '시공',
  '준공': '시공',
};

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
  })),
  {
    key: '보류',
    label: '보류 · DROP',
    band: '멈춤',
    droppable: false,
    why: '멈춤은 현장 상세에서 겁니다',
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
  docsFilled: boolean;
}): BoardColumn {
  if (p.holdState) return '보류';
  if (p.stage === 'intake') {
    /*
     * 계약 안에서 세 칸으로 갈린다. 순서가 곧 우선순위다.
     *
     *   반려가 있으면        → 계약보완  (협력사가 고칠 차례)
     *   필수 서류가 덜 찼으면 → 계약접수  (협력사가 더 낼 차례)
     *   다 찼으면            → 계약검토  (한백이 볼 차례 — 단가 지정·계약 확인)
     *
     * 서류는 여러 번 오간다. 그 왕복은 검토 ↔ 보완 사이에서만 일어나고,
     * 접수는 처음 모으는 동안만 서는 자리다 — 몇 번을 돌아도 칸이 늘지 않는다.
     */
    if (p.rejectedDocs > 0) return '계약보완';
    return p.docsFilled ? '계약검토' : '계약접수';
  }
  return p.status;
}

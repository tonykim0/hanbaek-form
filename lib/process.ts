/**
 * 시공 진행현황의 흐름과 전이 조건.
 *
 * 상태를 자유롭게 바꿀 수 있게 두면 화면이 실제 현장과 어긋난다.
 * 「설치완료인데 설치완료 사진이 없는 현장」 같은 것이 생기고, 그때 무엇이 진짜인지
 * 알 방법이 없어진다. 그래서 넘어가는 데 필요한 것을 여기 한 곳에 못 박는다.
 *
 * 조건이 없는 상태는 사람이 판단하는 것이다 — 없는 규칙을 만들어 넣지 않는다.
 *
 * 착공·준공마감은 상태가 아니라 날짜다. 기성 트리거가 실착공일·준공마감일에서 직접
 * 판정하므로(lib/settlement.ts) 같은 사실을 상태로 한 번 더 두지 않는다.
 */
import type { ProcessInfo, ProjectDocument, ProcessStatus } from '@/types/project';
import { PROCESS_STATUSES } from '@/types/project';

export interface StatusGate {
  /** 사람이 읽는 조건 — 화면에 그대로 나간다 */
  need: string;
  met: (process: ProcessInfo) => boolean;
}

const docApproved = (process: ProcessInfo, key: string): boolean =>
  process.docs.some((d) => d.kind === key && (d.status === 'uploaded' || d.status === 'approved'));

/**
 * 상태별 전이 조건 (2026-08-19 한백 확인).
 *
 * Record 로 선언했으므로 상태를 추가하면 여기서 컴파일이 깨진다 —
 * 조건을 정하지 않은 상태가 조용히 생기는 것을 막는다.
 */
export const STATUS_GATES: Record<ProcessStatus, StatusGate | null> = {
  '계약완료': null,   // 서류·단가가 다 차고 한백이 확인하면 여기서 시작한다
  /*
   * 우리가 운영사에 계약서를 낸 날. 우리가 하는 일이라 통보를 기다릴 것이 없다.
   *
   * 낸 뒤로는 운영사 쪽이 알아서 승인·접수하고(형식이다), 환경부 대기번호가 나오기를
   * 기다린다. 이 칸이 없던 동안은 「안 낸 현장」과 「내고 환경부를 기다리는 현장」이
   * 계약완료에 같이 있었다 — 그 둘은 할 일이 다르다.
   */
  '운영사 계약서 제출': {
    need: '운영사 계약서 제출일',
    met: (p) => Boolean(p.cpoSubmitDate),
  },
  // 환경부 승인 뒤 운영사가 따로 통보한다. 공정에서 유도할 수 없어 입력받는다.
  '시공진행필요': {
    need: '운영사 시공승인일',
    met: (p) => Boolean(p.cpoApprovalDate),
  },
  '설치완료': {
    need: '설치완료 사진',
    met: (p) => docApproved(p, 'photoDone'),
  },
  // 시공팀이 준공서류를 접수하면 넘어간다
  '준공서류 접수/검토': {
    need: '준공서류',
    met: (p) => docApproved(p, 'completion'),
  },
  '준공보완': null,   // 검토 결과 보완이 필요하다는 한백·운영사 판단
  '준공': null,       // 보완이 해소되었다는 판단
};

/**
 * 저장된 문자열을 진행현황으로 좁힌다.
 *
 * 상태 목록이 바뀌면 DB 에는 이제 없는 값이 남는다. 그걸 그대로 통과시키면
 * 그 현장은 보드의 어느 칸에도 속하지 않아 화면에서 조용히 사라진다.
 * 사라지는 것보다 첫 칸에 서 있는 편이 낫다 — 눈에 보이면 고칠 수 있다.
 */
export function asProcessStatus(value: string | null | undefined): ProcessStatus {
  return (PROCESS_STATUSES as readonly string[]).includes(value ?? '')
    ? (value as ProcessStatus)
    : PROCESS_STATUSES[0];
}

export function statusIndex(status: ProcessStatus): number {
  return PROCESS_STATUSES.indexOf(status);
}

/**
 * 지금 넘어갈 수 있는 상태들.
 *
 * 보드가 카드를 끌기 전에 놓을 수 없는 칸을 미리 흐리게 하려고 쓴다 —
 * 끌어다 놓고 나서 거절당하는 것보다 못 놓는다는 걸 먼저 보여주는 편이 낫다.
 */
export function entryOkOf(process: ProcessInfo): ProcessStatus[] {
  return PROCESS_STATUSES.filter((s) => canEnter(s, process).ok);
}

/**
 * 이 상태로 넘어갈 수 있는가. 막고 있는 조건을 함께 돌려준다.
 *
 * ★그 상태의 조건만 보지 않는다.★ 앞선 단계의 조건까지 전부 본다.
 * '준공보완'·'준공' 처럼 조건이 없는 상태로 곧장 건너뛰면 「준공서류가 없는 준공」이
 * 만들어진다 — 표·보드에서 단계를 직접 고를 수 있게 되면서 실제로 열린 구멍이다.
 * 흐름이 한 줄이므로 뒤 단계는 앞 단계의 조건을 이미 지났다는 뜻이어야 한다.
 *
 * 되돌리는 것은 막지 않는다. 앞으로 가는 조건만 누적되므로 뒤 단계에서 앞 단계로
 * 내려오는 길은 그대로 열려 있다.
 */
export function canEnter(
  status: ProcessStatus,
  process: ProcessInfo
): { ok: true } | { ok: false; blockedBy: string } {
  for (const st of PROCESS_STATUSES.slice(0, statusIndex(status) + 1)) {
    const gate = STATUS_GATES[st];
    if (gate && !gate.met(process)) return { ok: false, blockedBy: gate.need };
  }
  return { ok: true };
}

/**
 * 계약 단계에 보완이 필요한가.
 *
 * 별도 상태로 저장하지 않는다 — 반려된 서류가 있다는 사실 자체가 「계약보완」이다.
 * 상태를 따로 두면 반려를 풀고도 상태가 남아 어긋난다.
 */
export function contractNeedsFix(documents: ProjectDocument[]): string[] {
  return documents.filter((d) => d.status === 'rejected').map((d) => d.kind);
}

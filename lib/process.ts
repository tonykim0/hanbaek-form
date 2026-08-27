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
import type { Court, ProcessInfo, ProjectDocument, ProcessStatus } from '@/types/project';
import { PROCESS_STATUSES } from '@/types/project';
import { normalizeOrg } from '@/lib/roles';

/**
 * 없는 것 하나.
 *
 * `key` 는 화면이 「이건 지금 내가 선언할 것이라 뺀다」를 가릴 때 쓰고(advanceBlockers),
 * `label` 은 사람에게 그대로 나간다.
 */
export interface Blocker {
  key: string;
  label: string;
}

/**
 * 그 칸에 들어가려면 무엇이 있어야 하나 — ★없는 것만★ 담아 돌려준다.
 *
 * ★「됐나(boolean)」가 아니라 목록인 이유★ (2026-08-27) — 예전에는 `met: () => boolean` 과
 * 사람이 읽는 `need` 문자열이 따로 있었고, 화면(ConstructionTab 의 진행 단추)이 같은 조건을
 * 한 번 더 손으로 적었다. 두 벌이니 어긋났다: 충전기 발주 조건을 넣을 때 모뎀 발주 수량을
 * 화면 쪽에만 빠뜨렸다(2026-08-26). 목록으로 돌려주면 화면은 판정하지 않고 첫 항목만 적는다.
 */
export type StatusGate = (process: ProcessInfo) => Blocker[];

/** 없는 것만 남긴다 — 조건마다 `조건 && {key,label}` 로 적고 여기서 거른다 */
const missing = (list: Array<Blocker | false | null | undefined>): Blocker[] =>
  list.filter((b): b is Blocker => Boolean(b));

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
   * 우리가 운영사에 계약서를 냈는가. 우리가 하는 일이라 통보를 기다릴 것이 없다.
   *
   * 낸 뒤로는 운영사 쪽이 알아서 승인·접수하고(형식이다), 환경부 대기번호가 나오기를
   * 기다린다. 이 칸이 없던 동안은 「안 낸 현장」과 「내고 환경부를 기다리는 현장」이
   * 계약완료에 같이 있었다 — 그 둘은 할 일이 다르다.
   *
   * ★조건이 없다 — 넘기는 것이 곧 선언이다(한백 지시 2026-08-25).★
   * 「제출 체크」를 조건으로 두었더니 같은 사실을 두 번 말해야 했다: 상세에서 체크해야
   * 보드에 넘기기가 뜨고, 그걸 또 눌러야 옮겨졌다. 다른 게이트는 밖에서 오는 값을
   * 지킨다(환경부 승인일·착공일) — 이 칸만은 우리 선언이라 지킬 바깥 사실이 없다.
   * 한 화면에 같은 값을 두 번 두지 않는다(화면 규칙 5).
   *
   * 낸 날은 저장소가 넘길 때 찍는다(cpoSubmitDate) — 화면은 제출됨/미제출만 보여준다.
   */
  '운영사 계약서 제출': null,
  // 계약서를 냈으면 시작할 수 있다 — 행위신고 접수를 언제 넣을지는 시공팀 판단이라 조건이 없다
  '행위신고': null,
  /*
   * 환경부 승인일과 행위신고 완료 체크 — 둘 다 있어야 한다 (그 한 칸이 운영사
   * 시공승인도 겸한다, 한백 2026-08-27).
   * 행위신고는 승인을 기다리는 동안 미리 해놓는 일이고(1~2주), 끝나지 않았으면
   * 시공을 시작할 수 없다(한백 확인). 파일이 있다고 통과가 아니라 사람이 완료를 선언한다.
   */
  '충전기 발주':
    /*
     * 행위신고는 ★했거나 대상이 아니거나★ 둘 중 하나면 된다 (한백 지시 2026-08-26).
     * 신고 없이 시공으로 가는 현장이 있는데, 그 현장이 「완료」밖에 없으면 안 한 일을
     * 했다고 체크해야 넘어갔다 — 두 값을 따로 두고 여기서 합친다(types notifySkippedAt).
     * 화면은 「대상 여부」를 먼저 고르게 하고, 대상이면 신고일·파일이 다 차야 진행
     * 단추가 열린다(ConstructionTab 의 advance).
     */
    /*
     * 환경부 승인일 한 칸이 운영사 시공승인도 겸한다 (한백 2026-08-27) —
     * 전에는 cpoApprovalDate 를 봤다. 두 날짜를 같은 날로 보기로 했고, 남은 칸이
     * envApprovalDate 다(기성 트리거의 근거이자 한백 전용 칸).
     */
    (p) => missing([
      !p.envApprovalDate && { key: 'envApprovalDate', label: '환경부 승인일' },
      !p.notifyDoneAt && !p.notifySkippedAt
        && { key: 'notifyDoneAt', label: '행위신고 대상 여부' },
    ]),
  /*
   * ★발주와 수령을 두 칸으로 갈랐다★ (한백 지시 2026-08-26) — 한 칸에 두면 차례를 넘길
   * 자리가 없다. 발주는 한백이 하고 수령은 현장이 확인하는데, 같은 칸에 있으면 「누가
   * 다음 일을 하는가」가 칸으로 드러나지 않았다.
   *
   * 그래서 조건도 한 칸씩 내려왔다: 수령 칸에 들어가는 조건은 발주가 끝난 것이고,
   * 착공 칸에 들어가는 조건은 수령이 끝난 것이다. 착공일은 착공 칸에서 적는다.
   */
  '충전기 수령': (p) => missing([
    !p.chargerOrderDate && { key: 'chargerOrderDate', label: '충전기 발주일' },
    !p.chargerShipDate && { key: 'chargerShipDate', label: '충전기 출고일' },
    !p.chargerModelId && { key: 'chargerModelId', label: '충전기 모델' },
    p.chargerOrderQty == null && { key: 'chargerOrderQty', label: '충전기 발주 수량' },
    p.modemOrderQty == null && { key: 'modemOrderQty', label: '모뎀 발주 수량' },
  ]),
  // 충전기가 현장에 왔다 — 수령 완료 체크가 그 선언이다
  '착공': (p) => missing([
    !p.chargerDoneAt && { key: 'chargerDoneAt', label: '충전기 수령 완료' },
  ]),
  // 공사가 돌았다 — 착공일은 착공 칸에서 적고, 설치 사진과 완료 선언이 이 칸을 연다
  '설치완료': (p) => missing([
    !p.startActualDate && { key: 'startActualDate', label: '착공일' },
    !docApproved(p, 'photoDone') && { key: 'photoDone', label: '설치완료 사진' },
    !p.installConfirmedAt && { key: 'installConfirmedAt', label: '설치 완료 선언' },
  ]),
  // 전기사용신청 → 점검 → 통신까지 끝났다. 개통 체크가 여기로 왔다(단계를 쪼개면서).
  '개통완료': (p) => missing([
    !p.commDoneDate && { key: 'commDoneDate', label: '통신완료일' },
    !p.openDoneAt && { key: 'openDoneAt', label: '개통 완료 선언' },
  ]),
  /*
   * 시공팀이 준공서류를 접수하면 넘어간다 — 개통은 앞 단계(개통완료)가 이미 확인했다.
   *
   * ★조건을 「설치완료확인서(환경부)」로 옮겼다★ (한백 확인 2026-08-27) — 준공에 받는 서류를
   * 여섯 칸으로 갈랐으니(환경부 둘·대관서류 넷) 뭉뚱그린 「준공서류」 칸이 조건일 이유가 없다.
   * 그 묶음에서 가장 먼저 나오는 것이 설치완료확인서라 그것을 접수의 표지로 삼는다.
   */
  '준공서류 접수/검토': (p) => missing([
    !docApproved(p, 'completeConfirm')
      && { key: 'completeConfirm', label: '설치완료확인서 (환경부)' },
  ]),
  // 검토 결과 보완이 필요하다는 한백·운영사 판단 — 시공팀이 제출을 끝냈다고 선언한 뒤의 일이다
  '준공보완': (p) => missing([
    !p.completionSubmitAt && { key: 'completionSubmitAt', label: '준공서류 제출 완료' },
  ]),
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
 * ★그 상태의 조건만 보지 않는다.★ 지금 자리에서 목표까지 건너는 단계의 조건을 전부 본다.
 * '준공보완'·'준공' 처럼 조건이 없는 상태로 곧장 건너뛰면 「준공서류가 없는 준공」이
 * 만들어진다 — 표·보드에서 단계를 직접 고를 수 있게 되면서 실제로 열린 구멍이다.
 *
 * ★지금 서 있는 자리까지는 지난 것으로 친다.★ 처음부터 전부 검사했더니, 이미
 * 접수/검토에 서 있는 현장이 옛 칸(계약서 제출 체크 등)이 비어 있다고 준공으로 못
 * 갔다 — 시드·이관 데이터는 단계가 값보다 앞서 있을 수 있고, 그 자리는 사람이
 * 이미 통과시킨 것이다.
 *
 * 되돌리는 것은 막지 않는다 — 뒤 단계에서 앞 단계로 내려오는 길은 늘 열려 있다.
 */
export function canEnter(
  status: ProcessStatus,
  process: ProcessInfo
): { ok: true } | { ok: false; blockedBy: string } {
  const from = statusIndex(process.status);
  const to = statusIndex(status);
  if (to <= from) return { ok: true };
  for (const st of PROCESS_STATUSES.slice(from + 1, to + 1)) {
    const blockers = STATUS_GATES[st]?.(process) ?? [];
    if (blockers.length > 0) {
      return { ok: false, blockedBy: blockers.map((b) => b.label).join(' · ') };
    }
  }
  return { ok: true };
}

// ── 공정 입력 권한 ──────────────────────────────────────────────
/**
 * 한백만 적는 공정 칸.
 *
 * 나머지 날짜·메모는 그 현장의 시공사가 직접 적는다 — 실착공·설치완료는 현장이 아는
 * 값이라, 잠겨 있으면 전화·카톡으로 받아 한백이 대신 적게 된다. 이 플랫폼으로 소통하는
 * 것이 양사의 목적이므로(노션 공정관리의 방식) 예외만 잠근다:
 *   환경부 승인일 — 환경부가 한백에 통보하는 값이다(운영사 시공승인도 이 한 칸이
 *     겸한다, 2026-08-27).
 *     지급을 여는 날짜라(기성 「환경부 승인」 트리거) 더욱 시공사가 적을 자리가 아니다.
 *   충전기 발주일·출고일 — 발주는 한백이 하고, 출고도 한백이 통보받는다.
 *   운영사 계약서 제출 — 한백이 내는 것이다. 이제 화면에서 적는 자리가 없다(보드에서
 *     넘길 때 저장소가 찍는다). 잠금은 남겨 둔다 — 경로가 열려 있는 한 판정도 있어야 한다.
 * 수령일부터는 현장의 일이다 — 시공사가 적는다 (한백 확인, 2026-08-21).
 */
export const HANBAEK_ONLY_PROCESS_FIELDS = [
  'envApprovalDate', 'chargerOrderDate', 'chargerShipDate', 'cpoSubmitDate',
  /*
   * 발주는 한백이 한다 — 수량도 발주한 쪽이 적는다(한백 지시 2026-08-26). 수령 수량
   * (chargerQty·modemQty)은 현장에서 세는 값이라 시공사 칸이다.
   * 충전기 모델도 한백이 정한다 — 운영사와의 계약에 딸린 값이다.
   */
  'chargerOrderQty', 'modemOrderQty', 'chargerModelId',
] as const;

const HANBAEK_ONLY_LABEL: Record<(typeof HANBAEK_ONLY_PROCESS_FIELDS)[number], string> = {
  envApprovalDate: '환경부 승인일',
  chargerOrderDate: '충전기 발주일',
  chargerShipDate: '충전기 출고일',
  cpoSubmitDate: '운영사 계약서 제출',
  chargerOrderQty: '발주 충전기 수량',
  modemOrderQty: '발주 모뎀 수량',
  chargerModelId: '충전기 모델',
};

/** 화면이 칸을 잠글 때 쓰는 판정 — 저장소(assertProcessWrite)와 같은 기준이어야 한다 */
export function isHanbaekOnlyProcessField(field: string): boolean {
  return (HANBAEK_ONLY_PROCESS_FIELDS as readonly string[]).includes(field);
}

/** 이 사람이 공정을 얼마나 고칠 수 있나 — 서버(page)가 세션으로 정해서 화면에 내려보낸다 */
export type ProcessEdit = 'all' | 'partner' | 'none';

/**
 * 완료 체크가 여는 단계 — 체크하는 순간 그 단계의 조건이 차 있으면 저절로 넘어간다
 * (한백 확인). 체크는 「이 구간 끝났다」는 선언이라 전이까지가 그 뜻이다.
 *
 * ★날짜 입력은 전이가 아니다★ — 잘못 적은 하루가 현장을 밀면 안 된다. 자동은
 * 체크 다섯 개뿐이고, 지금 단계의 바로 다음 한 걸음만 간다 — 뛰어넘기와 판단
 * 단계(준공보완·준공) 자동 진입은 없다. 조건이 아직 안 찼으면(예: 행위신고 체크는
 * 됐는데 환경부 승인일이 없음) 체크만 남고, 조건이 차면 보드 카드의 넘기기가 민다.
 */
export const CHECK_ADVANCES = {
  notifyDoneAt: '충전기 발주',
  // 불필요도 같은 걸음이다 — 「이 구간 끝났다」는 선언인 것은 같다
  notifySkippedAt: '충전기 발주',
  // 수령 완료는 「착공」을 연다 — 수령 칸에 서서 수령을 확인하고 넘어간다
  chargerDoneAt: '착공',
  installConfirmedAt: '설치완료',
  openDoneAt: '개통완료',
  completionSubmitAt: '준공서류 접수/검토',
} as const satisfies Record<string, ProcessStatus>;

/**
 * 완료 선언을 하려면 무엇이 있어야 하나 — 없는 것만 담아 돌려준다.
 *
 * 게이트(STATUS_GATES)는 「선언이 있는가」를 보고, 이쪽은 「그 선언을 할 수 있는가」를 본다.
 * 화면의 진행 단추가 누르는 순간 선언을 찍으므로, 단추를 막는 것은 이 목록이다.
 * 두 곳에 나눠 적으면 또 어긋나므로 게이트 옆에 둔다.
 */
const CHECK_REQUIRES: Partial<Record<string, (p: ProcessInfo) => string[]>> = {
  notifyDoneAt: (p) => missingLabels([
    !p.notifyRequiredAt && !p.notifySkippedAt && '대상 여부를 먼저 고르세요',
    Boolean(p.notifyRequiredAt) && !p.notifyDate && '행위신고일',
    Boolean(p.notifyRequiredAt) && !docApproved(p, 'notify') && '신고 파일',
  ]),
  chargerDoneAt: (p) => missingLabels([
    !p.chargerRecvDate && '충전기 수령일',
    p.chargerQty == null && '충전기 수령 수량',
    p.modemQty == null && '모뎀 수령 수량',
  ]),
  installConfirmedAt: (p) => missingLabels([
    !p.installDoneDate && '설치완료일',
    !docApproved(p, 'photoDone') && '설치완료 사진',
  ]),
  openDoneAt: (p) => missingLabels([
    !p.commDoneDate && '통신완료일',
    !p.openDate && '개통완료일',
  ]),
  completionSubmitAt: (p) => missingLabels([
    !docApproved(p, 'completion') && '준공서류',
  ]),
};

const missingLabels = (list: Array<string | false | null | undefined>): string[] =>
  list.filter((x): x is string => Boolean(x));

/**
 * 화면의 「다음 단계로 진행」 단추를 막는 것들 — 없으면 빈 배열이고, 그때 단추가 열린다.
 *
 * ★화면은 판정하지 않는다★ — 조건을 화면에도 적으면 두 벌이 되고 어긋난다(2026-08-26 에
 * 모뎀 발주 수량을 화면 쪽에만 빠뜨렸다). 화면은 이 목록의 첫 항목을 단추 이름에 적는다.
 *
 * @param target  이 단추가 여는 칸
 * @param declares 누르는 순간 찍히는 선언 칸 — 그 항목은 「지금 하는 일」이라 목록에서 뺀다
 */
export function advanceBlockers(
  target: ProcessStatus,
  declares: string | null,
  process: ProcessInfo
): string[] {
  const fromDeclaration = declares ? CHECK_REQUIRES[declares]?.(process) ?? [] : [];
  const fromGate = (STATUS_GATES[target]?.(process) ?? [])
    .filter((b) => b.key !== declares)
    .map((b) => b.label);
  // 선언 조건이 먼저다 — 그것이 이 화면에서 채울 것이고, 게이트는 딴 화면의 값일 수 있다
  return [...new Set([...fromDeclaration, ...fromGate])];
}

/**
 * 상태를 옮기면 차례(court)도 따라 넘어간다.
 *
 * 옮겼다는 것은 그 단계의 확인이 끝났고 다음 사람이 움직일 차례라는 뜻이다. 이게 없으면
 * 설치완료 검토를 끝내고도 차례가 한백에 남아, 준공서류를 준비할 시공사가 자기 차례인 줄
 * 모른다. 손 넘기기(setCourt)는 그대로 있다 — 전화로 결정 난 현장은 따로 넘긴다.
 */
export const COURT_AFTER_STATUS: Record<ProcessStatus, Court> = {
  '계약완료': '한백',             // 다음 일: 운영사에 계약서 제출 — 한백이 한다
  '운영사 계약서 제출': '운영사', // 시공승인 회신을 기다린다
  '행위신고': '시공사',           // 시공팀이 접수한다 (1~2주)
  '충전기 발주': '한백',          // 발주·출고·모델·발주 수량은 한백이 적는다
  '충전기 수령': '시공사',        // 충전기를 받고 수량을 세는 것은 현장이다
  '착공': '시공사',               // 공사 중
  '설치완료': '시공사',           // 개통 절차 진행
  '개통완료': '시공사',           // 준공서류 준비
  '준공서류 접수/검토': '한백',
  '준공보완': '시공사',
  '준공': '한백',                 // 준공마감·정산 처리
};

/**
 * 공정 쓰기 권한 — 한백은 전부, 그 현장의 시공사는 한백 전용 칸을 뺀 전부.
 *
 * 라우트는 로그인만 본다(sessionWrite). 누가 어느 칸을 적는지는 여기 한 곳이고
 * 저장소(pg-store)가 그 판정을 부른다 — 화면에서만 잠그면 라우트를 직접 불러 뚫린다.
 * 소속 비교는 normalizeOrg — 「에코일렉」과 「에코일렉 」이 갈리면 그 시공사는 자기
 * 현장에 아무것도 못 적는다.
 */
export function assertProcessWrite(
  actor: { role: string; org: string | null },
  gcOrg: string | null,
  fields: ReadonlyArray<string>
): void {
  if (actor.role === 'admin') return;
  const isGc =
    (actor.role === 'cons' || actor.role === 'salesCons') &&
    actor.org !== null &&
    gcOrg !== null &&
    normalizeOrg(actor.org) === normalizeOrg(gcOrg);
  if (!isGc) {
    throw new Error('공정 입력은 한백 관리자와 그 현장의 시공사만 할 수 있습니다.');
  }
  const blocked = fields.find(isHanbaekOnlyProcessField);
  if (blocked) {
    throw new Error(
      `${HANBAEK_ONLY_LABEL[blocked as (typeof HANBAEK_ONLY_PROCESS_FIELDS)[number]]}은 한백이 적는 칸입니다.`
    );
  }
}

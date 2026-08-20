/**
 * 데이터 접근 추상화 계층 — SYSTEM_ARCHITECTURE §0-1.
 *
 *   [화면] → [이 인터페이스] → [구현: 파일 · Postgres]
 *
 * 화면과 비즈니스 로직은 이 인터페이스만 부른다. 그 뒤가 무엇인지 몰라야 한다.
 *
 * 원칙 둘:
 *  1. dual-write 금지. 한 필드를 두 곳에 동시에 쓰지 않는다.
 *     (협력사 접수는 포털→노션, 한백 관리는 콘솔→Postgres 로 갈라 둔다. 정본이 하나여야 한다.)
 *  2. 권한은 화면이 아니라 이 계층에서 건다. 협력사에게는 자기 현장만 나가야지,
 *     전부 보내놓고 화면에서 가리면 안 된다.
 */
import type {
  Court, DocStatus, IntakeDraft, PayoutRow, PreInstall, ProcessInfo, ProcessStatus,
  ProjectDetail, ProjectSummary, Settlement, SettlementSummary,
} from '@/types/project';
import type { Actor, Viewer } from '@/lib/auth/types';

export type { Actor };

export interface ProjectRepository {
  /**
   * 현장 목록 — 공 차례·정체일 기준으로 정렬된다.
   * viewer 를 받는 이유: 권한을 데이터 계층에서 걸기 때문이다.
   */
  listProjects(viewer: Viewer): Promise<ProjectSummary[]>;
  /** 현장 하나의 접수·시공·정산 전체. 권한 밖이면 null. */
  getProject(id: string, viewer: Viewer): Promise<ProjectDetail | null>;

  /**
   * 정산관리 목록. [한백 전용]
   *
   * listProjects 와 따로 두는 이유: 이쪽에는 계획액·회수액이 들어 있다.
   * 같은 경로로 내보내면서 화면에서 가리는 방식은 쓰지 않는다 — 협력사 브라우저에
   * 실려 나간 적이 있다. 관리자가 아니면 빈 목록을 돌려준다.
   */
  listSettlements(viewer: Viewer): Promise<SettlementSummary[]>;

  /**
   * 지급 명세 — 어느 현장의 무슨 비용 몇 차가 누구에게 얼마.
   *
   * listSettlements 와 따로 두는 이유: 이쪽은 협력사도 본다. 그래서 마진·기성이 없고,
   * 자기가 받는 쪽 줄만 나간다(영업만 맡은 회사에게 시공비 줄을 주지 않는다).
   * 화면에서 가리는 방식은 쓰지 않는다 — 여기서 안 만든다.
   */
  listPayouts(viewer: Viewer): Promise<PayoutRow[]>;

  /**
   * 접수 — 협력사가 콘솔에서 현장을 만든다.
   * 영업사·시공사는 접수한 사람의 소속으로 채운다(자기 현장이 되도록).
   */
  createProject(draft: IntakeDraft, actor: Actor): Promise<string>;

  /**
   * 서류 검수. [한백 전용]
   *
   * 검수는 예외를 걸러내는 방식이다 — 제출된 서류는 기본이 통과이고, 문제 있는 것만 반려한다.
   * 그래서 실제로 쓰이는 값은 'rejected'(반려)와 'uploaded'(반려 해제)다.
   * 'approved'는 「내가 직접 확인했다」는 표시로 남겨 둔다 — 통과 판정에는 영향이 없다.
   *
   * 반려는 사유가 필수다. 사유 없는 반려는 협력사가 무엇을 고쳐야 할지 알 수 없다.
   */
  setDocumentStatus(
    input: {
      projectId: string;
      kind: string;
      status: Extract<DocStatus, 'approved' | 'rejected' | 'uploaded'>;
      reason?: string | null;
    },
    actor: Actor
  ): Promise<void>;

  /**
   * 진행현황을 한 줄 남긴다.
   *
   * 한백과 그 현장의 협력사 둘 다 쓸 수 있다 — 특이사항은 양쪽에서 나온다.
   */
  addNote(input: { projectId: string; body: string }, actor: Actor): Promise<void>;

  /**
   * 자기가 남긴 진행현황을 고친다.
   *
   * ★자기가 쓴 것만이다.★ 남의 글을 고칠 수 있으면 기록이 아니라 편집물이 된다.
   * 판정 기준은 글에 적힌 이름(소속)이다 — 사람 이름을 안 남기므로 그것이 유일한 기준이다.
   *
   * 고친 흔적(editedAt)을 남긴다. 조용히 바뀌면 읽는 사람이 옛 내용을 기억하고 있을 때
   * 무엇이 맞는지 알 수 없다. 지우는 길은 두지 않는다.
   */
  editNote(
    input: { projectId: string; noteId: string; body: string },
    actor: Actor
  ): Promise<void>;

  /**
   * 서류 한 칸을 지운다. [한백 전용]
   *
   * ★반려와 다른 일이다.★ 반려는 「이 서류를 고쳐 오라」이고, 삭제는 「이 칸에 이 서류가
   * 있을 자리가 아니다」다 — ZIP 자동분류가 엉뚱한 칸에 넣었을 때가 그렇다.
   * 협력사는 지우지 못한다. 잘못 올렸으면 다시 올리면 그 자리를 덮는다.
   *
   * 지운 파일 주소를 돌려준다 — 파일 자체를 지우는 것은 부르는 쪽(라우트)이 한다.
   * 저장소 계층이 Blob 을 직접 만지면 파일 저장소·DB 저장소 두 곳에 같은 코드가 생긴다.
   */
  deleteDocument(
    input: { projectId: string; kind: string },
    actor: Actor
  ): Promise<{ blobUrl: string | null }>;

  /**
   * 기설치 조사. [그 현장의 협력사 · 한백]
   *
   * 환경부 사업은 현장마다 기설치 충전기를 조사해야 한다. 조사는 현장에 가는 쪽(협력사)이
   * 하고 한백이 확인하므로 양쪽이 쓴다 — 한백만 쓸 수 있으면 조사한 사람이 적을 자리가 없다.
   *
   * preChecked 는 「봤다」는 표시다. preInstall 의 '없음' 과 「아직 안 봤음」을 가른다.
   */
  setPreInstall(
    projectId: string,
    patch: { preInstall?: PreInstall; preNote?: string | null; preChecked?: boolean },
    actor: Actor
  ): Promise<void>;

  /**
   * 영업사·시공사를 고친다. [한백 전용]
   *
   * ★이 문자열은 표시용이 아니라 접근 키다.★ 협력사가 자기 현장을 보는 판정이
   * `org === salesOrg || org === gcOrg` 문자열 일치라서, 한 글자 다르면 그 협력사에게
   * 그 현장이 영구히 안 보인다. 한백이 대신 접수할 때 손으로 적는 값이므로 고칠 길이 있어야 한다.
   *
   * 이름은 저장소에서 다듬는다(normalizeOrg) — 붙여넣기로 들어온 NBSP·전각공백이 눈에
   * 안 보이는 채로 소유권을 갈라놓는 일이 실제로 생긴다.
   */
  setOrgs(
    projectId: string,
    patch: { salesOrg?: string | null; gcOrg?: string | null },
    actor: Actor
  ): Promise<void>;

  /**
   * 공 차례를 넘긴다. [한백 전용]
   * 「접수 완료 처리」가 하는 일이 이것이다 — 단계(stage)는 서류·단가에서 유도되므로
   * 따로 저장하지 않는다. 여기서 움직이는 것은 누가 다음에 손을 대야 하는가뿐이다.
   */
  setCourt(projectId: string, court: Court, actor: Actor): Promise<void>;

  /**
   * 계약 확인. [한백 전용]
   *
   * 협력사가 낸 것을 한백이 훑어보고 누르는 자리다. 이것이 있어야 계약이 넘어간다
   * (lib/stage.ts) — 서류가 다 차고 단가가 붙어도 사람이 확인하기 전에는 계약접수에 남는다.
   *
   * 조건이 안 맞으면 거절한다. 필수 서류가 비었거나 반려가 남아 있거나 단가가 없는 계약을
   * 확인해 버리면, 그 뒤로는 무엇이 확인된 것인지 알 수 없어진다.
   *
   * 확인과 함께 공 차례가 시공사로 넘어간다 — 계약이 끝났다는 것은 다음 손이 시공사라는 뜻이다.
   */
  confirmContract(projectId: string, confirmed: boolean, actor: Actor): Promise<void>;

  /**
   * 계약 라인에 단가 케이스를 붙인다. [한백 전용]
   * 케이스는 불변이라 값을 복사하지 않고 참조만 남긴다 — 지급액은 조회할 때 계산된다.
   */
  setLinePricing(lineId: string, pricingRuleId: string | null, actor: Actor): Promise<void>;

  /** 지급일·비고 저장. [한백 전용] 넘긴 필드만 바뀐다. */
  setPayment(projectId: string, patch: PaymentPatch, actor: Actor): Promise<void>;

  /**
   * 공정 진행현황을 옮긴다. [한백 전용] 보드에서 카드를 끌어다 놓는 것이 이것이다.
   *
   * 자유롭게 못 바꾼다. 넘어가는 조건은 lib/process.ts 의 STATUS_GATES 한 곳에 있고,
   * 저장소가 그 조건을 다시 확인한다 — 화면에서만 막으면 「설치완료인데 설치완료 사진이
   * 없는 현장」이 생기고, 그때 무엇이 진짜인지 알 방법이 없어진다.
   *
   * 계약이 끝나지 않은 현장은 옮길 수 없다. 상세의 시공 탭이 잠기는 것과 같은 규칙이다.
   */
  setProcessStatus(projectId: string, status: ProcessStatus, actor: Actor): Promise<void>;

  /**
   * 환경부 보조금 신청 대기번호. [한백 전용]
   * 접수 뒤에 나오는 값이라 협력사 접수 폼에는 없다 — 한백이 콘솔에서 채운다.
   */
  setEnvQueueNo(projectId: string, value: string | null, actor: Actor): Promise<void>;

  /**
   * 공정 마일스톤 날짜·메모. [한백 전용] 넘긴 필드만 바뀐다.
   *
   * 날짜는 조건이지 전이가 아니다 — 운영사 시공승인일을 넣으면 「시공진행필요」로 넘길 수
   * 있게 되지만, 넘기는 것은 사람이 한다. 날짜 입력이 곧 단계 이동이면 잘못 적은 하루가
   * 현장을 다음 단계로 밀어버린다.
   *
   * 협력사에게는 아직 열지 않는다. 시공사가 실착공일을 직접 넣는 흐름은 정해지지 않았고,
   * 환경부·운영사 승인일은 한백이 통보받는 값이라 협력사가 적을 자리가 아니다.
   */
  updateProcess(projectId: string, patch: ProcessPatch, actor: Actor): Promise<void>;

  /**
   * 서류 올리기·다시 올리기. [그 현장의 협력사 · 한백]
   *
   * 반려된 서류를 다시 올리면 반려가 풀린다 — 그래야 계약 단계가 한 바퀴 돈다.
   * 반려만 표시하고 고칠 길을 안 주면 협력사는 화면을 보고도 아무것도 할 수 없다.
   */
  uploadDocument(
    input: { projectId: string; kind: string; filename: string; blobUrl: string },
    actor: Actor
  ): Promise<void>;
}

/**
 * 공정 화면이 저장하는 것. 넘기지 않은 필드는 건드리지 않는다.
 * 상태(status)는 여기 없다 — 조건을 확인해야 하므로 setProcessStatus 로만 움직인다.
 */
export type ProcessPatch = Partial<
  Pick<
    ProcessInfo,
    | 'envApprovalDate' | 'cpoSubmitDate' | 'cpoApprovalDate' | 'chargerOrderDate' | 'chargerShipDate'
    | 'chargerRecvDate' | 'startPlanDate' | 'startActualDate' | 'installDoneDate'
    | 'commDoneDate' | 'memo'
  >
>;

/** 지급 화면이 저장하는 것. 넘기지 않은 필드는 건드리지 않는다. */
export type PaymentPatch = Partial<
  Pick<Settlement, 'salesPay1Date' | 'salesPay2Date' | 'consPay1Date' | 'consPay2Date' | 'payNote'>
>;

/*
 * 다음 단계에서 이 인터페이스에 붙일 쓰기 작업.
 *
 *   setSettlementRule(projectId, ruleId)                  — 현장별 정산규칙 적용       [한백]
 *
 * 정산 쪽(준공마감 지정·기성 회수 체크)은 뒤로 미뤄 둔다 — 영업이 도는 것이 먼저다.
 */

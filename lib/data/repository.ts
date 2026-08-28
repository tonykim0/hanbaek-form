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
  Court, DocStatus, HoldState, IntakeDraft, LineAxes, NewPayoutEntry, NewPricingRule, PayoutKind, PayoutRow, PreInstall, PricingRule,
  ChargerModel,
  PayoutPlanRow, ProcessInfo, ProcessStatus, ProjectDetail, ProjectSummary, Settlement, SettlementRule, SettlementSummary, BatchFinal, TaxInvoice,
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
   * listProjects 와 따로 두는 이유: 이쪽에는 계획액·수금액이 들어 있다.
   * 같은 경로로 내보내면서 화면에서 가리는 방식은 쓰지 않는다 — 협력사 브라우저에
   * 실려 나간 적이 있다. 관리자가 아니면 빈 목록을 돌려준다.
   */
  listSettlements(viewer: Viewer): Promise<SettlementSummary[]>;

  /**
   * 지급 내역 — 송금 대상으로 확정한 지급만. 어느 현장의 어떤 명목이 누구에게 얼마·언제.
   *
   * listSettlements 와 따로 두는 이유: 이쪽은 협력사도 본다. 그래서 마진·기성이 없고,
   * 자기가 받는 쪽 줄만 나간다(영업만 맡은 회사에게 시공비 줄을 주지 않는다).
   * 화면에서 가리는 방식은 쓰지 않는다 — 여기서 안 만든다.
   */
  listPayouts(viewer: Viewer): Promise<PayoutRow[]>;

  /**
   * 협력사 지급관리(/payouts) 화면이 받는 것 — 지급 계획과 확정 내역을 ★한 번의 읽기로★.
   *
   * ★왜 전용 조회인가★
   * 예전에는 화면이 두 길로 갈려 있었다. 한백은 `listSettlements` 로 전 현장을 읽고
   * 이어서 `listPayouts` 로 같은 현장을 또 읽었고(같은 데이터 두 번), 협력사는
   * `listProjects` 뒤에 현장마다 `getProject` 를 불렀다(N+1). 그 화면이 실제로 죽었다 —
   * 300초 런타임 타임아웃(2026-08-21). 현장 하나를 한 번 읽어 계획과 내역을 같이
   * 조립하면 두 길이 하나가 되고, 협력사에게 마진·기성을 안 주는 것은 저장소가 지운다.
   *
   * 계획(plans)은 보는 사람 몫만 나온다 — 영업만 맡은 회사에게 시공비 줄을 주지 않는다.
   */
  listPayoutOverview(viewer: Viewer): Promise<{
    plans: PayoutPlanRow[];
    history: PayoutRow[];
  }>;

  /**
   * 할 일 조립이 보는 것 — 현장·지급 내역·기성을 ★한 번의 읽기로★.
   *
   * ★왜 전용 조회인가★ 할 일(lib/todos)은 화면을 옮길 때마다 불린다(상단 바의 배지).
   * 예전에는 `listProjects` 와 `listPayouts` 를 나란히 불러 같은 현장을 두 번 읽었고,
   * 여기에 기성까지 붙이면 세 번이 된다 — 지급관리 화면이 그 방식으로 죽은 적이 있다
   * (300초 타임아웃, 2026-08-21). 현장을 한 번 읽어 셋을 같이 조립한다.
   *
   * 기성(settlements)은 한백 전용이라 협력사에게는 빈 목록이다 — 금액을 읽어 보내고
   * 화면에서 가리는 방식은 쓰지 않는다(listSettlements 와 같은 규칙).
   * 누가 무엇을 할 일로 받는지는 이 계층이 아니라 할 일 규칙이 정한다.
   */
  listTodoSources(viewer: Viewer): Promise<{
    projects: ProjectSummary[];
    history: PayoutRow[];
    settlements: SettlementSummary[];
  }>;

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
   * 칸을 통째로 비우는 것은 한백만 한다.
   *
   * 지운 파일 주소들을 돌려준다 — 한 칸에 여러 장이 붙을 수 있다(migrations/0021).
   * 파일 자체를 지우는 것은 부르는 쪽(라우트)이 한다: 저장소 계층이 Blob 을 직접 만지면
   * 파일 저장소·DB 저장소 두 곳에 같은 코드가 생긴다.
   */
  deleteDocument(
    input: { projectId: string; kind: string },
    actor: Actor
  ): Promise<{ blobUrls: string[] }>;

  /**
   * 그 칸의 파일 한 장을 뺀다. [그 현장의 협력사 · 한백]
   *
   * ★올리는 쪽이 지울 수 있어야 한다.★ 한 칸에 파일이 쌓이게 되면서(migrations/0021)
   * 잘못 올린 파일을 다시 올려 덮는 길이 없어졌다 — 그 자리가 여기다. 칸을 비우는 것과
   * 다르다: 칸의 상태(반려 사유 등)는 그대로 두고 파일 한 장만 뺀다.
   *
   * 마지막 한 장을 빼면 그 칸은 미제출로 돌아간다 — 파일 없는 「제출됨」을 만들지 않는다.
   */
  deleteDocumentFile(
    input: { projectId: string; kind: string; url: string },
    actor: Actor
  ): Promise<{ blobUrl: string | null }>;

  /**
   * 기설치 조사. [그 현장의 협력사 · 한백]
   *
   * 환경부 사업은 현장마다 기설치 충전기를 조사해야 한다. 조사는 현장에 가는 쪽(협력사)이
   * 하고 한백이 확인하므로 양쪽이 쓴다 — 한백만 쓸 수 있으면 조사한 사람이 적을 자리가 없다.
   *
   * preChecked 는 「봤다」는 표시다. preInstall 의 '없음' 과 「아직 안 봤음」을 가른다.
   *
   * preRejectReason 은 조사 반려다 [한백 전용] — 사유를 적으면 조사 표시가 풀리고 공이
   * 영업사로 넘어간다. 협력사가 조사를 다시 저장하면 사유가 지워진다(보완이 반려를 푼다).
   */
  setPreInstall(
    projectId: string,
    patch: {
      preInstall?: PreInstall;
      preNote?: string | null;
      preChecked?: boolean;
      preRejectReason?: string | null;
    },
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
   * 현장을 멈추거나(보류·계약중단) 다시 돌린다(null). [한백 전용]
   *
   * 세울 때는 사유가 필수다 — 왜 멈췄는지 없으면 몇 달 뒤 아무도 모른다(반려와 같은 규칙).
   * 지우지 않는다 — 계약이 무산돼도 현장은 보드 끝 칸에 기록으로 남는다.
   * 재개하면 정체일을 다시 센다(lastProgressAt) — 멈춰 있던 날을 정체로 세면 억울하다.
   */
  setHold(
    projectId: string,
    hold: { state: HoldState; note: string } | null,
    actor: Actor
  ): Promise<void>;

  /**
   * 현장명을 고친다. [한백 전용]
   * 접수 때 협력사가 적는 값이라 오타가 흔한데 고칠 길이 없었다(화면 규칙 7).
   */
  setProjectName(projectId: string, name: string, actor: Actor): Promise<void>;

  /**
   * 현장을 삭제한다. [한백 전용]
   *
   * 잘못 만든 현장(중복 접수·시험 입력)을 지우는 자리다 — 계약이 무산된 현장은
   * 지우지 않고 계약중단(setHold)으로 세운다, 그건 기록이다.
   * 서류·공정·정산·메모가 함께 지워진다(FK cascade). 감사기록은 남는다(FK 없음).
   * 파일(Blob) 삭제는 라우트가 한다 — 지운 서류의 주소 목록을 돌려준다.
   */
  deleteProject(projectId: string, actor: Actor): Promise<{ blobUrls: string[] }>;

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
   * 누락 서류 보완요청 · 그 취소. [한백]
   *
   * 검토에 올라온 계약에 필수 서류가 여러 칸 비어 있을 때, 그 칸들을 한 번에 반려로
   * 세워 계약보완으로 내린다(한백 지시 2026-08-25). 예전에는 길이 없었다 — 서류 한 장의
   * 반려는 올라온 파일에만 걸리고(setDocumentStatus 가 미제출을 거절한다), 안 낸 서류는
   * 반려할 대상이 없어서 「서류가 없는데 검토 칸에 서 있는 계약」을 되돌릴 수 없었다.
   *
   * 파일을 요구하지 않는 대신 ★파일이 없는 칸만★ 겨냥한다. 올라온 서류의 문제는
   * 그 칸의 반려가 다룬다 — 두 길이 같은 칸을 건드리면 사유가 서로를 지운다.
   *
   * ask=false 는 되돌리기다 — 파일 없이 반려로 서 있는 칸을 미제출로 되돌린다.
   * 잘못 눌렀을 때 길이 없으면 DB 를 직접 만져야 한다(화면 규칙 7).
   */
  askMissingDocs(
    projectId: string,
    ask: boolean,
    reason: string | null,
    actor: Actor
  ): Promise<{ kinds: string[] }>;

  /**
   * 계약서 접수 선언 — 협력사가 「다 냈다」고 누른다(그 현장의 협력사와 한백).
   *
   * 이것이 계약접수와 계약검토를 가른다(lib/board.ts). 필수 서류 칸이 차는 것만으로
   * 넘기지 않는 이유: 협력사가 아직 고치는 중인 것이 한백의 검토 칸에 서면, 한백은
   * 무엇이 검토를 기다리는 것인지 알 수 없다(한백 지시 2026-08-24).
   *
   * 필수 서류가 덜 찼으면 거절한다 — 낼 것이 남았는데 「다 냈다」고 할 수는 없다.
   * 되돌릴 수 있다(submitted=false) — 잘못 눌렀을 때 길이 없으면 안 된다.
   */
  submitContract(projectId: string, submitted: boolean, actor: Actor): Promise<void>;

  /**
   * 계약 라인에 단가 케이스를 붙인다. [한백 전용]
   * 케이스는 불변이라 값을 복사하지 않고 참조만 남긴다 — 지급액은 조회할 때 계산된다.
   */
  setLinePricing(lineId: string, pricingRuleId: string | null, actor: Actor): Promise<void>;

  /**
   * 모든 계약 라인의 단가 판정 축. [한백 전용]
   *
   * 막힌 라인(활성 케이스가 하나도 안 맞는 라인)을 세는 데 쓴다 — 금액은 없다.
   * 협력사 화면에는 이 조회가 필요 없다.
   */
  listLineAxes(actor: Actor): Promise<LineAxes[]>;

  /**
   * 단가 케이스 전부. [한백 전용]
   *
   * 영업단가·시공단가·마진이 들어 있다. 협력사에게 넘기면 화면에서 가려도 브라우저에
   * 원본이 남으므로 여기서 막는다(redactForViewer 와 같은 이유).
   */
  listPricingRules(actor: Actor): Promise<PricingRule[]>;

  /**
   * 단가 케이스를 추가한다. [한백 전용]
   *
   * ★고치는 길은 두지 않는다.★ 케이스는 불변이다 — 계약 라인이 값을 복사하지 않고 이것을
   * 참조하므로, 금액을 고치면 이미 지정된 현장의 지급액이 소급해서 바뀐다. 조건이나 금액이
   * 달라지면 새 케이스를 만들고 옛 것을 중지한다.
   *
   * 기성은 규칙 id 가 아니라 단계(settlementSteps)로 받는다 — 같은 모양의 규칙이 이미
   * 있으면 그것을 붙이고, 없으면 만든다. 그래서 규칙도 케이스처럼 불변으로 쌓인다.
   */
  addPricingRule(input: NewPricingRule, actor: Actor): Promise<string>;

  /**
   * 케이스를 통째로 고친다 — ★아직 어느 계약 라인도 참조하지 않을 때만★. [한백 전용]
   *
   * 참조된 케이스의 금액을 고치면 이미 지정된 현장의 지급액·기성이 소급해서 바뀐다 —
   * 그건 수정이 아니라 사고다. 그래서 참조가 하나라도 있으면 거절하고, 그때는 화면이
   * 전 값을 프리필한 개정(새 케이스 + 옛 것 중지)으로 이끈다. 잘못 넣은 값을 라인에
   * 붙이기 전에 바로잡는 것이 이 길이다. id 는 그대로 둔다.
   */
  updatePricingRule(id: string, input: NewPricingRule, actor: Actor): Promise<void>;

  /**
   * 정산 규칙 전부. [한백 전용]
   *
   * 단가 케이스가 단계로 정의한 기성 모양이 여기 쌓인다 — 케이스 화면이 차수·금액을
   * 그리고, 현장 상세의 규칙 고르기가 이름을 쓴다. 단계에서 기성 금액이 유도되므로
   * 협력사에게 넘기지 않는다(단가 케이스와 같은 이유).
   */
  listSettlementRules(actor: Actor): Promise<SettlementRule[]>;

  /**
   * 충전기 모델 목록 — 현장에서 고를 후보다.
   *
   * 금액이 없어 협력사도 본다(시공사가 자기 현장의 모델을 고른다). 내린 모델(active=false)도
   * 돌려준다 — 옛 현장이 그것을 참조하고 있어서 빼면 이름이 안 보인다. 화면이 고를 수 있는
   * 것만 거른다.
   */
  listChargerModels(): Promise<ChargerModel[]>;

  /** 모델 등록 [한백 전용] — 이름이 겹치면 거절한다(오타로 같은 모델이 둘이 되는 것을 막는다) */
  addChargerModel(input: { name: string; maker?: string | null; note?: string | null }, actor: Actor): Promise<string>;

  /**
   * 케이스의 적용 시작·비고를 고친다. [한백 전용]
   *
   * 금액·축은 여기서도 못 고친다 — 라인이 참조하므로 소급 변경이 된다. 적용 시작과 비고는
   * 지급액 계산에 안 쓰여 안전하고, 시드가 「2026년 하반기」처럼 대략만 아는 값을 넣는
   * 일이 실제로 있어 고치는 자리가 있어야 한다(화면 규칙 7).
   * 적용 시작을 옮기면 다른 케이스와 같은 칸·같은 시작이 될 수 있어 중복 검사를 다시 한다.
   */
  setPricingRuleMeta(
    id: string,
    patch: { startDate?: string; note?: string | null },
    actor: Actor
  ): Promise<void>;

  /**
   * 케이스를 쓰거나 그만 쓴다. [한백 전용]
   *
   * 지우지 않는다 — 이미 이 케이스를 참조하는 계약 라인이 있으면 지급액을 계산할 수 없게 된다.
   * 중지하면 새로 지정할 수는 없고, 이미 붙은 것은 그대로 계산된다.
   */
  setPricingRuleActive(id: string, active: boolean, actor: Actor): Promise<void>;

  /** 지급 비고 저장. [한백 전용] 넘긴 필드만 바뀐다. */
  setPayment(projectId: string, patch: PaymentPatch, actor: Actor): Promise<void>;

  /**
   * 현장의 정산 규칙을 적용하거나 바꾼다. [한백 전용]
   *
   * 단가 케이스를 지정하면 제안값이 들어오지만(setLinePricing), 그것은 현장에 규칙이
   * 없을 때 한 번뿐이다. 제안이 틀린 현장·제안값이 없는 케이스의 현장은 여기로 고친다 —
   * 넣는 자리를 만들면 고치는 자리도 만든다. 이것이 없어서 DB 를 직접 만져야 했다.
   *
   * null 은 미지정으로 되돌린다 — 기성 단계·금액 계산이 멈춘다.
   */
  /**
   * 지급조건 확정 — 단가 케이스와 정산 규칙을 잠근다. [한백 전용]
   *
   * ★왜 잠그는가★ 그 둘이 계획·잔액·기성·마진을 전부 정한다. 중간에 누가 갈아 끼우면
   * 이미 나간 지급과 앞으로 받을 기성이 같이 뒤틀린다(한백 지시 2026-08-28).
   *
   * 지급이 나가면 자동으로 확정된다(runPayoutBatch·addPayoutEntry) — 돈이 움직인 뒤의
   * 변경이 가장 위험하기 때문이다. 덜 된 조건은 굳히지 않는다: 단가가 안 붙은 라인이
   * 있거나 정산 규칙이 없으면 확정을 거절한다.
   *
   * false 는 해제다 — 확정 뒤에 진짜 오류가 드러나는 일이 있어 되돌릴 길을 둔다.
   */
  setPayoutTermsConfirmed(projectId: string, confirmed: boolean, actor: Actor): Promise<void>;

  setSettlementRule(projectId: string, ruleId: string | null, actor: Actor): Promise<void>;

  /**
   * 운영사가 통보한 준공마감일. [한백 전용]
   *
   * 공정에서 유도할 수 없어 따로 받는다 — 대부분 운영사의 마지막 기성(잔액) 트리거라,
   * 이 값이 없으면 그 차수가 영원히 「대기」로 남는다. null 은 통보 취소다.
   */
  setCpoCloseDate(projectId: string, date: string | null, actor: Actor): Promise<void>;

  /**
   * 기성 차수의 수금 기록. [한백 전용]
   *
   * ★날짜와 금액은 한 사실이다★ — 「받았다」는 날짜로 표시하고, 받은 금액이 계획액과
   * 다르면 그 금액을 같이 적는다(협의로 턴키단가와 다르게 받는 현장이 있다).
   * amount 가 null 이면 계획액대로 받은 것이다. value 가 null 이면 수금을 되돌린다.
   *
   * 차수가 열리지 않았으면(트리거 미충족) 받을 수 없다 — 저장소가 막는다.
   */
  setSettlementCollected(
    projectId: string,
    no: 1 | 2 | 3,
    value: { at: string; amount: number | null } | null,
    actor: Actor
  ): Promise<void>;

  /**
   * 회차 지급 확정 — 지금 지급할 회차(1차/2차)를 모아서 한 지급일로 기록한다. [한백 전용]
   *
   * ★금액은 받지 않는다.★ 1차 = 지급할 총액(계획+조정)의 70%, 2차 = 잔액으로 정해져
   * 있으므로 저장소가 계산해 넣는다(payoutStepsOf) — 수기 입력을 열어두면 유도값과
   * 어긋난 금액이 남는다. 회차별 업무 조건도 저장소가 다시 검사한다: 영업비 1차=계약완료,
   * 영업비 2차=개통완료, 시공비 1차=설치완료, 시공비 2차=개통완료. 영업비 지급조건 서류,
   * 단가와 송금 대상도 모두 갖춰져야 한다.
   *
   * 「8월 영업비를 한꺼번에」가 이 호출 하나다: 항목 여러 개, 지급일 하나. 이 동작은
   * 실제 이체가 아니라 송금 대상·금액·일자를 확정해 원장에 남기는 일이다. 전부 되거나 전부
   * 안 된다 — 반쯤 확정된 배치는 어디까지 처리됐는지 알 수 없다.
   */
  runPayoutBatch(
    items: Array<{ projectId: string; kind: PayoutKind }>,
    at: string,
    actor: Actor
  ): Promise<{ count: number; total: number }>;

  /**
   * 지급 원장에 예외 한 건을 넣는다. [한백 전용]
   *
   * 조정(자재비·추가공사비·차감·재정산)과 회수만 — 회차 금액(1차·2차)은 정해져 있어
   * 여기로 못 들어온다(runPayoutBatch 가 계산해 넣는다). 검사는 checkPayoutEntry.
   */
  addPayoutEntry(projectId: string, input: NewPayoutEntry, actor: Actor): Promise<string>;

  /**
   * 배치의 지급일을 옮긴다. [한백 전용]
   *
   * 배치 = 그 지급일에 그 지급처로 나간 그 구분(영업비/시공비)의 지급 줄 전부 —
   * 영업·시공은 계산서를 따로 끊으므로 배치도 구분으로 갈린다(한백 확인 2026-08-24). 세금계산서가
   * (지급처 × 지급일) 키로 붙어 있으므로 같은 트랜잭션에서 함께 옮긴다 —
   * 따로 옮기면 첨부가 옛 날짜에 고아로 남는다.
   */
  movePayoutBatch(
    org: string, kind: PayoutKind, from: string, to: string, actor: Actor
  ): Promise<{ moved: number }>;

  /** 세금계산서 목록 — 한백의 보관함. 배치 상태는 listBatchFinals 가 따로 준다. [한백의 눈] */
  listTaxInvoices(actor: Actor): Promise<TaxInvoice[]>;

  /**
   * 배치 최종 확정·해제. [한백 전용]
   *
   * 세금계산서와 무관하다(한백 확인 2026-08-24) — 계산서는 보관용 첨부일 뿐이고
   * 확정은 한백이 배치를 잠그는 행위다. 확정되면 항목 빼기·지급일 변경·취소가
   * 해제 후에만 된다(화면 규칙 7번). 계산서 첨부·교체·삭제는 잠기지 않는다.
   */
  finalizeBatch(org: string, kind: PayoutKind, payDate: string, undo: boolean, actor: Actor): Promise<void>;

  /** 확정된 배치 목록 — 가확정/확정 배지의 정본. 협력사는 자기 지급처 것만 받는다. */
  listBatchFinals(actor: Actor): Promise<BatchFinal[]>;

  /**
   * 배치 가확정 취소 — 그 배치의 지급 줄 전부를 원장에서 지운다. [한백 전용]
   * 회차들은 지급 가능으로 돌아가 지급관리 표에서 다시 체크할 수 있다.
   * 확정됐거나 계산서가 붙어 있으면 거부한다(해제·삭제부터). 전부 되거나 전부 안 된다.
   */
  cancelPayoutBatch(
    org: string, kind: PayoutKind, payDate: string, actor: Actor
  ): Promise<{ canceled: number }>;

  /**
   * 세금계산서 저장 — 배치 하나에 한 장(같은 배치에 다시 올리면 교체). [한백 전용]
   * 금액(공급가액·세액·합계)은 AI 판독이 검산을 통과했을 때만 실려 온다.
   */
  saveTaxInvoice(
    // finalizedAt 은 못 넣는다 — 새 첨부는 늘 가확정으로 시작하고, 확정은 finalizeBatch 뿐이다
    input: Omit<TaxInvoice, 'id' | 'uploadedAt' | 'finalizedAt'>,
    actor: Actor
  ): Promise<{ id: string; replacedBlobUrl: string | null }>;

  /** 세금계산서 금액 고치기 — 판독이 틀렸거나 못 읽은 것을 사람이 적는다. [한백 전용] */
  updateTaxInvoice(
    id: string,
    patch: { supplyAmount: number | null; taxAmount: number | null; totalAmount: number | null },
    actor: Actor
  ): Promise<void>;

  /** 세금계산서 삭제 — 지운 파일 주소를 돌려준다(라우트가 Blob 도 지운다). [한백 전용] */
  deleteTaxInvoice(id: string, actor: Actor): Promise<{ blobUrl: string }>;

  /**
   * 지급 원장에서 한 건을 지운다. [한백 전용]
   *
   * 고치기는 없다 — 금액·날짜를 반쯤 고친 흔적이 남는 것보다, 지우고 다시 넣는 것이
   * 감사 로그에 온전히 남는다. 지운 값은 로그에 적힌다.
   */
  deletePayoutEntry(projectId: string, entryId: string, actor: Actor): Promise<void>;

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
   * 환경부 사업연도. [한백 전용]
   * 접수 연도가 기본값으로 들어가고, 이월 현장(작년 사업이 올해 접수)만 고친다.
   */
  setBizYear(projectId: string, year: number | null, actor: Actor): Promise<void>;

  /**
   * 공정 마일스톤 날짜·메모. [한백 · 그 현장의 시공사] 넘긴 필드만 바뀐다.
   *
   * 날짜는 조건이지 전이가 아니다 — 운영사 시공승인일을 넣으면 「충전기 발주」로 넘길 수
   * 있게 되지만, 넘기는 것은 사람이 한다. 날짜 입력이 곧 단계 이동이면 잘못 적은 하루가
   * 현장을 다음 단계로 밀어버린다.
   *
   * 시공사가 직접 적는다 — 착공·설치완료는 현장이 아는 값이라, 잠겨 있으면 전화·카톡으로
   * 받아 한백이 대신 적게 된다. 예외만 한백 전용이다(lib/process.ts
   * HANBAEK_ONLY_PROCESS_FIELDS): 환경부 승인일 · 충전기 발주일·출고일 · 운영사 계약서 제출.
   * 판정은 assertProcessWrite 한 곳이다.
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
    | 'installedSpots' | 'installedUnits'
    | 'commDoneDate' | 'openDate' | 'memo'
    | 'notifyDate' | 'chargerQty' | 'modemQty' | 'chargerOrderQty' | 'modemOrderQty' | 'chargerModelId'
    | 'notifyDoneAt' | 'notifySkippedAt' | 'notifyRequiredAt' | 'chargerDoneAt' | 'installConfirmedAt'
    | 'openDoneAt' | 'completionSubmitAt'
  >
>;

/** 지급 화면이 저장하는 것. 넘기지 않은 필드는 건드리지 않는다. */
export type PaymentPatch = Partial<Pick<Settlement, 'payNote'>>;

/*
 * 정산 쪽(준공마감 지정·기성 수금 체크)은 뒤로 미뤄 둔다 — 영업이 도는 것이 먼저다.
 */

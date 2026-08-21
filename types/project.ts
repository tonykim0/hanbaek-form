/**
 * 통합 도메인 모델 — SYSTEM_ARCHITECTURE §6 의 논리 스키마.
 *
 * 이 타입들은 「추상화 계층이 다루는 스키마」이지 저장 형태가 아니다.
 * 물리 저장은 지금 노션, 나중에 자체 DB. 구현이 바뀌어도 이 파일은 안 바뀐다.
 *
 * 핵심 불변식:
 *  - 한 현장(Project)에 계약 라인(ContractLine)이 여럿. 단가는 라인별.
 *  - 단가 지정 = 스냅샷. 매트릭스를 나중에 고쳐도 지정된 라인 금액은 안 바뀐다.
 *  - 서류는 번호가 아니라 종류(kind)로 다룬다.
 */

export type CpoName =
  | '플러그링크'
  | '나이스인프라'
  | '현대엔지니어링'
  | 'SK일렉링크'
  | '에버온';

/**
 * 고를 수 있는 값 목록.
 *
 * 유니온과 배열을 따로 적으면 갈린다 — 운영사가 lib/notion.ts 에도 한 벌 있었다.
 * `satisfies` 로 묶어 두면 유니온에 값을 더할 때 여기도 채우지 않으면 컴파일이 깨진다.
 */
export const CPO_NAMES = [
  '플러그링크', '나이스인프라', '현대엔지니어링', 'SK일렉링크', '에버온',
] as const satisfies readonly CpoName[];

export type BuildingType = '공동주택' | '상업시설';
export const BUILDING_TYPES = ['공동주택', '상업시설'] as const satisfies readonly BuildingType[];
/** 노션에 없는 신규 필드. 회의록 종류를 결정한다. */
export type ContractParty = '입주자대표회의' | '관리단' | '건설사';
export type PowerType = '한전불입' | '모자분리' | '한전불입+모자분리';
/**
 * 교체유형 — 사업구분과 묶여 있다.
 *
 * 환경부 보조금은 신규 설치에만 나오고, 기존 충전기를 교체하는 것은 자체투자다.
 * 그래서 실제로 존재하는 조합이 셋뿐이라 셋을 그대로 값으로 둔다 —
 * 「환경부 + 제자리교체」처럼 있을 수 없는 조합을 고를 수 있게 두면 그 현장의 단가가
 * 어느 케이스에도 안 맞고, 왜 안 맞는지 알 수 없다.
 */
export type ReplType = '환경부 신규' | '자체투자 (제자리교체)' | '자체투자 (신규위치)';
export const REPL_TYPES = [
  '환경부 신규', '자체투자 (제자리교체)', '자체투자 (신규위치)',
] as const satisfies readonly ReplType[];

/**
 * 케이스의 채널 — 한백이 그 현장에서 맡는 범위.
 *
 * 턴키가 기본이고, 한쪽만 맡는 현장은 단가 구성이 다르다 — 시공 채널은 영업단가 0,
 * 영업 채널은 시공단가 0. 예전에는 이것이 축에 없어서 「시공만」이 케이스 이름에만 적혀
 * 있었다 — 그래서 영업사가 있는 현장의 후보 목록에 영업 0원짜리가 「조건이 맞는 케이스」로 섞였다.
 * 현장 데이터로 유도하지 않는다 — 영업사 null 은 「없음」이 아니라 「아직 미지정」일 수 있다.
 * (옛 저장값 '시공만' 은 '시공' 으로 옮겼다 — 2026-08-21)
 */
export type Channel = '턴키' | '영업' | '시공';
export const CHANNELS = ['턴키', '영업', '시공'] as const satisfies readonly Channel[];
export type BizType = '환경부' | '자체투자';

/** 교체유형이 사업구분을 정한다 — 따로 고르게 두면 두 값이 어긋난다 */
export function bizTypeOfRepl(repl: ReplType): BizType {
  return repl === '환경부 신규' ? '환경부' : '자체투자';
}
/**
 * 기설치 충전기 — 두 값뿐이다.
 *
 * 예전에 '확인불가' 를 뒀는데, 그것은 기설치 상태가 아니라 「조사를 못 했다」는 뜻이다.
 * 그 자리는 preChecked(조사 여부)가 맡는다 — 값과 진행상태를 한 칸에 섞으면
 * 「확인불가인데 조사함」 같은 상태가 생긴다.
 */
export type PreInstall = '없음' | '있음';

/** 현장이 통과하는 단계 */
export type Stage = 'intake' | 'construction' | 'settlement';
/** 공 차례 — 지금 누가 움직여야 하는가 */
export type Court = '한백' | '영업사' | '시공사' | '운영사';

/**
 * 기성 트리거 — 매트릭스 전 케이스 실측 결과 딱 4가지.
 * ※ '준공마감' 은 운영사가 정한다. 우리 공정 일정에서 유도할 수 없다.
 */
export type Trigger = '환경부 승인' | '착공' | '준공마감' | '해당없음';
export type PayoutType = '정액' | '잔액' | '해당없음';

// ── 현장 ────────────────────────────────────────────────────────
export interface Project {
  id: string;
  /** 한백_현장관리번호 (노션 PK) */
  mgmtNo: string | null;
  cpo: CpoName;
  salesOrg: string | null;
  gcOrg: string | null;
  name: string;
  addr: string | null;
  bldgType: BuildingType | null;
  contractParty: ContractParty | null;
  parkTotal: number | null;
  mgr: string | null;
  tel: string | null;
  mail: string | null;
  preInstall: PreInstall;
  preNote: string | null;
  /**
   * 기설치 조사를 했는가.
   *
   * ★'없음' 과 「아직 안 봤음」은 다른 것이다.★ 접수 기본값이 '없음' 이라 이 값 없이는
   * 둘이 같은 모양으로 보인다 — 환경부 사업은 현장마다 조사를 해야 하고,
   * 안 한 현장을 골라내는 것이 그 업무의 절반이다.
   */
  preChecked: boolean;
  /**
   * 기설치 조사 반려 사유 — 한백이 「다시 조사해라」를 되돌린 이유. null 이면 반려 아님.
   * 협력사가 조사를 다시 저장하면 지워진다(보완이 반려를 푼다 — 서류 반려와 같은 규칙).
   */
  preRejectReason: string | null;
  powerType: PowerType | null;
  /**
   * 현장 대표 교체유형 — 계약 라인이 전부 같을 때만 채운다.
   * 섞인 현장은 null 이고, 그때는 라인의 값이 정본이다.
   */
  replType: ReplType | null;
  bizType: BizType | null;
  /** 환경부 사업연도 — 단가 케이스·대기번호의 연도와 같은 축. 접수 연도가 기본값 */
  bizYear: number | null;
  /**
   * 환경부 보조금 신청 대기번호.
   *
   * 운영사가 환경부에 접수하고, 접수되면 이 번호를 우리에게 알려준다 —
   * 우리가 환경부에서 직접 받는 값이 아니라 운영사를 거쳐 온다(2026-08-20 한백 확인).
   *
   * 「2026-595」처럼 사업연도가 붙은 형태로도 오고 번호만 오기도 한다 —
   * 쪼개지 않고 받은 그대로 둔다. 쪼개는 규칙을 정하면 형식이 다른 값이 들어올 때 깨진다.
   */
  envQueueNo: string | null;
  /** 접수할 때 협력사가 적은 말 (영업비 차감·프로모션 적용 조건 등) */
  note: string | null;
  /**
   * 한백이 계약을 확인한 날. null 이면 아직 확인 전이다.
   *
   * ★단계를 저장하지 않는다는 규칙과 어긋나지 않는다.★ 이것은 단계가 아니라
   * 「한백이 봤다」는 사실이다 — 서류가 다 차고 단가가 붙어도, 사람이 한 번 훑어보기
   * 전에는 계약완료로 넘기지 않는다. 그 확인 여부는 자료에서 유도할 수 없어 저장한다.
   *
   * 서류가 반려되면 지워진다. 반려는 「이 계약은 아직 아니다」는 판정이라
   * 앞서 한 확인을 무효로 만든다 — 보완한 뒤 다시 확인해야 한다.
   */
  contractConfirmedAt: string | null;
  createdAt: string;
  /** 한백이 현장별로 적용하는 정산 규칙. 미지정이면 기성이 계산되지 않는다. */
  settlementRuleId: string | null;
  settlementAppliedAt: string | null;
  /** 멈춤 상태. null 이면 정상 진행 중. */
  holdState: HoldState | null;
  holdNote: string | null;
}

// ── 단가 규칙 · 정산 규칙 ────────────────────────────────────────
/**
 * 정산 단계의 금액 산정 방식.
 *   고정 — 대당 고정액 (운영사가 못 박은 선급금)
 *   비율 — 턴키 × 비율
 *   잔액 — 턴키 − 앞단계 합계
 */
export type StepBasis =
  | { kind: '고정'; unit: number }
  | { kind: '비율'; ratio: number }
  | { kind: '잔액' };

export interface SettlementStepRule {
  trigger: Trigger;
  basis: StepBasis;
}

/**
 * 정산 규칙 — 단가와 분리된 별도 테이블. 한백이 내부적으로 관리하고 현장별로 적용한다.
 * ★불변★ 추가·비활성만. 한 번 현장에 적용되면 수정하지 않는다.
 */
export interface SettlementRule {
  id: string;
  name: string;
  /** 1~3단계 */
  steps: SettlementStepRule[];
  note: string | null;
  active: boolean;
}

/**
 * 화면에서 규칙을 고를 때 받는 후보. 이름에 기성 모양(트리거·금액)이 들어 있어
 * 협력사에게 보내면 안 된다 — 서버가 한백일 때만 만들어 넘긴다(단가 후보와 같은 이유).
 */
export type SettlementRuleChoice = Pick<SettlementRule, 'id' | 'name'>;

/**
 * 단가 규칙 (매트릭스 케이스).
 *
 * ★불변★ 한 번 계약 라인에 지정되면 수정하지 않는다. 조건이 바뀌면 새 행을 추가한다.
 * 그래서 계약 라인은 값을 복사하지 않고 이 케이스를 참조만 한다 — 스냅샷이 필요 없다.
 */
export interface PricingRule {
  id: string;
  caseName: string;
  cpo: CpoName;
  bizType: BizType;
  /** 수전방식별로 케이스를 쪼갠다. 겸용 행은 두 개로 분리했다. */
  powerType: '모자분리' | '한전불입';
  /** 7·10년 겸용 케이스가 있어 배열이다 */
  termYears: number[];
  bldgTypes: BuildingType[];
  replType: ReplType;
  channel: Channel;
  bizYear: number;
  startDate: string;
  salesUnit: number;
  consUnit: number;
  margin: number;
  /** 이 케이스에 통상 붙는 정산 규칙 — 제안값. 실제 적용은 현장(Project)에 둔다. */
  defaultSettlementRuleId: string;
  supervisionBearer: string | null;
  safetyFeeBearer: string | null;
  note: string | null;
  active: boolean;
}

/**
 * 새로 만드는 단가 케이스.
 *
 * id 는 저장소가 축에서 만든다 — 사람이 적게 두면 「pl-y10」 같은 이름이 겹치고, 겹치면
 * 이미 다른 현장이 참조하는 케이스를 덮어쓴다. active 도 없다 — 만들면 쓰는 것이다.
 *
 * 정산 규칙은 id 로 고르지 않고 단계로 적는다 — 받는 단가(턴키)를 운영사에게 몇 차로
 * 어떻게 받는지. 저장소가 같은 모양의 규칙을 찾아 붙이고, 없으면 만든다(불변·재사용).
 * 빈 배열은 「기성 미정」이다 — 규칙이 아직 안 정해진 운영사가 실제로 있다.
 */
export type NewPricingRule = Omit<PricingRule, 'id' | 'active' | 'defaultSettlementRuleId'> & {
  settlementSteps: SettlementStepRule[];
};

/**
 * 단가 판정에 쓰이는 라인 한 줄의 축 — 막힌 라인을 세는 데 쓴다. [한백 전용 조회]
 * 금액은 없다. 축과 참조뿐이다.
 */
export interface LineAxes {
  projectId: string;
  projectName: string;
  lineId: string;
  cpo: CpoName;
  bizType: BizType | null;
  bldgType: BuildingType | null;
  projectReplType: ReplType | null;
  termYears: number;
  qty: number;
  powerType: Exclude<PowerType, '한전불입+모자분리'> | null;
  lineReplType: ReplType | null;
  pricingRuleId: string | null;
}

export interface ContractLine {
  id: string;
  projectId: string;
  termYears: number;
  qty: number;
  /** 이 라인의 수전방식 — 혼용 현장은 라인별로 갈린다 */
  powerType: Exclude<PowerType, '한전불입+모자분리'> | null;
  /**
   * 이 라인의 교체유형 — 자체투자 현장은 라인별로 갈린다.
   *
   * 제자리교체와 신규위치가 한 현장에 섞인다. 단가 케이스가 그 축으로도 갈리므로
   * (lib/pricing-match.ts) 현장에 하나만 두면 섞인 현장의 절반이 틀린 단가를 받는다.
   */
  replType: ReplType | null;
  memo: string | null;
  /** null 이면 「단가 미지정」. 영업사에게 금액이 안 보인다. */
  pricingRuleId: string | null;
  /** 단가를 확정한 날 */
  pricedAt: string | null;
}

/**
 * 화면으로 나가는 단가 케이스.
 *
 * 금액 셋이 nullable 인 이유: 보는 사람에 따라 지운 채로 나가기 때문이다.
 * 화면에서 가리는 것만으로는 부족하다 — 서버가 렌더한 데이터가 통째로 브라우저에 실려서
 * 페이지 소스를 열면 그대로 보인다. 그래서 저장소 계층에서 아예 null 로 만든다.
 *
 * 타입이 nullable 이므로 새 화면을 만들 때도 「없을 수 있다」를 강제로 다루게 된다.
 */
export type PricingRuleView = Omit<PricingRule, 'salesUnit' | 'consUnit' | 'margin'> & {
  salesUnit: number | null;
  consUnit: number | null;
  margin: number | null;
};

/** 화면이 받는 조립된 라인 — 참조가 풀려 있다 */
export interface ContractLineView extends ContractLine {
  rule: PricingRuleView | null;
}

// ── 서류 ────────────────────────────────────────────────────────
export type DocStatus = 'none' | 'uploaded' | 'approved' | 'rejected';

export interface ProjectDocument {
  kind: string;
  filename: string | null;
  /** 실제 파일 주소 (Vercel Blob). null 이면 파일이 아직 없다. */
  blobUrl: string | null;
  status: DocStatus;
  rejectReason: string | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
}

// ── 공정 ────────────────────────────────────────────────────────
/**
 * 시공 진행현황 — 한백이 실제로 쓰는 흐름 그대로다.
 *
 * 순서가 곧 진행이다. 배열 순서를 바꾸면 화면의 진행 표시가 함께 바뀐다.
 */
export const PROCESS_STATUSES = [
  /*
   * 첫 상태는 「계약이 끝났고 공정은 아직 시작 안 됐다」는 뜻이다.
   * 계약이 안 끝난 현장도 이 값을 갖는다 — 저장된 이 값은 계약이 끝난 뒤에만 의미가 있고,
   * 계약 단계의 자리(계약접수·계약보완)는 서류·단가에서 유도된다(lib/board.ts).
   */
  '계약완료',
  /*
   * 운영사에 계약서를 낸 자리 (2026-08-20 한백 확인).
   *
   * ★승인을 기다리는 칸이 아니다.★ 내면 다 승인·접수된다 — 운영사 승인은 형식이라
   * 별도로 기다릴 것이 없다. 그래서 「승인대기」로 부르지 않는다.
   *
   * 여기서 실제로 기다리는 것은 환경부다. 운영사가 환경부에 접수하고, 접수되면 대기번호를
   * 우리에게 알려준다(project.envQueueNo). 그다음이 환경부 승인이고, 운영사가 시공승인을
   * 통보하면 시공으로 넘어간다.
   *
   * ★이 칸이 없으면 안 낸 현장과 낸 현장이 계약완료에 같이 있다.★ 계약완료 다음이 곧바로
   * 「시공진행필요」였는데 그건 운영사 시공승인까지 끝났다는 뜻이라, 그 사이 몇 주가
   * 한 칸에 뭉쳐 있었다 — 우리가 안 낸 것인지 환경부를 기다리는 것인지 알 수 없었다.
   */
  '운영사 계약서 제출',
  /*
   * 행위신고를 접수하는 자리 — 계약서를 내고 환경부 승인을 기다리는 동안 시공팀이
   * 미리 해놓는 일이다(1~2주, 한백 확인). 완료 체크가 「시공진행필요」를 연다.
   */
  '행위신고',
  '시공진행필요',
  /*
   * 충전기가 현장에 와 있는 자리 — 수령 완료 체크가 조건이다.
   * 발주~수령이 몇 주 걸리는 실제 병목이라, 기다리는 현장과 착공만 남은 현장을 가른다.
   */
  '충전기 수령',
  /*
   * 공사가 실제로 시작된 자리 (2026-08-21 한백 확인 — 시공을 더 쪼갠다).
   * 착공일이 있어야 들어온다(수령은 앞 단계가 이미 확인했다). 「시공진행필요」와
   * 갈라야 시작해야 하는 현장과 진행 중인 현장이 한 칸에 뭉치지 않는다.
   */
  '착공',
  '설치완료',
  /*
   * 전기사용신청 → 점검 → 통신까지 끝난 자리. 통신완료일과 개통 완료 체크가 조건이다.
   * 설치는 끝났는데 개통 절차가 도는 현장과 준공서류를 준비하는 현장을 가른다.
   */
  '개통완료',
  '준공서류 접수/검토',
  '준공보완',
  '준공',
] as const;

export type ProcessStatus = (typeof PROCESS_STATUSES)[number];

/**
 * 현장이 멈춘 상태. 진행 흐름과 별개다.
 *
 * 「보류」는 계약은 됐는데 도중에 중단된 것이라 시공 상태가 아니라 계약 쪽에 가깝다.
 * 그래서 진행 단계와 섞지 않고 따로 둔다 — 섞으면 「설치완료면서 보류」를 표현할 수 없다.
 */
/**
 * 멈춤 — 보류(사정이 풀리면 재개)와 계약중단(계약이 무산됨).
 * 옛 이름 'DROP' 은 읽을 때 계약중단으로 바꾼다(저장소가 한다).
 * 세울 때는 사유가 필수다 — 왜 멈췄는지 없으면 몇 달 뒤 아무도 모른다.
 */
export type HoldState = '보류' | '계약중단';
export const HOLD_STATES = ['보류', '계약중단'] as const satisfies readonly HoldState[];

/** 노션 공정관리 마스터의 실제 날짜 필드 (준공서류일·기자재발주일은 없다) */
export interface ProcessInfo {
  projectId: string;
  /** 계약 마스터에서 롤업으로 오는 값 */
  envApprovalDate: string | null;
  chargerOrderDate: string | null;
  chargerShipDate: string | null;
  chargerRecvDate: string | null;
  startPlanDate: string | null;
  /**
   * 운영사에 계약서를 냈는가. 「운영사 계약서 제출」로 넘어가는 근거다.
   * 날짜가 아니라 여부다 — 체크한 날이 저장되지만 화면은 제출됨/미제출만 보여준다.
   * 한백이 하는 일이고 협력사는 몰라도 되는 값이라, 협력사 화면에는 줄을 안 그린다.
   */
  cpoSubmitDate: string | null;
  /**
   * 운영사 시공승인일.
   * 환경부 승인 뒤 운영사가 따로 통보한다 — 공정에서 유도할 수 없어 입력받는다.
   * 「시공진행필요」로 넘어가는 근거다.
   */
  cpoApprovalDate: string | null;
  /** 「착공」 트리거의 근거 */
  startActualDate: string | null;
  installDoneDate: string | null;
  /**
   * 설치 실적 — 몇 거점에 몇 기를 설치했나. 시공사가 설치완료 때 적는다.
   * 계약 대수(qty)와 다를 수 있다 — 계약은 약속이고 이것은 실제로 세운 것이다.
   */
  installedSpots: number | null;
  installedUnits: number | null;
  commDoneDate: string | null;
  /** 개통완료일 — 통신까지 끝나고 실제 개통된 날. 시공사가 적는다 */
  openDate: string | null;
  /**
   * 묶음별 완료 체크 — 파일을 다 올리고 작업이 끝났는지 사람이 선언한다(체크한 날 저장).
   * 파일이 있다는 것과 일이 끝났다는 것은 다른 말이라, 단계 이동은 이 체크를 조건으로
   * 잠근다(lib/process.ts STATUS_GATES). 시공사가 체크하고 한백이 해제할 수 있다.
   */
  /**
   * 행위신고일 — 신고를 접수한 날. 파일을 올리면 그 날짜가 기본으로 들어가고(비어 있을
   * 때만), 실제 접수일이 다르면 고친다.
   */
  notifyDate: string | null;
  notifyDoneAt: string | null;       // 행위신고 완료 → 「시공진행필요」 조건
  /** 수령한 수량 — 충전기 몇 대, 모뎀 몇 개가 현장에 왔나. 시공사가 수령 때 센다. */
  chargerQty: number | null;
  modemQty: number | null;
  chargerDoneAt: string | null;      // 충전기 수령 완료 → 「충전기 수령」 조건
  installConfirmedAt: string | null; // 설치 완료 → 「설치완료」 조건
  openDoneAt: string | null;         // 개통 완료 → 「준공서류 접수/검토」 조건
  completionSubmitAt: string | null; // 준공서류 제출 완료 → 「준공보완·준공」 조건
  docs: ProjectDocument[];
  status: ProcessStatus;
  memo: string | null;
}

// ── 정산 ────────────────────────────────────────────────────────
export type StepState = 'na' | 'waiting' | 'open' | 'collected';

export interface SettlementStep {
  no: 1 | 2 | 3;
  trigger: Trigger;
  /** 화면 표시용 — 고정 / 비율 / 잔액 */
  basisLabel: string;
  /** 계획액 = 대당금액 × 대수, 잔액이면 (턴키 − 앞단계 정액합) × 대수 */
  planAmount: number | null;
  state: StepState;
  collectedAt: string | null;
}

export interface Settlement {
  projectId: string;
  steps: SettlementStep[];
  /**
   * ★운영사가 통보하는 준공마감일.
   * 공정 마일스톤에서 유도할 수 없어 별도로 받는다. 대부분 운영사의 최종 기성(잔액) 트리거.
   */
  cpoCloseDate: string | null;
  safetyFee: number | null;
  /** 지급 비고 */
  payNote: string | null;
}

/**
 * 협력사도 보는 정산 값 — 자기 지급에 딸린 것만.
 *
 * 기성(차수·트리거·금액)과 정산 규칙은 여기 없다. 그것은 운영사에게서 한백이 받는 돈이라
 * 협력사가 알 일이 아니고, 규칙 이름에는 금액이 그대로 적혀 있다
 * (「환경부 승인 300,000원 → 착공 800,000원 → …」).
 */
export interface PartnerSettlementView {
  projectId: string;
  /** 정산 메모 — 한백이 적고 협력사가 읽는다 */
  payNote: string | null;
}

/**
 * 한백 전용 묶음 — ★협력사 응답에는 이 키가 아예 없다.★
 *
 * 예전에는 하나의 상세를 만든 뒤 금액만 null 로 지웠다(redactForViewer). 그러면 새 필드가
 * 늘 때마다 지우는 것을 잊고 새어나간다 — 실제로 `settlementRule` 이 통째로 나가고 있었다
 * (2026-08-22 실측: 규칙 이름과 steps.basis.unit 에 기성 전액이 그대로).
 * 그래서 「지우는 것」이 아니라 「애초에 없는 것」으로 바꿨다. 옵셔널이라 화면은
 * `detail.admin?.…` 로 접근하고, 타입이 없을 수 있음을 강제한다.
 */
export interface AdminOnlyDetail {
  /** 이 현장에 적용된 정산 규칙 (참조 해소됨) — 이름·단계에 기성 금액이 들어 있다 */
  settlementRule: SettlementRule | null;
  /** 기성 차수 — 트리거·산정방식·금액·회수 상태 */
  steps: SettlementStep[];
  /** 운영사가 통보하는 준공마감일 */
  cpoCloseDate: string | null;
  /** 안전관리비 — 원가다 */
  safetyFee: number | null;
}

/**
 * 협력사 지급관리 화면의 한 줄 — 현장 × 구분(영업비·시공비).
 *
 * 계획(plan)은 단가 케이스 × 대수에서 유도되고, 조정·확정은 원장에서 온다.
 * 저장소가 보는 사람 몫만 만들어 준다(listPayoutOverview) — 화면이 가리지 않는다.
 */
export interface PayoutPlanRow {
  key: string;
  projectId: string;
  projectName: string;
  cpo: string;
  kind: PayoutKind;
  org: string | null;
  plan: number;
  adjust: number;
  confirmed: number;
  /** 자기 쪽 단가가 안 붙은 라인 수 — 계획 금액이 그만큼 비어 있다 */
  unpriced: number;
  milestones: PayoutMilestones;
  feeMissing: string[];
  /** 회차 지급 기록의 지급일 — 원장에서 유도 */
  step1At: string | null;
  step2At: string | null;
}

// ── 하도급사 지급 원장 ───────────────────────────────────────────
/**
 * 지급 명목. 두 갈래다 —
 *   지급: 돈이 실제로 움직였다. 회수는 음수로 저장된다(중복지급을 돌려받는 것).
 *   조정: 줘야 할 금액 자체가 바뀐다. 계획(단가×대수)에 더하거나 뺀다.
 *
 * ★왜 원장인가★ 계획(70/30)만 있던 때는 선금·차액·회수·차감이 전부 비고 문장으로만
 * 남았다 — 노션 정산관리 115행 중 10행이 그랬다. 문장은 합산이 안 되고, 월별 지급명세와
 * 거래명세서는 송금 대상으로 확정한 지급의 합이다.
 *
 * 자재비·추가공사비는 영업·시공이 분리된 채널에서만 생긴다(턴키 업체는 영업비·시공비
 * 안에서 해결). 영업자 부담이므로 시공비에 (+), 영업비에 차감(−) 두 건으로 적는다.
 */
/*
 * manual — 사람이 금액을 적을 수 있는 명목인가.
 * 1차·2차 회차 금액은 정해져 있다(총 지급금액의 70%/30%) — 시스템이 계산해 넣고,
 * 사람은 지급 확정(누구에게 얼마를 어느 날 보낼지)만 한다. 수기 입력을 열어두면 유도값과 어긋난 금액이
 * 남고 어느 쪽이 맞는지 알 수 없게 된다 (한백 확인 2026-08-20).
 * 선금·차액은 원장을 만들기 전의 기록용으로만 남긴다 — 새로 적을 수 없다.
 */
export const PAYOUT_CATEGORIES = [
  { key: '1차', type: '지급', sign: 1, manual: false },
  { key: '2차', type: '지급', sign: 1, manual: false },
  { key: '선금', type: '지급', sign: 1, manual: false },
  { key: '차액', type: '지급', sign: 1, manual: false },
  { key: '회수', type: '지급', sign: -1, manual: true },
  { key: '자재비', type: '조정', sign: 1, manual: true },
  { key: '추가공사비', type: '조정', sign: 1, manual: true },
  { key: '차감', type: '조정', sign: -1, manual: true },
  // 재정산은 방향이 정해져 있지 않다(추가 지급도, 감액도 있다) — 화면이 방향을 받는다
  { key: '재정산', type: '조정', sign: 0, manual: true },
] as const;
export type PayoutCategory = (typeof PAYOUT_CATEGORIES)[number]['key'];
export type PayoutEntryType = (typeof PAYOUT_CATEGORIES)[number]['type'];

export type PayoutKind = '영업비' | '시공비';
export const PAYOUT_KINDS = ['영업비', '시공비'] as const satisfies readonly PayoutKind[];

export interface PayoutEntry {
  id: string;
  projectId: string;
  /** 어느 쪽 돈인가 — 영업비는 영업사, 시공비는 시공사에게 간다 */
  kind: PayoutKind;
  category: PayoutCategory;
  /** 원 단위 정수. 부호가 있다 — 회수·차감은 음수. */
  amount: number;
  /** 지급일(지급) 또는 발생일(조정), YYYY-MM-DD */
  at: string;
  note: string | null;
  createdAt: string;
}

/** 원장에 넣을 때 받는 입력 — id·시각은 저장소가 만든다 */
export type NewPayoutEntry = Omit<PayoutEntry, 'id' | 'projectId' | 'createdAt'>;

// ── 화면이 받는 묶음 ─────────────────────────────────────────────
export interface ProjectSummary {
  id: string;
  /** 한백_현장관리번호 — 노션과 맞춰 볼 때 쓴다 */
  mgmtNo: string | null;
  name: string;
  addr: string | null;
  cpo: CpoName;
  salesOrg: string | null;
  gcOrg: string | null;
  bldgType: BuildingType | null;
  bizType: BizType | null;
  powerType: PowerType | null;
  envQueueNo: string | null;
  /** 기설치 조사 결과 — 조사 전이면 null (「없음」과 가른다) */
  preInstall: PreInstall | null;
  createdAt: string;
  lines: Array<{ termYears: number; qty: number }>;
  stage: Stage;
  /** 공정 진행현황. 보드에서 이 현장이 서는 칸이다. */
  status: ProcessStatus;
  /** 멈춘 현장. null 이면 진행 중. */
  holdState: HoldState | null;
  court: Court;
  /** 마지막 진척 후 경과일. 노션엔 없는 지표. */
  stalledDays: number;
  priced: boolean;
  /** 반려된 서류 수 — 협력사가 목록에서 바로 알아야 한다 */
  rejectedDocs: number;
  /**
   * 필수 서류 칸이 다 찼는가 (반려 여부는 별개).
   * 계약접수(아직 모으는 중)와 계약검토(다 찼으니 한백 차례)를 가르는 값이다.
   */
  docsFilled: boolean;
  /**
   * 지금 넘어갈 수 있는 공정 단계.
   * 보드가 놓을 수 없는 칸을 미리 가리는 데 쓴다 — 조건은 lib/process.ts 가 정한다.
   */
  entryOk: ProcessStatus[];
  /**
   * 다음 단계와 그 준비 상태 — 보드 카드가 다음 걸음을 민다.
   * ready 면 카드에서 바로 넘길 수 있고, 아니면 need(막는 것)가 카드에 적힌다.
   */
  nextStep: { status: ProcessStatus; ready: boolean; need: string | null } | null;
  /**
   * 시공 마일스톤 스냅샷 — 표가 「모든 걸 한눈에」 그리는 데 쓴다.
   * 날짜의 유무가 곧 그 일의 여부다. 완료 체크(…DoneAt)는 boolean 으로 얹는다.
   * 일정 값이라 협력사에게도 나간다 — 금액이 아니다.
   */
  milestones: {
    envApprovalDate: string | null;
    cpoApprovalDate: string | null;
    notifyDate: string | null;
    notifyDone: boolean;
    chargerOrderDate: string | null;
    chargerRecvDate: string | null;
    chargerDone: boolean;
    startDate: string | null;
    installDoneDate: string | null;
    installConfirmed: boolean;
    /** 개통완료일 — 통신완료일(commDoneDate)이 아니라 실제 개통된 날을 표에 그린다 */
    openDate: string | null;
    openDone: boolean;
    completionSubmitAt: string | null;
  };
}

/**
 * 정산관리 화면이 받는 요약. [한백 전용]
 *
 * ★ProjectSummary 와 합치지 않는다.★ 저 목록은 협력사 브라우저로도 나가는데
 * 여기에는 계획액·회수액이 들어 있다. 한 타입으로 묶으면 「이 화면은 금액을 안 쓴다」는
 * 약속을 타입이 지켜주지 못하고, 언젠가 협력사 화면으로 실려 나간다.
 */
export interface PayoutMilestones {
  /** 영업비 1차 — 한백이 계약 확인을 완료한 날 */
  contractCompletedAt: string | null;
  /** 시공비 1차 — 설치 완료 체크일 */
  installCompletedAt: string | null;
  /** 영업비·시공비 2차 — 개통 완료 체크일 */
  openedAt: string | null;
}

export interface SettlementSummary {
  id: string;
  name: string;
  cpo: CpoName;
  /** 계약 총 대수 */
  qty: number;
  stage: Stage;
  status: ProcessStatus;
  /** 적용된 정산 규칙 이름. null 이면 기성이 계산되지 않는다. */
  ruleName: string | null;
  steps: SettlementStep[];
  /** 계획액 합계 */
  planTotal: number;
  /** 회수된 금액 합계 */
  collectedTotal: number;
  /** 운영사가 통보한 준공마감일 — 마지막 기성(잔액)의 근거 */
  cpoCloseDate: string | null;

  /*
   * 여기부터는 반대 방향이다 — 한백이 협력사에게 내려주는 돈.
   * 위(steps·planTotal)는 운영사에게서 받는 기성이다. 두 방향을 한 화면에 섞으면
   * 「얼마 남았나」가 어느 쪽 이야기인지 알 수 없다.
   */
  salesOrg: string | null;
  gcOrg: string | null;
  /** 지급 회차를 여는 업무 완료일 */
  payoutMilestones: PayoutMilestones;
  /** 영업비 지급 전에 반드시 갖춰야 하는 서류 */
  salesFeeMissing: string[];
  /** 영업비 계획 = Σ(영업비/대 × 대수) */
  salesTotal: number;
  /** 시공비 계획 = Σ(시공비/대 × 대수) */
  consTotal: number;
  /** 한백 마진 총액 = 받을 기성 − 내려줄 지급 */
  marginTotal: number;
  /** 단가가 안 붙은 라인 수. 0 이 아니면 위 금액이 실제보다 적다. */
  unpricedLines: number;
  /*
   * 원장에서 유도한 실적. 계획 + 조정 − 지급 = 잔액.
   * 지급일 4칸으로 저장하던 것을 원장 합으로 바꿨다 — 선금·차액·회수가 날짜 한 칸에
   * 들어가지 않는다.
   */
  salesAdjust: number;
  salesPaid: number;
  salesLastPaidAt: string | null;
  consAdjust: number;
  consPaid: number;
  consLastPaidAt: string | null;
  /** 회차 지급 기록(1차·2차)의 지급일 — 없으면 그 회차가 아직 안 나갔거나 원장 전의 기록이다 */
  salesStep1At: string | null;
  salesStep2At: string | null;
  consStep1At: string | null;
  consStep2At: string | null;
  payNote: string | null;
}

/**
 * 진행현황 한 줄 — 한백·협력사가 남기는 특이사항.
 *
 * 어느 칸에도 안 들어가는 사정이 여기 온다(관리사무소 사정으로 공사 연기, 한전 불입 지연…).
 * 사람 이름 대신 소속만 남긴다 — 회사마다 계정이 하나라 이름이 늘 같다.
 */
export interface ProjectNote {
  id: string;
  author: string;
  body: string;
  /** 남긴 시각 (YYYY-MM-DD HH:mm) */
  at: string;
  /** 고친 시각. null 이면 처음 쓴 그대로다. */
  editedAt: string | null;
}

/**
 * 지급 한 줄 — 「어느 현장의 무슨 비용 몇 차를 누구에게 얼마」.
 *
 * 노션 「26 정산관리」의 영업비 1·2차 / 시공비 1·2차 뷰와 같은 단위다. 현장 한 건이
 * 영업비 2줄 + 시공비 2줄로 최대 네 줄이 된다 — 달마다 나가는 돈을 세려면 이 단위여야 한다.
 *
 * ★협력사에게도 나간다.★ 그래서 마진·기성은 여기 없다. 자기가 받는 쪽 줄만 받는다 —
 * 영업만 맡은 회사에게 시공비 줄을 보내지 않는다(effectiveVisibility).
 */
/**
 * 지급 내역 한 줄 — 원장에서 송금 대상으로 확정한 지급 한 건이다.
 * 아직 안 나간 몫은 여기 없다 — 잔액은 하도급사 지급관리(/payouts)가 센다.
 */
export interface PayoutRow {
  projectId: string;
  projectName: string;
  cpo: CpoName;
  /** 받는 곳. null 이면 아직 정해지지 않았다. */
  org: string | null;
  kind: PayoutKind;
  /** 명목 — 원장의 category */
  label: string;
  /** 확정 지급액(부호 있음 — 회수는 음수) */
  amount: number;
  /** 지급일 */
  paidAt: string;
  note: string | null;
}

export interface ContractState {
  /** 이 현장에 필요한 필수 서류 칸 수 */
  requiredTotal: number;
  /** 그중 통과한 것 (제출됐고 반려 안 됨) */
  satisfied: number;
  /**
   * 필수 서류 칸이 다 찼는가 — 반려 여부는 보지 않는다.
   *
   * ★접수와 검토를 가르는 사실이다.★ 칸이 비어 있으면 협력사가 더 낼 것이 있고(계약접수),
   * 다 찼으면 한백이 볼 차례다(계약검토). 반려는 그보다 먼저 잡히므로(계약보완) 여기서
   * 반려를 셈에 넣으면 두 판정이 겹친다.
   */
  docsFilled: boolean;
  /**
   * 반려된 서류 수 — 필수 여부를 가리지 않는다.
   *
   * 조건부·선택 서류가 반려됐어도 계약은 못 넘어간다. 반려는 「이 계약은 아직 아니다」는
   * 판정이고, 그 판정이 남은 계약을 넘기면 보드의 「계약보완」 칸과 실제가 어긋난다.
   */
  rejected: number;
  /** 라인마다 단가가 붙었는가 */
  allPriced: boolean;
  /** 한백 확인만 남았는가 — 확인 버튼이 열리는 조건이고 저장소도 이것을 본다 */
  ready: boolean;
  /** 영업비 지급조건 서류 중 아직 통과하지 못한 것 */
  feeMissing: string[];
}

export interface ProjectDetail {
  project: Project;
  lines: ContractLineView[];
  documents: ProjectDocument[];
  process: ProcessInfo;
  /** 협력사도 보는 정산 값 — 기성·규칙은 admin 에 있다 */
  settlement: PartnerSettlementView;
  /**
   * 한백 전용 묶음 — 협력사 응답에는 이 키가 없다(AdminOnlyDetail 주석 참조).
   * 화면은 `detail.admin?.…` 로 읽는다.
   */
  admin?: AdminOnlyDetail;
  stage: Stage;
  /**
   * 계약이 어디까지 왔고 무엇에 막혀 있는가 (lib/stage.ts 의 contractStateOf).
   *
   * ★화면은 이것을 다시 계산하지 않는다.★ 예전에는 현장 상세가 required.every(...) 로
   * 다시 세고 목록 요약이 또 자기 식으로 셌다. 조건을 하나 바꾸면 그 곳들이 갈려서
   * 「버튼은 눌리는데 저장이 거절되는」 상태가 생긴다.
   */
  contract: ContractState;
  court: Court;
  stalledDays: number;
  /** 진행현황 — 최근 것이 위로 온다 */
  notes: ProjectNote[];
  /**
   * 하도급사 지급 원장 — 날짜 오름차순.
   * 협력사에게는 자기 쪽(영업비/시공비)만 실려 간다(redactForViewer).
   */
  payoutEntries: PayoutEntry[];
}

// ── 접수 입력 ────────────────────────────────────────────────────
/** 협력사가 콘솔에서 접수할 때 채우는 것 (INTAKE_SPEC §2) */
export interface IntakeDraft {
  cpo: CpoName;
  /**
   * 접수 업체 — 한백이 대신 접수할 때만 쓴다.
   *
   * 협력사가 접수하면 서버가 접수자의 소속으로 채운다. 이 값은 무시된다 —
   * 협력사가 남의 회사 이름을 넣어 남의 현장을 만들 수 있으면 안 된다.
   *
   * 한백이 계정 없는 업체의 건을 대신 받는 경우가 간혹 있어서, 그때 이름만 적어 둔다.
   * 비워두면 「어느 업체도 아닌 현장」이 되고 한백만 본다.
   */
  salesOrg: string | null;
  gcOrg: string | null;
  name: string;
  addr: string | null;
  bldgType: BuildingType | null;
  contractParty: ContractParty | null;
  parkTotal: number | null;
  mgr: string | null;
  tel: string | null;
  mail: string | null;
  preInstall: PreInstall;
  preNote: string | null;
  /* 기설치 조사 여부(preChecked)는 여기 없다 — 접수 뒤의 일이라 서버가 false 로 만든다 */
  powerType: PowerType | null;
  replType: ReplType | null;
  bizType: BizType | null;
  note: string | null;
  lines: Array<{
    termYears: number;
    qty: number;
    powerType: Exclude<PowerType, '한전불입+모자분리'> | null;
    replType: ReplType | null;
    memo: string | null;
  }>;
  /** 칸별로 붙인 파일 이름. 파일 자체는 별도 업로드 경로로 간다. */
  documents: Array<{ kind: string; filename: string }>;
}

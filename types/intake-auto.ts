/**
 * ZIP 자동 처리 결과의 모양.
 *
 * ★lib/intake-auto.ts · lib/intake-review.ts 에 두지 않는 이유★
 * 그 둘은 @vercel/blob 과 Anthropic SDK 를 들여오는 서버 전용 모듈이다. 클라이언트
 * 컴포넌트가 거기서 타입을 가져오면 번들러가 그 모듈을 클라이언트 그래프로 끌어와
 * React 가 둘이 되고, 화면이 useContext 에서 죽는다 — 실제로 겪었다.
 * 타입은 양쪽이 읽어도 되는 자리에 둔다.
 */
import type { BizType, BuildingType, ContractParty, CpoName, PowerType } from './project';

/** 자동으로 채운 현장 정보. 비어 있는 것은 사람이 채운다. */
export interface AutoFields {
  cpo: CpoName | null;
  name: string | null;
  addr: string | null;
  bldgType: BuildingType | null;
  contractParty: ContractParty | null;
  powerType: PowerType | null;
  bizType: BizType | null;
  parkTotal: number | null;
  mgr: string | null;
  tel: string | null;
  mail: string | null;
  /**
   * 판독이 본 기설치. 모르겠으면 null 이다 —
   * 「확인불가」는 상태가 아니라 조사가 안 됐다는 뜻이라 값으로 두지 않는다.
   */
  preInstall: '없음' | '있음' | null;
  /*
   * 비고는 없다. 판독이 읽은 잡다한 문구(견적금액·신고일)를 넣어봤지만, 비고는
   * 「영업비 차감하여 프로모션 적용」처럼 사람이 판단해 쓰는 칸이라 자동으로 채우면
   * 정작 써야 할 말이 묻힌다.
   */
  /** 총 계약연수·대수. 축이 갈린 현장은 대수를 사람이 쪼갠다. */
  termYears: number | null;
  qty: number | null;
}

export interface AutoDoc {
  kind: string;
  /** 분류가 판정한 서류 종류 (사람이 읽는 이름) */
  category: string;
  filename: string;
  blobUrl: string;
}

/** 서류 한 장의 검수 결과 */
export interface DocFinding {
  /** 서류 칸 kind */
  kind: string;
  /** 문제가 없는가 */
  ok: boolean;
  /** 무엇이 어떻게 문제인지 — 한 줄씩 */
  issues: string[];
  /** 검수를 실제로 돌렸는가 (실패·건너뜀이면 false) */
  checked: boolean;
}

export interface DocReview {
  findings: DocFinding[];
  /** 서류들이 가리키는 현장 주소 — 폼의 주소 칸에 쓴다 */
  siteAddress: string | null;
  /** 검수하지 못한 서류 (용량 초과·판독 실패) */
  notChecked: string[];
}

export interface AutoIntakeResult {
  fields: AutoFields;
  /** 필드별 판독 신뢰도 (0~1) */
  confidence: Record<string, number>;
  docs: AutoDoc[];
  review: DocReview | null;
  warnings: string[];
}

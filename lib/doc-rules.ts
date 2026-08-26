/**
 * 접수 서류 마스터 + 조건부 필수 규칙 — INTAKE_SPEC §3.
 *
 * 서류는 번호가 아니라 종류(key)로 다룬다. 자동분류가 종류를 판별해 각 칸에 채운다.
 * 해당없는 서류도 칸을 없애지 않는다 — 「빠뜨린 것」과 「원래 불필요한 것」을 구분해야 한다.
 *
 * ※ lib/notion.ts 의 buildMissingDocsNote() 와 규칙이 다르다.
 *   그쪽은 계약주체 필드가 노션에 없어 건축물유형으로 회의록을 판정한다.
 *   이 파일이 정본이고, 노션 구현을 붙일 때 그쪽을 이 규칙으로 맞춘다.
 */
import type {
  BizType,
  BuildingType,
  ContractParty,
  CpoName,
  PowerType,
  PreInstall,
} from '@/types/project';
import { subsidized } from '@/types/project';

/** m=필수 · c=조건부필수 · o=해당없음 */
export type DocReq = 'm' | 'c' | 'o';

export interface DocContext {
  /**
   * 운영사. 모를 수도 있다.
   *
   * 콘솔은 운영사 다섯 곳을 안다(CpoName). 포털의 접수 판독은 그보다 넓은 목록을 읽어서
   * 「대영채비」처럼 콘솔이 모르는 이름이 올 수 있고, 아직 못 읽은 경우도 있다. 그때는
   * 운영사별 조건을 걸지 않는다 — 모르는 운영사에게 그 운영사 양식을 요구할 수 없다.
   */
  cpo: CpoName | null;
  contractParty: ContractParty | null;
  bldgType: BuildingType | null;
  /** 계약 라인 중 하나라도 모자분리면 true (혼용 현장 대응) */
  hasMotherSeparation: boolean;
  preInstall: PreInstall;
  /**
   * 사업구분. 기설치 서류가 이것으로 갈린다.
   *
   * 기설치 조사는 환경부 사업의 요건이다 — 보조금이 기설치 여부로 갈리기 때문이다.
   * 자체투자는 조사할 이유가 없으므로 그 서류도 해당없음이다(2026-08-20 한백 확인).
   */
  bizType: BizType | null;
}

interface DocSpec {
  key: string;
  name: string;
  /** 영업비 지급조건 서류 */
  fee?: boolean;
  ext?: string;
  /**
   * 기설치 조사에 딸린 서류.
   *
   * 서류 목록에서 빼고 「기설치」 구역에서 다룬다 — 현장마다 기설치 조사를 해야 하는데,
   * 그 증빙이 서류 열여섯 칸 사이에 섞여 있으면 조사가 됐는지 안 됐는지 보이지 않는다.
   * 필수 판정에서는 빠지지 않는다(접수 조건은 그대로다).
   */
  preinstall?: boolean;
  req: (ctx: DocContext) => DocReq;
  label?: (ctx: DocContext) => string;
}

/**
 * 프로모션 요금 합의서를 받는 운영사.
 *
 * 이 둘만 필수인 이유는 **양식이 이 둘밖에 없다**는 것이다(2026-08-20 한백 확인) —
 * 다른 운영사는 낼 서류 자체가 존재하지 않는다. 「면제」가 아니라 「없다」다.
 *
 * 예전 이름은 SURVEY_CPOS 였다. 실사보고서용으로 만든 상수를 합의서에 다시 쓴 것이라
 * 무엇을 가리키는 목록인지 이름이 거짓말을 하고 있었다.
 */
const AGREEMENT_CPOS: CpoName[] = ['플러그링크', '나이스인프라'];

/**
 * 환경부 사업만 내는 서류.
 *
 * 「자체투자가 아니면」이 아니라 「환경부면」으로 센다. 두 값뿐이라 지금은 같은 답이지만,
 * 사업구분을 아직 모르는 현장(null)에서 갈린다 — 모르는 것을 필수로 걸면 낼 수 없는
 * 서류 때문에 계약이 막힌다.
 */
const envOnly = (c: DocContext): DocReq => (c.bizType === '환경부' ? 'm' : 'o');

const SPECS: DocSpec[] = [
  { key: 'contract', name: '전기차충전 토탈솔루션 계약서', req: () => 'm' },
  {
    key: 'agreement',
    name: '프로모션 요금 합의서',
    req: (c) => (c.cpo && AGREEMENT_CPOS.includes(c.cpo) ? 'm' : 'o'),
  },
  { key: 'sealuse', name: '직인사용 동의서', req: () => 'm' },
  /*
   * 개인정보 동의서와 설치신청서는 환경부 서류다 (2026-08-20 한백 확인).
   * 환경부에 보조금을 신청하면서 내는 것이라, 자체투자 현장은 낼 곳이 없다.
   * 사업구분을 모르면(null) 요구하지 않는다 — 모르는 것을 누락이라 적으면
   * 사람이 매번 확인해야 하고, 그러면 이 판정을 아무도 믿지 않게 된다.
   */
  { key: 'privacy', name: '개인정보 수집·이용 동의서', req: (c) => envOnly(c) },
  { key: 'apply', name: '전기차 완속충전시설 설치신청서', req: (c) => envOnly(c) },
  { key: 'consult', name: '사전현장컨설팅 결과서', fee: true, req: () => 'm' },
  {
    key: 'minutes',
    name: '회의록',
    req: (c) => (resolveParty(c) === '건설사' ? 'c' : 'm'),
    label: (c) => {
      const party = resolveParty(c);
      if (party === '입주자대표회의') return '입주자대표회의 회의록';
      if (party === '관리단') return '관리단 회의록';
      if (party === '건설사') return '회의록 (건설사)';
      return '회의록';
    },
  },
  {
    key: 'kepcobill',
    name: '한국전력 전기요금 청구서',
    req: (c) => (c.hasMotherSeparation ? 'm' : 'o'),
  },
  { key: 'bldgreg', name: '건축물대장', req: () => 'm' },
  { key: 'bizreg', name: '사업자등록증 (고유번호증)', req: () => 'm' },
  {
    /*
     * 실사보고서와 사진대지는 같은 것이다 (2026-08-19 한백 확인).
     * 예전에는 운영사에 따라 둘로 갈라 두고 서로를 면제시켰는데, 같은 서류라면
     * 칸이 둘일 이유가 없다 — 어느 칸에 넣어야 하는지를 협력사가 판단해야 했다.
     *
     * 확장자를 못 박지 않는다. 운영사마다 엑셀로도 오고 PDF 로도 온다.
     */
    key: 'survey',
    name: '실사보고서 (사진대지)',
    fee: true,
    req: () => 'm',
  },
  {
    key: 'legacylog',
    name: '기설치 충전기 설치이력',
    ext: '.xlsx',
    /*
     * 환경부 사업만 낸다. 기설치가 없어도 '없음' 확인용으로 제출받지만, 자체투자는
     * 조사 자체를 하지 않으므로 낼 것이 없다 — 여기서 필수로 두면 자체투자 현장이
     * 만들 수 없는 엑셀 때문에 계약이 영구히 막힌다.
     */
    req: (c) => envOnly(c),
    preinstall: true,
  },
  {
    key: 'legacyev',
    name: '기설치 증빙자료',
    // 기설치가 있는 환경부 현장만 증빙이 필수다. 없으면 낼 것이 없다.
    req: (c) => (c.bizType === '환경부' && c.preInstall === '있음' ? 'm' : 'o'),
    preinstall: true,
  },
  {
    key: 'checklist2',
    name: '별지2 사전체크리스트 (현대엔지니어링)',
    req: (c) => (c.cpo === '현대엔지니어링' ? 'm' : 'o'),
  },
  {
    /*
     * 규칙에 없는 서류가 오는 자리. 필수로 두지 않는다 — 채울 것이 정해져 있지 않은 칸을
     * 필수로 걸면 접수가 영구히 막힌다.
     */
    key: 'etc',
    name: '기타',
    req: () => 'o',
  },
  {
    key: 'approval',
    name: '설치승인서 (현대엔지니어링)',
    // 현대엔지니어링 현장에만 존재한다(2026-08-19 한백 확인).
    // 필수인지 「있으면 받는다」인지는 미확인이라 조건부로 둔다 —
    // 필수로 잘못 걸면 접수 완료가 영구히 막힌다.
    req: (c) => (c.cpo === '현대엔지니어링' ? 'c' : 'o'),
  },
  {
    key: 'quote',
    name: '견적서 (SK 자체투자)',
    /*
     * SK일렉링크 자체투자 현장만 낸다 (한백 지시 2026-08-25). SK 정책이 시공 전 설치도면·
     * 견적서를 서면 승인받게 하고, 승인되지 않은 시공비는 청구할 수 없다
     * (lib/pricing-policy-sk-h2.ts). 그래서 접수 때 받아 둔다.
     *
     * ★자체투자만이다 — 연동은 뺀다.★ 연동은 별개 사업구분이고(기 구축 충전기 연동,
     * 2026-08-23 추가) 견적서를 요구한다는 확인이 없다. 필수로 잘못 걸면 그 현장의 접수가
     * 영구히 막힌다 — 이 파일이 여러 번 겪은 실수다. 요구해야 하는 것으로 확인되면
     * 조건에 '연동' 을 더한다.
     */
    req: (c) => (c.cpo === 'SK일렉링크' && c.bizType === '자체투자' ? 'm' : 'o'),
  },
];

/**
 * 계약주체가 비어 있으면 건축물유형으로 추정한다.
 * 기존 노션 현장에는 계약주체가 없어서(신규 필드) 소급 입력 없이 굴러가야 한다.
 */
export function resolveParty(ctx: DocContext): ContractParty | null {
  if (ctx.contractParty) return ctx.contractParty;
  if (ctx.bldgType === '공동주택') return '입주자대표회의';
  if (ctx.bldgType === '상업시설') return '관리단';
  return null;
}

export interface EvaluatedDoc {
  key: string;
  label: string;
  req: DocReq;
  fee: boolean;
  ext: string | null;
  /** 기설치 구역에서 다루는 서류 — 서류 목록에서는 빠진다 */
  preinstall: boolean;
}

/** 현장 조건에 따라 서류 15칸의 필수 여부를 확정한다 */
export function evaluateDocs(ctx: DocContext): EvaluatedDoc[] {
  return SPECS.map((s) => ({
    key: s.key,
    label: s.label ? s.label(ctx) : s.name,
    req: s.req(ctx),
    fee: s.fee ?? false,
    ext: s.ext ?? null,
    preinstall: s.preinstall ?? false,
  }));
}

export function buildDocContext(input: {
  cpo: CpoName | null;
  contractParty: ContractParty | null;
  bldgType: BuildingType | null;
  projectPowerType: PowerType | null;
  linePowerTypes: Array<PowerType | null>;
  preInstall: PreInstall;
  bizType: BizType | null;
}): DocContext {
  const all = [input.projectPowerType, ...input.linePowerTypes];
  return {
    cpo: input.cpo,
    contractParty: input.contractParty,
    bldgType: input.bldgType,
    hasMotherSeparation: all.some((p) => p === '모자분리' || p === '한전불입+모자분리'),
    preInstall: input.preInstall,
    bizType: input.bizType,
  };
}

/**
 * 이 현장에 기설치 조사가 필요한가.
 *
 * 환경부 보조금이 기설치 여부로 갈리기 때문에 보조 사업만 조사한다 —
 * 자체투자·연동은 해당없음이다. 화면·표·필터가 같은 판정을 봐야 해서 여기 한 곳에 둔다.
 */
export const needsPreInstallCheck = (bizType: BizType | null): boolean =>
  subsidized(bizType);

/** 공정 서류 슬롯 — 노션 공정관리 마스터의 file 속성들 */
export const PROCESS_DOCS = [
  { key: 'notify', name: '행위신고' },
  /*
   * ★설치완료 때 같이 내는 세 장★ (한백 지시 2026-08-26) — 운영사 시스템의 「공통」 묶음이
   * 그렇다: 시공일자 · 설치완료보고서 · 충전시설 설치 신고서 · 전기사용신청 접수증.
   * 시공일자는 새 칸을 만들지 않았다 — 설치완료일이 그 값이다(같은 값을 두 번 두지 않는다).
   */
  { key: 'installReport', name: '설치완료보고서' },
  { key: 'installNotice', name: '충전시설 설치 신고서' },
  // 올리는 것은 신청서가 아니라 접수증이다 — 이름이 파일과 같아야 무엇을 올릴지 안다
  { key: 'elecapply', name: '전기사용신청 접수증' },
  { key: 'kepcofee', name: '한전시설부담금' },
  { key: 'completion', name: '준공서류' },
  /*
   * ★준공 단계에 받는 서류★ (한백 2026-08-27). 환경부 제출분 둘과 대관서류 넷이다.
   * 설치사진대장·도면은 받지 않는다(한백 확인) — 칸을 만들지 않는다.
   */
  { key: 'completeConfirm', name: '설치완료확인서 (환경부)' },
  { key: 'costSurvey', name: '원가조사서 (환경부)' },
  // 대관서류 — 관공서에 내는 넷. 이름은 실제 파일 이름과 같게 적는다
  { key: 'safety', name: '안전점검필증 (사용전점검필증)' },
  /*
   * 전기안전관리자 선임신고증명서 — ★한전불입 현장만★ (한백 2026-08-27).
   * 모자분리는 세대 계량이라 선임 대상이 아니다. 화면이 수전방식을 보고 칸을 낸다.
   */
  { key: 'safetyMgr', name: '전기안전관리자 선임신고증명서' },
  { key: 'useInspect', name: '사용검사 필증' },
  { key: 'asBuilt', name: '준공도' },
  { key: 'photoDone', name: '설치완료사진' },
  { key: 'comm', name: '통신확인' },
] as const;

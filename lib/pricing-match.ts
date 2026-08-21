/**
 * 계약 라인에 붙일 수 있는 단가 케이스를 고른다.
 *
 * 매트릭스는 34행이지만 한 라인에 맞는 것은 보통 한둘이다. 전부 늘어놓으면
 * 사람이 잘못 고르고, 그 순간 지급액이 통째로 틀어진다. 축으로 좁혀서 보여준다.
 *
 * ★없는 축은 조건에서 뺀다.★ 현장 정보가 덜 채워졌다고 후보가 0개가 되면 아무것도 못 고른다 —
 * 아는 축으로만 좁히고, 무엇으로 좁혔는지 화면에 적어 사람이 판단하게 한다.
 */
import { BUILDING_TYPES, bizTypeOfRepl, CHANNELS, CPO_NAMES, REPL_TYPES } from '@/types/project';
import type {
  ContractLine, CpoName, NewPricingRule, PricingRule, Project, ReplType,
} from '@/types/project';
import { checkSettlementSteps } from '@/lib/settlement';

export interface RuleMatch {
  /** 모든 축이 맞는 것 */
  exact: PricingRule[];
  /** 운영사만 맞는 것 — 축이 비어 판정이 안 될 때의 대안 */
  others: PricingRule[];
  /** 실제로 좁히는 데 쓴 축 (화면 표시용) */
  usedAxes: string[];
}

export function matchingRules(
  project: Pick<Project, 'cpo' | 'bizType' | 'replType' | 'bldgType'>,
  line: Pick<ContractLine, 'termYears' | 'powerType' | 'replType'>,
  /** 후보가 될 케이스 전부 — 저장소에서 온다(시드 파일이 아니다) */
  all: PricingRule[]
): RuleMatch {
  /*
   * 교체유형은 라인의 값이 정본이다.
   * 자체투자 현장은 제자리교체와 신규위치가 섞이고, 그때 현장 쪽 값은 null 이다.
   * 라인에 없으면(옛 데이터) 현장 값으로 내려간다.
   */
  const replType = line.replType ?? project.replType;
  const sameCpo = all.filter((r) => r.active && r.cpo === project.cpo);
  const usedAxes: string[] = ['운영사'];

  const exact = sameCpo.filter((r) => {
    if (!r.termYears.includes(line.termYears)) return false;
    if (project.bizType && r.bizType !== project.bizType) return false;
    if (line.powerType && r.powerType !== line.powerType) return false;
    if (replType && r.replType !== replType) return false;
    if (project.bldgType && !r.bldgTypes.includes(project.bldgType)) return false;
    return true;
  });

  usedAxes.push('계약연수');
  if (project.bizType) usedAxes.push('사업구분');
  if (line.powerType) usedAxes.push('수전방식');
  if (replType) usedAxes.push('교체유형');
  if (project.bldgType) usedAxes.push('건축물유형');

  const exactIds = new Set(exact.map((r) => r.id));
  return { exact, others: sameCpo.filter((r) => !exactIds.has(r.id)), usedAxes };
}

/** 라인 id → 그 라인에 붙일 수 있는 단가 케이스 */
export type RuleOptions = Record<string, RuleMatch>;

/**
 * 케이스 id — 축에서 만든다.
 *
 * 사람이 적게 두면 겹치고, 겹치면 이미 다른 현장이 참조하는 케이스를 덮어쓴다.
 * 축이 같은 케이스를 또 만들면 끝에 번호가 붙는다(반년마다 단가가 바뀌어 실제로 생긴다).
 */
export function pricingRuleId(r: NewPricingRule, taken: Set<string>): string {
  const part = [
    CPO_SLUG[r.cpo] ?? 'cpo',
    `y${r.termYears.join('-')}`,
    r.powerType === '모자분리' ? 'mother' : 'kepco',
    REPL_SLUG[r.replType] ?? 'x',
    r.bldgTypes.length === 2 ? 'both' : r.bldgTypes[0] === '상업시설' ? 'biz' : 'apt',
    ...(r.channel === '시공' ? ['gc'] : r.channel === '영업' ? ['sales'] : []),
    String(r.bizYear),
  ].join('-');
  if (!taken.has(part)) return part;
  for (let n = 2; ; n += 1) {
    const next = `${part}-${n}`;
    if (!taken.has(next)) return next;
  }
}

const CPO_SLUG: Record<CpoName, string> = {
  '플러그링크': 'pl',
  '나이스인프라': 'nice',
  '현대엔지니어링': 'hec',
  'SK일렉링크': 'sk',
  '에버온': 'everon',
};

const REPL_SLUG: Record<ReplType, string> = {
  '환경부 신규': 'new',
  '자체투자 (제자리교체)': 'inplace',
  '자체투자 (신규위치)': 'move',
};

const POWER_CASES = ['한전불입', '모자분리'] as const;

/**
 * 케이스가 앞뒤 맞는가 — 저장 전에 한 번 본다.
 *
 * 화면에서도 막지만 라우트는 직접 부를 수 있다. 그리고 여기서 막는 것들은 다 「나중에
 * 어느 현장에도 안 맞는 케이스」가 되는 조합이다 — 그때는 왜 안 맞는지 알 수 없다.
 *
 * ★열거값도 여기서 본다.★ 라우트는 본문을 캐스팅만 하므로 「플러그링크 」(뒤 공백) 같은
 * 오타가 그대로 온다. matchingRules 는 문자열 완전 일치라 그 케이스는 어느 라인에도 안 맞고,
 * 케이스는 불변·삭제 불가라 중지 말고는 치울 길이 없다 — 저장 전에 막는 것이 유일한 방어다.
 * 형태 검사(배열인가)도 같이 한다 — 필드가 빠진 JSON 이 TypeError 원문을 422 로 내보내지 않게.
 */
export function checkPricingRule(r: NewPricingRule): string[] {
  const bad: string[] = [];
  if (!r || typeof r !== 'object') return ['넣을 값이 없습니다.'];
  if (!r.caseName?.trim?.()) bad.push('케이스 이름을 적어주세요.');

  if (!CPO_NAMES.includes(r.cpo)) bad.push('운영사가 목록에 없습니다.');
  if (!POWER_CASES.includes(r.powerType)) bad.push('수전방식은 한전불입 · 모자분리 중 하나여야 합니다.');
  if (!REPL_TYPES.includes(r.replType)) bad.push('교체유형이 목록에 없습니다.');
  if (!CHANNELS.includes(r.channel)) bad.push('채널은 턴키 · 영업 · 시공 중 하나여야 합니다.');
  // 한쪽만 맡는 채널에 반대쪽 단가가 붙어 있으면 어느 쪽인지 알 수 없는 케이스가 된다
  if (r.channel === '시공' && r.salesUnit > 0) bad.push('시공 케이스는 영업단가가 0 이어야 합니다.');
  if (r.channel === '영업' && r.consUnit > 0) bad.push('영업 케이스는 시공단가가 0 이어야 합니다.');

  if (!Array.isArray(r.termYears) || r.termYears.length === 0) {
    bad.push('계약연수를 하나 이상 고르세요.');
  } else if (r.termYears.some((y) => !Number.isInteger(y) || y < 1 || y > 30)) {
    bad.push('계약연수는 1~30 사이의 정수여야 합니다.');
  }
  if (!Array.isArray(r.bldgTypes) || r.bldgTypes.length === 0) {
    bad.push('건축물유형을 하나 이상 고르세요.');
  } else if (r.bldgTypes.some((b) => !BUILDING_TYPES.includes(b))) {
    bad.push('건축물유형이 목록에 없습니다.');
  }

  // 교체유형이 사업구분을 정한다 — 두 값이 어긋나면 그 케이스는 어느 현장에도 안 맞는다
  if (REPL_TYPES.includes(r.replType) && bizTypeOfRepl(r.replType) !== r.bizType) {
    bad.push(`${r.replType} 는 사업구분이 ${bizTypeOfRepl(r.replType)} 입니다.`);
  }

  const money = [r.salesUnit, r.consUnit, r.margin];
  if (money.some((n) => !Number.isInteger(n) || n < 0)) bad.push('단가는 0 이상의 정수여야 합니다.');
  else if (r.salesUnit + r.consUnit + r.margin === 0) bad.push('받는 단가가 0 원인 케이스는 만들 수 없습니다.');
  // 기성 단계는 받는 단가(턴키)를 나눠 받는 정의라 금액이 맞을 때만 검사할 수 있다
  else bad.push(...checkSettlementSteps(r.settlementSteps, r.salesUnit + r.consUnit + r.margin));
  if (!Number.isInteger(r.bizYear) || r.bizYear < 2020 || r.bizYear > 2100) {
    bad.push('사업연도를 확인해주세요.');
  }
  return bad;
}

/* ── MECE — 원자 칸과 적용 시작 ─────────────────────────────────────────────
 * 케이스 한 행은 원자 칸(교체유형 × 수전방식 × 연수 × 건축물유형 × 채널) 여러 개를 덮는
 * 「블록」이다. MECE 는 행이 아니라 칸에서 성립해야 한다:
 *
 *   ME — 같은 운영사의 활성 케이스 두 개가 같은 칸을 같은 적용 시작으로 덮으면 중복이다.
 *        적용 시작이 다르면 개정이다 — 반년마다 단가가 바뀌고, 현장은 계약 시기의 단가를
 *        따르므로 옛 케이스도 활성인 채 남는다. 시간축까지 넣어야 「하나뿐」이 성립한다.
 *   CE — 어느 칸이 비었는지는 화면(운영사별 그리드)과 막힌 라인 목록이 보인다.
 */

/** 케이스가 덮는 원자 칸들 — 채널·교체유형·수전은 행에 하나라 연수 × 유형만 곱한다 */
export function cellsOf(r: Pick<NewPricingRule, 'replType' | 'powerType' | 'termYears' | 'bldgTypes' | 'channel'>): string[] {
  return r.termYears.flatMap((t) =>
    r.bldgTypes.map((b) => `${r.replType}|${r.powerType}|${t}|${b}|${r.channel}`)
  );
}

/**
 * 적용 시작을 견줄 수 있는 값으로 — 「2026년 1월 20일」「2026년 8월」「2026년」「2026-08-22」 전부 읽는다.
 * 글자 그대로 견주면 「10월」이 「2월」보다 앞선다. 못 읽으면 사업연도만 쓴다.
 */
export function startKey(r: Pick<NewPricingRule, 'startDate' | 'bizYear'>): string {
  const pad = (v: string | undefined) => (v ?? '0').padStart(2, '0');
  const half = /(\d{4})년\s*(상|하)반기/.exec(r.startDate);
  if (half) return `${half[1]}-${half[2] === '상' ? '01' : '07'}-00`;
  const iso = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(r.startDate.trim());
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  const m = /(\d{4})년(?:\s*(\d{1,2})월)?(?:\s*(\d{1,2})일)?/.exec(r.startDate);
  if (!m) return `${r.bizYear}-00-00`;
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
}

/*
 * ── 반기 — 매트릭스의 시간축 ──────────────────────────────────────────────
 * 운영사 단가는 반년마다 갱신되는 것이 관행이라(원본 CSV 도 상·하반기 행이었다)
 * 매트릭스를 반기 단위로 편다. 케이스의 반기는 적용 시작에서 유도한다 —
 * 월을 모르는 값(「2026년」)은 연초 적용으로 보고 상반기에 둔다.
 */

/** 케이스가 속하는 반기 — 「2026-상」 꼴. 시기 탭을 가르는 키다 */
export function halfKeyOf(r: Pick<NewPricingRule, 'startDate' | 'bizYear'>): string {
  const [y, m] = startKey(r).split('-');
  return `${y}-${Number(m) >= 7 ? '하' : '상'}`;
}

/** 반기의 끝 — 이 값보다 startKey 가 작거나 같으면 그 시기에 적용 중인 케이스다 */
export function halfEndKey(halfKey: string): string {
  const [y, h] = halfKey.split('-');
  return `${y}-${h === '상' ? '06' : '12'}-99`;
}

/** 반기 키를 사람이 읽는 이름으로 — 「2026 상반기」 */
export function halfLabel(halfKey: string): string {
  const [y, h] = halfKey.split('-');
  return `${y} ${h}반기`;
}

/**
 * 이 케이스와 겹치는 활성 케이스 — 있으면 중복이라 넣을 수 없다.
 * 같은 운영사 · 칸 교집합 · 같은 적용 시작. 시작이 다르면 개정이라 겹쳐도 된다.
 */
export function duplicateOf(
  // 새 케이스와 기존 케이스(적용 시작을 고칠 때) 둘 다 들어온다 — 겹침 판정에 쓰는 축만 받는다
  input: Pick<PricingRule, 'cpo' | 'replType' | 'powerType' | 'termYears' | 'bldgTypes' | 'channel' | 'startDate' | 'bizYear'>,
  existing: PricingRule[]
): PricingRule | null {
  const mine = new Set(cellsOf(input));
  const myStart = startKey(input);
  return (
    existing.find(
      (r) =>
        r.active &&
        r.cpo === input.cpo &&
        startKey(r) === myStart &&
        cellsOf(r).some((c) => mine.has(c))
    ) ?? null
  );
}

/**
 * 저장 전 정돈 — 값의 뜻은 그대로, 표기만 한 벌로.
 *
 * 계약연수는 오름차순이다. 화면 sort() 버그로 [10,7] 이 들어온 적이 있고, 그러면 케이스명이
 * 「10·7년」, id 가 y10-7 이 되어 같은 축인데 다른 id 인 케이스가 생긴다 — 겹침 번호(-2)
 * 장치가 그것을 못 잡는다. 건축물유형도 같은 이유로 순서를 고정한다.
 */
export function normalizePricingRule(r: NewPricingRule): NewPricingRule {
  return {
    ...r,
    caseName: r.caseName.trim(),
    startDate: r.startDate.trim(),
    note: r.note?.trim() || null,
    termYears: [...new Set(r.termYears)].sort((a, b) => a - b),
    bldgTypes: BUILDING_TYPES.filter((b) => r.bldgTypes.includes(b)),
  };
}

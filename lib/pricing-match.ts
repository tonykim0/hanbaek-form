/**
 * 계약 라인에 붙일 수 있는 단가 케이스를 고른다.
 *
 * 매트릭스는 34행이지만 한 라인에 맞는 것은 보통 한둘이다. 전부 늘어놓으면
 * 사람이 잘못 고르고, 그 순간 지급액이 통째로 틀어진다. 축으로 좁혀서 보여준다.
 *
 * ★없는 축은 조건에서 뺀다.★ 현장 정보가 덜 채워졌다고 후보가 0개가 되면 아무것도 못 고른다 —
 * 아는 축으로만 좁히고, 무엇으로 좁혔는지 화면에 적어 사람이 판단하게 한다.
 */
import { bizTypeOfRepl } from '@/types/project';
import type {
  ContractLine, CpoName, NewPricingRule, PricingRule, Project, ReplType,
} from '@/types/project';

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

/**
 * 케이스가 앞뒤 맞는가 — 저장 전에 한 번 본다.
 *
 * 화면에서도 막지만 라우트는 직접 부를 수 있다. 그리고 여기서 막는 것들은 다 「나중에
 * 어느 현장에도 안 맞는 케이스」가 되는 조합이다 — 그때는 왜 안 맞는지 알 수 없다.
 */
export function checkPricingRule(r: NewPricingRule): string[] {
  const bad: string[] = [];
  if (!r.caseName.trim()) bad.push('케이스 이름을 적어주세요.');
  if (r.termYears.length === 0) bad.push('계약연수를 하나 이상 고르세요.');
  if (r.bldgTypes.length === 0) bad.push('건축물유형을 하나 이상 고르세요.');
  // 교체유형이 사업구분을 정한다 — 두 값이 어긋나면 그 케이스는 어느 현장에도 안 맞는다
  if (bizTypeOfRepl(r.replType) !== r.bizType) {
    bad.push(`${r.replType} 는 사업구분이 ${bizTypeOfRepl(r.replType)} 입니다.`);
  }
  if (r.salesUnit < 0 || r.consUnit < 0 || r.margin < 0) bad.push('단가는 0 이상이어야 합니다.');
  if (r.salesUnit + r.consUnit + r.margin === 0) bad.push('턴키가 0 원인 케이스는 만들 수 없습니다.');
  if (r.bizYear < 2020 || r.bizYear > 2100) bad.push('사업연도를 확인해주세요.');
  return bad;
}

/**
 * 계약 라인에 붙일 수 있는 단가 케이스를 고른다.
 *
 * 매트릭스는 34행이지만 한 라인에 맞는 것은 보통 한둘이다. 전부 늘어놓으면
 * 사람이 잘못 고르고, 그 순간 지급액이 통째로 틀어진다. 축으로 좁혀서 보여준다.
 *
 * ★없는 축은 조건에서 뺀다.★ 현장 정보가 덜 채워졌다고 후보가 0개가 되면 아무것도 못 고른다 —
 * 아는 축으로만 좁히고, 무엇으로 좁혔는지 화면에 적어 사람이 판단하게 한다.
 */
import type { PricingRule, Project, ContractLine } from '@/types/project';
import { PRICING_RULES } from '@/lib/data/seed/pricing-rules';

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
  line: Pick<ContractLine, 'termYears' | 'powerType' | 'replType'>
): RuleMatch {
  /*
   * 교체유형은 라인의 값이 정본이다.
   * 자체투자 현장은 제자리교체와 신규위치가 섞이고, 그때 현장 쪽 값은 null 이다.
   * 라인에 없으면(옛 데이터) 현장 값으로 내려간다.
   */
  const replType = line.replType ?? project.replType;
  const sameCpo = PRICING_RULES.filter((r) => r.active && r.cpo === project.cpo);
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

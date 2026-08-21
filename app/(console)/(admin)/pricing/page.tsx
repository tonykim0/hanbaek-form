/**
 * 단가 케이스 — 매트릭스를 여기서 관리한다. [한백 전용]
 *
 * ★왜 화면이 필요한가★
 * 케이스는 처음에 CSV 를 옮긴 시드 파일(lib/data/seed/pricing-rules.ts)로 심었다. 그래서
 * 새 조건이 생기면 코드를 고치고 배포해야 했고, 어느 조합에 케이스가 없는지도 볼 수 없었다 —
 * 「자체투자 (제자리교체)」에 케이스가 하나도 없다는 것을 현장이 들어와 계약 확인이 막힐 때
 * 알게 된다. 그때는 왜 안 되는지 화면에 「단가 미지정」밖에 안 적혀 있다.
 *
 * 정본은 저장소다(DB). 이 화면에서 넣은 케이스가 현장 상세의 후보 목록에 그대로 나온다.
 *
 * 금액이 들어 있으므로 (admin) 그룹 아래 둔다 — 협력사에게는 서버가 렌더조차 하지 않는다.
 */
import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import PricingMatrix from '@/components/PricingMatrix';
import { matchingRules } from '@/lib/pricing-match';

export const metadata = { title: '단가 케이스 — 한백 전기차사업관리' };

export default async function PricingPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/pricing');

  const actor = actorOf(session);
  const [rules, axes, settlementRules] = await Promise.all([
    getRepository().listPricingRules(actor),
    getRepository().listLineAxes(actor),
    // 케이스마다 기성 단계를 그리는 데 쓴다 — 규칙의 정본은 저장소다(케이스와 같은 이유)
    getRepository().listSettlementRules(actor),
  ]);

  /*
   * 막힌 라인 — 아직 미지정인데 활성 케이스가 하나도 안 맞는 것.
   * 이미 지정된 라인은 세지 않는다(케이스가 나중에 중지돼도 계산은 그대로 돈다).
   * 「모든 현장에 대응한다」의 잣대가 이 목록이다 — 축 공간을 다 채우는 것이 아니라,
   * 실제로 들어온 라인이 케이스를 못 찾는 순간 여기 나타나 한 번에 채울 수 있으면 된다.
   */
  const blockedLines = axes.filter((l) => {
    if (l.pricingRuleId) return false;
    const m = matchingRules(
      { cpo: l.cpo, bizType: l.bizType, replType: l.projectReplType, bldgType: l.bldgType },
      { termYears: l.termYears, powerType: l.powerType, replType: l.lineReplType },
      rules
    );
    return m.exact.length === 0;
  });
  /*
   * 라인이 참조하는 케이스 — 화면이 「수정」과 「개정」을 가르는 데 쓴다.
   * 참조된 케이스를 고치면 소급 변경이라, 그 행은 전 값을 프리필한 개정으로만 연다.
   * 판정의 정본은 저장소다(updatePricingRule 이 다시 본다) — 여기 값은 버튼을 가를 뿐이다.
   */
  const referencedIds = [...new Set(axes.map((l) => l.pricingRuleId).filter((x): x is string => Boolean(x)))];

  return (
    <PricingMatrix
      rules={rules}
      settlementRules={settlementRules}
      blockedLines={blockedLines}
      referencedIds={referencedIds}
    />
  );
}

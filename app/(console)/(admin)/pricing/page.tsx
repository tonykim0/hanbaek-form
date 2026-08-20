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

export const metadata = { title: '단가 케이스 — 한백 전기차사업관리' };

export default async function PricingPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/pricing');

  const rules = await getRepository().listPricingRules(actorOf(session));
  return <PricingMatrix rules={rules} />;
}

import { redirect } from 'next/navigation';
import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser, viewerOf } from '@/lib/auth/session';
import PayoutWorkBoard from '@/components/settlement/PayoutWorkBoard';
import { isHanbaek } from '@/lib/roles';

export const metadata = { title: '협력사 지급관리 — 한백 전기차충전사업' };

/**
 * 협력사 지급관리 — 한백은 줄에서 지급일을 골라 확정하고, 협력사는 자기 몫을 본다.
 *
 * (admin) 그룹에서 뺐다(한백 확인) — 협력사가 이번에 받을 금액·지급시기를 묻지 않고
 * 여기서 확인한다. 협력사에게 마진·남의 몫이 안 가는 것은 저장소가 지워서 준다
 * (redactForViewer) — 화면에서 가리는 방식은 쓰지 않는다.
 */
export default async function PayoutsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/payouts');
  /*
   * 여기서 눈과 손이 갈린다.
   *   눈(isHanbaek) — 전 협력사의 줄을 보는가, 자기 몫만 보는가.
   *   손(canConfirm) — 지급일을 골라 확정할 수 있는가. 열람 전용은 못 한다.
   * 예전에는 둘 다 isAdmin 한 값이었다.
   */
  const seesAll = isHanbaek(session.role);
  const canConfirm = session.role === 'admin';

  /*
   * 한 번의 읽기로 계획과 내역을 같이 받는다(listPayoutOverview).
   *
   * 예전에는 길이 둘이었다 — 한백은 전 현장 요약을 읽고 이어서 지급 내역을 또 읽었고
   * (같은 데이터 두 번), 협력사는 현장마다 상세를 다시 읽었다(N+1). 그 화면이 실제로
   * 300초 런타임 타임아웃으로 죽었다(2026-08-21). 조립은 저장소가 하고, 협력사에게
   * 마진·기성이 안 가는 것도 저장소가 지운다 — 화면은 그릴 것만 받는다.
   */
  const [{ plans }, finals] = await Promise.all([
    getRepository().listPayoutOverview(viewerOf(session)),
    // 배치의 가확정/확정 — 지급 칸의 배지가 본다. 협력사는 자기 지급처 것만(저장소가 가른다).
    getRepository().listBatchFinals(actorOf(session)),
  ]);

  const siteCount = new Set(plans.map((r) => r.projectId)).size;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">협력사 지급관리</h1>
        <p className="mt-1.5 text-base text-slate-500">
          {seesAll ? `한백 → 협력사 · 현장 ${siteCount}건` : `받을 지급 — 현장 ${siteCount}건`}
        </p>
      </div>

      <PayoutWorkBoard rows={plans} finals={finals} canConfirm={canConfirm} />
    </>
  );
}

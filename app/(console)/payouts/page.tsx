import { redirect } from 'next/navigation';
import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { effectiveVisibility } from '@/lib/roles';
import { payoutsOfDetail, payoutsOfSummaries, type PayoutRowInput } from '@/lib/payout-board';
import PayoutWorkBoard from '@/components/settlement/PayoutWorkBoard';

export const metadata = { title: '협력사 지급관리 — 한백 전기차충전사업' };

/**
 * 협력사 지급관리 — 한백은 줄에서 지급일을 골라 확정하고, 협력사는 자기 몫을 본다.
 *
 * (admin) 그룹에서 뺐다(한백 확인) — 협력사가 이번에 받을 금액·지급시기를 묻지 않고
 * 여기서 확인한다. 다만 협력사에게 전 현장 요약(listSettlements — 마진과 남의 몫이
 * 들어 있다)을 내려보내면 화면에서 가려도 브라우저에 원본이 남으므로, 협력사 줄은
 * 자기 현장 상세(저장소가 지운 것)에서 만든다(lib/payout-board).
 */
export default async function PayoutsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/payouts');
  const isAdmin = session.role === 'admin';
  const repo = getRepository();

  let rows: PayoutRowInput[];
  if (isAdmin) {
    rows = payoutsOfSummaries(await repo.listSettlements(viewerOf(session)));
  } else {
    const mine = await repo.listProjects(viewerOf(session));
    const details = (
      await Promise.all(mine.map((p) => repo.getProject(p.id, viewerOf(session))))
    ).filter((d): d is NonNullable<typeof d> => d !== null);
    rows = details.flatMap((d) =>
      payoutsOfDetail(d, effectiveVisibility(session.role, session.org, d.project))
    );
  }

  const siteCount = new Set(rows.map((r) => r.projectId)).size;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">협력사 지급관리</h1>
        <p className="mt-1.5 text-base text-slate-500">
          {isAdmin ? `한백 → 협력사 · 현장 ${siteCount}건` : `받을 지급 — 현장 ${siteCount}건`}
        </p>
      </div>

      <PayoutWorkBoard rows={rows} canConfirm={isAdmin} />
    </>
  );
}

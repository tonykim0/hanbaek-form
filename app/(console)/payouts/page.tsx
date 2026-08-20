import { redirect } from 'next/navigation';
import { getRepository, repositoryKind } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import PayoutBoard from '@/components/settlement/PayoutBoard';

export const metadata = { title: '하도급사 지급관리 — 한백 전기차충전사업' };

/**
 * 하도급사 지급관리 — 하도급사에게 내려줄 돈.
 *
 * 운영사 기성(/receivables)과 나눈 이유는 그쪽 주석에 적었다.
 *
 * ★한백 전용★ 협력사는 자기 지급액도 이 화면으로 보지 않는다 —
 * 여기에는 남의 현장과 마진이 함께 있다. 자기 것은 현장 상세에서 본다.
 */
export default async function PayoutsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/payouts');
  if (session.role !== 'admin') redirect('/projects');

  const rows = await getRepository().listSettlements(viewerOf(session));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-[-0.03em] text-slate-900">하도급사 지급관리</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {/*
            지급 건수를 「현장 × 2」로 세지 않는다 — 받는 곳이 없는 줄은 지급이 아니다.
            아래 표와 같은 기준으로 세야 두 숫자가 어긋나지 않는다.
          */}
          한백 → 하도급사 · 현장 {rows.length}건 · 지급{' '}
          {rows.reduce((n, r) => n + (r.salesOrg ? 1 : 0) + (r.gcOrg ? 1 : 0), 0)}건
        </p>
      </div>

      <PayoutBoard rows={rows} />

      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        지급액은 계약 라인에 붙인 단가에서 나옵니다 — 손으로 적지 않습니다. 회차는 1차 70% ·
        2차 30%. 지급일 입력은 지금 현장 상세의 정산 탭에만 있습니다.
        {repositoryKind() === 'file' && ' 지금은 예시 데이터입니다 (로컬 파일 저장소).'}
      </p>
    </>
  );
}

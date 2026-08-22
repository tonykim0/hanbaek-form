import { redirect } from 'next/navigation';
import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import ReceivableBoard from '@/components/settlement/ReceivableBoard';
import { isHanbaek } from '@/lib/roles';

export const metadata = { title: '운영사 기성관리 — 한백 전기차충전사업' };

/**
 * 운영사 기성관리 — 운영사에게서 받을 돈.
 *
 * 협력사 지급(/payouts)과 화면을 나눈 이유: 방향이 다르고 축이 다르다.
 * 여기는 차수·트리거가 축이고, 저기는 상대·회차가 축이다. 한 화면에서 토글로 바꾸면
 * 두 화면 중 어디를 보고 있었는지가 주소에 안 남아서 링크로 보낼 수도, 돌아올 수도 없다.
 *
 * ★한백 전용★ 저장소가 한백이 아니면 빈 목록을 준다. 여기서도 한 번 더 막는다 —
 * 화면만 막으면 저장소를 바꿀 때 가드가 빠진다.
 *
 * 열람 전용도 본다. 넣는 칸이 아직 없는 화면이라(회수 체크·준공마감 지정) 읽기만 여는
 * 데 따로 잠글 것이 없다 — 목록을 그리는 것이 전부다.
 */
export default async function ReceivablesPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/receivables');
  if (!isHanbaek(session.role)) redirect('/projects');

  const rows = await getRepository().listSettlements(viewerOf(session));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">운영사 기성관리</h1>
        <p className="mt-1.5 text-base text-slate-500">
          운영사 → 한백 · 현장 {rows.length}건
        </p>
      </div>

      <ReceivableBoard rows={rows} />

      {/*
        * 기성은 청구해서 받는 것이 아니라 트리거가 차면 열린다 — 환경부 승인일·실착공일은
        * 현장 상세의 시공 탭에서 넣고, 준공마감일은 한백이 지정한다. 회수 체크와 준공마감일
        * 지정은 아직 없다. 이 세 문장이 화면 아래 붙어 있었는데, 넣는 자리가 여기 없다는 것은
        * 넣는 칸이 없는 것으로 이미 보인다(화면 규칙 2번).
        */}
      <p className="mt-4 text-small text-slate-400">
              </p>
    </>
  );
}

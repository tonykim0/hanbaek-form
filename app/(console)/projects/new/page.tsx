import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import IntakeForm from '@/components/IntakeForm';
import { knownOrgs } from '@/lib/orgs';
import { canWrite } from '@/lib/roles';
import { viewerOf } from '@/lib/auth/session';

export const metadata = { title: '서류 접수 — 한백 전기차사업관리' };

/**
 * 서류 접수 — 협력사가 시스템 안에서 낸다.
 *
 * 예전에는 사이드바에서 포털(hanbaek-form)로 나가는 바깥 링크였다. 로그인한 협력사를
 * 남의 사이트로 보내면 소속을 다시 적어야 하고, 낸 것이 어디로 갔는지도 알 수 없다.
 * 여기서 내면 세션의 소속으로 현장이 만들어지고 보드의 「계약접수」 칸에 바로 선다.
 *
 * 로그인 없이 쓰는 포털 접수(/intake)는 그대로 둔다 — 운영 중이고, 아직 계정이 없는
 * 협력사가 쓴다. 주소가 겹치면 Next 가 라우트를 못 고르므로 콘솔 쪽은 /projects/new 다.
 *
 * 한백도 쓴다. 원래는 협력사 전용이었는데, 계정 없는 업체의 건을 한백이 간혹 대신 받는다 —
 * 그 한 건 때문에 계정을 만들 이유가 없어서, 한백에게는 업체 이름을 적는 칸이 더 나온다.
 */
export default async function ConsoleIntakePage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/projects/new');
  // 내는 자리다 — 열람 전용에게는 낼 것이 없다(미들웨어가 먼저 걸러도 문은 여기에도 둔다)
  if (!canWrite(session.role)) redirect('/projects');
  const isAdmin = session.role === 'admin';
  // 한백이 대신 접수할 때 업체 이름을 골라 넣게 한다 — 손으로 적으면 한 글자씩 갈린다
  const orgs = isAdmin ? await knownOrgs(viewerOf(session)) : [];

  return (
    <>
      <h1 className="mb-6 text-h1 font-black text-slate-900">서류 접수</h1>

      <IntakeForm org={session.org} isAdmin={isAdmin} knownOrgs={orgs} />
    </>
  );
}

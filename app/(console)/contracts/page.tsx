import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { canWrite } from '@/lib/roles';

export const metadata = { title: '계약서 작성 — 한백 전기차사업관리시스템' };

/**
 * 계약서 작성 — 운영사별 양식으로 들어가는 자리.
 *
 * 양식 자체는 포털(app/(portal)/hec 등)에 있고 운영 중이다. 협력사·영업자가 로그인 없이
 * 쓰는 화면이라 여기로 옮기지 않는다 — 옮기면 계정 없는 협력사가 못 쓴다.
 *
 * 대신 들어가는 자리를 시스템 안에 두고 소속을 실어 보낸다. 예전처럼 사이드바에서
 * 남의 사이트로 튕기면, 협력사는 자기가 어느 시스템에 있는지 모르고 돌아올 길도 없다.
 *
 * 고를 것만 둔다 — 부제·단계 표시·아래 설명문을 걷었다(한백 지시 2026-08-25). 새 탭에서
 * 열리는 것은 눌러 보면 알고, 접수로 가는 길은 사이드바에 있다(화면 규칙 2).
 * SK 자체투자·공동주택관리정보시스템 양식은 이 목록에서 뺐다 — 양식은 포털에 그대로
 * 있다. 단지조회는 콘솔의 /apartments 가 같은 화면이다.
 */
const FORMS: Array<{ path: string; cpo: string; note: string }> = [
  { path: '/hec', cpo: '현대엔지니어링', note: '설치신청서 · 사전현장컨설팅결과서' },
  { path: '/nice', cpo: '나이스인프라', note: '설치신청서 · 사전현장컨설팅결과서' },
  { path: '/sk', cpo: 'SK일렉링크', note: '설치신청서 · 사전현장컨설팅결과서' },
  { path: '/pluglink', cpo: '플러그링크', note: '설치신청서 · 사전현장컨설팅결과서' },
];

export default async function ContractsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/contracts');
  // 만들어서 내는 자리다 — 열람 전용은 들어오지 않는다
  if (!canWrite(session.role)) redirect('/projects');

  return (
    <>
      <h1 className="mb-6 text-h1 font-black text-slate-900">계약서 작성</h1>

      <div className="grid max-w-[880px] gap-2 sm:grid-cols-2">
        {FORMS.map((f) => (
          <a
            key={f.path}
            /* 소속은 있을 때만 싣는다 — 빈 org= 를 달고 가면 양식이 빈 소속을 채운다 */
            href={session.org ? `${f.path}?org=${encodeURIComponent(session.org)}` : f.path}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-between gap-3 rounded-panel border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span className="min-w-0">
              <span className="block text-lead font-bold text-slate-900">{f.cpo}</span>
              <span className="block text-tiny text-slate-400">{f.note}</span>
            </span>
            <span aria-hidden className="shrink-0 text-brand-700">↗</span>
          </a>
        ))}
      </div>
    </>
  );
}

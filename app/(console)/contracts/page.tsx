import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';

export const metadata = { title: '계약서 작성 — 한백 전기차사업관리' };

/**
 * 계약서 작성 — 운영사별 양식으로 들어가는 자리.
 *
 * 양식 자체는 포털(app/(portal)/hec 등)에 있고 운영 중이다. 협력사·영업자가 로그인 없이
 * 쓰는 화면이라 여기로 옮기지 않는다 — 옮기면 계정 없는 협력사가 못 쓴다.
 *
 * 대신 들어가는 자리를 시스템 안에 두고 소속을 실어 보낸다. 예전처럼 사이드바에서
 * 남의 사이트로 튕기면, 협력사는 자기가 어느 시스템에 있는지 모르고 돌아올 길도 없다.
 */
const FORMS: Array<{ path: string; cpo: string; note: string }> = [
  { path: '/hec', cpo: '현대엔지니어링', note: '설치신청서 · 사전현장컨설팅결과서' },
  { path: '/nice', cpo: '나이스인프라', note: '설치신청서 · 사전현장컨설팅결과서' },
  { path: '/sk', cpo: 'SK일렉링크', note: '설치신청서 · 사전현장컨설팅결과서' },
  { path: '/pluglink', cpo: '플러그링크', note: '설치신청서 · 사전현장컨설팅결과서' },
  { path: '/sk-invest', cpo: 'SK일렉링크 (자체투자)', note: '자체투자 양식' },
  { path: '/kapt', cpo: '공동주택관리정보시스템', note: '입주자 동의 관련 양식' },
];

export default async function ContractsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/contracts');
  if (session.role === 'admin') redirect('/admin/reissue');

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-[-0.03em] text-slate-900">계약서 작성</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {session.org ?? '소속 없음'} · 운영사 양식을 골라 작성하고, 만든 서류는 접수에서 냅니다
        </p>
      </div>

      <ol className="mb-5 flex flex-wrap items-center gap-2 text-small font-bold">
        <Step n={1} label="계약서 작성" now />
        <Arrow />
        <Step n={2} label="서류 접수" href="/projects/new" />
        <Arrow />
        <Step n={3} label="계약접수 칸" href="/projects" />
      </ol>

      <div className="grid max-w-[880px] gap-2 sm:grid-cols-2">
        {FORMS.map((f) => (
          <a
            key={f.path}
            href={`${f.path}?org=${encodeURIComponent(session.org ?? '')}`}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-900">{f.cpo}</span>
              <span className="block text-tiny text-slate-400">{f.note}</span>
            </span>
            <span aria-hidden className="shrink-0 text-brand-700">↗</span>
          </a>
        ))}
      </div>

      <p className="mt-4 max-w-[880px] text-xs leading-relaxed text-slate-400">
        양식은 새 탭에서 열립니다 — 로그인 없이 쓰는 화면이라 아직 이 시스템 안으로 들어와
        있지 않습니다. 소속({session.org ?? '없음'})은 주소에 실어 보냅니다. 작성한 서류는
        내려받아 <Link href="/projects/new" className="font-bold text-brand-700 hover:underline">서류 접수</Link>
        에서 올리면 됩니다.
      </p>
    </>
  );
}

function Step({ n, label, now, href }: { n: number; label: string; now?: boolean; href?: string }) {
  const body = (
    <span
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
        now ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
      }`}
    >
      <span className={now ? 'text-brand-200' : 'text-slate-300'}>{n}</span>
      {label}
    </span>
  );
  return href ? <li><Link href={href} className="hover:opacity-80">{body}</Link></li> : <li>{body}</li>;
}

function Arrow() {
  return <li aria-hidden className="text-slate-300">›</li>;
}

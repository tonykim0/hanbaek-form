import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';

const cpos = [
  {
    name: '플러그링크',
    code: 'PL',
    href: '/pluglink',
    description: '보조금 · 자체투자',
  },
  {
    name: '현대엔지니어링',
    code: 'HEC',
    href: '/hec',
    description: '보조금 · 자체투자',
  },
  {
    name: '나이스인프라',
    code: 'NICE',
    href: '/nice',
    description: '보조금 · 자체투자',
  },
  {
    name: 'SK일렉링크',
    code: 'SK',
    href: '/sk',
    description: '보조금 · 자체투자',
  },
];

const updates = [
  {
    date: '2026. 08. 07.',
    title: '아파트 정보 조회(K-apt) 내부 기능으로 통합',
    href: '/kapt',
    isNew: true,
  },
  {
    date: '2026. 08. 05.',
    title: '운영사별 영업자료 · 시방서 자료실 신설',
    href: '/materials',
  },
  {
    date: '2026. 07. 29.',
    title: '기설치 충전기 이력 작성 및 증빙자료 제출 안내',
    href: '/notices/legacy-charger-history.html',
  },
  {
    date: '2026. 07. 28.',
    title: '현대엔지니어링 별지1(사진대지)·별지2(사전체크리스트) 추가',
    note: '2026. 08. 01.부터 적용',
  },
  {
    date: '2026. 07. 27.',
    title: '플러그링크 자체투자 계약서 추가',
  },
  {
    date: '2026. 07. 26.',
    title: '현대엔지니어링 운영서비스 계약서 업데이트',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7f8f4] text-slate-900">
      <SiteHeader active="home" />

      <main className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-6 sm:pt-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <section id="contracts" className="scroll-mt-24">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.14em] text-brand-700">CONTRACT</p>
                <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-slate-900">
                  계약서 작성
                </h2>
              </div>
              <p className="text-xs text-slate-400">운영사를 선택하세요</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {cpos.map((cpo) => (
                <Link
                  key={cpo.href}
                  href={cpo.href}
                  className="group relative min-h-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.5)] transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[0_18px_36px_-24px_rgba(49,106,64,0.55)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-brand-50 px-2 text-xs font-black text-brand-700 ring-1 ring-brand-100">
                      {cpo.code}
                    </span>
                    <span aria-hidden className="text-xl text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-600">
                      →
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold tracking-[-0.02em] text-slate-900">
                    {cpo.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{cpo.description}</p>
                </Link>
              ))}
            </div>
          </section>

          <aside className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Link
              href="/intake"
              className="group rounded-2xl bg-brand-700 p-5 text-white shadow-[0_16px_35px_-24px_rgba(34,69,45,0.9)] transition hover:bg-brand-800"
            >
              <span className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-brand-100">
                NEXT STEP
              </span>
              <h2 className="mt-5 text-xl font-black tracking-[-0.03em]">작성 완료본 접수</h2>
              <p className="mt-2 text-sm leading-5 text-brand-100">
                현장별 서류를 하나의 ZIP으로 묶어 접수합니다.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold">
                접수 시작 <span className="transition group-hover:translate-x-1">→</span>
              </span>
            </Link>

            <Link
              href="/materials"
              className="group rounded-2xl border border-slate-200 bg-[#fffdf8] p-5 transition hover:border-amber-300"
            >
              <span className="text-xs font-bold tracking-[0.12em] text-amber-700">RESOURCES</span>
              <h2 className="mt-2 text-lg font-black tracking-[-0.02em] text-slate-900">
                영업자료 · 시방서
              </h2>
              <p className="mt-2 text-sm leading-5 text-slate-500">
                운영사별 최신 자료를 검색하고 내려받으세요.
              </p>
              <span className="mt-4 inline-flex text-sm font-bold text-amber-800 group-hover:underline">
                자료실 열기 →
              </span>
            </Link>

            <Link
              href="/kapt"
              className="group rounded-2xl border border-slate-200 bg-[#f8fbff] p-5 transition hover:border-sky-300"
            >
              <span className="text-xs font-bold tracking-[0.12em] text-sky-700">LOOKUP</span>
              <h2 className="mt-2 text-lg font-black tracking-[-0.02em] text-slate-900">
                아파트 정보 조회
              </h2>
              <p className="mt-2 text-sm leading-5 text-slate-500">
                K-apt 기본정보와 전기차 충전시설을 확인하세요.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-sky-800 group-hover:underline">
                조회하러 가기 <span aria-hidden>→</span>
              </span>
            </Link>
          </aside>
        </div>

        <section className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <p className="text-[11px] font-bold tracking-[0.14em] text-amber-700">UPDATES</p>
              <h2 className="mt-0.5 text-lg font-black tracking-[-0.02em]">업데이트 안내</h2>
            </div>
            <span className="text-xs text-slate-400">최근 변경사항</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {updates.map((update) => (
              <li key={`${update.date}-${update.title}`} className="grid gap-1 px-5 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-6">
                <span className="flex items-center gap-2 text-xs tabular-nums text-slate-400">
                  {update.date}
                  {update.isNew && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                      NEW
                    </span>
                  )}
                </span>
                {update.href ? (
                  <Link
                    href={update.href}
                    target={update.href.startsWith('/notices/') ? '_blank' : undefined}
                    rel={update.href.startsWith('/notices/') ? 'noopener noreferrer' : undefined}
                    className="text-sm font-semibold leading-5 text-slate-700 hover:text-brand-700 hover:underline"
                  >
                    {update.title}
                  </Link>
                ) : (
                  <p className="text-sm font-medium leading-5 text-slate-700">{update.title}</p>
                )}
                {update.note && (
                  <span className="justify-self-start rounded-md bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 sm:justify-self-end">
                    {update.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white/50 px-6 py-7 text-center text-xs text-slate-400">
        한백 EV Infra Solutions · Internal Operations
      </footer>
    </div>
  );
}

import Link from 'next/link';

const updates = [
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-10">
      <div className="max-w-4xl w-full">
        <header className="text-left mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="한백" className="w-16 h-16 mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">한백 전기차충전사업</h1>
        </header>

        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
          <div className="order-2 md:order-1">
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                계약서 만들기
              </h2>
              <p className="text-xs text-gray-500 mb-3">CPO를 선택해주세요</p>
              <div className="flex flex-col gap-3">
                <Link
                  href="/pluglink"
                  className="block w-full bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-brand-300 transition p-4"
                >
                  <h3 className="text-lg font-semibold text-gray-900">플러그링크</h3>
                  <p className="text-sm text-gray-500 mt-1">보조금·자체투자 선택</p>
                </Link>

                <Link
                  href="/hec"
                  className="block w-full bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-brand-300 transition p-4"
                >
                  <h3 className="text-lg font-semibold text-gray-900">현대엔지니어링</h3>
                  <p className="text-sm text-gray-500 mt-1">보조금·자체투자 선택</p>
                </Link>

                <Link
                  href="/nice"
                  className="block w-full bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-brand-300 transition p-4"
                >
                  <h3 className="text-lg font-semibold text-gray-900">나이스인프라</h3>
                  <p className="text-sm text-gray-500 mt-1">보조금·자체투자 선택</p>
                </Link>

                <Link
                  href="/sk"
                  className="block w-full bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-brand-300 transition p-4"
                >
                  <h3 className="text-lg font-semibold text-gray-900">SK일렉링크</h3>
                  <p className="text-sm text-gray-500 mt-1">보조금·자체투자 선택</p>
                </Link>
              </div>
            </section>

            <div className="border-t border-gray-200 mb-8" />

            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                계약서 접수하기
              </h2>
              <Link
                href="/intake"
                className="block w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-sm hover:shadow-md transition p-4"
              >
                <h3 className="text-lg font-semibold">작성 완료한 계약서 접수</h3>
                <p className="text-sm text-brand-100 mt-1">
                  완료된 계약서 ZIP을 업로드해주세요 (영업자용)
                </p>
              </Link>
            </section>
          </div>

          <aside className="order-1 md:order-2 bg-white border border-gray-200 border-t-4 border-t-amber-400 rounded-lg shadow-sm p-5">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900 mb-4">
              <span aria-hidden>📢</span>
              업데이트 안내
            </h2>
            <ul className="flex flex-col gap-4">
              {updates.map((u, i) => (
                <li key={u.date} className="text-sm">
                  <span className="flex items-center gap-1.5 text-xs text-gray-400 tabular-nums mb-1">
                    {u.date}
                    {i === 0 && (
                      <span className="text-[10px] font-bold text-white bg-amber-500 rounded px-1 py-0.5 leading-none">
                        NEW
                      </span>
                    )}
                  </span>
                  {u.href ? (
                    <a
                      href={u.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-start gap-1 text-brand-700 font-medium leading-snug hover:underline"
                    >
                      {u.title}
                      <span aria-hidden className="text-brand-500 transition-transform group-hover:translate-x-0.5">↗</span>
                    </a>
                  ) : (
                    <p className="text-gray-700 leading-snug">{u.title}</p>
                  )}
                  {u.note && (
                    <span className="inline-block mt-1.5 text-xs text-brand-700 bg-brand-50 rounded px-1.5 py-0.5">
                      {u.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <footer className="mt-10 text-center text-xs text-gray-400">
          한백 EV Infra Solutions
        </footer>
      </div>
    </div>
  );
}

import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-10">
      <div className="max-w-2xl w-full">
        <header className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="한백" className="w-16 h-16 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">한백 계약서 자동생성</h1>
        </header>

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            계약서 만들기
          </h2>
          <p className="text-xs text-gray-500 mb-3">CPO를 선택해주세요</p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/pluglink"
              className="block w-full bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-brand-300 transition p-5"
            >
              <h3 className="text-lg font-semibold text-gray-900">플러그링크</h3>
              <p className="text-sm text-gray-500 mt-1">플러그링크 계약서류 자동생성 (보조금·자체투자 선택)</p>
            </Link>

            <Link
              href="/hec"
              className="block w-full bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-brand-300 transition p-5"
            >
              <h3 className="text-lg font-semibold text-gray-900">현대엔지니어링</h3>
              <p className="text-sm text-gray-500 mt-1">현대엔지니어링 운영서비스 계약서류 자동생성</p>
            </Link>

            <Link
              href="/nice"
              className="block w-full bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-brand-300 transition p-5"
            >
              <h3 className="text-lg font-semibold text-gray-900">나이스인프라</h3>
              <p className="text-sm text-gray-500 mt-1">나이스인프라 계약서류 자동생성</p>
            </Link>

            <Link
              href="/sk"
              className="block w-full bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-brand-300 transition p-5"
            >
              <h3 className="text-lg font-semibold text-gray-900">SK일렉링크</h3>
              <p className="text-sm text-gray-500 mt-1">SK일렉링크 계약서류 자동생성 (보조금·자체투자 선택)</p>
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
            className="block w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-sm hover:shadow-md transition p-5"
          >
            <h3 className="text-lg font-semibold">작성 완료한 계약서 접수</h3>
            <p className="text-sm text-brand-100 mt-1">
              완료된 계약서 ZIP을 업로드해주세요 (영업자용)
            </p>
          </Link>
        </section>

        <footer className="mt-10 text-center text-xs text-gray-400">
          한백 EV Infra Solutions
        </footer>
      </div>
    </div>
  );
}

import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">한백 계약서 자동생성</h1>
          <p className="text-sm text-gray-500 mt-1">CPO를 선택해주세요</p>
        </header>

        <div className="space-y-4">
          <Link
            href="/pluglink"
            className="block w-full bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-blue-300 transition p-5"
          >
            <h2 className="text-lg font-semibold text-gray-900">플러그링크</h2>
            <p className="text-sm text-gray-500 mt-1">플러그링크 계약서류 자동생성</p>
          </Link>

          <Link
            href="/hec"
            className="block w-full bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-blue-300 transition p-5"
          >
            <h2 className="text-lg font-semibold text-gray-900">현대엔지니어링</h2>
            <p className="text-sm text-gray-500 mt-1">현대엔지니어링 운영서비스 계약서류 자동생성</p>
          </Link>
        </div>

        <footer className="mt-8 text-center text-xs text-gray-400">
          한백 EV Infra Solutions
        </footer>
      </div>
    </div>
  );
}

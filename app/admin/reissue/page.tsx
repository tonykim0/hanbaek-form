import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import SiteHeader from '@/components/SiteHeader';
import { internalModeHref } from '@/lib/internal-mode';

export const metadata: Metadata = {
  title: '서류 재발행 (담당자) | 한백 전기차충전사업',
  robots: { index: false, follow: false },
};

/**
 * 담당자 전용 진입점 — 헤더 메뉴에 넣지 않고 이 주소를 아는 사람만 씁니다.
 * (자료실 관리 /admin/materials 와 같은 방식)
 *
 * 계약서 작성 페이지 자체는 협력사·영업자와 공용이라 그대로 두고,
 * 여기서 들어갈 때만 판독·재발행 도구가 붙은 상태로 엽니다.
 */

const CPOS: Array<{ path: string; name: string; note: string }> = [
  { path: '/hec', name: '현대엔지니어링', note: '사진대지 · 사전 체크리스트 포함 가능' },
  { path: '/nice', name: '나이스인프라', note: '별지7호 1장' },
  { path: '/sk', name: 'SK일렉링크', note: '별지7호 1장' },
  { path: '/pluglink', name: '플러그링크', note: '별지7호 1장' },
];

export default function ReissuePage() {
  return (
    <div className="min-h-screen bg-[#f7f8f4]">
      <SiteHeader active="contracts" />
      <main className="max-w-3xl mx-auto px-5 py-8 sm:px-6 sm:py-10">
        <header className="mb-6">
          <Link
            href="/#contracts"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-700 transition mb-3"
          >
            <span aria-hidden>←</span> 계약서 작성으로
          </Link>
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="한백" width={40} height={40} className="flex-none" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">서류 재발행 (담당자)</h1>
              <p className="text-sm text-gray-500 mt-1">
                협력사 스캔본 판독 · 사전현장컨설팅결과서 단독 출력
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-5 mb-5">
          <h2 className="text-base font-semibold text-gray-900 mb-2">쓰는 순서</h2>
          <ol className="list-decimal ml-5 space-y-1.5 text-sm text-gray-700">
            <li>아래에서 운영사를 골라 엽니다.</li>
            <li>
              상단 「협력사 서류로 자동 채우기」에 협력사가 보내온 계약서류 스캔 PDF를
              올리고 <b>판독해서 폼 채우기</b>를 누릅니다.
            </li>
            <li>
              「서류에서 발견된 문제」 · 「판독이 불확실한 항목」 · 「비어 있는 필수 항목」을
              원본과 대조해 고칩니다.
            </li>
            <li>
              <b>계약서 생성 및 다운로드</b>(전체 · 신양식) 또는{' '}
              <b>컨설팅결과서만</b>으로 뽑습니다.
            </li>
          </ol>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-5">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/60">
            <h2 className="text-base font-semibold text-gray-900">운영사 선택</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {CPOS.map((cpo) => (
              <li key={cpo.path}>
                <Link
                  href={internalModeHref(cpo.path)}
                  className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-brand-50/60 transition"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900">
                      {cpo.name}
                    </span>
                    <span className="block text-xs text-gray-500">{cpo.note}</span>
                  </span>
                  <span aria-hidden className="flex-none text-brand-700">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold mb-1">알아두실 점</p>
          <ul className="list-disc ml-4 space-y-1">
            <li>
              판독·재발행 도구는 주소에 <code className="bg-amber-100 rounded px-1">?import=1</code>{' '}
              이 붙었을 때만 나타납니다. 협력사·영업자가 쓰는 <b>계약서 작성 페이지에는
              보이지 않습니다.</b>
            </li>
            <li>
              접근 차단이 아니라 화면 분리입니다 — 주소를 아는 사람은 열 수 있습니다.
              판독은 AI 호출 비용이 드니 링크를 외부에 공유하지 마세요.
            </li>
            <li>판독값은 참고용입니다. 생성 전에 반드시 원본과 대조하세요.</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

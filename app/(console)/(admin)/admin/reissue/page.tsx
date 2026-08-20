import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
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
  { path: '/hec', name: '현대엔지니어링', note: '설치신청서 + 컨설팅결과서 자동 재발행' },
  { path: '/nice', name: '나이스인프라', note: '설치신청서 + 컨설팅결과서 자동 재발행' },
  { path: '/sk', name: 'SK일렉링크', note: '설치신청서 + 컨설팅결과서 자동 재발행' },
  { path: '/pluglink', name: '플러그링크', note: '설치신청서 + 컨설팅결과서 자동 재발행' },
];

export default function ReissuePage() {
  return (
    <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <Link
            href="/#contracts"
            className="inline-flex items-center gap-1 text-base text-slate-500 hover:text-brand-700 transition mb-3"
          >
            <span aria-hidden>←</span> 계약서 작성으로
          </Link>
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="한백" width={40} height={40} className="flex-none" />
            <div>
              <h1 className="text-h1 font-black text-slate-900">서류 재발행 (담당자)</h1>
              <p className="text-base text-slate-500 mt-1">
                기존 설치신청서·사전현장컨설팅결과서를 최신 양식으로 자동 변환
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-panel border border-slate-200 bg-white shadow-sm p-4 sm:p-5 mb-5">
          <h2 className="text-base font-semibold text-slate-900 mb-2">쓰는 순서</h2>
          <ol className="list-decimal ml-5 space-y-1.5 text-base text-slate-700">
            <li>아래에서 운영사를 골라 엽니다.</li>
            <li>기존 별지5호 설치신청서 PDF와 별지7호 결과서 PDF를 각각 넣습니다.</li>
            <li><b>두 문서 판독 후 최신 DOCX 다운로드</b>를 누릅니다.</li>
            <li>자동 다운로드된 2페이지 DOCX와 화면의 판독 확인사항을 원본과 대조합니다.</li>
          </ol>
        </section>

        <section className="rounded-panel border border-slate-200 bg-white shadow-sm overflow-hidden mb-5">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/60">
            <h2 className="text-base font-semibold text-slate-900">운영사 선택</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {CPOS.map((cpo) => (
              <li key={cpo.path}>
                <Link
                  href={internalModeHref(cpo.path)}
                  className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-brand-50/60 transition"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-slate-900">
                      {cpo.name}
                    </span>
                    <span className="block text-small text-slate-500">{cpo.note}</span>
                  </span>
                  <span aria-hidden className="flex-none text-brand-700">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="rounded-box border border-amber-200 bg-amber-50 px-4 py-3 text-small text-amber-900">
          <p className="font-semibold mb-1">알아두실 점</p>
          <ul className="list-disc ml-4 space-y-1">
            <li>
              판독·재발행 도구는 주소에 <code className="bg-amber-100 rounded-tag px-1">?import=1</code>{' '}
              이 붙었을 때만 나타납니다. 협력사·영업자가 쓰는 <b>계약서 작성 페이지에는
              보이지 않습니다.</b>
            </li>
            <li>
              접근 차단이 아니라 화면 분리입니다 — 주소를 아는 사람은 열 수 있습니다.
              판독은 AI 호출 비용이 드니 링크를 외부에 공유하지 마세요.
            </li>
            <li>판독값은 참고용입니다. 생성된 DOCX를 반드시 원본과 대조하세요.</li>
          </ul>
        </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { internalModeHref } from '@/lib/internal-mode';

export const metadata: Metadata = {
  title: '서류 재발행 | 한백 전기차충전사업',
  robots: { index: false, follow: false },
};

/**
 * 재발행 진입점 — 헤더 메뉴에 넣지 않고 이 주소를 아는 사람만 씁니다.
 * (자료실 관리 /admin/materials 와 같은 방식)
 *
 * 계약서 작성 페이지 자체는 협력사·영업자와 공용이라 그대로 두고,
 * 여기서 들어갈 때만 판독·재발행 도구가 붙은 상태로 엽니다.
 *
 * 화면은 왼쪽으로 붙입니다 (한백 지시 2026-08-26) — 설명 문구도 두지 않습니다
 * (화면 규칙 2번: 규칙은 문장이 아니라 동작으로 보이게 만든다).
 */

const CPOS: Array<{ path: string; name: string }> = [
  { path: '/hec', name: '현대엔지니어링' },
  { path: '/nice', name: '나이스인프라' },
  { path: '/sk', name: 'SK일렉링크' },
  { path: '/pluglink', name: '플러그링크' },
];

export default function ReissuePage() {
  return (
    <div className="max-w-3xl">
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
            <h1 className="text-h1 font-black text-slate-900">서류 재발행</h1>
            <p className="text-base text-slate-500 mt-1">
              설치신청서·사전현장컨설팅결과서를 각각 최신 양식으로 변환
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-panel border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/60">
          <h2 className="text-base font-semibold text-slate-900">운영사 선택</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {CPOS.map((cpo) => (
            <li key={cpo.path}>
              <Link
                href={internalModeHref(cpo.path)}
                className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-brand-50/60 transition"
              >
                <span className="text-base font-semibold text-slate-900">{cpo.name}</span>
                <span aria-hidden className="flex-none text-brand-700">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

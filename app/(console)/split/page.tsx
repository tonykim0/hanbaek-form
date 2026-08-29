import type { Metadata } from 'next';
import PdfSorter from '@/components/PdfSorter';

export const metadata: Metadata = {
  title: 'PDF 분류·분할 | 한백 전기차충전사업',
  robots: { index: false, follow: false },
};

/**
 * PDF 분류·분할 — 스캔 묶음 하나를 서류 종류별로 갈라 받는다.
 *
 * 스캐너가 계약서류를 통째로 한 PDF 로 뱉는데, 그것을 종류별로 가르는 일을 손으로 하고
 * 있었다(한백 2026-08-29). 접수 ZIP 이 이미 같은 판독을 하고 있어서, 그 길을 그대로 쓰고
 * 끝만 바꿨다 — 현장에 붙이는 대신 사람이 받아 간다.
 *
 * 한백도 협력사도 쓴다. 열람 전용은 못 들어간다(middleware) — 부를 때마다 판독 비용이
 * 나가는 일이라 보기만 하는 계정에는 열지 않는다.
 */
export default function SplitPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-h2 font-black tracking-[-0.02em] text-slate-900">PDF 분류·분할</h1>
      <PdfSorter />
    </div>
  );
}

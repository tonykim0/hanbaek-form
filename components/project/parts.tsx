'use client';

/**
 * 계약 탭과 기설치 구역이 같이 쓰는 조각.
 *
 * 서류 한 칸의 상태(docState)가 두 곳에 나온다 — 서류 목록과 기설치 증빙이다.
 * 같은 서류를 두 곳에서 다른 색으로 보여주면 어느 쪽이 맞는지 물어야 한다.
 */
import type { ProjectDocument } from '@/types/project';
import type { DocReq } from '@/lib/doc-rules';

/**
 * 머리말의 사실 한 칸 — 라벨 위, 값 아래 (2026-08-27).
 *
 * 라벨과 값을 옆으로 붙여 두면 칸 너비가 값 길이를 따라가서, 아무리 격자에 넣어도 열이
 * 안 맞는다. 그래서 사실 아홉 개가 줄이 접힐 때마다 다른 자리로 가고, 「운영사가 어디
 * 적혀 있더라」를 매번 다시 찾아야 했다. 세로로 쌓으면 값이 한 열에 서서 눈이 자리를
 * 기억한다 — 머리말의 모든 사실이 같은 격자(FACT_GRID)를 쓴다.
 */
export function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-tiny font-bold tracking-[0.04em] text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-keep font-bold text-slate-800">{value}</dd>
    </div>
  );
}

export function docState(doc: ProjectDocument | undefined, req: DocReq) {
  if (req === 'o') return { label: '해당없음', tone: 'text-slate-400' };
  if (!doc || doc.status === 'none') {
    return req === 'm'
      ? { label: '미제출', tone: 'text-red-700' }
      : { label: '미제출', tone: 'text-slate-400' };
  }
  if (doc.status === 'rejected') return { label: '반려', tone: 'text-red-700' };
  // 제출된 것은 통과로 본다 — 반려하지 않는 한 계약 완료를 막지 않는다
  if (doc.status === 'uploaded') return { label: '제출됨', tone: 'text-brand-700' };
  return { label: '확인함', tone: 'text-brand-700' };
}

/**
 * 서류 카드의 바탕 — ★색을 채우는 것은 「돌려보낸 것」과 「끝난 것」뿐★
 * (한백 지시 2026-09-04 「반려 사유 UXUI 를 일원화하고 개선」).
 *
 * 그전에는 ★미제출 필수 칸이 붉은 배경★이었다. 필수 서류가 다 찬 현장이 154 중 21곳
 * 뿐이라(2026-08-31 실측) 화면이 온통 빨간 카드였고, 정작 사람이 지금 손대야 하는
 * 반려(주황) 한두 칸이 그 사이에 묻혔다. 안 온 것은 소리치지 않는다 — 테두리와 상태
 * 글자로 말하고(docState 가 빨강으로 적는다), 개수는 제목 옆 「필수 N/M」이 센다.
 *
 * 반려가 주황인 이유는 화면 규칙 12 다: 빨강 배경은 되돌릴 수 없는 것을 확정할 때만이고,
 * 반려는 되돌릴 수 있으며 사람이 봐야 하는 것이다.
 */
export function docCardTone(doc: ProjectDocument | undefined, req: DocReq): string {
  if (doc?.status === 'rejected') return 'border-amber-300 bg-amber-50';
  if (doc?.blobUrl || doc?.status === 'uploaded' || doc?.status === 'approved') {
    return 'border-brand-200 bg-brand-50';
  }
  if (req === 'm') return 'border-red-200 bg-white';
  return 'border-dashed border-slate-200 bg-white';
}

/**
 * 반려 사유 — ★어디에 적히든 한 모양이다★ (한백 지시 2026-09-04).
 *
 * 세 자리가 제각각이었다: 계약 서류 카드는 흰 바탕, 기설치 카드는 red-50 바탕,
 * 구역 위 띠는 목록의 한 줄. 같은 문장이 자리마다 다른 옷을 입으면 같은 것인지
 * 물어야 한다. 카드 바탕이 주황이라 사유는 흰 바탕으로 띄운다(붉은 바탕은 묻힌다).
 */
export function RejectReason({ children }: { children: string }) {
  return (
    <p className="mt-2 rounded-ctl bg-white px-2 py-1.5 text-tiny leading-snug text-red-800">
      {children}
    </p>
  );
}

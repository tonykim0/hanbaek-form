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

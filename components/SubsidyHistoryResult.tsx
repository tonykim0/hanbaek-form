'use client';

/**
 * 「EV 보조금 신청이력(2017~2024)」 조회 결과 카드.
 *
 * 기관충전소 결과와 나란히, 그러나 따로 보여줍니다 — 두 자료의 출처 · 시점이
 * 달라 한쪽에만 있는 현장이 흔하기 때문입니다.
 */

import {
  regionText,
  type LookupResult,
} from '@/lib/charger-history';
import {
  summarizeSubsidy,
  type SubsidyMeta,
  type SubsidyRecord,
  type SubsidySummary,
} from '@/lib/subsidy-history';

function ApplyTable({ summary }: { summary: SubsidySummary }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] font-bold tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-bold">사업연도</th>
            <th className="py-2 pr-3 font-bold">대기번호</th>
            <th className="py-2 pr-3 font-bold">신청대수</th>
            <th className="py-2 pr-3 font-bold">충전기유형</th>
            <th className="py-2 pr-3 font-bold">공사완료</th>
            <th className="py-2 font-bold">최초지급서류</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {summary.rows.map(([year, waitNo, qty, type, doneAt, paidAt], i) => (
            <tr key={`${year}-${waitNo}-${i}`}>
              <td className="py-2 pr-3 tabular-nums text-slate-700">{year}</td>
              <td className="py-2 pr-3 tabular-nums text-slate-600">{waitNo || '—'}</td>
              <td className="py-2 pr-3 tabular-nums font-semibold text-slate-900">
                {qty}
                <span className="ml-0.5 text-[11px] font-medium text-slate-400">기</span>
              </td>
              <td className="py-2 pr-3 text-slate-600">{type || '—'}</td>
              <td className="py-2 pr-3 tabular-nums text-slate-600">{doneAt || '—'}</td>
              <td className="py-2 tabular-nums text-slate-600">{paidAt || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Matched({
  result,
}: {
  result: Extract<LookupResult<SubsidyRecord>, { status: '매칭' }>;
}) {
  const { record } = result;
  const summary = summarizeSubsidy(record);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="bg-amber-50 px-5 py-4">
        <p className="text-[11px] font-bold tracking-[0.14em] text-amber-700">보조금 신청이력</p>
        <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-amber-900">
          보조금 신청 기록이 있습니다 — {summary.years.join(', ')}년 {summary.count}건 ·{' '}
          {summary.units.toLocaleString('ko-KR')}기
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {record.nm.length > 0 ? record.nm.join(' · ') : '(신청자명 없음)'}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {record.ad} · {regionText(result.regionKey)}
        </p>
      </div>

      <dl className="grid gap-3 border-t border-slate-100 px-5 py-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-bold tracking-wide text-slate-500">사업연도</dt>
          <dd className="mt-1 font-semibold tabular-nums text-slate-900">
            {summary.years.join(', ')}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold tracking-wide text-slate-500">공사완료</dt>
          <dd className="mt-1 font-semibold tabular-nums text-slate-900">
            {summary.completed}/{summary.count}건
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold tracking-wide text-slate-500">충전기유형</dt>
          <dd className="mt-1 text-slate-900">
            {summary.types.map((t) => `${t.name} ${t.qty}기`).join(' · ') || '—'}
          </dd>
        </div>
      </dl>

      <div className="border-t border-slate-100 px-5 py-4">
        <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-500">신청 이력</p>
        <ApplyTable summary={summary} />
      </div>

      {result.by !== '도로명' && (
        <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          {result.by === '지번'
            ? '도로명으로는 기록이 없어 지번으로 찾은 결과입니다 — 신청자명이 맞는지 확인해주세요.'
            : '원본의 시군구 표기가 달라 보정해 찾은 결과입니다 — 신청자명이 맞는지 확인해주세요.'}
        </p>
      )}
      {result.otherRegions.length > 0 && (
        <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          같은 도로명 · 번호가 {result.otherRegions.map(regionText).join(', ')}에도 있습니다.
        </p>
      )}
    </div>
  );
}

function Empty({
  result,
}: {
  result: Extract<LookupResult<SubsidyRecord>, { status: '무매칭' | '시군구불일치' }>;
}) {
  const isMismatch = result.status === '시군구불일치';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-[11px] font-bold tracking-[0.14em] text-slate-500">보조금 신청이력</p>
      <h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-900">
        {isMismatch
          ? '입력한 시 · 군에는 신청 기록이 없습니다'
          : '보조금 신청 기록이 없습니다'}
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {isMismatch
          ? `같은 도로명 · 번호가 ${result.candidates
              .map(regionText)
              .join(', ')}에 있습니다. 주소의 시 · 군을 다시 확인해주세요.`
          : '2017~2024년 보조금 신청 명부에 이 주소가 없습니다.'}
      </p>
    </div>
  );
}

export default function SubsidyHistoryResult({
  result,
  meta,
}: {
  result: LookupResult<SubsidyRecord> | null;
  meta: SubsidyMeta;
}) {
  if (!result) return null;

  return (
    <div className="flex flex-col gap-2">
      {result.status === '매칭' ? <Matched result={result} /> : <Empty result={result} />}
      <p className="px-1 text-xs leading-5 text-slate-400">
        보조금 신청이력 {meta.years} · 신청 {meta.rows.toLocaleString('ko-KR')}건 ·{' '}
        {meta.units.toLocaleString('ko-KR')}기 · {meta.addresses.toLocaleString('ko-KR')}개 주소.
        위 기관충전소 자료와는 별개의 명부라 한쪽에만 있는 현장이 있습니다.
      </p>
    </div>
  );
}

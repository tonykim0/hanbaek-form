'use client';

/**
 * 「EV 보조금 신청이력(2017~2024)」 조회 결과 카드.
 *
 * 이 카드는 보조금 명부(DB2) 값만 다룹니다. DB1(기관충전소) 값은 절대 섞지 않습니다
 * — 두 DB 는 출처 · 시점이 달라 섞으면 어느 자료의 숫자인지 읽히지 않습니다.
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

/**
 * 이 DB 의 신청대수 합계 (A).
 * B(현재 등록 완속)는 DB1 값이므로 여기에 두지 않습니다 — 두 DB 는 섞지 않습니다.
 */
function AppliedStat({ applied }: { applied: number }) {
  return (
    <div className="border-t border-slate-100 p-4">
      <div
        className={`rounded-xl border p-3 ${
          applied > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
        }`}
      >
        <p className="text-[11px] font-semibold text-slate-500">보조금 이력 합계 (A)</p>
        <p
          className={`mt-1 text-2xl font-black tabular-nums tracking-[-0.03em] ${
            applied > 0 ? 'text-amber-800' : 'text-slate-900'
          }`}
        >
          {applied.toLocaleString('ko-KR')}
          <span className="ml-0.5 text-xs font-bold text-slate-400">기</span>
        </p>
      </div>
    </div>
  );
}

/**
 * 신청 이력 — 한 건을 한 줄로.
 *   2021년 · 대기번호 4384 · 1기 · 완속충전기 · 공사완료 2021-11-16
 */
function ApplyList({ summary }: { summary: SubsidySummary }) {
  return (
    <ul className="space-y-1 text-sm text-slate-700">
      {summary.rows.map(([year, waitNo, qty, type, doneAt, paidAt], i) => (
        <li key={`${year}-${waitNo}-${i}`} className="tabular-nums">
          <span className="font-semibold text-slate-900">{year}년</span>
          {' · 대기번호 '}
          {waitNo || '—'}
          {' · '}
          <span className="font-semibold text-slate-900">{qty}기</span>
          {type ? ` · ${type}` : ''}
          {doneAt ? ` · 공사완료 ${doneAt}` : ''}
          {paidAt ? (
            <span className="text-slate-400">{` · 최초지급서류 ${paidAt}`}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Matched({ result }: { result: Extract<LookupResult<SubsidyRecord>, { status: '매칭' }> }) {
  const { record } = result;
  const summary = summarizeSubsidy(record);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="bg-amber-50 px-5 py-4">
        <p className="text-[11px] font-bold tracking-[0.14em] text-amber-700">DB2 조회 결과</p>
        <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-amber-900">
          보조금 신청 기록이 있습니다 — {summary.years.join(', ')}년 {summary.count}건 ·{' '}
          {summary.units.toLocaleString('ko-KR')}기
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {record.nm.length > 0 ? record.nm.join(' · ') : '(신청자명 없음)'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          <span className="font-bold text-slate-600">찾은 주소</span>
          {' — '}
          {record.ad} · {regionText(result.regionKey)}
        </p>
      </div>

      <AppliedStat applied={summary.units} />

      <div className="border-t border-slate-100 px-5 py-4">
        <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-500">신청 이력</p>
        <ApplyList summary={summary} />
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
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
     <div className="p-5">
      <p className="text-[11px] font-bold tracking-[0.14em] text-slate-500">DB2 조회 결과</p>
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
          : 'DB2 에 이 주소의 보조금 신청 기록이 없습니다.'}
      </p>
      {result.parsed && (
        <p className="mt-3 text-xs text-slate-400">
          조회한 키 — {result.parsed.sido || '(시·도 미상)'} {result.parsed.sgg} ·{' '}
          {result.parsed.road} {result.parsed.num}
        </p>
      )}
      </div>
      <AppliedStat applied={0} />
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
        {meta.years} · 신청 {meta.rows.toLocaleString('ko-KR')}건 ·{' '}
        {meta.units.toLocaleString('ko-KR')}기 · {meta.addresses.toLocaleString('ko-KR')}개 주소.
        원본을 그대로 집계한 값입니다.
      </p>
    </div>
  );
}

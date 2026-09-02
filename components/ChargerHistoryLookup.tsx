'use client';
import { FIELD } from '@/components/ui';

import { useCallback, useRef, useState } from 'react';
import { useAddressSearch } from '@/components/contracts/AddressSearchButton';
import SubsidyHistoryResult from '@/components/SubsidyHistoryResult';
import {
  DATA_BASE,
  lookupChargerHistory,
  regionText,
  summarize,
  SUBSIDY_CODE,
  VERDICT_TEXT,
  type IndexMeta,
  type LookupResult,
  type Shard,
  type SiteRecord,
  type Summary,
} from '@/lib/charger-history';
import {
  lookupSubsidyHistory,
  SUBSIDY_DATA_BASE,
  type SubsidyMeta,
  type SubsidyRecord,
} from '@/lib/subsidy-history';

/* --------------------------------------------------------------- 샤드 읽기 */

/** 샤드 JSON 을 내려받아 화면에 캐시해 둡니다 (같은 샤드 재요청 방지) — 기설치 조사(PreInstall)도 쓴다 */
export function useShardLoader<R>(base: string) {
  const cache = useRef(new Map<string, Promise<Shard<R>>>());

  return useCallback(
    async (shard: string): Promise<Shard<R>> => {
      const hit = cache.current.get(shard);
      if (hit) return hit;
      const promise = fetch(`${base}/${shard}.json`).then((res) => {
        if (!res.ok) throw new Error(`조회 데이터를 불러오지 못했습니다 (${res.status})`);
        return res.json() as Promise<Shard<R>>;
      });
      cache.current.set(shard, promise);
      promise.catch(() => cache.current.delete(shard));
      return promise;
    },
    [base]
  );
}

/* ------------------------------------------------------------------ 조각들 */

/**
 * 어느 DB 에서 나온 결과인지 밝히는 구역 제목.
 * 두 DB 는 같은 성격의 보조금 이력 자료라 이름을 따로 붙이지 않고 번호로만 가릅니다.
 */
function SourceHeading({ tag, className }: { tag: string; className: string }) {
  return (
    <div className="px-1 pt-1">
      <span className={`rounded px-1.5 py-0.5 text-micro font-black tracking-wide ${className}`}>
        {tag}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  unit = '기',
  tone = 'plain',
}: {
  label: string;
  value: number;
  unit?: string;
  tone?: 'plain' | 'warn';
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-tiny font-semibold text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-black tabular-nums tracking-[-0.03em] ${
          tone === 'warn' ? 'text-amber-800' : 'text-slate-900'
        }`}
      >
        {value.toLocaleString('ko-KR')}
        <span className="ml-0.5 text-xs font-bold text-slate-400">{unit}</span>
      </p>
    </div>
  );
}

/**
 * 보조금 신청번호 「2022-595」 → 사업연도 2022 · 대기번호 595.
 * 형식이 다르면 쪼개지 않고 원본 그대로 대기번호 칸에 둡니다.
 */
function splitApplyNo(applyNo: string): { year: string; no: string } {
  const m = /^(\d{4})-(\d+)$/.exec(applyNo.trim());
  return m ? { year: m[1], no: m[2] } : { year: '', no: applyNo.trim() };
}

function HistoryTable({ summary }: { summary: Summary }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-tiny font-bold tracking-wide text-slate-500">
            <th className="whitespace-nowrap py-2 pr-3 font-bold">설치시기</th>
            <th className="whitespace-nowrap py-2 pr-3 text-right font-bold">대수</th>
            <th className="whitespace-nowrap py-2 pr-3 font-bold">구분</th>
            <th className="whitespace-nowrap py-2 pr-3 font-bold">사업연도</th>
            <th className="whitespace-nowrap py-2 pr-3 font-bold">대기번호</th>
            <th className="whitespace-nowrap py-2 font-bold">운영기관</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {summary.rows.map(([year, month, qty, code, applyNo, operator, fast], i) => {
            const apply = splitApplyNo(applyNo);
            return (
            <tr key={`${year}-${month}-${code}-${applyNo}-${operator}-${i}`}>
              <td className="py-2 pr-3 tabular-nums text-slate-700">
                {year}
                {month ? `. ${month}` : ''}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums font-semibold text-slate-900">
                {qty}
                <span className="ml-1 text-tiny font-medium text-slate-400">
                  {fast ? '급속' : '완속'}
                </span>
              </td>
              <td className="py-2 pr-3">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-tiny font-semibold ${
                    code === 'N' || code === 'U'
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {SUBSIDY_CODE[code] ?? code}
                </span>
              </td>
              <td className="py-2 pr-3 tabular-nums font-semibold text-slate-700">
                {apply.year ? `${apply.year}년` : '—'}
              </td>
              <td className="py-2 pr-3 tabular-nums text-slate-600">{apply.no || '—'}</td>
              <td className="py-2 text-slate-600">{operator || '—'}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchedResult({ result }: { result: Extract<LookupResult, { status: '매칭' }> }) {
  const { record } = result;
  const summary = summarize(record);
  const verdict = VERDICT_TEXT[summary.verdict];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div
        className={`px-5 py-4 ${
          verdict.tone === 'warn' ? 'bg-amber-50' : 'bg-brand-50'
        }`}
      >
        <p
          className={`text-tiny font-bold tracking-[0.14em] ${
            verdict.tone === 'warn' ? 'text-amber-700' : 'text-brand-700'
          }`}
        >
          DB1 조회 결과
        </p>
        <h2
          className={`mt-1 text-xl font-black tracking-[-0.03em] ${
            verdict.tone === 'warn' ? 'text-amber-900' : 'text-brand-800'
          }`}
        >
          {verdict.label}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {record.nm.length > 0 ? record.nm.join(' · ') : '(충전소명 없음)'}
          {record.kd && <span className="text-slate-400"> · {record.kd}</span>}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {record.ad} · {regionText(result.regionKey)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-4 sm:grid-cols-4">
        <Stat label="현재 등록 완속 (B)" value={summary.slow} />
        <Stat label="현재 등록 급속" value={summary.fast} />
        <Stat
          label="보조금 설치"
          value={summary.subsidized}
          tone={summary.subsidized > 0 ? 'warn' : 'plain'}
        />
        <Stat label="자부담 설치" value={summary.ownFunded} />
      </div>

      <dl className="grid gap-3 border-t border-slate-100 px-5 py-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-tiny font-bold tracking-wide text-slate-500">보조금 사업연도</dt>
          <dd className="mt-1 font-semibold tabular-nums text-slate-900">
            {summary.applyYears.length > 0 ? summary.applyYears.join(', ') : '없음'}
          </dd>
        </div>
        <div>
          <dt className="text-tiny font-bold tracking-wide text-slate-500">운영기관</dt>
          <dd className="mt-1 text-slate-900">
            {summary.operators.map((o) => `${o.name}(${o.qty})`).join(' · ') || '—'}
          </dd>
        </div>
      </dl>

      <div className="border-t border-slate-100 px-5 py-4">
        <p className="mb-2 text-tiny font-bold tracking-wide text-slate-500">설치 이력</p>
        <HistoryTable summary={summary} />
      </div>

      {result.by !== '도로명' && (
        <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          {result.by === '지번'
            ? '도로명으로는 기록이 없어 지번으로 찾은 결과입니다 — 현장명이 맞는지 확인해주세요.'
            : '원본의 시군구 표기가 달라 보정해 찾은 결과입니다 — 현장명이 맞는지 확인해주세요.'}
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

function EmptyResult({
  result,
}: {
  result: Extract<LookupResult, { status: '무매칭' | '시군구불일치' }>;
}) {
  const isMismatch = result.status === '시군구불일치';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-tiny font-bold tracking-[0.14em] text-brand-700">DB1 조회 결과</p>
      <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-slate-900">
        {isMismatch ? '입력한 시 · 군에는 기록이 없습니다' : '등록된 충전기 기록이 없습니다'}
      </h2>
      {isMismatch ? (
        <p className="mt-2 text-sm leading-6 text-slate-600">
          같은 도로명 · 번호가 {result.candidates.map(regionText).join(', ')}에 있습니다. 주소의
          시 · 군을 다시 확인해주세요.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-slate-600">
          이 주소에는 등록된 충전기도, 보조금 이력도 없습니다. 신규 현장이거나 원본의 주소 표기가
          다를 수 있으니 현장명으로도 한 번 확인해주세요.
        </p>
      )}
      {result.parsed && (
        <p className="mt-3 text-xs text-slate-400">
          조회한 키 — {result.parsed.sido || '(시·도 미상)'} {result.parsed.sgg} ·{' '}
          {result.parsed.road} {result.parsed.num}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- 본체 */

export default function ChargerHistoryLookup({
  meta,
  subsidyMeta,
}: {
  meta: IndexMeta;
  subsidyMeta: SubsidyMeta;
}) {
  const loadCharger = useShardLoader<SiteRecord>(DATA_BASE);
  const loadSubsidy = useShardLoader<SubsidyRecord>(SUBSIDY_DATA_BASE);
  const [road, setRoad] = useState('');
  const [jibun, setJibun] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [subsidy, setSubsidy] = useState<LookupResult<SubsidyRecord> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (input: { road: string; jibun: string }) => {
      setBusy(true);
      setError(null);
      setResult(null);
      setSubsidy(null);
      try {
        // 두 자료는 별개라 나란히 조회합니다 (한쪽에만 있는 현장이 흔합니다)
        const [charger, subsidyResult] = await Promise.all([
          lookupChargerHistory(input, loadCharger),
          lookupSubsidyHistory(input, loadSubsidy),
        ]);
        setResult(charger);
        setSubsidy(subsidyResult);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [loadCharger, loadSubsidy]
  );

  const { open, loading, error: searchError } = useAddressSearch((address, data) => {
    setRoad(address);
    const picked = data?.jibunAddress || data?.autoJibunAddress || '';
    setJibun(picked);
    void run({ road: address, jibun: picked });
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <label htmlFor="charger-history-address" className="text-sm font-bold text-slate-900">
          현장 주소
        </label>
        <p className="mt-1 text-xs text-slate-500">
          주소를 검색해 고르면 바로 조회합니다. 직접 입력할 때는 도로명주소로 적어주세요.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            id="charger-history-address"
            value={road}
            onChange={(e) => setRoad(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && road.trim()) {
                e.preventDefault();
                void run({ road, jibun });
              }
            }}
            placeholder="예) 광주광역시 광산구 비아로 23"
            className={`${FIELD} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={open}
            disabled={loading}
            className="flex-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
          >
            {loading ? '여는 중…' : '주소 검색'}
          </button>
          <button
            type="button"
            onClick={() => void run({ road, jibun })}
            disabled={busy || !road.trim()}
            className="flex-none rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800 disabled:opacity-40"
          >
            {busy ? '조회 중…' : '이력 조회'}
          </button>
        </div>

        {jibun && (
          <p className="mt-2 text-xs text-slate-400">지번주소 {jibun}</p>
        )}
        {(error || searchError) && (
          <p className="mt-2 text-sm font-semibold text-red-600">{error ?? searchError}</p>
        )}
      </div>

      {result && (
        <section className="flex flex-col gap-2">
          <SourceHeading tag="DB1" className="bg-sky-100 text-sky-800" />
          {result.status === '매칭' ? (
            <MatchedResult result={result} />
          ) : (
            <EmptyResult result={result} />
          )}
          <p className="px-1 text-xs leading-5 text-slate-400">
            기준일 {meta.asOf} · 충전기 {meta.rows.toLocaleString('ko-KR')}기 ·{' '}
            {meta.addresses.toLocaleString('ko-KR')}개 주소. 원본을 그대로 집계한 값이므로, 원본에
            등록되지 않은 설치분은 나오지 않습니다.
          </p>
        </section>
      )}

      {subsidy && (
        <section className="flex flex-col gap-2">
          <SourceHeading tag="DB2" className="bg-amber-100 text-amber-800" />
          <SubsidyHistoryResult result={subsidy} meta={subsidyMeta} />
        </section>
      )}
    </div>
  );
}

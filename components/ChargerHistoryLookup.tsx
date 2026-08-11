'use client';

import { useCallback, useRef, useState } from 'react';
import { useAddressSearch } from '@/components/contracts/AddressSearchButton';
import HistoryComparison from '@/components/HistoryComparison';
import {
  DATA_BASE,
  lookupChargerHistory,
  type IndexMeta,
  type LookupResult,
  type Shard,
  type SiteRecord,
} from '@/lib/charger-history';
import {
  lookupSubsidyHistory,
  SUBSIDY_DATA_BASE,
  type SubsidyMeta,
  type SubsidyRecord,
} from '@/lib/subsidy-history';

/* --------------------------------------------------------------- 샤드 읽기 */

/** 샤드 JSON 을 내려받아 화면에 캐시해 둡니다 (같은 샤드 재요청 방지) */
function useShardLoader<R>(base: string) {
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
  const [result, setResult] = useState<{
    charger: LookupResult;
    subsidy: LookupResult<SubsidyRecord>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (input: { road: string; jibun: string }) => {
      setBusy(true);
      setError(null);
      setResult(null);
      try {
        // 두 자료를 나란히 조회한 뒤 한 표에서 맞대 봅니다
        const [charger, subsidy] = await Promise.all([
          lookupChargerHistory(input, loadCharger),
          lookupSubsidyHistory(input, loadSubsidy),
        ]);
        setResult({ charger, subsidy });
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
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm placeholder:text-slate-300 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200"
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

        {jibun && <p className="mt-2 text-xs text-slate-400">지번주소 {jibun}</p>}
        {(error || searchError) && (
          <p className="mt-2 text-sm font-semibold text-red-600">{error ?? searchError}</p>
        )}
      </div>

      {result && (
        <HistoryComparison
          charger={result.charger}
          subsidy={result.subsidy}
          meta={meta}
          subsidyMeta={subsidyMeta}
        />
      )}
    </div>
  );
}

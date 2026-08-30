'use client';

import { FormEvent, useState } from 'react';
import type { ApartmentCandidate, ApartmentDetail } from '@/lib/kapt-types';

type Props = {
  initialCandidates?: ApartmentCandidate[];
  initialDetail?: ApartmentDetail | null;
};

const EMPTY_CANDIDATES: ApartmentCandidate[] = [];

export default function KaptApartmentExplorer({
  initialCandidates = EMPTY_CANDIDATES,
  initialDetail = null,
}: Props) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState(initialCandidates);
  const [detail, setDetail] = useState<ApartmentDetail | null>(initialDetail);
  const [searching, setSearching] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [notice, setNotice] = useState(
    '아파트명, 법정동 또는 도로명주소로 검색할 수 있습니다.',
  );

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();

    if (normalized.length < 2) {
      setNotice('검색어를 두 글자 이상 입력해주세요.');
      return;
    }

    setSearching(true);
    setDetail(null);

    try {
      const response = await fetch(`/api/kapt/search?q=${encodeURIComponent(normalized)}`);
      const payload = (await response.json()) as {
        candidates?: ApartmentCandidate[];
        notice?: string;
      };

      setCandidates(payload.candidates ?? []);
      setNotice(payload.notice ?? '검색 결과에서 단지를 선택해주세요.');
    } catch {
      setCandidates([]);
      setNotice('검색 중 문제가 생겼습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSearching(false);
    }
  }

  async function selectCandidate(candidate: ApartmentCandidate) {
    setLoadingDetail(true);

    try {
      const response = await fetch(`/api/kapt/${encodeURIComponent(candidate.kaptCode)}`);
      const payload = (await response.json()) as ApartmentDetail & { notice?: string };

      if (!response.ok || !payload.complex) throw new Error(payload.notice);

      setDetail(payload);
      setNotice(payload.notice ?? '단지 정보를 불러왔습니다.');
    } catch {
      setDetail(null);
      setNotice('단지 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
      <header className="mb-6">
        <h1 className="text-2xl font-black tracking-[-0.03em] text-slate-900">아파트 정보 조회</h1>
        <p className="mt-1 text-sm text-slate-400">K-apt 기본정보 · 전기차 시설정보</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_32px_-28px_rgba(15,23,42,0.55)] sm:p-6">
        <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">단지 찾기</h2>

        <form onSubmit={search} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <label className="sr-only" htmlFor="kapt-apartment-query">
            아파트명 또는 주소
          </label>
          <input
            id="kapt-apartment-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 래미안원베일리, 반포동, 반포대로 333"
            autoComplete="off"
            className="h-12 min-w-0 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={searching}
            className="h-12 rounded-xl bg-brand-700 px-5 text-sm font-bold text-white transition hover:bg-brand-800 disabled:cursor-wait disabled:bg-slate-400"
          >
            {searching ? '검색 중...' : '검색'}
          </button>
        </form>

        <p className="mt-3 flex items-center gap-2 text-xs leading-5 text-slate-500" role="status">
          <span
            aria-hidden
            className="grid h-5 w-5 flex-none place-items-center rounded-full bg-brand-50 font-serif font-bold text-brand-700"
          >
            i
          </span>
          {notice}
        </p>
      </section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-black text-slate-900">검색 후보</h2>
            <p className="mt-1 text-xs text-slate-400">{candidates.length}개 단지</p>
          </div>

          <div className="flex max-h-72 gap-1 overflow-auto p-2 lg:block lg:max-h-[44rem]">
            {candidates.map((candidate) => {
              const selected = candidate.kaptCode === detail?.complex.kaptCode;

              return (
                <button
                  type="button"
                  key={candidate.kaptCode}
                  onClick={() => selectCandidate(candidate)}
                  className={`min-w-60 rounded-xl border p-3 text-left transition lg:block lg:w-full lg:min-w-0 ${
                    selected
                      ? 'border-brand-200 bg-brand-50'
                      : 'border-transparent bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <b className="truncate text-sm text-slate-900">{candidate.name}</b>
                    {selected && (
                      <em className="flex-none rounded bg-brand-700 px-1.5 py-0.5 text-[9px] font-black not-italic text-white">
                        선택됨
                      </em>
                    )}
                  </span>
                  <span className="mt-1.5 block truncate text-tiny leading-4 text-slate-500">
                    {candidate.roadAddress || candidate.address}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1 text-micro text-slate-500">
                    {candidate.region && <span className="rounded bg-white px-1.5 py-1">{candidate.region}</span>}
                    {candidate.households !== null && (
                      <span className="rounded bg-white px-1.5 py-1">
                        {candidate.households.toLocaleString('ko-KR')}세대
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

            {!candidates.length && (
              <div className="flex min-h-44 min-w-full flex-col items-center justify-center px-5 text-center">
                <b className="text-sm text-slate-700">단지를 검색해주세요.</b>
                <span className="mt-2 text-tiny leading-5 text-slate-500">
                  단지명, 법정동 또는 도로명주소를 두 글자 이상 입력할 수 있습니다.
                </span>
              </div>
            )}
          </div>
        </section>

        {detail ? (
          <section
            className={`min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white transition ${
              loadingDetail ? 'opacity-50' : ''
            }`}
            aria-busy={loadingDetail}
          >
            <div className="px-5 py-5 sm:px-6">
              <span className="inline-flex rounded-md bg-brand-50 px-2 py-1 text-micro font-black tracking-wide text-brand-700">
                K-apt 공개정보
              </span>
              <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-900">
                {detail.complex.name}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {detail.complex.roadAddress || detail.complex.address}
              </p>
            </div>

            <div className="space-y-5 border-t border-slate-200 bg-slate-50/70 p-4 sm:p-6">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-4 sm:px-5">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-slate-800 text-sm font-black text-white shadow-sm">
                    1
                  </span>
                  <div>
                    <h3 className="text-base font-black tracking-[-0.02em] text-slate-900">
                      우리단지 기본정보
                    </h3>
                    <p className="mt-0.5 text-tiny text-slate-500">
                      주소, 규모, 건축 및 관리 기본사항
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
                  {detail.basicInfo.map((information) => {
                    const wide =
                      information.label.includes('주소') || information.label.includes('시행사');

                    return (
                      <div
                        key={information.label}
                        className={`min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3.5 ${
                          wide ? 'sm:col-span-2' : ''
                        }`}
                      >
                        <dt className="text-tiny font-semibold text-slate-500">
                          {information.label}
                        </dt>
                        <dd className="mt-1.5 break-words text-sm font-black leading-5 text-slate-900">
                          {information.value}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>

              <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-brand-100 bg-brand-50 px-4 py-4 sm:px-5">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand-700 text-sm font-black text-white shadow-sm">
                    2
                  </span>
                  <div>
                    <h3 className="text-base font-black tracking-[-0.02em] text-slate-900">
                      전기차 시설정보
                    </h3>
                    <p className="mt-0.5 text-tiny text-slate-500">
                      전기차 주차면, 이용시간과 충전기 설치 상세
                    </p>
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {detail.electricVehicle.overview.map((information) => (
                      <div
                        key={information.label}
                        className="min-w-0 rounded-xl border border-brand-100 bg-[#fbfefc] px-4 py-3.5"
                      >
                        <dt className="text-tiny font-semibold leading-4 text-slate-500">
                          {information.label}
                        </dt>
                        <dd className="mt-1.5 break-words text-sm font-black leading-5 text-slate-900">
                          {information.value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mb-3 mt-6 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">충전기 상세</h4>
                      <p className="mt-0.5 text-micro text-slate-500">
                        위치와 충전 방식, 운영사업자 정보
                      </p>
                    </div>
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-micro font-bold text-brand-700">
                      {detail.electricVehicle.chargers.length}개 설치 유형
                    </span>
                  </div>

                  {detail.electricVehicle.chargers.length ? (
                    <>
                      <div className="grid gap-3 md:hidden">
                        {detail.electricVehicle.chargers.map((charger) => (
                          <article key={charger.id} className="rounded-xl border border-slate-200 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-black text-slate-900">
                                  {charger.location} · {charger.installationType}
                                </p>
                                <p className="mt-1 text-tiny leading-4 text-slate-500">
                                  {charger.chargerType}
                                </p>
                              </div>
                              <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-black text-brand-700">
                                {charger.count === null
                                  ? '-'
                                  : `${charger.count.toLocaleString('ko-KR')}대`}
                              </span>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-tiny">
                              <div>
                                <dt className="text-slate-400">충전속도</dt>
                                <dd className="mt-1 font-bold text-slate-700">{charger.speed}</dd>
                              </div>
                              <div>
                                <dt className="text-slate-400">충전사업자</dt>
                                <dd className="mt-1 font-bold text-slate-700">{charger.operator}</dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="text-slate-400">연락처</dt>
                                <dd className="mt-1 font-bold text-slate-700">{charger.operatorPhone}</dd>
                              </div>
                            </dl>
                          </article>
                        ))}
                      </div>

                      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
                        <table className="w-full min-w-[46rem] border-collapse text-tiny">
                          <thead>
                            <tr className="bg-slate-50 text-left text-slate-500">
                              <th className="whitespace-nowrap px-3 py-3 font-bold">구분</th>
                              <th className="whitespace-nowrap px-3 py-3 font-bold">설치유형</th>
                              <th className="whitespace-nowrap px-3 py-3 font-bold">충전기타입</th>
                              <th className="whitespace-nowrap px-3 py-3 font-bold">충전속도</th>
                              <th className="whitespace-nowrap px-3 py-3 font-bold">설치대수</th>
                              <th className="whitespace-nowrap px-3 py-3 font-bold">충전사업자</th>
                              <th className="whitespace-nowrap px-3 py-3 font-bold">연락처</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.electricVehicle.chargers.map((charger) => (
                              <tr key={charger.id} className="border-t border-slate-100 text-slate-700">
                                <td className="px-3 py-3">{charger.location}</td>
                                <td className="px-3 py-3">{charger.installationType}</td>
                                <td className="px-3 py-3">{charger.chargerType}</td>
                                <td className="px-3 py-3">{charger.speed}</td>
                                <td className="whitespace-nowrap px-3 py-3 font-black text-brand-700">
                                  {charger.count === null
                                    ? '-'
                                    : `${charger.count.toLocaleString('ko-KR')}대`}
                                </td>
                                <td className="px-3 py-3">{charger.operator}</td>
                                <td className="px-3 py-3">{charger.operatorPhone}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 px-5 py-7 text-center text-xs text-slate-500">
                      K-apt에 등록된 충전기별 상세정보가 없습니다.
                    </div>
                  )}
                </div>
              </section>
            </div>

            <p className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-micro leading-5 text-slate-400 sm:px-6">
              출처: K-apt 공동주택관리정보시스템 공개 단지정보 · 단지코드{' '}
              {detail.complex.kaptCode}
            </p>
          </section>
        ) : (
          <section
            className={`flex min-h-96 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-center transition ${
              loadingDetail ? 'opacity-50' : ''
            }`}
            aria-busy={loadingDetail}
          >
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-base font-black text-brand-700">
              EV
            </span>
            <h2 className="mt-4 text-base font-black text-slate-700">
              {loadingDetail ? '단지 정보를 불러오는 중입니다' : '검색 결과에서 단지를 선택해주세요'}
            </h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              우리단지 기본정보와 전기차 시설정보가 한 화면에 표시됩니다.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

'use client';

/**
 * 조회 결과 — 두 DB 를 한 표에서 맞대 보여줍니다.
 *
 *   DB1 = 기관충전소  (등록 현황 스냅샷)
 *   DB2 = 보조금 명부 (2017~2024 신청)
 *
 * 어느 값이 어느 DB 에서 온 것인지 헷갈리지 않도록, 화면 어디에서나 같은 이름과
 * 같은 색을 씁니다 — DB1 은 파랑, DB2 는 주황.
 *
 * 두 DB 는 「보조금신청번호 ↔ 사업연도+대기번호」로 이어지므로 한 건씩 맞대고,
 * 이어지지 않은 행은 지우지 않고 어느 쪽에만 있는지 표시합니다.
 */

import {
  regionText,
  summarize,
  SUBSIDY_CODE,
  type IndexMeta,
  type LookupResult,
  type SiteRecord,
} from '@/lib/charger-history';
import { mergeHistories, readVerdict, type MergedRow } from '@/lib/history-merge';
import {
  summarizeSubsidy,
  type SubsidyMeta,
  type SubsidyRecord,
} from '@/lib/subsidy-history';

/* ------------------------------------------------------------------ 공통 표기 */

const DB1 = {
  tag: 'DB1',
  name: '기관충전소',
  role: '등록 현황',
  chip: 'bg-sky-100 text-sky-800',
  text: 'text-sky-700',
} as const;

const DB2 = {
  tag: 'DB2',
  name: '보조금 명부',
  role: '보조금 신청',
  chip: 'bg-amber-100 text-amber-800',
  text: 'text-amber-700',
} as const;

function Tag({ db }: { db: typeof DB1 | typeof DB2 }) {
  return (
    <span className={`rounded px-1 py-0.5 text-[10px] font-black tracking-wide ${db.chip}`}>
      {db.tag}
    </span>
  );
}

function Legend({ meta, subsidyMeta }: { meta: IndexMeta; subsidyMeta: SubsidyMeta }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {[
        { db: DB1, detail: `${meta.asOf} 스냅샷 · ${meta.rows.toLocaleString('ko-KR')}기` },
        {
          db: DB2,
          detail: `${subsidyMeta.years}년 · ${subsidyMeta.rows.toLocaleString('ko-KR')}건`,
        },
      ].map(({ db, detail }) => (
        <div key={db.tag} className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2">
          <Tag db={db} />
          <span className="text-xs font-bold text-slate-800">{db.name}</span>
          <span className="text-[11px] text-slate-500">
            {db.role} · {detail}
          </span>
        </div>
      ))}
    </div>
  );
}

function Stat({
  db,
  label,
  value,
  tone = 'plain',
}: {
  db: typeof DB1 | typeof DB2;
  label: string;
  value: number;
  tone?: 'plain' | 'warn';
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
        <Tag db={db} />
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-black tabular-nums tracking-[-0.03em] ${
          tone === 'warn' ? 'text-amber-800' : 'text-slate-900'
        }`}
      >
        {value.toLocaleString('ko-KR')}
        <span className="ml-0.5 text-xs font-bold text-slate-400">기</span>
      </p>
    </div>
  );
}

const STATUS_STYLE: Record<MergedRow['status'], { label: string; className: string }> = {
  일치: { label: 'DB1·DB2 일치', className: 'bg-emerald-50 text-emerald-700' },
  대수차이: { label: '대수 차이', className: 'bg-red-100 text-red-700' },
  DB2만: { label: 'DB2에만 있음', className: DB2.chip },
  DB1만: { label: 'DB1에만 있음', className: DB1.chip },
};

/** 이어지지 않은 행에 붙는 사유 — 확정이 아니라 가능성으로 적습니다 */
function reasonOf(row: MergedRow, lastListedYear: number): string {
  if (row.status === 'DB1만') {
    if (row.no && Number(row.year) > lastListedYear) return `DB2 수록 범위(~${lastListedYear}) 밖`;
    if (!row.no) return '보조금 신청번호 없음 — 자부담 가능성';
    return 'DB2 명부에 해당 대기번호 없음';
  }
  if (row.status === 'DB2만') {
    if (!row.doneAt) return '공사완료일 없음 — 미시공 가능성';
    return 'DB1 등록 미확인 — 철거 · 미등록 가능성';
  }
  return '';
}

function MergedTable({ rows, lastListedYear }: { rows: MergedRow[]; lastListedYear: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] font-bold tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-bold">신청연도 · 대기번호</th>
            <th className={`py-2 pr-3 font-bold ${DB2.text}`}>DB2 신청</th>
            <th className={`py-2 pr-3 font-bold ${DB1.text}`}>DB1 등록</th>
            <th className="py-2 pr-3 font-bold">유형</th>
            <th className="py-2 pr-3 font-bold">공사완료 · 설치</th>
            <th className="py-2 font-bold">대조</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => {
            const reason = reasonOf(row, lastListedYear);
            return (
              <tr key={`${row.year}-${row.no}-${row.status}-${i}`}>
                <td className="py-2 pr-3 tabular-nums text-slate-700">
                  {row.year}
                  {row.no ? ` · ${row.no}` : ''}
                </td>
                <td className="py-2 pr-3 tabular-nums font-semibold text-slate-900">
                  {row.applied === null ? <span className="text-slate-300">없음</span> : `${row.applied}기`}
                </td>
                <td className="py-2 pr-3 tabular-nums font-semibold text-slate-900">
                  {row.registered === null ? (
                    <span className="text-slate-300">없음</span>
                  ) : (
                    <>
                      {row.registered}기
                      <span className="ml-1 text-[11px] font-medium text-slate-400">
                        {row.fast ? '급속' : '완속'}
                      </span>
                    </>
                  )}
                </td>
                <td className="py-2 pr-3 text-slate-600">{row.kind || '—'}</td>
                <td className="py-2 pr-3 tabular-nums text-slate-600">
                  {row.doneAt || '—'}
                  {row.installed && (
                    <span className="ml-1 text-[11px] text-slate-400">DB1 {row.installed}</span>
                  )}
                </td>
                <td className="py-2">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                      STATUS_STYLE[row.status].className
                    }`}
                  >
                    {STATUS_STYLE[row.status].label}
                  </span>
                  {reason && <span className="ml-1.5 text-[11px] text-slate-400">{reason}</span>}
                  {row.operators && (
                    <span className="ml-1.5 text-[11px] text-slate-400">{row.operators}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 원본 그대로 — 이어 붙이기 전 각 DB 를 확인하고 싶을 때 */
function RawTables({
  charger,
  subsidy,
}: {
  charger: SiteRecord | null;
  subsidy: SubsidyRecord | null;
}) {
  const chargerSummary = charger ? summarize(charger) : null;
  const subsidySummary = subsidy ? summarizeSubsidy(subsidy) : null;

  return (
    <details className="border-t border-slate-100 px-5 py-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-500">
        각 DB 원본 그대로 보기
      </summary>

      <div className="mt-3 space-y-4 text-sm">
        <div>
          <p className="mb-1 flex items-center gap-1 text-[11px] font-bold tracking-wide text-slate-500">
            <Tag db={DB1} /> {DB1.name} {charger?.kd ? `· ${charger.kd}` : ''}
          </p>
          {chargerSummary ? (
            <ul className="space-y-0.5 text-slate-600">
              {chargerSummary.rows.map(([year, month, qty, code, applyNo, operator, fast], i) => (
                <li key={`c-${year}-${month}-${applyNo}-${i}`} className="tabular-nums">
                  {year}
                  {month ? `. ${month}` : ''} · {qty}기 {fast ? '급속' : '완속'} ·{' '}
                  {SUBSIDY_CODE[code] ?? code} · 신청번호 {applyNo || '—'} · {operator || '—'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400">기록 없음</p>
          )}
        </div>

        <div>
          <p className="mb-1 flex items-center gap-1 text-[11px] font-bold tracking-wide text-slate-500">
            <Tag db={DB2} /> {DB2.name}
          </p>
          {subsidySummary ? (
            <ul className="space-y-0.5 text-slate-600">
              {subsidySummary.rows.map(([year, waitNo, qty, type, doneAt, paidAt], i) => (
                <li key={`s-${year}-${waitNo}-${i}`} className="tabular-nums">
                  {year}년 · 대기번호 {waitNo || '—'} · {qty}기 · {type || '유형 미상'} · 공사완료{' '}
                  {doneAt || '미기재'} · 최초지급서류 {paidAt || '미기재'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400">기록 없음</p>
          )}
        </div>
      </div>
    </details>
  );
}

export default function HistoryComparison({
  charger,
  subsidy,
  meta,
  subsidyMeta,
}: {
  charger: LookupResult;
  subsidy: LookupResult<SubsidyRecord>;
  meta: IndexMeta;
  subsidyMeta: SubsidyMeta;
}) {
  const chargerRecord = charger.status === '매칭' ? charger.record : null;
  const subsidyRecord = subsidy.status === '매칭' ? subsidy.record : null;

  const lastListedYear = Number(subsidyMeta.years.split('~').pop());
  const merged = mergeHistories(chargerRecord, subsidyRecord, lastListedYear);
  const verdict = readVerdict(merged);

  const names = [...new Set([...(chargerRecord?.nm ?? []), ...(subsidyRecord?.nm ?? [])])];
  const address = chargerRecord?.ad ?? subsidyRecord?.ad ?? '';
  const region =
    charger.status === '매칭'
      ? regionText(charger.regionKey)
      : subsidy.status === '매칭'
        ? regionText(subsidy.regionKey)
        : '';
  const by = charger.status === '매칭' ? charger.by : subsidy.status === '매칭' ? subsidy.by : null;
  const candidates =
    charger.status === '시군구불일치'
      ? charger.candidates
      : subsidy.status === '시군구불일치'
        ? subsidy.candidates
        : [];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={`px-5 py-4 ${verdict.tone === 'warn' ? 'bg-amber-50' : 'bg-brand-50'}`}>
        <p
          className={`text-[11px] font-bold tracking-[0.14em] ${
            verdict.tone === 'warn' ? 'text-amber-700' : 'text-brand-700'
          }`}
        >
          조회 결과
        </p>
        <h2
          className={`mt-1 text-lg font-black leading-7 tracking-[-0.03em] ${
            verdict.tone === 'warn' ? 'text-amber-900' : 'text-brand-800'
          }`}
        >
          {verdict.text}
        </h2>
        {(names.length > 0 || address) && (
          <>
            <p className="mt-2 text-sm text-slate-600">
              {names.length > 0 ? names.join(' · ') : '(현장명 없음)'}
              {chargerRecord?.kd && <span className="text-slate-400"> · {chargerRecord.kd}</span>}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {address}
              {region && ` · ${region}`}
            </p>
          </>
        )}
        <div className="mt-3">
          <Legend meta={meta} subsidyMeta={subsidyMeta} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-4 sm:grid-cols-4">
        <Stat db={DB1} label="등록 완속" value={merged.slow} />
        <Stat db={DB1} label="등록 급속" value={merged.fast} />
        <Stat
          db={DB1}
          label="보조금 표기"
          value={merged.registeredSubsidized}
          tone={merged.registeredSubsidized > 0 ? 'warn' : 'plain'}
        />
        <Stat
          db={DB2}
          label="보조금 신청"
          value={merged.applied}
          tone={merged.applied > 0 ? 'warn' : 'plain'}
        />
      </div>

      {merged.rows.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-500">
            건별 대조 — 보조금 신청번호(DB1) ↔ 사업연도 · 대기번호(DB2)
          </p>
          <MergedTable rows={merged.rows} lastListedYear={lastListedYear} />
          <p className="mt-2 text-[11px] leading-5 text-slate-400">
            이어지지 않은 건은 지우지 않고 어느 DB 에만 있는지 표시합니다. 대조는 같은 주소 안에서만
            하므로 다른 현장의 번호가 붙지는 않습니다.
          </p>
        </div>
      )}

      {!chargerRecord && !subsidyRecord && charger.parsed && (
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
          조회한 키 — {charger.parsed.sido || '(시·도 미상)'} {charger.parsed.sgg} ·{' '}
          {charger.parsed.road} {charger.parsed.num}
        </p>
      )}

      {candidates.length > 0 && (
        <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          같은 도로명 · 번호가 {candidates.map(regionText).join(', ')}에 있습니다. 주소의 시 · 군을
          다시 확인해주세요.
        </p>
      )}
      {by && by !== '도로명' && (
        <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          {by === '지번'
            ? '도로명으로는 기록이 없어 지번으로 찾은 결과입니다 — 현장명이 맞는지 확인해주세요.'
            : '원본의 시군구 표기가 달라 보정해 찾은 결과입니다 — 현장명이 맞는지 확인해주세요.'}
        </p>
      )}

      {(chargerRecord || subsidyRecord) && (
        <RawTables charger={chargerRecord} subsidy={subsidyRecord} />
      )}

      <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] leading-5 text-slate-500">
        DB1 기관충전소 {meta.asOf} 스냅샷 · DB2 보조금 명부 {subsidyMeta.years}년. 두 DB 는 출처 ·
        시점이 달라 한쪽에만 있는 현장이 있습니다.
      </p>
    </div>
  );
}

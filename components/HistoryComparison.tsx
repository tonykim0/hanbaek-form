'use client';

/**
 * 두 자료를 맞대 본 요약 — 조회 결과에서 실제로 판단에 쓰는 화면.
 *
 *   A = 보조금 이력 합계  (보조금 신청이력 2017~2024)
 *   B = 현재 등록 완속    (기관충전소 스냅샷)
 *
 * A 와 B 가 어긋나면 철거 · 교체 · 미등록 · 자부담 설치 중 하나이므로, 그 차이를
 * 문장으로 풀어 줍니다. 상세 표는 아래 카드에서 따로 봅니다.
 */

import {
  summarize,
  type IndexMeta,
  type LookupResult,
  type SiteRecord,
} from '@/lib/charger-history';
import {
  summarizeSubsidy,
  type SubsidyMeta,
  type SubsidyRecord,
} from '@/lib/subsidy-history';

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'warn' | 'plain';
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p
        className={`text-2xl font-black tabular-nums tracking-[-0.03em] ${
          tone === 'warn' ? 'text-amber-800' : 'text-slate-900'
        }`}
      >
        {value.toLocaleString('ko-KR')}
        <span className="ml-0.5 text-xs font-bold text-slate-400">기</span>
      </p>
      <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{label}</p>
    </div>
  );
}

/** A(보조금) 와 B(등록 완속) 의 차이를 읽어 줍니다 */
function readVerdict(a: number, b: number): { text: string; tone: 'warn' | 'ok' } {
  if (a === 0 && b === 0) {
    return {
      text: '두 자료 모두 기록이 없습니다. 신규 현장으로 보이나, 원본에 주소 표기가 다를 수 있으니 현장명으로도 확인해주세요.',
      tone: 'ok',
    };
  }
  if (a === 0) {
    return {
      text: '보조금 이력 없이 등록된 충전기만 있습니다. 자부담 설치분으로 보입니다.',
      tone: 'ok',
    };
  }
  if (b === 0) {
    return {
      text: '보조금 이력은 있으나 현재 등록된 완속 충전기가 없습니다. 철거되었거나 등록이 누락된 것일 수 있으니 현장을 확인하세요.',
      tone: 'warn',
    };
  }
  if (a === b) {
    return {
      text: '보조금 이력과 현재 등록 충전기 수가 일치합니다. 철거 · 교체 없이 보조사업 설치분만 있는 것으로 보입니다.',
      tone: 'warn',
    };
  }
  if (a < b) {
    return {
      text: `등록 충전기가 보조금 이력보다 ${b - a}기 많습니다. 자부담 설치분이 섞여 있는 것으로 보입니다.`,
      tone: 'warn',
    };
  }
  return {
    text: `보조금 이력이 등록 충전기보다 ${a - b}기 많습니다. 일부가 철거 · 교체되었거나 등록이 누락된 것일 수 있으니 현장을 확인하세요.`,
    tone: 'warn',
  };
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
  const chargerRecord: SiteRecord | null = charger.status === '매칭' ? charger.record : null;
  const subsidyRecord: SubsidyRecord | null = subsidy.status === '매칭' ? subsidy.record : null;

  const chargerSummary = chargerRecord ? summarize(chargerRecord) : null;
  const subsidySummary = subsidyRecord ? summarizeSubsidy(subsidyRecord) : null;

  const a = subsidySummary?.units ?? 0;
  const b = chargerSummary?.slow ?? 0;
  const verdict = readVerdict(a, b);

  // 보조금 명부의 마지막 연도 다음부터 올해까지 — 아직 공개되지 않은 구간
  const lastYear = Number(subsidyMeta.years.split('~').pop());
  const missingYears: number[] = [];
  if (Number.isFinite(lastYear)) {
    for (let y = lastYear + 1; y <= new Date().getFullYear(); y += 1) missingYears.push(y);
  }

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
        {missingYears.length > 0 && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs leading-5 text-amber-800">
            ⚠️ {missingYears.join('·')}년 보조금 이력은 아직 공개되지 않았습니다. 최근 설치분은
            조회에 나타나지 않으니 보조사업 설치 여부를 직접 확인해 주세요.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-4">
        <Stat label="보조금 이력 합계 (A)" value={a} tone={a > 0 ? 'warn' : 'plain'} />
        <Stat label="현재 등록 완속 (B)" value={b} tone="plain" />
      </div>

      {subsidySummary && (
        <ul className="border-t border-slate-100 px-5 py-3 text-sm text-slate-700">
          {subsidySummary.rows.map(([year, waitNo, qty, type, doneAt], i) => (
            <li key={`${year}-${waitNo}-${i}`} className="py-0.5 tabular-nums">
              {year}년 · 대기번호 {waitNo || '—'} · {qty}기 · {type || '유형 미상'}
              {doneAt ? ` · 공사완료 ${doneAt}` : ' · 공사완료 미기재'}
            </li>
          ))}
        </ul>
      )}

      {chargerSummary && chargerSummary.operators.length > 0 && (
        <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
          운영기관: {chargerSummary.operators.map((o) => `${o.name}(${o.qty})`).join(' · ')}
        </p>
      )}

      <p
        className={`border-t px-5 py-4 text-sm leading-6 ${
          verdict.tone === 'warn'
            ? 'border-amber-100 bg-amber-50/60 font-semibold text-amber-900'
            : 'border-slate-100 text-slate-700'
        }`}
      >
        {verdict.text}
      </p>

      <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] text-slate-500">
        기준: 등록 충전기 {meta.asOf} 스냅샷 · 보조금 이력 {subsidyMeta.years}년
      </p>
    </div>
  );
}

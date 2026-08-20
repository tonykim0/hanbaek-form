'use client';

/**
 * 단가 케이스 관리. [한백 전용]
 *
 * 세 구역이다.
 *   1) 빈 자리 — 운영사 × 교체유형 중 케이스가 0건인 칸. 이게 이 화면의 이유다.
 *   2) 케이스 — 등록된 것 전부. 중지·되살리기가 여기 있다.
 *   3) 새 케이스 — 넣는 자리.
 *
 * ★고치는 자리를 만들지 않는다.★
 * 케이스는 불변이다 — 계약 라인이 금액을 복사하지 않고 이 케이스를 참조하므로, 금액을 고치면
 * 이미 지정된 현장의 지급액이 소급해서 바뀐다. 반년마다 단가가 바뀌는 것은 「고침」이 아니라
 * 「새 케이스」다. 그래서 옛 것을 중지하고 새로 넣는다.
 *
 * 지우는 자리도 없다. 이미 참조하는 라인이 있으면 지급액을 계산할 수 없게 된다 —
 * 중지하면 새로 붙일 수는 없고, 이미 붙은 것은 그대로 계산된다.
 */
import { useMemo, useState } from 'react';
import {
  BUILDING_TYPES, bizTypeOfRepl, CPO_NAMES, REPL_TYPES,
  type BuildingType, type CpoName, type PricingRule, type ReplType,
} from '@/types/project';
import { won } from '@/lib/format';
import { useAction } from '@/lib/use-action';
import { Badge, Blank, Btn, Empty, Err, FIELD, Note, PANEL, Tag } from '@/components/ui';

const POWER_TYPES = ['한전불입', '모자분리'] as const;
const TERMS = [5, 7, 10] as const;

const turnkey = (r: PricingRule) => r.salesUnit + r.consUnit + r.margin;

export default function PricingMatrix({ rules }: { rules: PricingRule[] }) {
  const [adding, setAdding] = useState(false);

  const live = rules.filter((r) => r.active);
  const stopped = rules.length - live.length;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black text-slate-900">단가 케이스</h1>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-base text-slate-500">
            <span>
              사용 <b className="tabular-nums text-slate-800">{live.length}</b>건
            </span>
            {/* 0건도 적는다 — 「중지한 것이 없다」와 「중지 칸이 없다」는 다른 말이다 */}
            <span>
              중지 <b className="tabular-nums text-slate-800">{stopped}</b>건
            </span>
          </p>
        </div>
        <Btn onClick={() => setAdding((v) => !v)}>
          {adding ? '넣기 그만두기' : '새 케이스'}
        </Btn>
      </header>

      {adding && <AddCase onDone={() => setAdding(false)} />}

      <Holes rules={live} />
      <CaseList rules={rules} />
    </div>
  );
}

/* ── 빈 자리 ──────────────────────────────────────────────────────────────
 * 운영사 × 교체유형만 본다. 축을 다 곱하면 180칸이 되고, 그러면 「0」이 너무 많아
 * 정말 비어 있는 자리가 눈에 안 걸린다. 나머지 축은 아래 표에서 본다.
 */
function Holes({ rules }: { rules: PricingRule[] }) {
  const count = (cpo: CpoName, repl: ReplType) =>
    rules.filter((r) => r.cpo === cpo && r.replType === repl).length;

  const empty = CPO_NAMES.flatMap((c) =>
    REPL_TYPES.filter((t) => count(c, t) === 0).map((t) => `${c} · ${t}`)
  );

  return (
    <section className={`${PANEL} p-5 sm:p-6`}>
      <div className="mb-4">
        <h2 className="text-h3 font-black text-slate-900">빈 자리</h2>
        <p className="mt-0.5 text-tiny text-slate-400">
          케이스가 없는 조합은 그 현장이 들어와도 계약 확인이 안 된다
        </p>
      </div>

      <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <table className="w-full min-w-[560px] text-base">
          <thead className="border-b border-slate-200 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left">운영사</th>
              {REPL_TYPES.map((t) => (
                <th key={t} className="px-3 py-2.5 text-right">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {CPO_NAMES.map((cpo) => (
              <tr key={cpo}>
                <td className="px-3 py-2 font-bold text-slate-800">{cpo}</td>
                {REPL_TYPES.map((t) => {
                  const n = count(cpo, t);
                  return (
                    <td key={t} className="px-3 py-2 text-right tabular-nums">
                      {n === 0 ? (
                        <Empty kind="miss" label="0건" />
                      ) : (
                        <span className="font-bold text-slate-700">{n}건</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {empty.length > 0 && (
        <Note tone="warn" className="mt-3">
          케이스 없는 조합 {empty.length}칸 — {empty.join(' · ')}
        </Note>
      )}
    </section>
  );
}

/* ── 케이스 목록 ──────────────────────────────────────────────────────── */
function CaseList({ rules }: { rules: PricingRule[] }) {
  const [cpo, setCpo] = useState<CpoName | '전체'>('전체');
  const shown = cpo === '전체' ? rules : rules.filter((r) => r.cpo === cpo);

  return (
    <section className={`${PANEL} p-5 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3 font-black text-slate-900">케이스</h2>
        <div className="flex flex-wrap gap-1">
          {(['전체', ...CPO_NAMES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCpo(c)}
              className={`rounded-ctl px-2.5 py-1 text-tiny font-bold transition ${
                cpo === c
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <Blank>{cpo === '전체' ? '케이스 0건' : `${cpo} 케이스 0건`}</Blank>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[1040px] text-base">
            <thead className="border-b border-slate-200 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-left">케이스</th>
                <th className="px-3 py-2.5 text-left">축</th>
                <th className="px-3 py-2.5 text-right">영업</th>
                <th className="px-3 py-2.5 text-right">시공</th>
                <th className="px-3 py-2.5 text-right">마진</th>
                <th className="px-3 py-2.5 text-right">턴키</th>
                <th className="px-3 py-2.5 text-right">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row({ r }: { r: PricingRule }) {
  const { busy, error, run } = useAction();

  return (
    <tr className={r.active ? '' : 'bg-slate-50/60'}>
      <td className="px-3 py-2.5">
        <p className={`break-keep font-bold ${r.active ? 'text-slate-800' : 'text-slate-400'}`}>
          {r.caseName}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-tiny text-slate-400">
          <code className="text-micro">{r.id}</code>
          <span>{r.bizYear}년 · {r.startDate}</span>
          {r.note && <span className="break-keep">{r.note}</span>}
        </p>
        <Err className="mt-1 block">{error}</Err>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          <Tag tone={r.bizType === '환경부' ? 'stage' : 'mute'}>{r.replType}</Tag>
          <Tag>{r.powerType}</Tag>
          <Tag>{r.termYears.join('·')}년</Tag>
          <Tag>{r.bldgTypes.length === 2 ? '전체' : r.bldgTypes[0]}</Tag>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{won(r.salesUnit)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{won(r.consUnit)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{won(r.margin)}</td>
      <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-900">
        {won(turnkey(r))}
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          {r.active ? <Badge tone="ok">사용</Badge> : <Badge tone="hold">중지</Badge>}
          {/* 중지는 되돌릴 수 있다 — 넣는 자리를 만들면 되돌리는 자리도 만든다 */}
          <Btn
            size="sm"
            kind={r.active ? 'undo' : 'quiet'}
            busy={busy}
            onClick={() =>
              void run({
                url: '/api/pricing',
                method: 'PATCH',
                body: { id: r.id, active: !r.active },
                fail: '바꾸지 못했습니다.',
              })
            }
          >
            {r.active ? '중지' : '다시 사용'}
          </Btn>
        </div>
      </td>
    </tr>
  );
}

/* ── 새 케이스 ─────────────────────────────────────────────────────────── */
function AddCase({ onDone }: { onDone: () => void }) {
  const { busy, error, run } = useAction();

  const [cpo, setCpo] = useState<CpoName>('플러그링크');
  const [replType, setReplType] = useState<ReplType>('환경부 신규');
  const [powerType, setPowerType] = useState<(typeof POWER_TYPES)[number]>('한전불입');
  const [terms, setTerms] = useState<number[]>([10]);
  const [bldgs, setBldgs] = useState<BuildingType[]>(['공동주택']);
  const [bizYear, setBizYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState('');
  const [salesUnit, setSalesUnit] = useState('');
  const [consUnit, setConsUnit] = useState('');
  const [margin, setMargin] = useState('');
  const [note, setNote] = useState('');

  /* 사업구분은 고르게 두지 않는다 — 교체유형이 정한다(bizTypeOfRepl). 두 값을 따로 고르면 어긋난다 */
  const bizType = bizTypeOfRepl(replType);

  /*
   * 케이스 이름은 축에서 만든다. 손으로 적게 두면 이름과 축이 어긋나고, 그러면 화면에서
   * 「10년」이라고 읽히는 케이스가 7년 라인에 붙는다. 사람이 손댈 자리는 비고다.
   */
  const caseName = useMemo(() => {
    const bldg = bldgs.length === 2 ? '전체' : (bldgs[0] ?? '');
    return `${cpo} | ${bldg} | ${terms.join('·')}년 ${replType} | ${powerType}`;
  }, [cpo, bldgs, terms, replType, powerType]);

  const num = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^0-9]/g, '')) || 0));
  const total = num(salesUnit) + num(consUnit) + num(margin);

  const blocked =
    terms.length === 0 ? '계약연수 미선택'
      : bldgs.length === 0 ? '건축물유형 미선택'
        : total === 0 ? '단가 미입력'
          : null;

  async function save() {
    const ok = await run({
      url: '/api/pricing',
      body: {
        caseName, cpo, bizType, powerType, termYears: terms, bldgTypes: bldgs, replType,
        bizYear, startDate: startDate.trim() || `${bizYear}년`,
        salesUnit: num(salesUnit), consUnit: num(consUnit), margin: num(margin),
        defaultSettlementRuleId: '', supervisionBearer: null, safetyFeeBearer: null,
        note: note.trim() || null,
      },
      fail: '넣지 못했습니다.',
    });
    if (ok) onDone();
  }

  return (
    <section className={`${PANEL} p-5 sm:p-6`}>
      <h2 className="mb-4 text-h3 font-black text-slate-900">새 케이스</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="운영사">
          <select value={cpo} onChange={(e) => setCpo(e.target.value as CpoName)} className={FIELD}>
            {CPO_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="교체유형" hint={`사업구분 ${bizType}`}>
          <select
            value={replType}
            onChange={(e) => setReplType(e.target.value as ReplType)}
            className={FIELD}
          >
            {REPL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="수전방식">
          <select
            value={powerType}
            onChange={(e) => setPowerType(e.target.value as (typeof POWER_TYPES)[number])}
            className={FIELD}
          >
            {POWER_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        <Field label="계약연수" hint="겸용 케이스는 여럿 고른다">
          <Chips
            options={TERMS.map((t) => [t, `${t}년`])}
            picked={terms}
            onToggle={(v) => setTerms((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v].sort()))}
          />
        </Field>

        <Field label="건축물유형">
          <Chips
            options={BUILDING_TYPES.map((b) => [b, b])}
            picked={bldgs}
            onToggle={(v) => setBldgs((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))}
          />
        </Field>

        <Field label="사업연도">
          <input
            value={bizYear}
            onChange={(e) => setBizYear(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
            className={`${FIELD} tabular-nums`}
          />
        </Field>

        <Field label="영업단가">
          <Money value={salesUnit} onChange={setSalesUnit} />
        </Field>
        <Field label="시공단가">
          <Money value={consUnit} onChange={setConsUnit} />
        </Field>
        <Field label="마진">
          <Money value={margin} onChange={setMargin} />
        </Field>

        <Field label="적용 시작" hint="비우면 사업연도만">
          <input
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            placeholder="2026년 1월 20일"
            className={FIELD}
          />
        </Field>

        <Field label="비고" hint="금액만으로 설명되지 않는 것">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} />
        </Field>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-2">
            <dt className="text-tiny font-bold text-slate-400">케이스 이름</dt>
            <dd className="break-keep font-bold text-slate-800">{caseName}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-tiny font-bold text-slate-400">턴키</dt>
            <dd className="font-black tabular-nums text-slate-900">{won(total)}</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* 막는 것을 단추 이름에 적는다 — 흐린 단추만으로는 왜 안 되는지 알 수 없다 */}
          <Btn disabled={Boolean(blocked)} busy={busy} busyLabel="넣는 중…" onClick={() => void save()}>
            {blocked ? `${blocked} — 넣을 수 없음` : '케이스 넣기'}
          </Btn>
          <Btn kind="quiet" disabled={busy} onClick={onDone}>취소</Btn>
          <Err>{error}</Err>
        </div>
      </div>
    </section>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">{label}</span>
        {hint && <span className="text-micro text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** 여럿 고르는 칸 — 각지다(누르는 것이다). 동글한 것은 못 누르는 상태 배지다. */
function Chips<T extends string | number>({
  options, picked, onToggle,
}: {
  options: Array<[T, string]>;
  picked: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onToggle(v)}
          className={`rounded-ctl border px-2.5 py-1.5 text-small font-bold transition ${
            picked.includes(v)
              ? 'border-brand-300 bg-brand-50 text-brand-800'
              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Money({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = Number(value.replace(/[^0-9]/g, '')) || 0;
  return (
    <span className="flex items-baseline gap-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="0"
        className={`${FIELD} tabular-nums`}
      />
      <span className="shrink-0 text-micro text-slate-400">{n > 0 ? `${won(n)}원` : '원'}</span>
    </span>
  );
}

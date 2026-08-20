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
  BUILDING_TYPES, bizTypeOfRepl, CHANNELS, CPO_NAMES, REPL_TYPES,
  type BuildingType, type Channel, type CpoName, type LineAxes, type PricingRule, type ReplType,
} from '@/types/project';
import { won } from '@/lib/format';
import { useAction } from '@/lib/use-action';
import { startKey } from '@/lib/pricing-match';
import { Badge, Blank, Btn, Choice, Err, FIELD, PANEL, Tag } from '@/components/ui';

const POWER_TYPES = ['한전불입', '모자분리'] as const;
const TERMS = [5, 7, 10] as const;

/** 그리드 칸이나 막힌 라인에서 폼으로 넘기는 축 — 채워진 것만 프리필된다 */
export interface Prefill {
  cpo?: CpoName;
  replType?: ReplType;
  powerType?: (typeof POWER_TYPES)[number];
  terms?: number[];
  bldgs?: BuildingType[];
  channel?: Channel;
}

const turnkey = (r: PricingRule) => r.salesUnit + r.consUnit + r.margin;

export default function PricingMatrix({
  rules, settlementRules, blockedLines,
}: {
  rules: PricingRule[];
  /** 정산 규칙 후보 — 서버(page)가 넘긴다. 케이스의 제안값으로 붙어 단가 지정 때 현장에 옮겨진다 */
  settlementRules: Array<{ id: string; name: string }>;
  /** 활성 케이스가 하나도 안 맞는 실제 라인 — 서버(page)가 판정해서 넘긴다 */
  blockedLines: LineAxes[];
}) {
  /*
   * 폼은 「어느 축으로 여는가」와 함께 열린다 — 그리드의 빈 칸이나 막힌 라인을 누르면
   * 그 축이 채워진 채 열린다. null 이면 닫힘. key 로 다시 마운트해 프리필을 확실히 싣는다.
   */
  const [adding, setAdding] = useState<Prefill | null>(null);

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
        {/* 폼이 열리면 감춘다 — 채운 초록이 둘이면 「케이스 넣기」와 헷갈리고,
            이걸 누르면 입력이 통째로 사라진다. 닫는 길은 폼 안의 취소 하나다. */}
        {!adding && <Btn onClick={() => setAdding({})}>새 케이스</Btn>}
      </header>

      {adding && (
        <AddCase
          key={JSON.stringify(adding)}
          prefill={adding}
          settlementRules={settlementRules}
          onDone={() => setAdding(null)}
        />
      )}

      <BlockedLines lines={blockedLines} onFill={setAdding} />
      <Grid rules={live} onPick={setAdding} />
      <CaseList rules={rules} />
    </div>
  );
}

/* ── 막힌 라인 ────────────────────────────────────────────────────────────
 * 「모든 현장에 대응한다」의 잣대는 이 목록이 0건인 것이다. 축 공간(180칸)을 다 채우는
 * 것이 아니라 — 실제로 들어온 라인이 케이스를 못 찾을 때만 여기 나타난다.
 */
function BlockedLines({ lines, onFill }: { lines: LineAxes[]; onFill: (p: Prefill) => void }) {
  if (lines.length === 0) return null;
  return (
    <section className={`${PANEL} border-amber-200 p-5 sm:p-6`}>
      <h2 className="mb-4 text-h3 font-black text-slate-900">
        막힌 라인 <span className="tabular-nums text-amber-700">{lines.length}건</span>
      </h2>
      <div className="flex flex-col divide-y divide-slate-100">
        {lines.map((l) => {
          const repl = l.lineReplType ?? l.projectReplType;
          return (
            <div key={l.lineId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <span className="font-bold text-slate-800">{l.projectName}</span>
              <span className="flex flex-wrap gap-1">
                <Tag>{l.cpo}</Tag>
                {repl ? <Tag>{repl}</Tag> : <Tag tone="warn">교체유형 미지정</Tag>}
                <Tag>{l.termYears}년 × {l.qty}대</Tag>
                {l.powerType ? <Tag>{l.powerType}</Tag> : <Tag tone="warn">수전 미지정</Tag>}
                {l.bldgType ? <Tag>{l.bldgType}</Tag> : <Tag tone="warn">유형 미지정</Tag>}
              </span>
              <Btn
                size="sm"
                kind="side"
                className="ml-auto"
                onClick={() =>
                  onFill({
                    cpo: l.cpo,
                    replType: repl ?? undefined,
                    powerType: l.powerType ?? undefined,
                    terms: [l.termYears],
                    bldgs: l.bldgType ? [l.bldgType] : undefined,
                  })
                }
              >
                이 축으로 케이스 만들기
              </Btn>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── 운영사별 원자 칸 그리드 ──────────────────────────────────────────────
 * 줄 = 교체유형 × 수전방식(6), 칸 = 연수 × 건축물유형(6). 케이스 한 행이 여러 칸을 덮는
 * 블록이라, 행 목록만 봐서는 어느 칸이 비었는지 알 수 없다 — 칸으로 펴서 보인다.
 * 빈 칸은 조용한 「—」다. 진짜 경보는 위의 막힌 라인이 맡는다 — 축 공간 대부분은
 * 그 조합의 현장이 아직 없어서 비어 있는 것뿐이다.
 * 칸을 누르면 그 축이 채워진 폼이 열린다. 이미 찬 칸을 누르면 개정(새 적용 시작)이 된다.
 */
function Grid({ rules, onPick }: { rules: PricingRule[]; onPick: (p: Prefill) => void }) {
  const [cpo, setCpo] = useState<CpoName>(CPO_NAMES[0]);

  /* 턴키 채널만 격자에 편다 — 시공만은 드물어 목록에서 본다. 있으면 아래에 개수로 보인다 */
  const mine = rules.filter((r) => r.cpo === cpo && r.channel === '턴키');
  const gcCount = rules.filter((r) => r.cpo === cpo && r.channel === '시공만').length;

  /** 칸을 덮는 활성 케이스들 — 최신 적용 시작이 현재값이다 */
  const at = (repl: ReplType, power: (typeof POWER_TYPES)[number], term: number, bldg: BuildingType) => {
    const hits = mine
      .filter((r) =>
        r.replType === repl && r.powerType === power &&
        r.termYears.includes(term) && r.bldgTypes.includes(bldg)
      )
      .sort((a, b) => startKey(b).localeCompare(startKey(a)));
    return { now: hits[0] ?? null, versions: hits.length };
  };

  return (
    <section className={`${PANEL} p-5 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3 font-black text-slate-900">매트릭스</h2>
        <div className="flex flex-wrap gap-1">
          {CPO_NAMES.map((c) => (
            <Choice key={c} on={cpo === c} onClick={() => setCpo(c)}>{c}</Choice>
          ))}
        </div>
      </div>

      <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <table className="w-full min-w-[880px] text-base">
          <thead className="border-b border-slate-200 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left" rowSpan={2}>교체유형 · 수전</th>
              {TERMS.map((t) => (
                <th key={t} colSpan={2} className="border-l border-slate-100 px-3 pt-2 text-center">{t}년</th>
              ))}
            </tr>
            <tr>
              {TERMS.flatMap((t) =>
                BUILDING_TYPES.map((b) => (
                  <th key={`${t}-${b}`} className={`px-3 pb-2 text-right font-semibold ${b === '공동주택' ? 'border-l border-slate-100' : ''}`}>
                    {b === '공동주택' ? '공동' : '상업'}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {REPL_TYPES.flatMap((repl) =>
              POWER_TYPES.map((power) => (
                <tr key={`${repl}-${power}`}>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="font-bold text-slate-700">{repl}</span>
                    <span className="ml-1.5 text-tiny text-slate-400">{power}</span>
                  </td>
                  {TERMS.flatMap((term) =>
                    BUILDING_TYPES.map((bldg) => {
                      const { now, versions } = at(repl, power, term, bldg);
                      return (
                        <td key={`${term}-${bldg}`} className={`px-1 py-1 text-right ${bldg === '공동주택' ? 'border-l border-slate-100' : ''}`}>
                          <button
                            type="button"
                            title={now ? `${now.caseName} — 누르면 개정 케이스를 넣는다` : '누르면 이 축으로 케이스를 넣는다'}
                            onClick={() =>
                              onPick({ cpo, replType: repl, powerType: power, terms: [term], bldgs: [bldg] })
                            }
                            className="w-full rounded-ctl px-2 py-1 text-right tabular-nums transition hover:bg-brand-50"
                          >
                            {now ? (
                              <>
                                <span className="font-bold text-slate-800">{won(turnkey(now))}</span>
                                {versions > 1 && (
                                  <span className="ml-1 text-micro font-bold text-slate-400">×{versions}</span>
                                )}
                              </>
                            ) : (
                              <span className="font-bold text-slate-300">—</span>
                            )}
                          </button>
                        </td>
                      );
                    })
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 flex flex-wrap gap-x-4 text-tiny text-slate-400">
        <span>칸 값은 현재(최신 적용 시작) 턴키 단가 · ×N 은 개정 수</span>
        {gcCount > 0 && <span>시공만 케이스 {gcCount}건은 아래 목록에</span>}
      </p>
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
            <Choice key={c} on={cpo === c} onClick={() => setCpo(c)}>
              {c}
            </Choice>
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
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          <Tag>{r.replType}</Tag>
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
        {/* 실패 문구는 누른 단추 옆 — 첫 칸에 두면 좁은 창에서 스크롤 밖이다(규칙 9) */}
        <Err className="mt-1 block text-right">{error}</Err>
      </td>
    </tr>
  );
}

/* ── 새 케이스 ─────────────────────────────────────────────────────────── */
function AddCase({
  prefill, settlementRules, onDone,
}: {
  prefill: Prefill;
  settlementRules: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const { busy, error, run } = useAction();

  const [cpo, setCpo] = useState<CpoName>(prefill.cpo ?? '플러그링크');
  const [replType, setReplType] = useState<ReplType>(prefill.replType ?? '환경부 신규');
  const [powerType, setPowerType] = useState<(typeof POWER_TYPES)[number]>(prefill.powerType ?? '한전불입');
  const [terms, setTerms] = useState<number[]>(prefill.terms ?? [10]);
  const [bldgs, setBldgs] = useState<BuildingType[]>(prefill.bldgs ?? ['공동주택']);
  const [channel, setChannel] = useState<Channel>(prefill.channel ?? '턴키');
  const [bizYear, setBizYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState('');
  const [salesUnit, setSalesUnit] = useState('');
  const [consUnit, setConsUnit] = useState('');
  const [margin, setMargin] = useState('');
  const [note, setNote] = useState('');
  const [settleId, setSettleId] = useState('');

  /* 사업구분은 고르게 두지 않는다 — 교체유형이 정한다(bizTypeOfRepl). 두 값을 따로 고르면 어긋난다 */
  const bizType = bizTypeOfRepl(replType);

  /*
   * 케이스 이름은 축에서 만든다. 손으로 적게 두면 이름과 축이 어긋나고, 그러면 화면에서
   * 「10년」이라고 읽히는 케이스가 7년 라인에 붙는다. 사람이 손댈 자리는 비고다.
   */
  /*
   * 적용 시기를 이름에 박는다 — 반년마다 단가가 바뀌어 같은 축의 케이스가 또 생기는데,
   * 시기가 없으면 두 케이스가 똑같은 이름으로 셀렉트에 나란히 떠서 금액만 다르다.
   * 시드도 (상반기)/(하반기)로 같은 문제를 피했다.
   */
  const caseName = useMemo(() => {
    const bldg = bldgs.length === 2 ? '전체' : (bldgs[0] ?? '');
    const since = startDate.trim() || `${bizYear}년`;
    const gc = channel === '시공만' ? ' | 시공만' : '';
    return `${cpo} (${since}) | ${bldg} | ${terms.join('·')}년 ${replType} | ${powerType}${gc}`;
  }, [cpo, bldgs, terms, replType, powerType, startDate, bizYear, channel]);

  const num = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^0-9]/g, '')) || 0));
  const total = num(salesUnit) + num(consUnit) + num(margin);
  const gcSales = channel === '시공만' && num(salesUnit) > 0;

  const blocked =
    terms.length === 0 ? '계약연수 미선택'
      : bldgs.length === 0 ? '건축물유형 미선택'
        : total === 0 ? '단가 미입력'
          : gcSales ? '시공만은 영업단가 0'
            : bizYear < 2020 || bizYear > 2100 ? '사업연도 확인 필요'
              : null;

  async function save() {
    const ok = await run({
      url: '/api/pricing',
      body: {
        caseName, cpo, bizType, powerType, termYears: terms, bldgTypes: bldgs, replType, channel,
        bizYear, startDate: startDate.trim() || `${bizYear}년`,
        salesUnit: num(salesUnit), consUnit: num(consUnit), margin: num(margin),
        defaultSettlementRuleId: settleId, supervisionBearer: null, safetyFeeBearer: null,
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

        <Field label="채널" hint="영업 없이 시공만 하는 현장은 단가 구성이 다르다">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className={FIELD}
          >
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
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
            onToggle={(v) =>
              // sort() 기본은 문자열 비교라 [7,10] 이 [10,7] 이 된다 — 숫자로 비교한다
              setTerms((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v].sort((a, b) => a - b)))
            }
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

        <Field label="정산 규칙" hint="이 케이스를 붙이면 현장에 이 규칙이 적용된다">
          {/*
            * 비워 두면 이 케이스로 지정된 현장의 기성이 계산되지 않는다(정산 규칙 미적용).
            * 그래도 「없음」을 남긴다 — 기성 규칙이 아직 안 정해진 운영사가 실제로 있다.
            */}
          <select value={settleId} onChange={(e) => setSettleId(e.target.value)} className={FIELD}>
            <option value="">없음 — 기성이 계산되지 않음</option>
            {settlementRules.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
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

/** 여럿 고르는 칸 — 고른 상태의 모양은 Choice 부품이 정한다 */
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
        <Choice key={String(v)} on={picked.includes(v)} onClick={() => onToggle(v)}>
          {label}
        </Choice>
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

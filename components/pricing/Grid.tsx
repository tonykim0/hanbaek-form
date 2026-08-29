'use client';

import {
  Fragment, useContext, useState,
} from 'react';
import {
  BUILDING_TYPES, CPO_NAMES, powerTypesOfRepl, replTypesOf, type BuildingType, type CpoName, type PricingRule, type ReplType, type SettlementRule,
} from '@/types/project';
import { replLabel } from '@/types/project';
import { won } from '@/lib/format';

import { halfEndKey, halfKeyOf, halfLabel, startKey } from '@/lib/pricing-match';

import {
  Empty, FIELD, PANEL,
} from '@/components/ui';
import {
  CanEdit, POWER_TYPES, bldgAxisLabel, prefillOf, receiveUnitOf, type FormOpen,
} from './shared';

export function Grid({
  rules, settleById, onOpen,
}: {
  rules: PricingRule[];
  settleById: Map<string, SettlementRule>;
  onOpen: (f: FormOpen) => void;
}) {
  const canEdit = useContext(CanEdit);
  const [cpo, setCpo] = useState<CpoName>(CPO_NAMES[0]);
  const [halfPick, setHalfPick] = useState<string | null>(null);

  /* 턴키 채널만 격자에 편다 — 영업·시공 채널은 드물어 목록에서 본다. 있으면 아래에 개수로 보인다 */
  const mine = rules.filter((r) => r.cpo === cpo && r.channel === '턴키');

  /*
   * 연수 열은 그 운영사의 케이스에서 유도한다 — 5·7·10년을 늘 펴 두면 5년 정책이 있는 곳은
   * 에버온뿐이라(한백 확인 2026-08-22) 나머지 넷은 늘 빈 열 둘을 끌고 다닌다.
   * 그 빈 칸은 「케이스가 없다」가 아니라 「그 운영사에 없는 계약기간」이고, 둘은 다른 말이다.
   * 케이스가 아직 없는 운영사는 7·10년으로 편다 — 격자의 빈 칸이 케이스를 만드는 입구다.
   */
  const gridTerms = (() => {
    const found = [...new Set(mine.flatMap((r) => r.termYears))].sort((a, b) => a - b);
    return found.length > 0 ? found : [7, 10];
  })();
  const sideCount = rules.filter((r) => r.cpo === cpo && r.channel !== '턴키').length;

  /* 시기 탭은 전 운영사의 케이스에서 뽑는다 — 운영사를 바꿔도 탭이 그대로라 길을 잃지 않는다 */
  const halves = [...new Set(rules.filter((r) => r.channel === '턴키').map(halfKeyOf))].sort();
  const half = halfPick && halves.includes(halfPick) ? halfPick : halves[halves.length - 1] ?? null;

  /** 칸에서 이 시기에 적용 중인 케이스 — 그 반기까지 시작된 것 중 최신. 이전 반기 것이면 이월이다 */
  const at = (repl: ReplType, power: (typeof POWER_TYPES)[number], term: number, bldg: BuildingType) => {
    if (!half) return { now: null, carried: false };
    const end = halfEndKey(half);
    const hits = mine
      .filter((r) =>
        r.replType === repl && r.powerType === power &&
        r.termYears.includes(term) && r.bldgTypes.includes(bldg) &&
        startKey(r) <= end
      )
      .sort((a, b) => startKey(b).localeCompare(startKey(a)));
    const now = hits[0] ?? null;
    return { now, carried: now !== null && halfKeyOf(now) !== half };
  };

  /*
   * ── 정책 조건 행 ──────────────────────────────────────────────────────
   * 단가 아래에 조건을 같은 표의 행으로 잇는다 — 정책서가 그 꼴이고(구분 | 기준),
   * 조건이 연수·건축물유형으로 갈리는 것도 여기서 그대로 보인다(주차면 5% vs 2%).
   *
   * 한 칸의 값은 그 칸에 지금 적용 중인 케이스들에서 모은다 — 값이 서로 다르면 둘 다 적는다.
   * 감추면 「이 축의 조건이 갈린다」는 사실이 사라진다.
   */
  /*
   * num 행(충전요금·프로모션·연장차감)은 가운데 + tabular-nums, 글 행은 왼쪽 — 정렬을
   * 병합 폭이 아니라 행의 종류가 정한다. 폭으로 정하면 같은 행이 시기마다 다르게 선다.
   */
  const POLICY_ROWS: { label: string; num?: boolean; of: (r: PricingRule) => string | null }[] = [
    /*
     * ★설치조건이 맨 위다 (한백 2026-08-29).★ 「이 현장에 깔 수 있는가」가 먼저고
     * 요금·프로모션은 깔기로 한 뒤의 조건이다. 그전에는 요금이 위에 있어서, 조건을 보려면
     * 숫자 석 줄을 지나야 했다.
     */
    { label: '설치조건', of: (r) => r.installTerms },
    { label: '충전요금', num: true, of: (r) => (r.chargeRate === null ? null : `${won(r.chargeRate)}원`) },
    {
      label: '프로모션',
      num: true,
      of: (r) => (r.promo === null ? null
        : r.promo.length === 0 ? '없음'
          : r.promo.map((x) => `${x.months}개월 ${won(x.rate)}원`).join(' + ')),
    },
    {
      /*
       * 연장은 고를 수 있는 것이 여럿이다 — 늘리는 요금마다 차감액이 다르다
       * (플러그링크: 6개월 149원 20만 · 6개월 249원 10만). 하나만 적으면 고를 것이
       * 하나뿐인 것처럼 보이므로 전부 적는다. 숫자 한 칸이 아니게 되어 num 을 뗀다.
       *
       * ★이름이 「연장 차감」이었다 (한백 2026-08-29).★ 무엇을 차감하는지가 이름에 없어서
       * 기타 칸에 「프로모션 연장은 영업비 차감으로 가능」이라고 또 적혀 있었다 — 같은 말이
       * 두 곳에 있었다(화면 규칙 5). 이름이 그 말을 하면 기타에서 지울 수 있다.
       */
      label: '프로모션 연장 (영업비 차감)',
      of: (r) => {
        if (r.promoExtend === null) return null;
        if (r.promoExtend.length === 0) return '없음';
        const lines = r.promoExtend
          .map((x) => `· ${x.months}개월 ${won(x.rate)}원 → ${won(x.deduct)}원 차감`);
        /*
         * 연장 상한은 케이스의 값이라 옵션마다 같은 글자가 실려 온다 — 한 번만 적는다
         * (cap 주석 참고). 없으면 줄을 만들지 않는다: 빈 「상한 」 줄은 오해를 부른다.
         */
        const caps = [...new Set(r.promoExtend.map((x) => x.cap).filter(Boolean))];
        for (const c of caps) lines.push(`· 연장 상한 ${c}`);
        return lines.join('\n');
      },
    },
    { label: '지급자재', of: (r) => r.supplyItems },
    // 「병행」만으로는 무엇과 병행인지 알 수 없다 (한백 2026-08-29)
    { label: '병행주차 가능여부', of: (r) => r.coexistTerms },
    { label: '기타지원', of: (r) => r.otherSupport },
    { label: '기타', of: (r) => r.miscTerms },
  ];

  /** 한 칸(연수 × 유형)에 지금 적용 중인 케이스들 — 값 칸에 숫자가 뜨는 그 케이스들이다 */
  const casesAt = (term: number, bldg: BuildingType) =>
    replTypesOf(cpo).flatMap((repl) =>
      powerTypesOfRepl(repl).map((power) => at(repl, power, term, bldg).now)
    ).filter((r): r is PricingRule => r !== null);

  /** 칸 하나의 정책 값 — 케이스마다 다르면 둘 다 적는다. 아무 케이스도 없으면 null */
  const policyAt = (term: number, bldg: BuildingType, of: (r: PricingRule) => string | null) => {
    const vals = [...new Set(casesAt(term, bldg).map(of).filter((v): v is string => Boolean(v)))];
    // 값이 여럿이면(케이스마다 갈리면) 줄로 가른다 — ' / ' 로 이으면 긴 글이 한 덩어리가 된다
    return vals.length === 0 ? null : vals.join('\n');
  };

  /*
   * 값이 같은 옆칸을 하나로 묶는다 — 안 묶으면 「스탠드폴 + 가림막」이 여섯 번 적힌다.
   * 정책서도 같은 값은 셀을 병합해 두었고, 병합된 폭이 곧 「이 조건이 어디까지 같은가」다.
   *
   * ★값이 한 가지뿐이면 전 칸을 한 칸으로 묶는다.★ 열이 여섯이라 칸 하나가 100px 남짓인데,
   * 설치조건 같은 긴 글이 그 폭에 들어가면 한 행이 열 줄이 된다. 조건은 대개 축과 무관하게
   * 같은 값이고(빈 칸은 그 축에 케이스가 없다는 뜻일 뿐이다), 그럴 때 쪼개 봤자 읽히지 않는다.
   * 실제로 갈리는 조건(연수마다 다른 프로모션)만 칸이 쪼개진다.
   */
  /*
   * ── 글 행의 공통/차이 분해 ──────────────────────────────────────────────
   * 한 칸의 값은 그 칸 케이스들(교체유형×수전이 합쳐진)의 글을 겹치지 않게 모은 것이다.
   * 칸끼리 문자열 통째로 견주면 몇 줄만 달라도 「다른 값」이 되어, 공통 불릿까지 칸마다
   * 통째로 반복된다 — 기타 행에서 같은 일곱 줄이 세 칸에 찍혔다(2026-08-23 한백 지적).
   * 그래서 줄(불릿) 단위로 가른다: 값이 있는 모든 칸에 든 줄은 「공통」으로 전 폭에 한 번,
   * 나머지만 칸별로 남긴다.
   */
  const bulletsAt = (term: number, bldg: BuildingType, of: (r: PricingRule) => string | null) => {
    const out: string[] = [];
    for (const r of casesAt(term, bldg)) {
      const v = of(r);
      if (!v) continue;
      for (const line of v.split('\n')) if (!out.includes(line)) out.push(line);
    }
    return out;
  };

  const splitCommon = (of: (r: PricingRule) => string | null) => {
    const cells = gridTerms.flatMap((t) => BUILDING_TYPES.map((b) => bulletsAt(t, b, of)));
    const filled = cells.filter((c) => c.length > 0);
    const common = filled.length === 0
      ? []
      : filled[0].filter((line) => filled.every((c) => c.includes(line)));
    const rest = cells.map((c) => {
      const left = c.filter((line) => !common.includes(line));
      return left.length > 0 ? left.join('\n') : null;
    });
    return { common, rest };
  };

  /** 남은 칸별 값(또는 숫자 행의 칸 값)을 같은 값끼리 병합한다 */
  const spansOf = (of: (r: PricingRule) => string | null) => {
    const cells = gridTerms.flatMap((t) => BUILDING_TYPES.map((b) => policyAt(t, b, of)));
    const distinct = [...new Set(cells.filter((v): v is string => v !== null))];
    if (distinct.length <= 1) {
      return [{ value: distinct[0] ?? null, span: cells.length }];
    }
    const out: { value: string | null; span: number }[] = [];
    for (const v of cells) {
      const last = out[out.length - 1];
      if (last && last.value === v) last.span += 1;
      else out.push({ value: v, span: 1 });
    }
    return out;
  };

  return (
    <section className={`${PANEL} p-5 sm:p-6`}>
      {/*
        시기·운영사는 드롭다운이고 왼쪽에 몰려 있다 — 칩으로 늘어놓으면 해가 바뀔 때마다
        칩이 늘어(2026 상·하 → 2027 상·하 …) 줄바꿈되고, 그러면 표 머리가 아래로 밀린다.
        고르는 것이 둘뿐이라 한 줄에 나란히 두면 「무엇을 보고 있는가」가 한눈에 읽힌다.
      */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-h3 font-black text-slate-900">매트릭스</h2>
        <div className="w-40">
          <select
            aria-label="시기"
            className={FIELD}
            value={half ?? ''}
            onChange={(e) => setHalfPick(e.target.value)}
          >
            {halves.map((h) => (
              <option key={h} value={h}>{halfLabel(h)}</option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <select
            aria-label="운영사"
            className={FIELD}
            value={cpo}
            onChange={(e) => setCpo(e.target.value as CpoName)}
          >
            {CPO_NAMES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        {/*
          table-fixed + colgroup 으로 열 너비를 못 박는다. auto 레이아웃에서는 브라우저가
          내용으로 너비를 정해서, 값이 든 열은 넓어지고 「—」만 있는 열은 좁아진다 —
          그러면 5·7·10년 머리글(colSpan 2)과 그 아래 공동·상업 칸이 어긋난다.

          ★폭을 화면에 맞추지 않는다 (한백 2026-08-29 「표 넓이가 너무 넓다」).★ w-full 이면
          값 열 여섯이 패널 폭을 나눠 가져서 넓은 화면에서는 「240만」 하나가 200px 칸 오른쪽
          끝에 떨어져 섰다 — 줄 이름과 값 사이가 멀어 눈이 한 줄을 못 좇는다. 값 열은 금액
          하나가 서는 폭(7rem)으로 못 박고, 표는 그 합만큼만 차지한다. 좁은 화면은 옆으로 흐른다.
        */}
        <table className="w-max table-fixed text-small">
          <colgroup>
            <col className="w-52" />
            {gridTerms.flatMap((t) =>
              BUILDING_TYPES.map((b) => <col key={`${t}-${b}`} className="w-28" />)
            )}
          </colgroup>
          {/*
            ★대비 (같은 지적).★ 머리·줄 이름·값·조건이 전부 회색 한 톤이었다 — slate-500 머리,
            slate-700 이름, slate-800 값, slate-100 실선. 무엇을 먼저 읽어야 하는지 색이 말하지
            않았다. 층을 셋으로 가른다: 머리는 진한 회색 바탕에 검은 글자, 줄 이름은 연한 바탕
            (표의 왼쪽 기둥), 값은 검정·큰 글자. 조건 행은 그대로 회색 글이다 — 값을 읽고
            그다음 보는 것이라 값보다 한 단 낮아야 한다.
          */}
          <thead className="border-b-2 border-slate-300 bg-slate-100 text-tiny font-bold text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left tracking-[0.06em] text-slate-500" rowSpan={2}>교체유형 · 수전</th>
              {gridTerms.map((t) => (
                <th key={t} colSpan={2} className="border-l border-slate-300 px-3 pt-2 text-center text-base font-black text-slate-900">{t}년</th>
              ))}
            </tr>
            <tr>
              {gridTerms.flatMap((t) =>
                BUILDING_TYPES.map((b) => (
                  <th
                    key={`${t}-${b}`}
                    className={`break-keep px-3 pb-2 text-right font-semibold ${b === '공동주택' ? 'border-l border-slate-300' : ''}`}
                  >
                    {/* 줄여 적지 않는다 — 운영사마다 경계가 다르다(BLDG_LABEL) */}
                    {bldgAxisLabel(cpo, b)}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {/*
              있을 수 없는 조합(연동 × 한전불입)은 행을 만들지 않는다 — 클릭을 막는 게 아니라 자리가 없다.
              교체유형이 단가를 안 가르는 운영사의 신규위치도 마찬가지다(replTypesOf).
            */}
            {replTypesOf(cpo).flatMap((repl) =>
              powerTypesOfRepl(repl).map((power) => (
                <tr key={`${repl}-${power}`}>
                  {/*
                    줄 이름은 표의 왼쪽 기둥이다 — 연한 바탕으로 세워 값 칸과 갈린다.
                    열 너비가 고정이라 줄바꿈을 막지 않는다 — 막으면 「자체투자 (제자리교체)」가 칸을 넘는다.
                  */}
                  <td className="bg-slate-50 px-3 py-2">
                    <span className="font-bold text-slate-900">{replLabel(cpo, repl)}</span>
                    <span className="ml-1.5 text-tiny font-semibold text-slate-500">{power}</span>
                  </td>
                  {gridTerms.flatMap((term) =>
                    BUILDING_TYPES.map((bldg) => {
                      const { now, carried } = at(repl, power, term, bldg);
                      return (
                        <td key={`${term}-${bldg}`} className={`px-1 py-1 text-right ${bldg === '공동주택' ? 'border-l border-slate-200' : ''}`}>
                          <button
                            type="button"
                            disabled={!canEdit}
                            title={
                              !canEdit
                                ? now
                                  ? `${now.startDate}부터 적용`
                                  : '케이스 없음'
                                : now
                                ? carried
                                  ? `${now.startDate} 단가가 계속 적용 — 이 시기 개정 없음. 누르면 개정 폼이 열린다`
                                  : `${now.startDate}부터 적용 — 누르면 전 값을 실은 개정 폼이 열린다`
                                : '누르면 이 축으로 케이스를 넣는다'
                            }
                            onClick={() =>
                              onOpen({
                                prefill: now
                                  ? { ...prefillOf(now, settleById.get(now.defaultSettlementRuleId) ?? null), after: startKey(now) }
                                  : { cpo, replType: repl, powerType: power, terms: [term], bldgs: [bldg] },
                              })
                            }
                            className="w-full rounded-ctl px-2 py-1.5 text-right tabular-nums transition enabled:hover:bg-brand-50 disabled:cursor-default"
                          >
                            {now ? (
                              /*
                               * 값은 표에서 가장 먼저 읽는 것이라 가장 진하고 크다(text-base 검정).
                               * 이월(carried)은 이 시기에 개정이 없어 이전 값이 이어진 것 — 한 단만
                               * 연하게(slate-500). 예전 slate-400 은 빈 칸의 「—」(slate-300)과 붙어 보였다.
                               */
                              <span className={`text-base font-black ${carried ? 'text-slate-500' : 'text-slate-900'}`}>
                                {won(receiveUnitOf(now))}
                                {/* 부기 — 이 금액을 읽는 순간 같이 봐야 하는 조건 (한전불입 10기 이내 등) */}
                                {now.note && (
                                  <span className="block whitespace-normal break-keep text-tiny font-semibold text-slate-400">
                                    {now.note}
                                  </span>
                                )}
                              </span>
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

          {/* 단가와 조건을 한 표로 잇는다 — 굵은 선 한 겹으로만 가른다(상자를 겹치지 않는다) */}
          <tbody className="divide-y divide-slate-200 border-t-2 border-slate-300">
            {POLICY_ROWS.map((row) => {
              /* 숫자 행은 칸 값 그대로, 글 행은 공통 불릿을 떼어 전 폭에 한 번만 */
              if (row.num) {
                return (
                  <tr key={row.label} className="align-top">
                    <td className="bg-slate-50 px-3 py-2 font-bold text-slate-700">{row.label}</td>
                    {spansOf(row.of).map((c, i) => (
                      <td
                        key={i}
                        colSpan={c.span}
                        className={`whitespace-pre-line break-keep px-3 py-2 text-small text-center font-bold tabular-nums text-slate-800 ${i === 0 ? '' : 'border-l border-slate-200'}`}
                      >
                        {c.value === null ? <Empty kind="wait" /> : c.value}
                      </td>
                    ))}
                  </tr>
                );
              }
              const { common, rest } = splitCommon(row.of);
              const diffs: { value: string | null; span: number }[] = [];
              for (const v of rest) {
                const last = diffs[diffs.length - 1];
                if (last && last.value === v) last.span += 1;
                else diffs.push({ value: v, span: 1 });
              }
              const hasDiff = rest.some((v) => v !== null);
              const cols = gridTerms.length * BUILDING_TYPES.length;
              return (
                <Fragment key={row.label}>
                  <tr className="align-top">
                    {/* 행 라벨은 축 라벨(교체유형)과 같은 톤 — 표 안에 글자 크기를 셋 두지 않는다 */}
                    <td className="bg-slate-50 px-3 py-2 font-bold text-slate-700" rowSpan={common.length > 0 && hasDiff ? 2 : 1}>
                      {row.label}
                    </td>
                    {common.length > 0 ? (
                      <td colSpan={cols} className="whitespace-pre-line break-keep px-3 py-2 text-left text-small text-slate-700">
                        {common.join('\n')}
                      </td>
                    ) : hasDiff ? (
                      diffs.map((c, i) => (
                        <td
                          key={i}
                          colSpan={c.span}
                          className={`whitespace-pre-line break-keep px-3 py-2 text-left text-small text-slate-700 ${i === 0 ? '' : 'border-l border-slate-200'}`}
                        >
                          {c.value === null ? <Empty kind="wait" /> : c.value}
                        </td>
                      ))
                    ) : (
                      <td colSpan={cols} className="px-3 py-2 text-left text-small"><Empty kind="wait" /></td>
                    )}
                  </tr>
                  {/* 축마다 갈리는 줄만 아래 칸별로 — 공통이 없으면 위 행이 이미 칸별이다 */}
                  {common.length > 0 && hasDiff && (
                    <tr className="align-top">
                      {diffs.map((c, i) => (
                        <td
                          key={i}
                          colSpan={c.span}
                          className={`whitespace-pre-line break-keep px-3 pb-2 text-left text-small text-slate-700 ${i === 0 ? '' : 'border-l border-slate-200'}`}
                        >
                          {c.value === null ? <span className="text-slate-300">—</span> : c.value}
                        </td>
                      ))}
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 flex flex-wrap gap-x-4 text-tiny text-slate-400">
        <span>칸 값은 고른 시기에 적용 중인 받는 단가 · 연한 값은 이전 시기 단가의 이월</span>
        {sideCount > 0 && <span>영업·시공 채널 케이스 {sideCount}건은 아래 목록에</span>}
      </p>
    </section>
  );
}


'use client';

import {
  useContext, useState,
} from 'react';
import {
  CPO_NAMES, type CpoName, type PricingRule, type SettlementRule,
} from '@/types/project';
import { replLabel } from '@/types/project';
import { won } from '@/lib/format';
import { useAction } from '@/lib/use-action';

import {
  startKey,
} from '@/lib/pricing-match';
import {
  stepUnits,
} from '@/lib/settlement';
import {
  Badge, Blank, Btn, Empty, Err, FIELD, FIELD_CELL, PANEL, Tag,
} from '@/components/ui';
import {
  CanEdit, bldgAxisLabel, payoutUnitOf, prefillOf, receiveUnitOf, type FormOpen,
} from './shared';

/* ── 케이스 목록 ──────────────────────────────────────────────────────── */
export function CaseList({
  rules, settleById, referenced, onOpen,
}: {
  rules: PricingRule[];
  settleById: Map<string, SettlementRule>;
  referenced: Set<string>;
  onOpen: (f: FormOpen) => void;
}) {
  const [cpo, setCpo] = useState<CpoName | '전체'>('전체');
  // 운영사끼리 모으고 그 안에서 최신 시기가 위 — 이름순은 이름을 걷어내며 의미를 잃었다
  const shown = (cpo === '전체' ? rules : rules.filter((r) => r.cpo === cpo))
    .slice()
    .sort((a, b) => a.cpo.localeCompare(b.cpo, 'ko') || startKey(b).localeCompare(startKey(a)));

  /*
   * 기성 열 수는 보이는 케이스에서 뽑는다 — 규칙은 1~3단계고 운영사마다 다르다.
   * 3칸을 늘 펴 두면 2차까지인 운영사만 걸렀을 때 빈 열이 따라다니고, 그 빈 칸은
   * 「값이 없다」가 아니라 「그 차수가 없다」다(화면 규칙 10번). 케이스가 하나도
   * 없거나 전부 기성 미정이면 1칸은 남긴다 — 「기성 미정」이 설 자리다.
   */
  const stepCols = Math.max(
    1,
    ...shown.map((r) => settleById.get(r.defaultSettlementRuleId)?.steps.length ?? 0)
  );

  return (
    <section className={`${PANEL} p-5 sm:p-6`}>
      {/* 매트릭스와 같은 모양으로 — 두 구역의 필터가 다르게 생기면 같은 일을 두 번 배운다 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-h3 font-black text-slate-900">케이스</h2>
        <div className="w-40">
          <select
            aria-label="운영사"
            className={FIELD}
            value={cpo}
            onChange={(e) => setCpo(e.target.value as CpoName | '전체')}
          >
            {(['전체', ...CPO_NAMES] as const).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <Blank>{cpo === '전체' ? '케이스 0건' : `${cpo} 케이스 0건`}</Blank>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          {/*
            ★한 칸에 여러 값을 접어 넣지 않는다.★ 축 다섯 개가 꼬리표로 한 칸에 뭉쳐 있어서
            「7년 공동주택 케이스만 보자」고 눈으로 훑을 수가 없었다. 지급 단가와 기성 단계도
            같은 문제였다 — 영업·시공이 한 칸의 잔글씨였고, 기성은 차수가 세로로 쌓여
            케이스끼리 1차를 견주려면 줄을 세어야 했다. 값마다 열을 주면 한 열을 위아래로
            읽는 것이 곧 비교다.

            머리글이 두 줄이다 — 열이 열넷이라 한 줄이면 무엇이 축이고 무엇이 돈인지
            구분이 사라진다. 매트릭스도 같은 두 줄 머리다.

            정책 조건 열은 걷어냈다(한백 요청 2026-08-23). 같은 값이 매트릭스 아래
            정책 조건 행에 축별로 이미 있었다 — 한 화면에 두 번 두면 갈린다(화면 규칙 5번).
            케이스 하나의 전문은 「수정」·「개정」 폼에 있다.
          */}
          <table className="w-full min-w-[1760px] text-base">
            <thead className="border-b border-slate-200 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
              <tr>
                <th className="px-3 pt-2.5 text-left" rowSpan={2}>케이스</th>
                <th colSpan={5} className="border-l border-slate-200 px-3 pt-2 text-center">축</th>
                <th colSpan={5} className="border-l border-slate-200 px-3 pt-2 text-center">단가 (대당)</th>
                <th colSpan={stepCols} className="border-l border-slate-200 px-3 pt-2 text-center">기성 단계 (대당)</th>
                <th className="border-l border-slate-200 px-3 pt-2.5 text-right" rowSpan={2}>상태</th>
              </tr>
              <tr>
                <th className="border-l border-slate-200 px-3 pb-2 text-left font-semibold">교체유형</th>
                <th className="px-3 pb-2 text-left font-semibold">수전</th>
                <th className="px-3 pb-2 text-left font-semibold">연수</th>
                <th className="px-3 pb-2 text-left font-semibold">건축물</th>
                <th className="px-3 pb-2 text-left font-semibold">채널</th>
                {/* 돈의 흐름 순서 — 받는 단가에서 마진을 떼면 지급 단가, 그것을 영업·시공으로 나눈다 */}
                <th className="border-l border-slate-200 px-3 pb-2 text-right font-semibold">받는</th>
                <th className="px-3 pb-2 text-right font-semibold">마진</th>
                <th className="px-3 pb-2 text-right font-semibold">지급</th>
                <th className="px-3 pb-2 text-right font-semibold">영업</th>
                <th className="px-3 pb-2 text-right font-semibold">시공</th>
                {Array.from({ length: stepCols }, (_, i) => (
                  <th
                    key={i}
                    className={`px-3 pb-2 text-right font-semibold ${i === 0 ? 'border-l border-slate-200' : ''}`}
                  >
                    {i + 1}차
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <Row
                  key={r.id}
                  r={r}
                  settle={settleById.get(r.defaultSettlementRuleId) ?? null}
                  referenced={referenced.has(r.id)}
                  stepCols={stepCols}
                  onOpen={onOpen}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/*
 * 케이스 한 줄.
 *
 * 정책 조건(충전요금·프로모션·연장차감·지급자재·설치조건·기타지원) 칸은 걷어냈다
 * (한백 요청 2026-08-23). 같은 값이 매트릭스 아래 정책 조건 행에 축별로 이미 있고,
 * 여기서는 여섯 값을 폭 256px 한 칸에 접어 넣느라 긴 글은 두 줄로 자르고 있었다 —
 * 자른 글은 견줄 수도 없다. 케이스 하나의 전문은 「수정」·「개정」 폼이 정본이다.
 */
function Row({
  r, settle, referenced, stepCols, onOpen,
}: {
  r: PricingRule;
  settle: SettlementRule | null;
  referenced: boolean;
  /** 표 전체가 쓰는 기성 열 수 — 이 케이스의 차수가 그보다 적으면 남는 칸은 「—」다 */
  stepCols: number;
  onOpen: (f: FormOpen) => void;
}) {
  const canEdit = useContext(CanEdit);
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [startDraft, setStartDraft] = useState(r.startDate);
  // 기성 차수별 대당 금액 — 이 케이스의 받는 단가에 규칙을 적용한 값
  const stepAmount = settle ? stepUnits(settle.steps, receiveUnitOf(r)) : [];

  /*
   * 참조 없는 케이스는 「수정」으로 폼을 통째로 연다 — 이 빠른 칸은 참조된 케이스용이다.
   * 참조되면 금액·축이 소급이라 못 고치고, 적용 시작만 여기서 고친다
   * (지급액 계산에 안 쓰인다. 시드가 「2026년 하반기」처럼 대략만 아는 값을 넣는 일이 실제로 있다).
   */
  async function saveMeta() {
    const ok = await run({
      url: '/api/pricing',
      method: 'PATCH',
      body: { id: r.id, startDate: startDraft },
      fail: '고치지 못했습니다.',
    });
    if (ok) setEditing(false);
  }

  return (
    <tr className={r.active ? '' : 'bg-slate-50/60'}>
      <td className="px-3 py-2.5">
        {/* 이름을 따로 짓지 않는다 — 케이스의 정체는 운영사·시기·축이다. caseName 은 셀렉트용 파생 라벨로만 남는다 */}
        <p className={`break-keep font-bold ${r.active ? 'text-slate-800' : 'text-slate-400'}`}>
          {r.cpo}
          <span className={`ml-1.5 text-tiny font-semibold ${r.active ? 'text-slate-500' : 'text-slate-400'}`}>
            {r.startDate}
          </span>
        </p>
        {editing ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <input
              value={startDraft}
              onChange={(e) => setStartDraft(e.target.value)}
              placeholder="2026년 7월 21일"
              className={`${FIELD_CELL} max-w-[150px]`}
            />
            <Btn size="sm" busy={busy} busyLabel="저장 중…" onClick={() => void saveMeta()}>
              저장
            </Btn>
            <Btn
              size="sm"
              kind="quiet"
              disabled={busy}
              onClick={() => { setEditing(false); setStartDraft(r.startDate); }}
            >
              취소
            </Btn>
          </div>
        ) : (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-tiny text-slate-400">
            <code className="text-micro">{r.id}</code>
            {canEdit && referenced && (
              <Btn size="sm" kind="quiet" onClick={() => setEditing(true)}>적용 시작 수정</Btn>
            )}
          </p>
        )}
      </td>
      {/*
        축 다섯 — 값마다 한 칸이다. 꼬리표(Tag)를 벗기고 글자로 둔다: 열이 이미
        「무엇인가」를 말하고 있어서 꼬리표는 테를 한 겹 더 그리는 일뿐이고,
        누르는 것도 아니다(화면 규칙 11번 — 각지면 누르는 것).
      */}
      <td className="break-keep border-l border-slate-100 px-3 py-2.5 text-slate-700">{replLabel(r.cpo, r.replType)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{r.powerType}</td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{r.termYears.join('·')}년</td>
      <td className="break-keep px-3 py-2.5 text-slate-700">
        {/* 매트릭스 머리글과 같은 이름표 — 두 자리가 다르게 부르면 같은 축인지 알 수 없다 */}
        {r.bldgTypes.length === 2 ? '전체' : bldgAxisLabel(r.cpo, r.bldgTypes[0])}
      </td>
      {/* 턴키가 대부분이라 연하게 — 눈에 걸려야 하는 것은 드문 영업·시공 채널이다 */}
      <td className={`whitespace-nowrap px-3 py-2.5 ${r.channel === '턴키' ? 'text-slate-400' : 'font-bold text-slate-700'}`}>
        {r.channel}
      </td>

      <td className="border-l border-slate-100 px-3 py-2.5 text-right font-black tabular-nums text-slate-900">
        {won(receiveUnitOf(r))}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{won(r.margin)}</td>
      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-800">{won(payoutUnitOf(r))}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{won(r.salesUnit)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{won(r.consUnit)}</td>

      {/*
        기성은 차수마다 한 칸이다 — 트리거와 대당 금액을 같이 적는다. 금액만 두면
        「40%인지 잔액인지」가 사라지고, 트리거만 두면 얼마인지가 사라진다.
        규칙이 없는 케이스는 차수 칸을 통째로 묶어 「기성 미정」 하나만 적는다 —
        빈 칸 세 개로 두면 「1차가 없다」로 읽힌다.
      */}
      {settle === null ? (
        <td colSpan={stepCols} className="border-l border-slate-100 px-3 py-2.5">
          {/* 미정과 해당없음을 가르지 않는다 — 규칙이 없으면 이 케이스의 현장은 기성이 계산되지 않는다 */}
          <Tag tone="warn">기성 미정</Tag>
        </td>
      ) : (
        Array.from({ length: stepCols }, (_, i) => {
          const step = settle.steps[i];
          return (
            <td
              key={i}
              className={`px-3 py-2.5 text-right ${i === 0 ? 'border-l border-slate-100' : ''}`}
            >
              {step ? (
                <>
                  <p className="font-bold tabular-nums text-slate-800">{won(stepAmount[i])}</p>
                  <p className="break-keep text-tiny text-slate-400">{step.trigger}</p>
                </>
              ) : (
                // 이 운영사에는 없는 차수다 — 값이 빠진 것이 아니다
                <Empty kind="na" />
              )}
            </td>
          );
        })
      )}
      <td className="border-l border-slate-100 px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          {r.active ? <Badge tone="ok">사용</Badge> : <Badge tone="hold">중지</Badge>}
          {/*
            * 참조 전에는 자리에서 고치고(수정), 참조 뒤에는 전 값을 실은 새 케이스로 연다(개정) —
            * 참조된 케이스의 금액을 고치면 그 현장의 지급액이 소급해서 바뀌기 때문이다.
            */}
          {canEdit &&
            (referenced ? (
              <Btn
                size="sm"
                kind="quiet"
                onClick={() => onOpen({ prefill: { ...prefillOf(r, settle), after: startKey(r) } })}
              >
                개정
              </Btn>
            ) : (
              <Btn
                size="sm"
                kind="quiet"
                onClick={() =>
                  onOpen({ prefill: { ...prefillOf(r, settle), startDate: r.startDate }, editId: r.id })
                }
              >
                수정
              </Btn>
            ))}
          {/* 중지는 되돌릴 수 있다 — 넣는 자리를 만들면 되돌리는 자리도 만든다 */}
          {canEdit && (
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
          )}
        </div>
        {/* 실패 문구는 누른 단추 옆 — 첫 칸에 두면 좁은 창에서 스크롤 밖이다(규칙 9) */}
        <Err className="mt-1 block text-right">{error}</Err>
      </td>
    </tr>
  );
}


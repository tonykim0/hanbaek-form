'use client';

/**
 * 단가 케이스 관리. [한백 전용]
 *
 * 세 구역이다.
 *   1) 빈 자리 — 운영사 × 교체유형 중 케이스가 0건인 칸. 이게 이 화면의 이유다.
 *   2) 케이스 — 등록된 것 전부. 수정·개정·중지가 여기 있다.
 *   3) 폼 — 새 케이스·수정·개정이 같은 폼이다. 돈은 흐름 순서로 들어온다:
 *      받는 단가(운영사) → 마진 → 지급 단가 → 영업비·시공비 나눔 → 기성 단계.
 *
 * ★고치는 길은 참조 전까지만이다.★
 * 계약 라인은 금액을 복사하지 않고 케이스를 참조한다 — 참조된 케이스를 고치면 그 현장의
 * 지급액·기성이 소급해서 바뀐다. 그래서 참조 없는 케이스만 「수정」이고, 참조된 케이스는
 * 전 값이 채워진 「개정」(새 케이스)으로 연다. 반년마다 단가가 바뀌는 것은 고침이 아니라
 * 새 케이스다 — 옛 것은 중지한다.
 *
 * 지우는 자리는 없다. 이미 참조하는 라인이 있으면 지급액을 계산할 수 없게 된다 —
 * 중지하면 새로 붙일 수는 없고, 이미 붙은 것은 그대로 계산된다.
 */
import {
  useContext, useMemo, useState,
} from 'react';
import {
  type CpoName, type LineAxes, type PricingRule, type BizType, type SettlementRule,
} from '@/types/project';

import { useBackClose } from '@/lib/use-back-close';

import {
  settlementStepsKeyOf,
} from '@/lib/settlement';
import {
  Btn, PANEL, Tag,
} from '@/components/ui';
import { Grid } from './pricing/Grid';
import { CaseList } from './pricing/CaseList';
import { CaseForm } from './pricing/CaseForm';
import {
  CanEdit, type FormOpen, type Prefill,
} from './pricing/shared';

export default function PricingMatrix({
  rules, settlementRules, blockedLines, referencedIds, canEdit,
}: {
  rules: PricingRule[];
  /** 정산 규칙 표 — 케이스의 기성 단계를 그리는 데 쓴다. 케이스가 단계를 정의하면 저장소에 쌓인다 */
  settlementRules: SettlementRule[];
  /** 활성 케이스가 하나도 안 맞는 실제 라인 — 서버(page)가 판정해서 넘긴다 */
  blockedLines: LineAxes[];
  /** 계약 라인이 참조하는 케이스 id — 「수정」(자리 고침)과 「개정」(새 케이스)을 가른다 */
  referencedIds: string[];
  /** 고칠 수 있는가 — 열람 전용은 표만 본다 */
  canEdit: boolean;
}) {
  /*
   * 폼은 「무엇을 들고 여는가」와 함께 열린다 — 그리드의 빈 칸·막힌 라인은 축만,
   * 수정·개정은 케이스 전부를 싣는다. null 이면 닫힘. key 로 다시 마운트해 프리필을 확실히 싣는다.
   */
  const [form, setForm] = useState<FormOpen | null>(null);
  /*
   * 케이스 폼은 화면을 통째로 대체하고 맨 위로 스크롤까지 한다 — 사람 눈에는 페이지
   * 전환이라, 뒤로 가기가 폼을 닫아야 한다. 안 걸면 그 전에 보던 페이지로 튕긴다
   * (2026-08-23 실사고: 단가표 → 뒤로 가기 → 계정설정).
   */
  useBackClose(form !== null, () => setForm(null));

  const settleById = useMemo(
    () => new Map(settlementRules.map((s) => [s.id, s])),
    [settlementRules]
  );
  const referenced = useMemo(() => new Set(referencedIds), [referencedIds]);

  const live = rules.filter((r) => r.active);

  /*
   * 운영사의 기성 모양 — 케이스별 설정이 아니다(한백 확인 2026-08-23). 한 운영사의 기성은
   * 트리거 모양이 동일하고 차수 금액만 케이스마다 다르다. 마스터 표가 따로 없으므로
   * 그 운영사(같은 사업구분)의 활성 케이스들이 쓰는 규칙 중 최다를 그 운영사의 모양으로
   * 본다 — 사업구분까지 보는 이유: 보조와 자체투자는 실제로 모양이 갈린다(HEC 40/60% vs
   * 착공 70만, 자투 일시금 등).
   */
  function stepShapeOf(cpo: CpoName, bizType: BizType): SettlementRule | null {
    const count = new Map<string, { rule: SettlementRule; n: number }>();
    for (const r of live) {
      if (r.cpo !== cpo || r.bizType !== bizType || !r.defaultSettlementRuleId) continue;
      const rule = settleById.get(r.defaultSettlementRuleId);
      if (!rule) continue;
      const key = settlementStepsKeyOf(rule.steps);
      const hit = count.get(key);
      if (hit) hit.n += 1;
      else count.set(key, { rule, n: 1 });
    }
    let best: { rule: SettlementRule; n: number } | null = null;
    for (const c of count.values()) if (!best || c.n > best.n) best = c;
    return best?.rule ?? null;
  }
  const stopped = rules.length - live.length;

  return (
    <CanEdit.Provider value={canEdit}>
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black text-slate-900">단가표</h1>
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
        {canEdit && !form && <Btn onClick={() => setForm({ prefill: {} })}>새 케이스</Btn>}
      </header>

      {/*
        ★폼이 열리면 표·목록은 물러난다 (2026-08-29).★ 그전에는 폼이 페이지 맨 위에 끼어들고
        그 아래 매트릭스·케이스 목록이 그대로 남아, 케이스 하나를 고치는 화면이 한 페이지
        반 길이가 됐다 — 저장 단추가 어디 있는지 스크롤로 찾아야 했다. 위 useBackClose 가
        전제한 「화면을 통째로 대체한다」를 실제로 그렇게 만든다. 돌아가는 길은 폼 머리의
        「← 단가표로」와 취소, 그리고 뒤로 가기다.
      */}
      {form ? (
        <CaseForm
          key={JSON.stringify(form)}
          prefill={form.prefill}
          editId={form.editId}
          stepShapeOf={stepShapeOf}
          onDone={() => setForm(null)}
        />
      ) : (
        <>
          <BlockedLines lines={blockedLines} onFill={(prefill) => setForm({ prefill })} />
          <Grid rules={live} settleById={settleById} onOpen={setForm} />
          <CaseList
            rules={rules}
            settleById={settleById}
            referenced={referenced}
            onOpen={setForm}
          />
        </>
      )}
    </div>
    </CanEdit.Provider>
  );
}

/* ── 막힌 라인 ────────────────────────────────────────────────────────────
 * 「모든 현장에 대응한다」의 잣대는 이 목록이 0건인 것이다. 축 공간(180칸)을 다 채우는
 * 것이 아니라 — 실제로 들어온 라인이 케이스를 못 찾을 때만 여기 나타난다.
 */
function BlockedLines({ lines, onFill }: { lines: LineAxes[]; onFill: (p: Prefill) => void }) {
  const canEdit = useContext(CanEdit);
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
              {canEdit && (
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
              )}
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
 *
 * ★시기 탭★ 단가는 반년마다 갱신되므로 매트릭스도 반기 단위로 편다. 한 칸에 최신
 * 개정만 보이면 상반기 단가가 ×N 뒤에 숨는다 — 실제로 「왜 안 보이나」가 됐다.
 * 고른 반기까지 시작된 케이스 중 최신이 그 시기의 값이고, 이전 반기에서 이월된
 * 값(이 시기 개정 없음)은 연하게 보인다.
 *
 * 빈 칸은 조용한 「—」다. 진짜 경보는 위의 막힌 라인이 맡는다 — 축 공간 대부분은
 * 그 조합의 현장이 아직 없어서 비어 있는 것뿐이다.
 * 빈 칸을 누르면 그 축이 채워진 폼이, 찬 칸을 누르면 현재 케이스의 전 값을 실은
 * 개정 폼이 열린다 — 적용 시작만 비워서, 새 시작을 적어야 저장되게.
 */

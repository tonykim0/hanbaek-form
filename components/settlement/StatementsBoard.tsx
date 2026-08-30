'use client';

/**
 * 협력사 거래명세서 — 배치 목록.
 *
 * 배치 = (지급처 × 구분 × 지급일) — 영업비와 시공비는 세금계산서를 따로 끊으므로
 * 배치도 그 축으로 갈린다(한백 확인 2026-08-24). 가확정은 협력사 지급관리 표에서 체크로 만들고(그쪽이
 * 전 현장 현황을 보는 자리다), 여기는 만들어진 배치의 상태를 따라간다:
 *
 *   가확정    협력사가 이 합계로 세금계산서를 발행하는 단계
 *   확정      한백이 최종 확정 — 배치가 잠긴다
 *   지급완료   확정된 배치의 지급일이 지났다
 *   확정 누락  확정 없이 지급일이 지났다 — 확정은 지급의 전제인데 건너뛴 것이다
 *
 * 네 자리의 정본은 lib/payout-board 의 batchStateOf 다(두 축이 만든다).
 *
 * ★첨부와 확정을 줄에서 끝낸다★ — 계산서는 가확정 뒤 1~2일이면 오고, 확정에 필요한
 * 것(지급처·구분·지급일·합계·첨부 여부)은 줄에 다 있다. 계산서 한 장 = 그 줄에서
 * 첨부 → 확정. 상세(명세서)는 검토·인쇄·빼기·지급일 변경·해제의 자리다.
 *
 * ★계산서 자리를 한 열에 모은다 (한백 요청 2026-08-24).★ 예전에는 상태 배지·첨부 여부·확정
 * 단추가 세 열에 흩어져 있어서 줄을 좌우로 훑어야 다음 행동을 알았다. 그 열의 이름은
 * 「할 일」이었는데, 담기는 것이 계산서라 이름을 그것으로 바꿨다(한백 지적 2026-08-30). 그리고 확정 단추가 「거래명세서 →」와 붙어 있었다 — 가장 자주
 * 누르는 것과 배치를 잠그는 것이 나란히 있으면 안 된다(화면 규칙 8번).
 *
 * ★협력사도 본다★ — 자기 배치만(저장소가 가른다). 그 열의 내용이 눈에 따라 갈린다:
 * 협력사에게는 계산서 올리기, 한백에게는 첨부와 확정이다. 예전에는 협력사의 유일한
 * 할 일이 배지 아래 micro 잔글씨였다.
 *
 * ★협력사가 계산서를 직접 올린다★ (한백 지시 2026-08-30). 예전에는 「세금계산서 발행 —
 * 공급가액대로」라는 글자뿐이었고, 발행한 파일은 메일로 보내 한백이 옮겨 붙였다. 그 걸음을
 * 없앤다. 붙일 수 있는지는 판정 한 곳이 정한다(canAttachInvoice) — 자기 지급처의, 확정 전
 * 배치만. 확정 뒤에는 낸 것이 보이기만 한다: 한백이 보고 잠근 것과 붙어 있는 것이 달라지면
 * 안 된다.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { BatchFinal, PayoutKind, PayoutRow, TaxInvoice } from '@/types/project';
import {
  batchesOf, batchStateOf, canAttachInvoice, type Batch, type BatchState,
} from '@/lib/payout-board';
import type { Role } from '@/lib/roles';
import { Badge, Blank, Btn, Empty, Err, FIELD, Tag } from '@/components/ui';
import { Frame, won } from './parts';
import { useFinalizeBatch, useTaxInvoiceUpload } from './use-batch';

const BATCH_STATES = ['가확정', '확정 누락', '확정', '지급완료'] as const satisfies readonly BatchState[];
/** 상태마다 배지 색 — 확정 누락은 절차가 어긋난 것이라 가확정과 구별되어야 한다 */
const STATE_TONE: Record<BatchState, 'warn' | 'ok' | 'mute' | 'stop'> = {
  가확정: 'warn',
  '확정 누락': 'stop',
  확정: 'ok',
  지급완료: 'mute',
};
const PAYOUT_KINDS = ['영업비', '시공비'] as const satisfies readonly PayoutKind[];
/** 지급처가 비어 있는 배치 — 드롭다운에서도 고를 수 있어야 골라내 고칠 수 있다 */
const NO_ORG = '받는 곳 미지정';
const ALL = '전체';

export default function StatementsBoard({
  history, finals, invoices, seesAll, canEdit, role, myOrg,
}: {
  history: PayoutRow[];
  /** 확정된 배치 — 상태 배지의 정본. 협력사도 자기 것을 받는다. */
  finals: BatchFinal[];
  /** 첨부 파일 — 한백의 눈일 때만 내려온다(협력사는 빈 배열) */
  invoices: TaxInvoice[];
  /** 한백의 눈인가 — 첨부 파일 열이 보인다. 협력사는 자기 배치의 상태만 본다. */
  seesAll: boolean;
  /** 줄에서 첨부·확정을 누를 수 있는가 — 관리자만. 열람 전용은 보기만 한다. */
  canEdit: boolean;
  /** 보는 사람 — 어느 배치에 계산서를 붙일 수 있는지 줄마다 가린다 */
  role: Role;
  myOrg: string | null;
}) {
  // 묶는 규칙·상태 판정의 정본은 lib/payout-board — 할 일(세금계산서 발행)과 같은 정의다
  const batches = useMemo(() => batchesOf(history, finals, invoices), [history, finals, invoices]);

  /*
   * 필터 — 이 화면은 할 일 목록이다. 「계산서를 발행해야 하는 것」만 보는 것이 첫 쓰임이라
   * 상태가 첫 칸이다. 지급처는 한백에게만 준다 — 협력사는 자기 것 하나뿐이라 고를 게 없다.
   *
   * ★달 필터를 넣었다 (한백 2026-08-29).★ 없던 이유는 「지급완료를 걸러내면 남는 것이 곧
   * 앞으로의 것」이라서였는데, 지난 달을 되짚는 일(그 달에 무엇이 나갔나·계산서는 다
   * 받았나)이 실제로 있었다. 위 그래프에서 어느 달이 튀는지 보고 그 달을 여기서 여는
   * 것이 한 흐름이다. 해와 달을 한 칸으로 고른다 — 두 칸이면 「2026 × 3월」처럼 빈
   * 조합을 고를 수 있고, 있는 달만 내놓으면 그 일이 안 생긴다.
   */
  const [state, setState] = useState<string>(ALL);
  const [org, setOrg] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [month, setMonth] = useState<string>(ALL);

  /* 지급처 후보는 실제로 있는 배치에서 뽑는다 — 없는 곳을 고를 수 있으면 0건이 나온다 */
  const orgs = useMemo(
    () => [...new Set(batches.map((b) => b.org ?? NO_ORG))].sort((a, b) => a.localeCompare(b, 'ko')),
    [batches]
  );

  /* 달 후보는 실제로 배치가 있는 달만 — 최신이 위. 없는 달을 고를 수 있으면 0건이 나온다 */
  const months = useMemo(
    () => [...new Set(batches.map((b) => b.paidAt.slice(0, 7)))].sort().reverse(),
    [batches]
  );

  const shown = useMemo(
    () => batches.filter((b) =>
      (state === ALL || batchStateOf(b) === state)
      && (org === ALL || (b.org ?? NO_ORG) === org)
      && (kind === ALL || b.kind === kind)
      && (month === ALL || b.paidAt.slice(0, 7) === month)),
    [batches, state, org, kind, month]
  );
  const filtered = shown.length !== batches.length;
  /* 지금 보이는 것의 합 — 달을 고르면 그 달의 합이 된다(한백 2026-08-29) */
  const shownTotal = shown.reduce((n, b) => n + b.total, 0);
  const shownCount = shown.reduce((n, b) => n + b.count, 0);

  /* 상태별 건수 — 드롭다운 옵션에 적는다. 지급처·구분 필터와 무관한 전체 기준이다 */
  const countByState = useMemo(() => {
    const m = new Map<BatchState, number>();
    for (const b of batches) {
      const st = batchStateOf(b);
      m.set(st, (m.get(st) ?? 0) + 1);
    }
    return m;
  }, [batches]);

  return (
    <section>
      {/* 매트릭스·케이스와 같은 모양 — 고르는 것은 왼쪽에 몰고, 표 머리가 아래로 밀리지 않게 한 줄로 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-h3 font-black text-slate-900">배치</h2>
        <div className="w-40">
          {/* 건수를 옵션에 적는다 — 「가확정이 몇 건인가」를 눌러 보기 전에 안다. 0건인 상태는 골라도 빈 목록뿐이라 숫자가 곧 안내다 */}
          <select aria-label="상태" className={FIELD} value={state} onChange={(e) => setState(e.target.value)}>
            {[ALL, ...BATCH_STATES].map((v) => (
              <option key={v} value={v}>
                {v === ALL ? '상태 전체' : `${v} (${countByState.get(v as BatchState) ?? 0})`}
              </option>
            ))}
          </select>
        </div>
        {/* 지급처는 한백에게만 — 협력사는 자기 것 하나뿐이다 */}
        {seesAll && orgs.length > 1 && (
          <div className="w-44">
            <select aria-label="지급처" className={FIELD} value={org} onChange={(e) => setOrg(e.target.value)}>
              {[ALL, ...orgs].map((v) => (
                <option key={v} value={v}>{v === ALL ? '지급처 전체' : v}</option>
              ))}
            </select>
          </div>
        )}
        <div className="w-32">
          <select aria-label="구분" className={FIELD} value={kind} onChange={(e) => setKind(e.target.value)}>
            {[ALL, ...PAYOUT_KINDS].map((v) => (
              <option key={v} value={v}>{v === ALL ? '구분 전체' : v}</option>
            ))}
          </select>
        </div>
        {/* 달 — 배치가 한 달치뿐이면 고를 것이 없다(칸만 늘고 얻는 것이 없다) */}
        {months.length > 1 && (
          <div className="w-36">
            <select aria-label="지급월" className={FIELD} value={month} onChange={(e) => setMonth(e.target.value)}>
              {[ALL, ...months].map((v) => (
                <option key={v} value={v}>
                  {v === ALL ? '지급월 전체' : `${v.slice(0, 4)}년 ${Number(v.slice(5))}월`}
                </option>
              ))}
            </select>
          </div>
        )}
        <span className="text-tiny font-bold tabular-nums text-slate-400">
          {shown.length}건
          {/* 걸러서 몇 건이 빠졌는지 적는다 — 안 적으면 걸러진 목록이 전부처럼 보인다 */}
          {filtered && <span className="ml-1 font-semibold text-slate-300">/ 전체 {batches.length}건</span>}
        </span>
        {seesAll && (
          <Link
            href="/payouts"
            className="ml-auto text-small font-bold text-slate-500 transition hover:text-brand-800"
          >
            가확정은 협력사 지급관리에서 →
          </Link>
        )}
      </div>
      {shown.length === 0 ? (
        <Blank>{filtered ? '조건에 맞는 배치 0건' : '0건'}</Blank>
      ) : (
        <Frame min="760px">
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left">지급일</th>
              {/*
                지급처는 한백에게만 — 협력사는 자기 것 하나뿐이라 모든 줄에 제 회사 이름이
                되풀이된다(2026-08-30). 위 필터가 이미 같은 이유로 감춰져 있었는데 열만
                남아 있었다. 아래 합계 줄의 colSpan 도 같이 움직인다.
              */}
              {seesAll && <th className="px-3 py-2.5 text-left">지급처</th>}
              <th className="px-3 py-2.5 text-left">구분</th>
              {/* 여기부터 돈이다 — 얇은 선으로 「무엇이」와 「얼마」를 가른다(기성관리 표와 같은 모양) */}
              <th className="border-l border-slate-200 px-3 py-2.5 text-right">건수</th>
              <th className="px-3 py-2.5 text-right">공급가액</th>
              <th className="border-l border-slate-200 px-3 py-2.5 text-left">상태</th>
              {/*
                세금계산서 — 상태 배지·첨부·확정이 세 열에 흩어져 있던 것을 하나로 모은
                자리다(2026-08-24). 이름은 「할 일」이었는데 ★이 칸에 실제로 담기는 것은
                계산서★다 — 협력사는 올리고, 한백은 붙이고 확정한다(한백 지적 2026-08-30).
                다음 행동이 이 칸 안에서 순서대로 보이고, 끝난 배치는 계산서 링크만 남는다.
                명세서 링크는 오른쪽 끝 — 자주 누르는 것과 잠그는 것을 붙여 두지 않는다
                (화면 규칙 8번).
              */}
              <th className="px-3 py-2.5 text-left">세금계산서</th>
              <th className="px-3 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((b) => (
              <BatchRow
                key={`${b.paidAt}|${b.org ?? ''}|${b.kind}`}
                b={b} seesAll={seesAll} canEdit={canEdit} role={role} myOrg={myOrg}
              />
            ))}
          </tbody>
          {/*
            합계는 열 아래에 선다 — 위 필터 줄에 적으면 어느 열의 합인지 눈이 짝지어야 한다.
            ★지금 보이는 것의 합이다★ (한백 2026-08-29): 달을 고르면 그 달의 합이고,
            지급처·구분을 고르면 그 몫의 합이다. 그래서 무엇을 걸렀는지 왼쪽에 같이 적는다 —
            안 적으면 걸러진 합계가 전체 합계처럼 읽힌다.
          */}
          <tfoot className="border-t-2 border-slate-200 bg-slate-50/60 text-slate-800">
            <tr>
              <td
                className="px-3 py-2.5 text-tiny font-bold tracking-[0.06em] text-slate-500"
                colSpan={seesAll ? 3 : 2}
              >
                합계
                {filtered && (
                  <span className="ml-1.5 font-semibold text-slate-400">
                    {month !== ALL && `${month.slice(0, 4)}년 ${Number(month.slice(5))}월 · `}
                    {shown.length}/{batches.length}배치
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap border-l border-slate-200 px-3 py-2.5 text-right tabular-nums text-slate-500">
                {shownCount}건
              </td>
              <td className={`whitespace-nowrap px-3 py-2.5 text-right text-lead font-black tabular-nums ${shownTotal < 0 ? 'text-amber-800' : 'text-slate-900'}`}>
                {won(shownTotal)}
              </td>
              <td className="border-l border-slate-200" colSpan={3} />
            </tr>
          </tfoot>
        </Frame>
      )}
    </section>
  );
}

function BatchRow({
  b, seesAll, canEdit, role, myOrg,
}: { b: Batch; seesAll: boolean; canEdit: boolean; role: Role; myOrg: string | null }) {
  const state = batchStateOf(b);
  return (
    <tr className="transition hover:bg-brand-50/40">
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{b.paidAt}</td>
      {seesAll && (
        <td className="px-3 py-2.5 text-slate-700">
          {/* 드롭다운의 이름표와 같은 말이어야 골라낸 것과 표의 줄이 같아 보인다 */}
          {b.org ?? <Empty kind="miss" label={NO_ORG} />}
        </td>
      )}
      <td className="whitespace-nowrap px-3 py-2.5">
        <Tag tone={b.kind === '영업비' ? 'stage' : 'ok'}>{b.kind}</Tag>
      </td>
      <td className="whitespace-nowrap border-l border-slate-100 px-3 py-2.5 text-right tabular-nums text-slate-500">
        {b.count}건
      </td>
      <td className={`whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums ${b.total < 0 ? 'text-amber-800' : 'text-slate-800'}`}>
        {won(b.total)}
      </td>
      <td className="whitespace-nowrap border-l border-slate-100 px-3 py-2.5">
        <Badge tone={STATE_TONE[state]}>{state}</Badge>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <TodoCell b={b} state={state} seesAll={seesAll} canEdit={canEdit} role={role} myOrg={myOrg} />
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right">
        {b.org && (
          <Link
            href={`/payments/statement?org=${encodeURIComponent(b.org)}&date=${b.paidAt}&kind=${encodeURIComponent(b.kind)}`}
            className="text-small font-bold text-brand-700 transition hover:text-brand-900"
          >
            거래명세서 →
          </Link>
        )}
      </td>
    </tr>
  );
}

/**
 * 할 일 한 칸 — 이 배치에서 다음 행동이 무엇인가.
 *
 * 눈에 따라 다르다: 협력사의 할 일은 계산서 발행이고, 한백의 할 일은 첨부와 확정이다.
 * 할 일이 없으면 무엇으로 끝났는지(계산서 링크)나 「—」를 남긴다 — 빈 칸도 자리를
 * 지킨다(화면 규칙 6번).
 */
function TodoCell({
  b, state, seesAll, canEdit, role, myOrg,
}: {
  b: Batch;
  state: BatchState;
  seesAll: boolean;
  canEdit: boolean;
  role: Role;
  myOrg: string | null;
}) {
  /* 낸 계산서는 눈에 상관없이 같은 모양이다 — 누른 곳이 파일이라는 것이 먼저다 */
  const link = b.invoice ? (
    <a
      href={b.invoice.blobUrl}
      target="_blank"
      rel="noopener"
      className="text-small font-bold text-brand-700 underline-offset-2 hover:underline"
    >
      계산서
    </a>
  ) : null;
  /*
   * 협력사 — 가확정이면 이 합계로 계산서를 발행하고, ★그 자리에서 올린다★.
   * 확정된 뒤에는 낸 것만 보인다(바꾸려면 한백에 알린다).
   */
  if (!seesAll) {
    const mayAttach = b.org !== null
      && canAttachInvoice({ role, org: myOrg, batchOrg: b.org, finalized: b.finalized });
    if (!mayAttach) return link ?? <span className="text-small text-slate-300">—</span>;
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {link}
        <RowAttach
          org={b.org!} kind={b.kind} date={b.paidAt}
          pdfOnly
          label={link ? '바꾸기' : '세금계산서 올리기'}
        />
        {/*
          * 얼마로 끊나 — 합계(공급가액)는 같은 줄 왼쪽 칸에 있다.
          * ★가확정일 때만 적는다★ — 「확정 누락」은 지급일이 지난 자리라 발행을 재촉하는
          * 말이 아니다(올리는 것은 그때도 열려 있다).
          */}
        {!link && state === '가확정' && (
          <span className="text-tiny font-bold text-amber-700">공급가액대로</span>
        )}
      </span>
    );
  }

  const attached = link;

  // 열람 전용 — 행동 없이 사실만
  if (!canEdit || !b.org) {
    return attached ?? <span className="text-small text-slate-300">계산서 미첨부</span>;
  }

  /*
   * 확정 누락에도 확정 단추를 준다 — 예전에는 지급일이 지나면 단추가 사라져서, 놓친
   * 배치를 목록에서 고칠 수 없었다(상세에는 있는데 목록에는 신호도 길도 없었다).
   * 확정은 지급의 전제라 놓친 것일수록 바로 그 자리에서 채워야 한다(화면 규칙 7번).
   */
  const canFinalize = state === '가확정' || state === '확정 누락';

  return (
    <span className="inline-flex items-center gap-2.5">
      {/* 첨부는 확정 여부와 무관하다(보관용) — 잠긴 배치에도 계산서는 붙는다 */}
      {attached ?? <RowAttach org={b.org} kind={b.kind} date={b.paidAt} />}
      {canFinalize && <RowFinalize org={b.org} kind={b.kind} date={b.paidAt} />}
    </span>
  );
}

/** 줄의 확정 — 배치를 잠근다. 해제는 명세서(상세)나 지급관리의 지급 칸에서. */
function RowFinalize({ org, kind, date }: { org: string; kind: PayoutKind; date: string }) {
  const { busy, error, finalize } = useFinalizeBatch(org, kind, date);

  return (
    <span>
      <Btn size="sm" busy={busy} busyLabel="확정 중…" onClick={() => void finalize()}>
        확정
      </Btn>
      <Err className="block">{error}</Err>
    </span>
  );
}

/** 줄의 계산서 첨부 — 교체·삭제는 명세서(상세)에서 한다 */
function RowAttach({
  org, kind, date, pdfOnly = false, label = '첨부',
}: {
  org: string;
  kind: PayoutKind;
  date: string;
  /** 협력사 자리는 PDF 만 받는다 */
  pdfOnly?: boolean;
  /** 무엇을 하는 자리인지 — 협력사에게는 「세금계산서 올리기」다 */
  label?: string;
}) {
  const { busy, error, inputProps } = useTaxInvoiceUpload(org, kind, date, pdfOnly);

  return (
    <span>
      <label className={`text-small font-bold transition ${
        busy ? 'text-slate-400' : 'cursor-pointer text-slate-500 hover:text-brand-800'
      }`}>
        {busy ? '올리는 중…' : label}
        <input {...inputProps} className="hidden" />
      </label>
      <Err className="block">{error}</Err>
    </span>
  );
}

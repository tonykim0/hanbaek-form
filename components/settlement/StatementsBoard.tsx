'use client';

/**
 * 협력사 거래명세서 — 배치 목록.
 *
 * 배치 = (지급처 × 구분 × 지급일) — 영업비와 시공비는 세금계산서를 따로 끊으므로
 * 배치도 그 축으로 갈린다(한백 확인 2026-08-24). 가확정은 협력사 지급관리 표에서 체크로 만들고(그쪽이
 * 전 현장 현황을 보는 자리다), 여기는 만들어진 배치의 상태를 따라간다:
 *
 *   가확정   협력사가 이 합계로 세금계산서를 발행하는 단계 — 협력사 화면에는
 *            「세금계산서 발행 요청」으로 보인다
 *   확정     계산서가 첨부되고 한백이 최종 확정 — 배치가 잠긴다
 *   지급완료  확정된 배치의 지급일이 지났다
 *
 * ★첨부와 확정을 줄에서 끝낸다★ — 계산서는 가확정 뒤 1~2일이면 오고, 확정에 필요한
 * 것(지급처·구분·지급일·합계·첨부 여부)은 줄에 다 있다. 계산서 한 장 = 그 줄에서
 * 첨부 → 확정. 상세(명세서)는 검토·인쇄·빼기·지급일 변경·해제의 자리다.
 *
 * ★협력사도 본다★ — 자기 배치만(저장소가 가른다). 첨부 파일 열은 한백의 보관함이라
 * 한백에게만 보이지만, 상태 배지는 협력사에게가 더 중요하다 — 발행하라는 신호다.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { BatchFinal, PayoutKind, PayoutRow, TaxInvoice } from '@/types/project';
import { batchesOf, batchStateOf, type Batch, type BatchState } from '@/lib/payout-board';
import { Badge, Blank, Btn, Empty, Err, FIELD, Tag } from '@/components/ui';
import { Frame, won } from './parts';
import { useFinalizeBatch, useTaxInvoiceUpload } from './use-batch';

const BATCH_STATES = ['가확정', '확정', '지급완료'] as const satisfies readonly BatchState[];
const PAYOUT_KINDS = ['영업비', '시공비'] as const satisfies readonly PayoutKind[];
/** 지급처가 비어 있는 배치 — 드롭다운에서도 고를 수 있어야 골라내 고칠 수 있다 */
const NO_ORG = '받는 곳 미지정';
const ALL = '전체';

export default function StatementsBoard({
  history, finals, invoices, seesAll, canEdit,
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
}) {
  // 묶는 규칙·상태 판정의 정본은 lib/payout-board — 할 일(세금계산서 발행)과 같은 정의다
  const batches = useMemo(() => batchesOf(history, finals, invoices), [history, finals, invoices]);

  /*
   * 필터 — 이 화면은 할 일 목록이다. 「계산서를 발행해야 하는 것」만 보는 것이 첫 쓰임이라
   * 상태가 첫 칸이다. 지급처는 한백에게만 준다 — 협력사는 자기 것 하나뿐이라 고를 게 없다.
   * 달 필터는 두지 않았다: 목록이 지급일 내림차순이고 「지급완료」를 걸러내면 남는 것이
   * 곧 앞으로의 것이라, 달을 또 고르게 하면 칸만 늘고 얻는 것이 없다.
   */
  const [state, setState] = useState<string>(ALL);
  const [org, setOrg] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);

  /* 지급처 후보는 실제로 있는 배치에서 뽑는다 — 없는 곳을 고를 수 있으면 0건이 나온다 */
  const orgs = useMemo(
    () => [...new Set(batches.map((b) => b.org ?? NO_ORG))].sort((a, b) => a.localeCompare(b, 'ko')),
    [batches]
  );

  const shown = useMemo(
    () => batches.filter((b) =>
      (state === ALL || batchStateOf(b) === state)
      && (org === ALL || (b.org ?? NO_ORG) === org)
      && (kind === ALL || b.kind === kind)),
    [batches, state, org, kind]
  );
  const filtered = shown.length !== batches.length;

  return (
    <section>
      {/* 매트릭스·케이스와 같은 모양 — 고르는 것은 왼쪽에 몰고, 표 머리가 아래로 밀리지 않게 한 줄로 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-h3 font-black text-slate-900">배치</h2>
        <div className="w-32">
          <select aria-label="상태" className={FIELD} value={state} onChange={(e) => setState(e.target.value)}>
            {[ALL, ...BATCH_STATES].map((v) => (
              <option key={v} value={v}>{v === ALL ? '상태 전체' : v}</option>
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
              <th className="px-3 py-2.5 text-left">지급처</th>
              <th className="px-3 py-2.5 text-left">구분</th>
              <th className="px-3 py-2.5 text-right">건수</th>
              <th className="px-3 py-2.5 text-right">공급가액</th>
              <th className="px-3 py-2.5 text-left">상태</th>
              {seesAll && <th className="px-3 py-2.5 text-left">세금계산서</th>}
              <th className="px-3 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((b) => (
              <BatchRow key={`${b.paidAt}|${b.org ?? ''}|${b.kind}`} b={b} seesAll={seesAll} canEdit={canEdit} />
            ))}
          </tbody>
        </Frame>
      )}
    </section>
  );
}

function BatchRow({ b, seesAll, canEdit }: { b: Batch; seesAll: boolean; canEdit: boolean }) {
  const state = batchStateOf(b);
  return (
    <tr className="transition hover:bg-brand-50/40">
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{b.paidAt}</td>
      <td className="px-3 py-2.5 text-slate-700">
        {/* 드롭다운의 이름표와 같은 말이어야 골라낸 것과 표의 줄이 같아 보인다 */}
        {b.org ?? <Empty kind="miss" label={NO_ORG} />}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <Tag tone={b.kind === '영업비' ? 'stage' : 'ok'}>{b.kind}</Tag>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-500">{b.count}건</td>
      <td className={`whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums ${b.total < 0 ? 'text-amber-800' : 'text-slate-800'}`}>
        {won(b.total)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        {state === '가확정' && (
          <>
            <Badge tone="warn">가확정</Badge>
            {/* 협력사에게는 이 배지가 곧 할 일이다 — 이 합계로 계산서를 발행한다 */}
            {!seesAll && (
              <p className="mt-0.5 text-micro font-bold text-amber-700">세금계산서 발행 요청</p>
            )}
          </>
        )}
        {state === '확정' && <Badge tone="ok">확정</Badge>}
        {state === '지급완료' && <Badge tone="mute">지급완료</Badge>}
      </td>
      {seesAll && (
        <td className="whitespace-nowrap px-3 py-2.5">
          {b.invoice ? (
            <a
              href={b.invoice.blobUrl}
              target="_blank"
              rel="noopener"
              className="text-small font-bold text-brand-700 underline-offset-2 hover:underline"
            >
              첨부됨
            </a>
          ) : canEdit && b.org ? (
            // 계산서가 오면 이 줄에서 바로 붙인다 — 확정 여부와 무관한 보관용 첨부다
            <RowAttach org={b.org} kind={b.kind} date={b.paidAt} />
          ) : (
            <span className="text-small text-slate-300">미첨부</span>
          )}
        </td>
      )}
      <td className="whitespace-nowrap px-3 py-2.5 text-right">
        <span className="inline-flex items-center gap-2.5">
          {/* 확정은 줄에서 — 필요한 값이 이 줄에 다 있고, 해제(상세)가 있어 되돌릴 수 있다 */}
          {canEdit && b.org && state === '가확정' && (
            <RowFinalize org={b.org} kind={b.kind} date={b.paidAt} />
          )}
          {b.org && (
            <Link
              href={`/payments/statement?org=${encodeURIComponent(b.org)}&date=${b.paidAt}&kind=${encodeURIComponent(b.kind)}`}
              className="text-small font-bold text-brand-700 transition hover:text-brand-900"
            >
              명세서 →
            </Link>
          )}
        </span>
      </td>
    </tr>
  );
}

/** 줄의 확정 — 배치를 잠근다. 항목을 고치려면 명세서(상세)에서 해제부터. */
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
function RowAttach({ org, kind, date }: { org: string; kind: PayoutKind; date: string }) {
  const { busy, error, inputProps } = useTaxInvoiceUpload(org, kind, date);

  return (
    <span>
      <label className={`text-small font-bold transition ${
        busy ? 'text-slate-400' : 'cursor-pointer text-slate-500 hover:text-brand-800'
      }`}>
        {busy ? '올리는 중…' : '첨부'}
        <input {...inputProps} className="hidden" />
      </label>
      <Err className="block">{error}</Err>
    </span>
  );
}

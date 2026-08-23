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
 * ★협력사도 본다★ — 자기 배치만(저장소가 가른다). 첨부 파일 열은 한백의 보관함이라
 * 한백에게만 보이지만, 상태 배지는 협력사에게가 더 중요하다 — 발행하라는 신호다.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import type { BatchFinal, PayoutKind, PayoutRow, TaxInvoice } from '@/types/project';
import { today } from '@/lib/date';
import { Badge, Blank, Empty, Tag } from '@/components/ui';
import { Frame, won } from './parts';

interface Batch {
  paidAt: string;
  org: string | null;
  kind: PayoutKind;
  count: number;
  total: number;
  finalized: boolean;
  invoice: TaxInvoice | null;
}

/**
 * 배치의 자리 — 가확정 → 확정 → 지급완료.
 *
 * 지급일이 지난 배치는 확정 여부와 무관하게 지급완료다 — 이 시스템에서 원장의 지난
 * 지급일은 곧 사실이다(/payments 와 같은 해석). 두 단계 확정을 들이기 전에 나간
 * 배치들이 전부 「발행 요청」으로 보이면 협력사가 옛 지급마다 계산서를 다시 발행하려
 * 든다. 「가확정」과 그 신호는 지급일 전에만 뜻이 있다.
 */
function stateOf(b: Batch): '가확정' | '확정' | '지급완료' {
  if (b.paidAt < today()) return '지급완료';
  return b.finalized ? '확정' : '가확정';
}

export default function StatementsBoard({
  history, finals, invoices, seesAll,
}: {
  history: PayoutRow[];
  /** 확정된 배치 — 상태 배지의 정본. 협력사도 자기 것을 받는다. */
  finals: BatchFinal[];
  /** 첨부 파일 — 한백의 눈일 때만 내려온다(협력사는 빈 배열) */
  invoices: TaxInvoice[];
  /** 한백의 눈인가 — 첨부 파일 열이 보인다. 협력사는 자기 배치의 상태만 본다. */
  seesAll: boolean;
}) {
  const batches = useMemo<Batch[]>(() => {
    const inv = new Map(invoices.map((i) => [`${i.payDate}|${i.org}|${i.kind}`, i]));
    const fin = new Set(finals.map((f) => `${f.payDate}|${f.org}|${f.kind}`));
    const map = new Map<string, Batch>();
    for (const r of history) {
      const key = `${r.paidAt}|${r.org ?? ''}|${r.kind}`;
      const b = map.get(key) ?? {
        paidAt: r.paidAt, org: r.org, kind: r.kind, count: 0, total: 0,
        finalized: r.org ? fin.has(`${r.paidAt}|${r.org}|${r.kind}`) : false,
        invoice: r.org ? inv.get(`${r.paidAt}|${r.org}|${r.kind}`) ?? null : null,
      };
      b.count += 1;
      b.total += r.amount;
      map.set(key, b);
    }
    return [...map.values()].sort(
      (a, b) =>
        b.paidAt.localeCompare(a.paidAt)
        || (a.org ?? '').localeCompare(b.org ?? '', 'ko')
        || a.kind.localeCompare(b.kind)
    );
  }, [history, finals, invoices]);

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-h3 font-black text-slate-900">배치</h2>
        <span className="text-tiny font-bold tabular-nums text-slate-400">{batches.length}건</span>
        {seesAll && (
          <Link
            href="/payouts"
            className="ml-auto text-small font-bold text-slate-500 transition hover:text-brand-800"
          >
            가확정은 협력사 지급관리에서 →
          </Link>
        )}
      </div>
      {batches.length === 0 ? (
        <Blank>0건</Blank>
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
            {batches.map((b) => (
              <BatchRow key={`${b.paidAt}|${b.org ?? ''}|${b.kind}`} b={b} seesAll={seesAll} />
            ))}
          </tbody>
        </Frame>
      )}
    </section>
  );
}

function BatchRow({ b, seesAll }: { b: Batch; seesAll: boolean }) {
  const state = stateOf(b);
  return (
    <tr className="transition hover:bg-brand-50/40">
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{b.paidAt}</td>
      <td className="px-3 py-2.5 text-slate-700">
        {b.org ?? <Empty kind="miss" label="받는 곳 미지정" />}
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
          ) : (
            <span className="text-small text-slate-300">미첨부</span>
          )}
        </td>
      )}
      <td className="whitespace-nowrap px-3 py-2.5 text-right">
        {b.org && (
          <Link
            href={`/payments/statement?org=${encodeURIComponent(b.org)}&date=${b.paidAt}&kind=${encodeURIComponent(b.kind)}`}
            className="text-small font-bold text-brand-700 transition hover:text-brand-900"
          >
            명세서 →
          </Link>
        )}
      </td>
    </tr>
  );
}

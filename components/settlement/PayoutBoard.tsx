'use client';

/**
 * 하도급사 지급관리 — 하도급사에게 내려줄 돈.
 *
 * 축은 상대와 회차다. 현장 하나가 두 줄이 된다 — 영업사에게 줄 돈과 시공사에게 줄 돈은
 * 받는 곳이 다르고 금액도 따로 나간다. 한 줄로 묶으면 「누구에게 얼마가 남았나」를
 * 셀 안에서 다시 쪼개 읽어야 한다.
 *
 * 금액을 사람이 적지 않는다. 계약 라인에 붙인 단가에서 나오고 회차 비율로 쪼갠다
 * (lib/settlement.ts). 사람이 정하는 것은 언제 줬는가뿐이다.
 */
import { Fragment, useMemo, useState } from 'react';
import type { SettlementSummary } from '@/types/project';
import { PAY_SPLIT, payInstallments } from '@/lib/settlement';
import { CrossLink, Empty, Frame, SiteLink, Tile, won } from './parts';

/** 지급 한 건 — 현장 하나에 영업·시공 두 건이 붙는다 */
interface Payout {
  key: string;
  projectId: string;
  projectName: string;
  cpo: string;
  kind: '영업' | '시공';
  org: string | null;
  total: number;
  dates: Array<string | null>;
  unpriced: number;
}

function payoutsOf(rows: SettlementSummary[]): Payout[] {
  return rows.flatMap((r) => [
    {
      key: `${r.id}-영업`, projectId: r.id, projectName: r.name, cpo: r.cpo, kind: '영업' as const,
      org: r.salesOrg, total: r.salesTotal,
      dates: [r.salesPay1Date, r.salesPay2Date], unpriced: r.unpricedLines,
    },
    {
      key: `${r.id}-시공`, projectId: r.id, projectName: r.name, cpo: r.cpo, kind: '시공' as const,
      org: r.gcOrg, total: r.consTotal,
      dates: [r.consPay1Date, r.consPay2Date], unpriced: r.unpricedLines,
    },
  ]);
}

/** 아직 안 나간 돈 — 지급일이 안 찍힌 회차의 금액 합 */
function unpaidOf(p: Payout): number {
  return payInstallments(p.total).reduce((n, amount, i) => (p.dates[i] ? n : n + amount), 0);
}

export default function PayoutBoard({ rows }: { rows: SettlementSummary[] }) {
  const [org, setOrg] = useState<string | null>(null);

  const payouts = useMemo(() => payoutsOf(rows), [rows]);

  const orgs = useMemo(
    () =>
      [...new Set(payouts.map((p) => p.org).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b, 'ko')
      ),
    [payouts]
  );

  /*
   * ★받는 곳이 없는 줄은 합계에서 뺀다.★
   *
   * 한백이 계정 없는 업체의 건을 대신 접수하면서 업체명을 비우면, 그 현장도 영업·시공
   * 두 줄이 생긴다. 그것을 합계에 넣으면 「안 나간 돈」이 줄 사람 없는 금액까지 세게 되고,
   * 그 숫자는 한백이 현금 채무를 세는 숫자다 — 지우려면 거짓 지급일을 찍어야 했다.
   *
   * 없는 것으로 치지도 않는다. 따로 세어 경고로 세운다 — 업체를 지정하면 합계로 들어온다.
   */
  const payable = useMemo(() => payouts.filter((p) => p.org !== null), [payouts]);
  const orphan = useMemo(() => payouts.filter((p) => p.org === null), [payouts]);

  const money = useMemo(() => {
    const of = (kind: Payout['kind']) => payable.filter((p) => p.kind === kind);
    const sum = (list: Payout[]) => list.reduce((n, p) => n + p.total, 0);
    const unpaidSum = (list: Payout[]) => list.reduce((n, p) => n + unpaidOf(p), 0);
    return {
      salesTotal: sum(of('영업')),
      salesUnpaid: unpaidSum(of('영업')),
      consTotal: sum(of('시공')),
      consUnpaid: unpaidSum(of('시공')),
      total: sum(payable),
      unpaid: unpaidSum(payable),
      receivable: rows.reduce((n, r) => n + r.planTotal, 0),
      margin: rows.reduce((n, r) => n + r.marginTotal, 0),
      unpriced: rows.filter((r) => r.unpricedLines > 0).length,
      orphanCount: orphan.length,
      orphanSites: [...new Set(orphan.map((p) => p.projectName))],
      orphanTotal: sum(orphan),
    };
  }, [payable, orphan, rows]);

  // 「전체」에도 받는 곳 없는 줄은 안 섞는다 — 합계와 목록이 다른 것을 세면 안 맞는다
  const shown = org === null ? payable : payable.filter((p) => p.org === org);

  return (
    <div>
      <section aria-label="지급 합계" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="영업비" value={money.salesTotal} tone="out"
          note={`안 나간 돈 ${won(money.salesUnpaid)}원`} />
        <Tile label="시공비" value={money.consTotal} tone="out"
          note={`안 나간 돈 ${won(money.consUnpaid)}원`} />
        <Tile label="내려줄 지급 합계" value={money.total}
          note={`안 나간 돈 ${won(money.unpaid)}원`} />
        <Tile label="한백 몫" value={money.margin} note="받을 기성 − 내려줄 지급" />
      </section>

      {money.orphanCount > 0 && (
        <p className="mb-4 rounded-xl border-l-[3px] border-amber-500 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-900">
          받는 곳이 정해지지 않은 지급 <b>{money.orphanCount}건</b> ({money.orphanSites.join(' · ')})
          — 합계 {won(money.orphanTotal)}원. <b>합계에서 빼 두었습니다.</b>{' '}
          현장 상세의 현장 정보에서 영업사·시공사를 지정하면 합계로 들어옵니다.
        </p>
      )}

      {money.unpriced > 0 && (
        <p className="mb-4 rounded-xl border-l-[3px] border-amber-500 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-900">
          단가가 안 붙은 라인이 있는 현장 <b>{money.unpriced}건</b> — 그 라인은 0원으로 더해지므로
          지급액이 실제보다 적게 잡힙니다. 현장 상세의 정산 탭에서 단가 케이스를 지정해야 합니다.
        </p>
      )}

      {/* 받는 곳 고르기 — 한 번에 하나다. 여러 곳을 겹쳐 보는 일이 없다. */}
      {orgs.length > 1 && (
        <div className="mb-3 flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-0.5">
          {[null, ...orgs].map((o) => (
            <button
              key={o ?? '전체'}
              type="button"
              aria-current={org === o}
              onClick={() => setOrg(o)}
              className={`whitespace-nowrap rounded-[10px] px-3 py-1.5 text-[12px] font-bold transition ${
                org === o ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {o ?? '전체'}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <Empty />
      ) : (
        <Frame min="1080px">
          <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left">현장</th>
              <th className="px-3 py-2.5 text-left">구분</th>
              <th className="px-3 py-2.5 text-left">받는 곳</th>
              <th className="px-3 py-2.5 text-right">지급액</th>
              {PAY_SPLIT.map((r, i) => (
                <Fragment key={i}>
                  <th className="px-3 py-2.5 text-right">
                    {i + 1}차{' '}
                    <span className="font-normal text-slate-400">{Math.round(r * 100)}%</span>
                  </th>
                  <th className="px-3 py-2.5 text-left">{i + 1}차 지급일</th>
                </Fragment>
              ))}
              <th className="px-3 py-2.5 text-right">안 나간 돈</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((p) => {
              const parts = payInstallments(p.total);
              const unpaid = unpaidOf(p);
              return (
                <tr key={p.key} className="transition hover:bg-brand-50/40">
                  <td className="px-3 py-2.5">
                    <SiteLink id={p.projectId} name={p.projectName} />
                    <p className="mt-0.5 text-[11px] text-slate-400">{p.cpo}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        p.kind === '영업' ? 'bg-sky-100 text-sky-900' : 'bg-brand-100 text-brand-900'
                      }`}
                    >
                      {p.kind}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{p.org ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-800">
                    {won(p.total)}
                    {p.unpriced > 0 && (
                      <span
                        className="ml-1 whitespace-nowrap text-[10px] font-bold text-amber-700"
                        title="단가가 안 붙은 라인이 있어 실제보다 적습니다"
                      >
                        단가 미지정
                      </span>
                    )}
                  </td>
                  {parts.map((amount, i) => (
                    <Fragment key={i}>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-700">
                        {won(amount)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2.5 tabular-nums ${
                          p.dates[i] ? 'font-semibold text-brand-800' : 'text-slate-300'
                        }`}
                      >
                        {p.dates[i] ?? '미지급'}
                      </td>
                    </Fragment>
                  ))}
                  <td
                    className={`px-3 py-2.5 text-right font-bold tabular-nums ${
                      unpaid > 0 ? 'text-amber-800' : 'text-slate-300'
                    }`}
                  >
                    {unpaid > 0 ? won(unpaid) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Frame>
      )}

      <CrossLink
        href="/receivables"
        label="운영사 기성관리"
        amount={money.receivable}
        note="이 현장들에서 운영사에게 받을 기성은"
      />
    </div>
  );
}

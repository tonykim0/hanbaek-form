'use client';

/**
 * 거래명세서 한 장 — 인쇄물이자 (한백에게는) 배치를 고치는 자리.
 *
 * ★줄을 손으로 적지 않는다★ — 원장에서 그려진다. 항목이 틀렸으면 여기서 빼고
 * (원장 삭제 → 그 회차는 지급 가능으로 돌아간다) 지급관리 표에서 다시 가확정한다.
 * 반쯤 고친 명세서가 남는 것보다, 원장을 고치고 이 장을 다시 그리는 것이 맞다.
 *
 * 최종 확정과 첨부는 배치 목록의 줄에도 있다 — 보통 일은 거기서 끝난다. 여기의
 * 확정 카드는 검토하러 들어왔다가 그 자리에서 누르는 길이다. 확정·해제는 배치 목록과
 * 협력사 지급관리의 지급 칸에서도 된다(한백 확인 2026-08-25) — 세 자리가 같은 훅을 쓴다.
 * 확정은 세금계산서와 무관하게 한백이 누른다(한백 확인 2026-08-24, 계산서는 검토
 * 없는 보관용 첨부일 뿐이다). 확정되면 배치가 잠긴다(빼기·지급일 변경·취소) —
 * 협력사에게 이 합계가 최종이라고 말한 것이기 때문이다. 계산서 첨부·교체·삭제는
 * 잠기지 않는다. 잠금은 서버가 지킨다(pg-store) — 여기서는 눌리지 않게 감출 뿐이다.
 *
 * ★공급자는 협력사, 공급받는자는 한백이다 (한백 확인 2026-08-24).★
 * 협력사가 영업·시공을 공급하고 한백이 대금을 지급한다 — 그래서 세금계산서도 협력사가
 * 발행한다. 예전 머리글은 「공급자 한백 → 받는 곳 협력사」였다: 돈이 나가는 방향을 공급으로
 * 읽은 것이고, 그러면 이 명세서와 협력사가 끊은 계산서가 서로 반대를 말한다.
 * 이 장은 그 계산서를 뒷받침하는 명세다.
 *
 * ★부가세 줄★ 원장 금액은 공급가액이다(한백 확인 2026-08-23). 부가세·합계는 참고로
 * 적는다 — 실제 송금액은 합계다.
 *
 * 편집(빼기·지급일·세금계산서)은 전부 print:hidden — 종이에는 명세서만 남는다.
 */
import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PayoutKind, PayoutRow, TaxInvoice } from '@/types/project';
import type { PartnerDetailsView } from '@/lib/auth/partner-details';
import { HANBAEK } from '@/lib/hanbaek';
import { formatKoreanBizIdInput } from '@/lib/bizid';
import { batchStateOf } from '@/lib/payout-board';
import { useAction } from '@/lib/use-action';
import { Badge, Btn, Empty, Err, FIELD_CELL, Saved } from '@/components/ui';
import { won } from './parts';
import { useFinalizeBatch, useTaxInvoiceUpload } from './use-batch';

/**
 * 줄 하나의 부가세 — 공급가액의 10%.
 *
 * ★언제나 10% 다 (한백 확정 2026-08-24).★ 협력사에 간이과세·면세 유형은 없다 —
 * 그래서 과세유형을 저장하지도, 여기서 갈라 보지도 않는다. 리뷰에서 「면세 협력사면
 * 부가세가 없는데 10%가 붙는다」를 짚었는데 그런 협력사가 없다는 답을 받았다.
 *
 * 줄마다 반올림한다. 합계에 한 번 곱하면 열이 더해지지 않아서, 종이의 열을 위에서 아래로
 * 더한 값과 맨 아랫줄이 달라진다. 회수(음수)는 부가세도 음수다.
 */
const vatOf = (amount: number) => Math.round(amount * 0.1);

export default function StatementView({
  rows, org, partner, issuedAt, date, kind, invoice, finalized, canEdit,
}: {
  rows: PayoutRow[];
  org: string;
  /** 공급자(협력사)의 사업자 정보 — 없으면 그 칸이 「미지정」으로 뜬다 */
  partner: PartnerDetailsView | null;
  /** 작성일 — 이 장을 뽑은 날. 지급일과 다른 값이다 */
  issuedAt: string;
  date: string;
  /** 배치의 구분 — null 이면 그 지급일 전체를 읽기로만 본다(옛 링크) */
  kind: PayoutKind | null;
  /** 이 배치의 세금계산서 — 한백의 눈일 때만 내려온다(협력사는 null) */
  invoice: TaxInvoice | null;
  /** 최종 확정 여부 — batch_finals 의 행 유무. 계산서와 무관하다. */
  finalized: boolean;
  /** 항목 빼기·지급일 변경·세금계산서 관리 — 관리자만, 배치(kind 있음)일 때만 */
  canEdit: boolean;
}) {
  const supply = rows.reduce((n, r) => n + r.amount, 0);
  /*
   * 부가세는 ★줄값의 합★ 이다 — 합계에 한 번 곱하면 열이 더해지지 않는다.
   * 종이에 열이 있는데 위에서 아래로 더한 값과 맨 아랫줄이 다르면 그 장을 믿을 수 없다.
   */
  const vat = rows.reduce((n, r) => n + vatOf(r.amount), 0);
  // 상태 판정은 배치 목록과 같은 정본(lib/payout-board)이다
  const state = batchStateOf({ paidAt: date, finalized });
  // 잠긴 배치에는 빼기 열 자체가 없다 — 눌리지 않는 단추를 늘어놓지 않는다
  const canRemove = canEdit && !finalized;
  /*
   * 금액 두 열(공급가액·부가세) 앞의 칸 수 — 합계 줄의 라벨이 여기까지 뻗는다.
   * 현장 · 사업구분 · 연수 · 전력인입 · 계약대수 · 명목 = 6, 옛 링크에서는 구분이 붙어 7.
   */
  const labelSpan = kind === null ? 7 : 6;

  return (
    <>
      <section className="rounded-panel border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-slate-900 pb-4">
          <h1 className="flex items-center gap-2.5 text-h1 font-black tracking-tight text-slate-900">
            거래명세서
            {/* 종이에는 배지를 찍지 않는다 — 상태는 화면의 것이다 */}
            {canEdit && (
              <span className="print:hidden">
                <Badge tone={
                  state === '확정' ? 'ok'
                    : state === '가확정' ? 'warn'
                      : state === '확정 누락' ? 'stop'
                        : 'mute'
                }>
                  {state}
                </Badge>
              </span>
            )}
          </h1>
          <div className="text-right text-small leading-relaxed text-slate-600">
            {/* 작성일과 지급일은 다른 날이다 — 다시 뽑으면 작성일만 바뀐다 */}
            <p>
              <span className="font-bold text-slate-400">작성일</span>{' '}
              <span className="font-bold tabular-nums text-slate-900">{issuedAt}</span>
            </p>
            <p>
              <span className="font-bold text-slate-400">지급일</span>{' '}
              <span className="font-bold tabular-nums text-slate-900">{date}</span>
            </p>
            {kind && (
              <p>
                <span className="font-bold text-slate-400">구분</span>{' '}
                <span className="font-bold text-slate-900">{kind}</span>
              </p>
            )}
          </div>
        </header>

        {/*
          공급자(협력사) · 공급받는자(한백). 왼쪽이 공급자다 — 세금계산서와 같은 자리에 둔다.
          협력사 값은 사업자 정보 화면에서 협력사가 스스로 적는다. 안 적힌 칸은 「미지정」으로
          두고 명세서는 그대로 나온다 — 여기서 막으면 명세서를 아예 못 뽑는다.
        */}
        <div className="mt-4 grid gap-0 border border-slate-300 text-small sm:grid-cols-2">
          <Party
            role="공급자"
            name={org}
            bizRegNo={partner?.bizRegNo ? formatKoreanBizIdInput(partner.bizRegNo) : null}
            ceo={partner?.ceo ?? null}
            addr={partner?.addr ?? null}
          />
          <Party
            role="공급받는자"
            name={HANBAEK.name}
            bizRegNo={HANBAEK.bizRegNo}
            ceo={HANBAEK.ceo}
            addr={HANBAEK.addr}
            className="border-t border-slate-300 sm:border-l sm:border-t-0"
          />
        </div>

        {rows.length === 0 ? (
          <p className="py-10 text-center text-base text-slate-400">
            이 지급일에 {org}(으)로 나간 지급이 0건입니다
          </p>
        ) : (
          /*
           * 종이에서는 글자를 한 단계 줄인다 — 열이 여덟이라 A4 여백 안쪽(약 186mm)에
           * 16px 로는 안 들어간다. 화면에서는 그대로 크게 읽는다.
           */
          <table className="mt-4 w-full text-base print:text-small">
            <thead className="border-b border-slate-200 text-tiny font-bold tracking-[0.08em] text-slate-500">
              <tr>
                <th className="py-2 pr-3 text-left">현장</th>
                {/*
                  배치는 구분 하나로 묶여 있어 머리글에 이미 적혀 있다 — 줄마다 또 적으면
                  같은 값이 한 장에 두 번이다(화면 규칙 5번). 옛 링크(구분 없이 그 지급일
                  전체)로 들어오면 줄마다 갈리므로 그때만 열을 낸다.
                */}
                {kind === null && <th className="px-3 py-2 text-left">구분</th>}
                {/* 현장 기본정보 — 어느 현장의 무엇에 대한 값인지 이 넷이 말한다 (한백 요청) */}
                <th className="px-2 py-2 text-left">사업구분</th>
                <th className="px-2 py-2 text-right">연수</th>
                <th className="px-2 py-2 text-left">전력인입</th>
                <th className="px-2 py-2 text-right">계약대수</th>
                <th className="px-3 py-2 text-left">명목</th>
                {/* 메모 열은 뺐다 (한백 요청 2026-08-24) — 원장 줄의 메모는 지급 내역에서 본다 */}
                <th className="px-3 py-2 text-right">공급가액</th>
                <th className="py-2 pl-3 text-right">부가세</th>
                {canRemove && <th className="w-14 print:hidden"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <ItemRow key={r.entryId} r={r} showKind={kind === null} canEdit={canRemove} />
              ))}
            </tbody>
            <tfoot>
              {/*
                열이 둘이 되었으니 합계도 그 열에 선다 — 위에서 아래로 더한 값과 맞아야 한다.
                총 합계는 두 열을 묶어 한 줄로 둔다: 공급가액 칸 아래에 총액을 놓으면
                무엇의 합인지 어긋난다.
              */}
              <tr className="border-t-2 border-slate-900">
                <td colSpan={labelSpan} className="py-2.5 pr-3 text-right text-base font-black text-slate-900">
                  합계 ({rows.length}건)
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-base font-black tabular-nums text-slate-900">
                  {won(supply)}
                </td>
                <td className="whitespace-nowrap py-2.5 pl-3 text-right text-base font-bold tabular-nums text-slate-700">
                  {won(vat)}
                </td>
                {canRemove && <td className="print:hidden" />}
              </tr>
              <tr className="border-t border-slate-300">
                <td colSpan={labelSpan} className="py-2.5 pr-3 text-right text-base font-black text-slate-900">
                  총 합계
                  <span className="ml-1.5 text-tiny font-semibold text-slate-400">공급가액 + 부가세</span>
                </td>
                <td colSpan={2} className="whitespace-nowrap py-2.5 pl-3 text-right text-lead font-black tabular-nums text-slate-900">
                  {won(supply + vat)}
                  <span className="ml-1 text-tiny font-bold text-slate-400">원</span>
                </td>
                {canRemove && <td className="print:hidden" />}
              </tr>
            </tfoot>
          </table>
        )}

        {/*
          어느 계좌로 가는가 — 협력사에게 이 장의 핵심이고, 한백에게는 송금 전 대조다.
          값은 협력사가 사업자 정보 화면에서 적은 것이다(정본은 거기 하나다).
        */}
        {rows.length > 0 && (
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2 border-t border-slate-200 pt-3 text-small">
            <span className="text-tiny font-bold tracking-[0.08em] text-slate-400">지급 계좌</span>
            {partner?.bankName || partner?.bankAccountNo ? (
              <span className="font-bold text-slate-800">
                {partner.bankName ?? <Empty kind="miss" />}{' '}
                <span className="tabular-nums">{partner.bankAccountNo ?? ''}</span>
                {partner.bankHolder && (
                  <span className="font-semibold text-slate-500"> · {partner.bankHolder}</span>
                )}
              </span>
            ) : (
              <Empty kind="miss" />
            )}
          </p>
        )}
      </section>

      {canEdit && kind && rows.length > 0 && (
        <div className="mt-5 grid gap-4 print:hidden lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            {finalized ? (
              <Unfinalize org={org} kind={kind} date={date} />
            ) : (
              <>
                <Finalize org={org} kind={kind} date={date} supply={supply} />
                <MoveBatch org={org} kind={kind} date={date} />
              </>
            )}
          </div>
          <InvoiceCard org={org} kind={kind} date={date} invoice={invoice} />
        </div>
      )}
    </>
  );
}

/**
 * 공급자·공급받는자 한 칸.
 *
 * 업태·종목은 두지 않는다 (한백 확인 2026-08-24) — 이 명세서에 안 적는다.
 * 빈 칸은 지우지 않고 「미지정」으로 남긴다 — 안 적힌 것과 원래 없는 것은 다른 말이고,
 * 협력사가 사업자 정보 화면에서 채워야 하는 자리라는 신호이기도 하다(화면 규칙 6·10번).
 */
function Party({
  role, name, bizRegNo, ceo, addr, className = '',
}: {
  role: '공급자' | '공급받는자';
  name: string;
  bizRegNo: string | null;
  ceo: string | null;
  addr: string | null;
  className?: string;
}) {
  return (
    <div className={`p-3.5 ${className}`}>
      <p className="mb-1.5 text-micro font-bold tracking-[0.12em] text-slate-400">{role}</p>
      <p className="text-base font-black text-slate-900">{name}</p>
      <dl className="mt-1 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-0.5 text-slate-600">
        {([
          ['등록번호', bizRegNo, true],
          ['대표자', ceo, false],
          ['주소', addr, false],
        ] as const).map(([label, value, nums]) => (
          <Fragment key={label}>
            <dt className="text-tiny font-bold text-slate-400">{label}</dt>
            <dd className={`text-small ${nums ? 'tabular-nums' : ''}`}>
              {value ? <span className="text-slate-800">{value}</span> : <Empty kind="miss" />}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

/** 명세서 한 줄 — 빼기는 원장 삭제라 그 회차가 지급 가능 풀로 돌아간다 */
function ItemRow({
  r, showKind, canEdit,
}: {
  r: PayoutRow;
  /** 구분이 줄마다 갈리는 경우에만 — 배치는 머리글이 이미 말한다 */
  showKind: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { busy, error, run } = useAction();

  async function remove() {
    const ok = await run({
      url: `/api/projects/${r.projectId}/payouts`,
      method: 'DELETE',
      body: { entryId: r.entryId },
      fail: '빼지 못했습니다.',
    });
    if (ok) router.refresh();
  }

  return (
    <tr>
      <td className="py-2.5 pr-3 font-semibold text-slate-800">
        {r.projectName}
        <span className="ml-1.5 text-tiny font-normal text-slate-400">{r.cpo}</span>
      </td>
      {showKind && <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.kind}</td>}
      {/* 현장 기본정보 — 라인이 갈리면 여럿을 그대로 적는다(「7·10년」이 섞였다는 뜻이다) */}
      <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">
        {r.site.bizTypes.length > 0 ? r.site.bizTypes.join('·') : <Empty kind="miss" />}
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-slate-600">
        {r.site.termYears.length > 0 ? `${r.site.termYears.join('·')}년` : <Empty kind="miss" />}
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">
        {r.site.powerTypes.length > 0 ? r.site.powerTypes.join('·') : <Empty kind="miss" />}
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-slate-600">
        {r.site.qty > 0 ? `${r.site.qty}대` : <Empty kind="miss" />}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.label}</td>
      <td className={`whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums ${r.amount < 0 ? 'text-amber-800' : 'text-slate-900'}`}>
        {won(r.amount)}
      </td>
      <td className={`whitespace-nowrap py-2.5 pl-3 text-right tabular-nums ${r.amount < 0 ? 'text-amber-800' : 'text-slate-700'}`}>
        {won(vatOf(r.amount))}
      </td>
      {canEdit && (
        <td className="whitespace-nowrap py-2.5 pl-2 text-right print:hidden">
          {/* 빼기 = 확정 취소. 지급 가능 풀로 돌아가므로 되돌릴 수 있다 — 빨강을 안 쓴다(규칙 12) */}
          <Btn kind="quiet" size="sm" busy={busy} onClick={() => void remove()}>
            빼기
          </Btn>
          <Err className="block">{error}</Err>
        </td>
      )}
    </tr>
  );
}

/* ── 세금계산서 ───────────────────────────────────────────────────────────
 * 명세서 기록 옆의 첨부다 — 검토·대조·확정과 무관하다(한백 확인 2026-08-24).
 * 협력사가 발행해 보낸 것을 붙여 두는 보관함이고, 배치 하나에 한 장이다.
 * 확정 여부와 상관없이 언제든 붙이고 바꾸고 지운다.
 */
function InvoiceCard({
  org, kind, date, invoice,
}: {
  org: string;
  kind: PayoutKind;
  date: string;
  invoice: TaxInvoice | null;
}) {
  const router = useRouter();
  // 업로드 흐름은 배치 목록의 줄과 같은 훅이다 — 두 자리가 다른 길로 붙으면 갈린다
  const { busy, error, inputProps } = useTaxInvoiceUpload(org, kind, date);
  const del = useAction();

  async function remove() {
    if (!invoice) return;
    const ok = await del.run({
      url: '/api/statements/tax-invoice',
      method: 'DELETE',
      body: { id: invoice.id },
      fail: '지우지 못했습니다.',
    });
    if (ok) router.refresh();
  }

  return (
    <section className="rounded-panel border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-base font-black tracking-[-0.02em] text-slate-900">세금계산서</h2>

      {!invoice ? (
        <label className="block">
          <span className="mb-2 block text-small text-slate-500">
            {org}이(가) {kind} 몫으로 발행한 세금계산서를 이 명세서 옆에 붙여 둡니다
          </span>
          <input
            {...inputProps}
            className="block text-small text-slate-600 file:mr-3 file:rounded-ctl file:border file:border-slate-200 file:bg-white file:px-3 file:py-1.5 file:text-small file:font-bold file:text-slate-700"
          />
          {busy && <p className="mt-2 text-small font-bold text-slate-500">올리는 중…</p>}
          <Err className="mt-2 block">{error}</Err>
        </label>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-baseline gap-2">
            <a
              href={invoice.blobUrl}
              target="_blank"
              rel="noopener"
              className="font-bold text-brand-700 underline-offset-2 hover:underline"
            >
              {invoice.filename}
            </a>
            <span className="text-tiny text-slate-400">첨부 {invoice.uploadedAt}</span>
          </p>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <label className="cursor-pointer text-small font-bold text-slate-500 transition hover:text-slate-800">
              파일 교체
              <input {...inputProps} className="hidden" />
            </label>
            <span className="ml-auto" />
            <Btn kind="quiet" size="sm" busy={del.busy} onClick={() => void remove()}>
              삭제
            </Btn>
            {busy && <span className="text-small font-bold text-slate-500">올리는 중…</span>}
            <Err>{error ?? del.error}</Err>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * 최종 확정 — 배치를 잠근다. 세금계산서와 무관하다(검토 없는 보관용 첨부일 뿐).
 * 확정하면 빼기·지급일 변경·취소가 막힌다 — 협력사에게 이 합계가 최종이라고 말한 것이다.
 */
function Finalize({ org, kind, date, supply }: { org: string; kind: PayoutKind; date: string; supply: number }) {
  // 배치 목록의 줄과 같은 훅이다 — 화면 갱신도 훅이 한다
  const { busy, error, finalize } = useFinalizeBatch(org, kind, date);

  return (
    <section className="rounded-panel border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-base font-black tracking-[-0.02em] text-slate-900">최종 확정</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" busy={busy} busyLabel="확정 중…" onClick={() => void finalize()}>
          최종 확정
        </Btn>
        <span className="text-tiny text-slate-500">
          공급가액 <b className="tabular-nums">{won(supply)}</b>원으로 잠급니다 — 빼기·지급일 변경이 막힙니다
        </span>
        <Err>{error}</Err>
      </div>
    </section>
  );
}

/**
 * 확정 해제 — 잠긴 배치를 다시 가확정으로.
 *
 * 넣는 자리를 만들면 되돌리는 자리도 만든다(규칙 7). 해제하면 빼기·지급일 변경·계산서
 * 교체가 다시 열린다 — 협력사가 수정세금계산서를 발행해야 할 수 있으니 말로 알린다.
 */
function Unfinalize({ org, kind, date }: { org: string; kind: PayoutKind; date: string }) {
  const { busy, error, finalize } = useFinalizeBatch(org, kind, date);

  return (
    <section className="rounded-panel border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-base font-black tracking-[-0.02em] text-slate-900">확정 해제</h2>
      <p className="mb-3 text-small text-slate-500">
        이 배치는 최종 확정돼 잠겨 있습니다 — 항목·지급일·계산서를 고치려면 먼저 해제하세요.
        {org}이(가) 계산서를 이미 발행했다면 수정세금계산서가 필요할 수 있습니다.
      </p>
      <div className="flex items-center gap-2">
        <Btn kind="undo" size="sm" busy={busy} busyLabel="해제 중…" onClick={() => void finalize(true)}>
          확정 해제
        </Btn>
        <Err>{error}</Err>
      </div>
    </section>
  );
}

/** 지급일 변경 — 배치의 지급 줄 전부와 세금계산서가 같이 옮겨진다 */
function MoveBatch({ org, kind, date }: { org: string; kind: PayoutKind; date: string }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [to, setTo] = useState(date);
  const [moved, setMoved] = useState(false);

  async function move(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run({
      url: '/api/statements/batch',
      method: 'PATCH',
      body: { org, kind, from: date, to },
      fail: '옮기지 못했습니다.',
    });
    if (!ok) return;
    setMoved(true);
    // 배치 키가 날짜라 주소도 새 날짜로 — 옛 주소는 빈 명세서가 된다
    router.replace(`/payments/statement?org=${encodeURIComponent(org)}&date=${to}&kind=${encodeURIComponent(kind)}`);
  }

  return (
    <section className="rounded-panel border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-base font-black tracking-[-0.02em] text-slate-900">지급일 변경</h2>
      <form onSubmit={move} className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={`${FIELD_CELL} w-40`}
        />
        <Btn type="submit" size="sm" disabled={to === date} busy={busy} busyLabel="옮기는 중…">
          이 배치 전체를 옮기기
        </Btn>
        {moved && <Saved>옮겼습니다</Saved>}
        <Err>{error}</Err>
      </form>
      <p className="mt-2 text-tiny text-slate-400">
        이 지급일의 {org} {kind} 지급 전부와 세금계산서가 함께 옮겨집니다
      </p>

      {/*
        * 배치 통째 무르기 — 줄 단위 취소(지급관리 표·위 빼기)와 달리 배치 전체가
        * 지급 가능으로 돌아간다. 되돌릴 수 있는 일이라 빨강이 아니다(규칙 12) —
        * 다시 체크해 가확정하면 그대로다. 계산서가 붙어 있으면 서버가 거부한다.
        */}
      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <CancelBatch org={org} kind={kind} date={date} />
      </div>
    </section>
  );
}

/** 가확정 취소 — 배치의 지급 줄 전부를 물러 지급 가능으로 되돌린다 */
function CancelBatch({ org, kind, date }: { org: string; kind: PayoutKind; date: string }) {
  const router = useRouter();
  const { busy, error, run } = useAction();

  async function cancel() {
    const ok = await run({
      url: '/api/statements/batch',
      method: 'DELETE',
      body: { org, kind, payDate: date },
      fail: '취소하지 못했습니다.',
    });
    // 배치가 사라졌으니 목록으로 — 이 주소는 빈 명세서다
    if (ok) router.push('/statements');
  }

  return (
    <>
      <Btn kind="quiet" size="sm" busy={busy} busyLabel="취소 중…" onClick={() => void cancel()}>
        가확정 취소 — 배치 전체를 무른다
      </Btn>
      <Err>{error}</Err>
    </>
  );
}

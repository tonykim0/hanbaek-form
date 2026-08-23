'use client';

/**
 * 거래명세서 한 장 — 인쇄물이자 (한백에게는) 배치를 고치는 자리.
 *
 * ★줄을 손으로 적지 않는다★ — 원장에서 그려진다. 항목이 틀렸으면 여기서 빼고
 * (원장 삭제 → 그 회차는 지급 가능으로 돌아간다) 지급관리 표에서 다시 가확정한다.
 * 반쯤 고친 명세서가 남는 것보다, 원장을 고치고 이 장을 다시 그리는 것이 맞다.
 *
 * ★최종 확정이 여기 있다★ — 협력사가 가확정 합계로 발행한 세금계산서를 첨부하고,
 * 금액을 눈으로 확인한 뒤 누른다. 확정되면 배치가 잠긴다(빼기·지급일 변경·계산서
 * 교체 전부) — 협력사가 그 합계로 계산서를 이미 발행했기 때문이다. 잠금은 서버가
 * 지킨다(pg-store) — 여기서는 눌리지 않게 감출 뿐이다.
 *
 * ★부가세 줄★ 원장 금액은 공급가액이다(한백 확인 2026-08-23). 부가세·합계는 참고로
 * 적는다 — 실제 송금액은 합계다.
 *
 * 편집(빼기·지급일·세금계산서)은 전부 print:hidden — 종이에는 명세서만 남는다.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PayoutKind, PayoutRow, TaxInvoice } from '@/types/project';
import { today } from '@/lib/date';
import { useAction } from '@/lib/use-action';
import { Badge, Btn, Err, FIELD_CELL, Saved } from '@/components/ui';
import { won } from './parts';

export default function StatementView({
  rows, org, date, kind, invoice, canEdit,
}: {
  rows: PayoutRow[];
  org: string;
  date: string;
  /** 배치의 구분 — null 이면 그 지급일 전체를 읽기로만 본다(옛 링크) */
  kind: PayoutKind | null;
  /** 이 배치의 세금계산서 — 한백의 눈일 때만 내려온다(협력사는 null) */
  invoice: TaxInvoice | null;
  /** 항목 빼기·지급일 변경·세금계산서 관리 — 관리자만, 배치(kind 있음)일 때만 */
  canEdit: boolean;
}) {
  const supply = rows.reduce((n, r) => n + r.amount, 0);
  const vat = Math.round(supply * 0.1);
  const finalized = !!invoice?.finalizedAt;
  // 잠긴 배치에는 빼기 열 자체가 없다 — 눌리지 않는 단추를 늘어놓지 않는다
  const canRemove = canEdit && !finalized;

  return (
    <>
      <section className="rounded-panel border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-slate-900 pb-4">
          <h1 className="flex items-center gap-2.5 text-h1 font-black tracking-tight text-slate-900">
            거래명세서
            {/* 종이에는 배지를 찍지 않는다 — 상태는 화면의 것이다 */}
            {canEdit && (
              <span className="print:hidden">
                {date < today() ? (
                  <Badge tone="mute">지급완료</Badge>
                ) : finalized ? (
                  <Badge tone="ok">확정</Badge>
                ) : (
                  <Badge tone="warn">가확정</Badge>
                )}
              </span>
            )}
          </h1>
          <div className="text-right text-small leading-relaxed text-slate-600">
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
            <p>
              <span className="font-bold text-slate-400">공급자</span>{' '}
              <span className="font-bold text-slate-900">한백</span>
              <span className="mx-1 text-slate-300">→</span>
              <span className="font-bold text-slate-400">받는 곳</span>{' '}
              <span className="font-bold text-slate-900">{org}</span>
            </p>
          </div>
        </header>

        {rows.length === 0 ? (
          <p className="py-10 text-center text-base text-slate-400">
            이 지급일에 {org}(으)로 나간 지급이 0건입니다
          </p>
        ) : (
          <table className="mt-4 w-full text-base">
            <thead className="border-b border-slate-200 text-tiny font-bold tracking-[0.08em] text-slate-500">
              <tr>
                <th className="py-2 pr-3 text-left">현장</th>
                <th className="px-3 py-2 text-left">구분</th>
                <th className="px-3 py-2 text-left">명목</th>
                <th className="px-3 py-2 text-left">메모</th>
                <th className="py-2 pl-3 text-right">금액</th>
                {canRemove && <th className="w-14 print:hidden"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <ItemRow key={r.entryId} r={r} canEdit={canRemove} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900">
                <td colSpan={4} className="py-2.5 pr-3 text-right text-base font-black text-slate-900">
                  공급가액 ({rows.length}건)
                </td>
                <td className="whitespace-nowrap py-2.5 pl-3 text-right text-lead font-black tabular-nums text-slate-900">
                  {won(supply)}
                  <span className="ml-1 text-tiny font-bold text-slate-400">원</span>
                </td>
                {canRemove && <td className="print:hidden" />}
              </tr>
              <tr>
                <td colSpan={4} className="py-1 pr-3 text-right text-small font-bold text-slate-500">
                  부가세 (10%)
                </td>
                <td className="whitespace-nowrap py-1 pl-3 text-right text-base font-bold tabular-nums text-slate-700">
                  {won(vat)}
                  <span className="ml-1 text-tiny font-bold text-slate-400">원</span>
                </td>
                {canRemove && <td className="print:hidden" />}
              </tr>
              <tr className="border-t border-slate-300">
                <td colSpan={4} className="py-2.5 pr-3 text-right text-base font-black text-slate-900">
                  합계
                </td>
                <td className="whitespace-nowrap py-2.5 pl-3 text-right text-lead font-black tabular-nums text-slate-900">
                  {won(supply + vat)}
                  <span className="ml-1 text-tiny font-bold text-slate-400">원</span>
                </td>
                {canRemove && <td className="print:hidden" />}
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {canEdit && kind && rows.length > 0 && (
        <div className="mt-5 grid gap-4 print:hidden lg:grid-cols-2">
          <InvoiceCard org={org} kind={kind} date={date} invoice={invoice} statementSupply={supply} />
          {finalized ? (
            <Unfinalize org={org} kind={kind} date={date} />
          ) : (
            <MoveBatch org={org} kind={kind} date={date} />
          )}
        </div>
      )}
    </>
  );
}

/** 명세서 한 줄 — 빼기는 원장 삭제라 그 회차가 지급 가능 풀로 돌아간다 */
function ItemRow({ r, canEdit }: { r: PayoutRow; canEdit: boolean }) {
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
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.kind}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.label}</td>
      <td className="px-3 py-2.5 text-small text-slate-500">
        {r.note ?? <span className="text-slate-300">—</span>}
      </td>
      <td className={`whitespace-nowrap py-2.5 pl-3 text-right font-bold tabular-nums ${r.amount < 0 ? 'text-amber-800' : 'text-slate-900'}`}>
        {won(r.amount)}
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
 * 명세서 기록 옆의 첨부다 — 금액 판독·대조는 걷어냈다(한백 확인 2026-08-23).
 * 협력사가 발행해 보낸 것을 붙여 두는 보관함이고, 배치 하나에 한 장이다.
 */
function InvoiceCard({
  org, kind, date, invoice, statementSupply,
}: {
  org: string;
  kind: PayoutKind;
  date: string;
  invoice: TaxInvoice | null;
  /** 명세서 합계 — 최종 확정 버튼 옆에 적어, 계산서와 눈으로 대조하고 누르게 한다 */
  statementSupply: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const del = useAction();
  const fin = useAction();
  const finalized = !!invoice?.finalizedAt;

  async function finalize(undo: boolean) {
    const ok = await fin.run({
      url: '/api/statements/finalize',
      body: { org, kind, payDate: date, undo },
      fail: undo ? '해제하지 못했습니다.' : '확정하지 못했습니다.',
    });
    if (ok) router.refresh();
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
      const tokenRes = await fetch('/api/statements/tax-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'token', ext }),
      });
      const tokenBody = (await tokenRes.json().catch(() => ({}))) as {
        token?: string; pathname?: string; error?: string;
      };
      if (!tokenRes.ok || !tokenBody.token || !tokenBody.pathname) {
        setError(tokenBody.error ?? '업로드 준비에 실패했습니다.');
        return;
      }

      const { put } = await import('@vercel/blob/client');
      const blob = await put(tokenBody.pathname, file, {
        access: 'public',
        token: tokenBody.token,
      });

      const attach = await fetch('/api/statements/tax-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org, kind, payDate: date, blobUrl: blob.url, filename: file.name }),
      });
      if (!attach.ok) {
        const b = (await attach.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? '저장에 실패했습니다.');
        return;
      }
      router.refresh();
    } catch {
      setError('업로드 중 오류가 났습니다.');
    } finally {
      setBusy(false);
    }
  }

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
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
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
            {finalized ? (
              /* 잠긴 배치 — 교체·삭제 자리가 없다. 풀려면 옆 카드의 확정 해제부터. */
              <p className="text-small font-bold text-brand-800">
                최종 확정됨 · {invoice.finalizedAt}
              </p>
            ) : (
              <>
                {/*
                  * 확정 = 「이 계산서가 이 명세서와 맞다」는 사람의 판단이다.
                  * 그래서 명세서 합계를 버튼 옆에 적는다 — 계산서를 열어 이 숫자와
                  * 맞는지 눈으로 확인하고 누른다(자동 대조는 걷어냈다, 2026-08-23).
                  */}
                <Btn size="sm" busy={fin.busy} busyLabel="확정 중…" onClick={() => void finalize(false)}>
                  최종 확정
                </Btn>
                <span className="text-tiny text-slate-500">
                  공급가액 <b className="tabular-nums">{won(statementSupply)}</b>원과 맞는지 확인 후
                </span>
                <label className="ml-auto cursor-pointer text-small font-bold text-slate-500 transition hover:text-slate-800">
                  파일 교체
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
                <Btn kind="quiet" size="sm" busy={del.busy} onClick={() => void remove()}>
                  삭제
                </Btn>
              </>
            )}
            {busy && <span className="text-small font-bold text-slate-500">올리는 중…</span>}
            <Err>{error ?? del.error ?? fin.error}</Err>
          </div>
        </div>
      )}
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
  const router = useRouter();
  const { busy, error, run } = useAction();

  async function undo() {
    const ok = await run({
      url: '/api/statements/finalize',
      body: { org, kind, payDate: date, undo: true },
      fail: '해제하지 못했습니다.',
    });
    if (ok) router.refresh();
  }

  return (
    <section className="rounded-panel border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-base font-black tracking-[-0.02em] text-slate-900">확정 해제</h2>
      <p className="mb-3 text-small text-slate-500">
        이 배치는 최종 확정돼 잠겨 있습니다 — 항목·지급일·계산서를 고치려면 먼저 해제하세요.
        {org}이(가) 계산서를 이미 발행했다면 수정세금계산서가 필요할 수 있습니다.
      </p>
      <div className="flex items-center gap-2">
        <Btn kind="undo" size="sm" busy={busy} busyLabel="해제 중…" onClick={() => void undo()}>
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

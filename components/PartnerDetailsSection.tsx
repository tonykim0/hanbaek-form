'use client';

/**
 * 협력사 정보 — 계정마다 사업자등록증·정산 계좌.
 *
 * 두 자리에서 쓴다: 협력사는 /settings 에서 자기 카드 하나를, 한백은 설정(/admin/accounts)
 * 에서 전 계정을. 누가 남의 것을 고칠 수 있는지는 저장소(assertSelfOrAdmin)가 판정한다.
 *
 * 카드마다 「고치기」로 연다 — 평소엔 글자, 고칠 때만 입력칸(화면 규칙 4).
 * 사업자등록번호는 적는 대로 하이픈이 붙고 국세청 검증 숫자를 본다. 은행은 골라 넣고
 * 계좌번호는 숫자만 받는다 — 형식 규칙은 lib/bank-account 한 곳에 있다(저장소와 같은 규칙).
 * 서류(사업자등록증·통장사본)는 올리기·교체·지우기 — 편집 모드와 무관하게 그 자리에서 한다.
 *
 * 비어 있으면 「미지정」(노랑) — 지급 처리 전에 채워야 하는 값이라 눈에 띄어야 한다.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from '@/lib/use-action';
import type { AccountView } from '@/lib/auth/types';
import type { PartnerDetailsView, PartnerFileKind } from '@/lib/auth/partner-details';
import {
  ACCOUNT_DIGITS_MAX,
  ACCOUNT_DIGITS_MIN,
  BANKS,
  formatBizRegNo,
  isValidAccountNo,
  isValidBizRegNo,
  normalizeAccountNo,
} from '@/lib/bank-account';
import { Blank, Btn, Empty, Err, FIELD, Note, PANEL } from '@/components/ui';

const EMPTY_DETAILS: PartnerDetailsView = {
  bizRegNo: null,
  bizCertUrl: null,
  bankName: null,
  bankAccountNo: null,
  bankHolder: null,
  bankbookUrl: null,
};

export default function PartnerDetailsSection({
  accounts, details, dbReady, heading = true,
}: {
  /** 협력사 계정만 — 관리자 계정에는 협력사 정보를 두지 않는다 */
  accounts: AccountView[];
  details: Record<string, PartnerDetailsView>;
  dbReady: boolean;
  /** 페이지 제목이 이미 「협력사 정보」면 끈다 — 같은 말을 두 번 적지 않는다 */
  heading?: boolean;
}) {
  return (
    <section>
      {heading && (
        <h2 className="mb-3 text-base font-black tracking-[-0.02em] text-slate-900">협력사 정보</h2>
      )}

      {!dbReady && (
        <Note tone="warn" className="mb-3">
          지금은 파일 저장소로 돌고 있어 협력사 정보를 저장할 수 없습니다.{' '}
          <code>DATABASE_URL</code> 이 있어야 합니다.
        </Note>
      )}

      {accounts.length === 0 ? (
        <Blank>협력사 계정이 없습니다 — 위에서 계정을 먼저 만듭니다.</Blank>
      ) : (
        <div className="flex flex-col gap-3">
          {accounts.map((a) => (
            <PartnerCard
              key={a.id}
              account={a}
              details={details[a.id] ?? EMPTY_DETAILS}
              dbReady={dbReady}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PartnerCard({
  account, details, dbReady,
}: {
  account: AccountView;
  details: PartnerDetailsView;
  dbReady: boolean;
}) {
  const { busy, error, run } = useAction();
  const [fileError, setFileError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [form, setForm] = useState({ bizRegNo: '', bankName: '', bankAccountNo: '', bankHolder: '' });

  function openEdit() {
    setForm({
      bizRegNo: details.bizRegNo ? formatBizRegNo(details.bizRegNo) : '',
      bankName: details.bankName ?? '',
      bankAccountNo: details.bankAccountNo ?? '',
      bankHolder: details.bankHolder ?? '',
    });
    setLocalError(null);
    setEditing(true);
  }

  async function save() {
    setLocalError(null);
    // 저장소와 같은 검사를 먼저 돌린다 — 왕복 없이 그 자리에서 잡는다
    const bizDigits = form.bizRegNo.replace(/\D/g, '');
    if (bizDigits && !isValidBizRegNo(bizDigits)) {
      setLocalError('사업자등록번호가 올바르지 않습니다 — 숫자 10자리, 검증 숫자 불일치.');
      return;
    }
    const accountDigits = normalizeAccountNo(form.bankAccountNo);
    if (accountDigits && !isValidAccountNo(accountDigits)) {
      setLocalError(`계좌번호는 숫자 ${ACCOUNT_DIGITS_MIN}~${ACCOUNT_DIGITS_MAX}자리입니다.`);
      return;
    }
    const ok = await run({
      url: '/api/admin/partner-details',
      method: 'PATCH',
      body: {
        userId: account.id,
        bizRegNo: bizDigits,
        bankName: form.bankName,
        bankAccountNo: accountDigits,
        bankHolder: form.bankHolder,
      },
      label: account.org ?? account.id,
    });
    if (ok) setEditing(false);
  }

  // 현재 저장값이 목록에 없는 은행이면(자유 입력 시절 값) 선택지에 남겨 되돌릴 수 있게 한다
  const bankOptions: string[] =
    details.bankName && !(BANKS as readonly string[]).includes(details.bankName)
      ? [details.bankName, ...BANKS]
      : [...BANKS];

  return (
    <div className={`${PANEL} p-5`}>
      <div className="flex items-center gap-2">
        <p className="text-lead font-black text-slate-900">{account.org ?? account.name}</p>
        <p className="text-tiny text-slate-400">{account.id}</p>
        {!editing && (
          <button
            type="button"
            disabled={!dbReady}
            onClick={openEdit}
            className="ml-auto rounded-ctl border border-slate-200 px-2.5 py-1 text-tiny font-bold text-slate-600 transition hover:border-brand-300 hover:text-brand-800 disabled:opacity-40"
          >
            수정
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          {editing ? (
            <>
              <Field label="사업자등록번호">
                <input
                  value={form.bizRegNo}
                  disabled={busy}
                  inputMode="numeric"
                  placeholder="000-00-00000"
                  onChange={(e) => setForm((f) => ({ ...f, bizRegNo: formatBizRegNo(e.target.value) }))}
                  className={`${FIELD} tabular-nums`}
                />
              </Field>
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <Field label="은행">
                  <select
                    value={form.bankName}
                    disabled={busy}
                    onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                    className={`${FIELD} cursor-pointer`}
                  >
                    <option value="">선택</option>
                    {bankOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </Field>
                <Field label="계좌번호">
                  <input
                    value={form.bankAccountNo}
                    disabled={busy}
                    inputMode="numeric"
                    placeholder="숫자만"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, bankAccountNo: normalizeAccountNo(e.target.value) }))
                    }
                    className={`${FIELD} tabular-nums`}
                  />
                </Field>
              </div>
              <Field label="예금주">
                <input
                  value={form.bankHolder}
                  disabled={busy}
                  onChange={(e) => setForm((f) => ({ ...f, bankHolder: e.target.value }))}
                  className={FIELD}
                />
              </Field>
              <div className="flex items-center gap-2">
                <Btn onClick={() => void save()} busy={busy} busyLabel="저장 중…">저장</Btn>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                  className="rounded-ctl px-2.5 py-1.5 text-small font-bold text-slate-500 transition hover:text-slate-800"
                >
                  취소
                </button>
                <Err>{localError || error}</Err>
              </div>
            </>
          ) : (
            <>
              <FactRow label="사업자등록번호">
                {details.bizRegNo ? (
                  <span className="font-bold tabular-nums text-slate-800">
                    {formatBizRegNo(details.bizRegNo)}
                  </span>
                ) : (
                  <Empty kind="miss" />
                )}
              </FactRow>
              <FactRow label="정산 계좌">
                {details.bankName || details.bankAccountNo ? (
                  <span className="font-bold text-slate-800">
                    {details.bankName ?? <Empty kind="miss" />}{' '}
                    <span className="tabular-nums">{details.bankAccountNo ?? ''}</span>
                    {details.bankHolder && (
                      <span className="font-semibold text-slate-500"> · {details.bankHolder}</span>
                    )}
                  </span>
                ) : (
                  <Empty kind="miss" />
                )}
              </FactRow>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <FileFact account={account} kind="bizCert" url={details.bizCertUrl} dbReady={dbReady} onError={setFileError} />
          <FileFact account={account} kind="bankbook" url={details.bankbookUrl} dbReady={dbReady} onError={setFileError} />
        </div>
      </div>

      {fileError && (
        <p className="mt-2 text-tiny font-semibold text-red-700">{fileError}</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-tiny font-bold tracking-[0.08em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-28 shrink-0 text-tiny font-bold tracking-[0.08em] text-slate-400">{label}</span>
      <span className="min-w-0 text-base">{children}</span>
    </div>
  );
}

const KIND_LABEL: Record<PartnerFileKind, string> = {
  bizCert: '사업자등록증',
  bankbook: '통장사본',
};

/**
 * 서류 한 줄 — 올리기 / 보기·교체·지우기.
 * useAction 은 JSON 만 보내서 파일은 여기서 직접 multipart 로 보낸다. 오류는
 * 카드의 오류 슬롯(onError)으로 — 누른 자리 곁에 떠야 한다(화면 규칙 9).
 */
function FileFact({
  account, kind, url, dbReady, onError,
}: {
  account: AccountView;
  kind: PartnerFileKind;
  url: string | null;
  dbReady: boolean;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(init: RequestInit, fail: string) {
    setBusy(true);
    onError(null);
    try {
      const res = await fetch('/api/admin/partner-details', init);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        onError(`${KIND_LABEL[kind]} — ${data?.error ?? fail}`);
        return;
      }
      router.refresh();
    } catch {
      onError(`${KIND_LABEL[kind]} — ${fail}`);
    } finally {
      setBusy(false);
    }
  }

  function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('userId', account.id);
    body.append('kind', kind);
    body.append('file', file);
    void send({ method: 'POST', body }, '올리지 못했습니다.');
  }

  const actionBtn =
    'rounded-ctl border border-slate-200 px-2 py-1 text-tiny font-bold text-slate-600 transition hover:border-brand-300 disabled:opacity-40';

  return (
    <FactRow label={KIND_LABEL[kind]}>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={busy || !dbReady}
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = '';
        }}
      />
      <span className="flex items-center gap-2 whitespace-nowrap">
        {url ? (
          <>
            <a href={url} target="_blank" rel="noreferrer" className="font-bold text-brand-700 underline">
              보기
            </a>
            <button type="button" disabled={busy || !dbReady} onClick={() => inputRef.current?.click()} className={actionBtn}>
              {busy ? '올리는 중…' : '교체'}
            </button>
            <button
              type="button"
              disabled={busy || !dbReady}
              onClick={() => send(
                {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: account.id, kind }),
                },
                '지우지 못했습니다.'
              )}
              className="text-tiny font-bold text-slate-400 transition hover:text-red-700 disabled:opacity-40"
            >
              지우기
            </button>
          </>
        ) : (
          <>
            <Empty kind="miss" />
            <button type="button" disabled={busy || !dbReady} onClick={() => inputRef.current?.click()} className={actionBtn}>
              {busy ? '올리는 중…' : '올리기'}
            </button>
          </>
        )}
      </span>
    </FactRow>
  );
}

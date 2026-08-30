'use client';

/**
 * 협력사 정보 — 계정마다 사업자등록증·정산 계좌.
 *
 * 두 자리에서 쓴다: 협력사는 /settings 에서 자기 카드 하나를, 한백은 협력사 정보
 * (/admin/partners)에서 전 계정을. 누가 남의 것을 고칠 수 있는지는 저장소(assertSelfOrAdmin)가 판정한다.
 *
 * 카드마다 「고치기」로 연다 — 평소엔 글자, 고칠 때만 입력칸(화면 규칙 4).
 * 사업자등록번호는 적는 대로 하이픈이 붙고 국세청 검증 숫자를 본다(정본 lib/bizid). 은행은
 * 골라 넣고 계좌번호는 숫자만 받는다(lib/bank-account) — 저장소와 같은 규칙을 쓴다.
 * 서류(사업자등록증·통장사본)는 올리기·채우기·교체·지우기 — 편집 모드와 무관하게 그 자리에서 한다.
 * 서류를 올리면 Claude 가 읽어 입력칸을 1차로 채운다(/api/admin/partner-details/read).
 * ★채우는 데서 멈춘다★ — 저장은 사람이 「저장」을 눌러야 한다. 판독은 타이핑을 덜어 주는
 * 것이지 확인을 대신하는 것이 아니다. 검산에 걸린 값은 지우지 않고 카드 아래에 적는다.
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
  isValidAccountNo,
  normalizeAccountNo,
} from '@/lib/bank-account';
import { formatKoreanBizIdInput, isValidKoreanBizId } from '@/lib/bizid';
import { Blank, Btn, Empty, Err, FIELD, Note, PANEL } from '@/components/ui';

const EMPTY_DETAILS: PartnerDetailsView = {
  bizRegNo: null,
  ceo: null,
  addr: null,
  bizCertUrl: null,
  bankName: null,
  bankAccountNo: null,
  bankHolder: null,
  bankbookUrl: null,
};

export default function PartnerDetailsSection({
  accounts, details, dbReady, heading = true, canWrite = true,
}: {
  /** 협력사 계정만 — 관리자 계정에는 협력사 정보를 두지 않는다 */
  accounts: AccountView[];
  details: Record<string, PartnerDetailsView>;
  dbReady: boolean;
  /** 페이지 제목이 이미 「협력사 정보」면 끈다 — 같은 말을 두 번 적지 않는다 */
  heading?: boolean;
  /**
   * 고칠 수 있는가 — 열람 전용(재무팀)이면 false. 「수정」과 서류의
   * 올리기·채우기·교체·지우기가 사라지고 「보기」만 남는다.
   * 못 하는 일은 눌리지 않게 두는 쪽이다(화면 규칙 3) — 판정의 정본은 API 다.
   */
  canWrite?: boolean;
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
              canWrite={canWrite}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PartnerCard({
  account, details, dbReady, canWrite,
}: {
  account: AccountView;
  details: PartnerDetailsView;
  dbReady: boolean;
  canWrite: boolean;
}) {
  const { busy, error, run } = useAction();
  const [fileError, setFileError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [reading, setReading] = useState<PartnerFileKind | null>(null);
  const [readIssues, setReadIssues] = useState<string[]>([]);
  const [form, setForm] = useState({
    bizRegNo: '', ceo: '', addr: '', bankName: '', bankAccountNo: '', bankHolder: '',
  });

  /** 저장값에서 뜬 입력칸 한 벌 — 「고치기」와 서류 판독이 같은 바닥에서 시작한다 */
  function savedForm() {
    return {
      bizRegNo: details.bizRegNo ? formatKoreanBizIdInput(details.bizRegNo) : '',
      ceo: details.ceo ?? '',
      addr: details.addr ?? '',
      bankName: details.bankName ?? '',
      bankAccountNo: details.bankAccountNo ?? '',
      bankHolder: details.bankHolder ?? '',
    };
  }

  function openEdit() {
    setForm(savedForm());
    setLocalError(null);
    setReadIssues([]);
    setEditing(true);
  }

  /**
   * 서류에서 읽어 입력칸을 채운다 — ★저장까지 가지 않는다★. 읽은 값을 눈으로 보고
   * 「저장」을 눌러야 들어간다(화면 규칙 4·7). 못 읽은 칸은 건드리지 않는다 —
   * 빈 문자열로 덮으면 이미 적어 둔 값이 조용히 지워진다.
   */
  async function readDoc(kind: PartnerFileKind) {
    setReading(kind);
    setFileError(null);
    setReadIssues([]);
    try {
      const res = await fetch('/api/admin/partner-details/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: account.id, kind }),
      });
      const data = (await res.json().catch(() => null)) as
        | { fields?: Record<string, string | null>; issues?: string[]; error?: string }
        | null;
      if (!res.ok) {
        setFileError(`${KIND_LABEL[kind]} — ${data?.error ?? '읽지 못했습니다.'}`);
        return;
      }
      const fields = data?.fields ?? {};
      setForm((current) => {
        // 고치는 중이면 지금 적고 있는 값 위에, 아니면 저장값 위에 얹는다
        const next = { ...(editing ? current : savedForm()) };
        if (fields.bizRegNo) next.bizRegNo = formatKoreanBizIdInput(fields.bizRegNo);
        for (const key of ['ceo', 'addr', 'bankName', 'bankAccountNo', 'bankHolder'] as const) {
          const value = fields[key];
          if (value) next[key] = value;
        }
        return next;
      });
      setLocalError(null);
      setEditing(true);
      setReadIssues(data?.issues ?? []);
    } catch {
      setFileError(`${KIND_LABEL[kind]} — 읽지 못했습니다.`);
    } finally {
      setReading(null);
    }
  }

  async function save() {
    setLocalError(null);
    // 저장소와 같은 검사를 먼저 돌린다 — 왕복 없이 그 자리에서 잡는다
    const bizDigits = form.bizRegNo.replace(/\D/g, '');
    if (bizDigits && !isValidKoreanBizId(bizDigits)) {
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
        ceo: form.ceo,
        addr: form.addr,
        bankName: form.bankName,
        bankAccountNo: accountDigits,
        bankHolder: form.bankHolder,
      },
      label: account.org ?? account.id,
    });
    if (ok) {
      setEditing(false);
      setReadIssues([]);
    }
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
        {!editing && canWrite && (
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
                  onChange={(e) => setForm((f) => ({ ...f, bizRegNo: formatKoreanBizIdInput(e.target.value) }))}
                  className={`${FIELD} tabular-nums`}
                />
              </Field>
              {/* 대표자·주소는 거래명세서의 공급자 칸에 그대로 찍힌다 */}
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <Field label="대표자">
                  <input
                    value={form.ceo}
                    disabled={busy}
                    placeholder="홍길동"
                    onChange={(e) => setForm((f) => ({ ...f, ceo: e.target.value }))}
                    className={FIELD}
                  />
                </Field>
                <Field label="사업장 주소">
                  <input
                    value={form.addr}
                    disabled={busy}
                    placeholder="시·군·구부터"
                    onChange={(e) => setForm((f) => ({ ...f, addr: e.target.value }))}
                    className={FIELD}
                  />
                </Field>
              </div>
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
                    {formatKoreanBizIdInput(details.bizRegNo)}
                  </span>
                ) : (
                  <Empty kind="miss" />
                )}
              </FactRow>
              <FactRow label="대표자">
                {details.ceo
                  ? <span className="font-bold text-slate-800">{details.ceo}</span>
                  : <Empty kind="miss" />}
              </FactRow>
              <FactRow label="사업장 주소">
                {details.addr
                  ? <span className="font-bold text-slate-800">{details.addr}</span>
                  : <Empty kind="miss" />}
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
          <FileFact
            account={account} kind="bizCert" url={details.bizCertUrl} dbReady={dbReady}
            onError={setFileError} onRead={readDoc} reading={reading === 'bizCert'}
            canWrite={canWrite}
          />
          <FileFact
            account={account} kind="bankbook" url={details.bankbookUrl} dbReady={dbReady}
            onError={setFileError} onRead={readDoc} reading={reading === 'bankbook'}
            canWrite={canWrite}
          />
        </div>
      </div>

      {fileError && (
        <p className="mt-2 text-tiny font-semibold text-red-700">{fileError}</p>
      )}

      {/* 읽었지만 검산에 걸린 것 — 지우지 않고 그대로 보여 사람이 고치게 한다 */}
      {readIssues.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {readIssues.map((issue) => (
            <li key={issue} className="text-tiny font-semibold text-amber-700">{issue}</li>
          ))}
        </ul>
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
 * 서류 한 줄 — 올리기 / 보기·채우기·교체·지우기.
 * useAction 은 JSON 만 보내서 파일은 여기서 직접 multipart 로 보낸다. 오류는
 * 카드의 오류 슬롯(onError)으로 — 누른 자리 곁에 떠야 한다(화면 규칙 9).
 *
 * 올리고 나면 곧바로 판독으로 넘어간다 — 올린 사람이 원하는 것은 파일이 붙는 것이
 * 아니라 칸이 차는 것이다. 이미 붙어 있는 서류는 「채우기」로 다시 읽는다.
 */
function FileFact({
  account, kind, url, dbReady, onError, onRead, reading, canWrite,
}: {
  account: AccountView;
  kind: PartnerFileKind;
  url: string | null;
  dbReady: boolean;
  onError: (message: string | null) => void;
  onRead: (kind: PartnerFileKind) => void;
  reading: boolean;
  /** 열람 전용이면 「보기」만 남는다 — 올리기·채우기·교체·지우기가 사라진다 */
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(init: RequestInit, fail: string): Promise<boolean> {
    setBusy(true);
    onError(null);
    try {
      const res = await fetch('/api/admin/partner-details', init);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        onError(`${KIND_LABEL[kind]} — ${data?.error ?? fail}`);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      onError(`${KIND_LABEL[kind]} — ${fail}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('userId', account.id);
    body.append('kind', kind);
    body.append('file', file);
    // 올라간 뒤에 읽는다 — 판독은 Blob 에 붙은 것을 다시 받아 본다
    if (await send({ method: 'POST', body }, '올리지 못했습니다.')) onRead(kind);
  }

  const actionBtn =
    'rounded-ctl border border-slate-200 px-2 py-1 text-tiny font-bold text-slate-600 transition hover:border-brand-300 disabled:opacity-40';

  /*
   * 열람 전용(재무팀)은 「보기」만 — 파일 고르는 칸도 두지 않는다. 눌리지 않는 단추를
   * 남겨 두면 무엇이 막힌 건지 화면에서 알 수 없다(화면 규칙 3).
   */
  if (!canWrite) {
    return (
      <FactRow label={KIND_LABEL[kind]}>
        <span className="flex items-center gap-2 whitespace-nowrap">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="font-bold text-brand-700 underline">
              보기
            </a>
          ) : (
            <Empty kind="miss" />
          )}
        </span>
      </FactRow>
    );
  }

  return (
    <FactRow label={KIND_LABEL[kind]}>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={busy || !dbReady}
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = '';
        }}
      />
      <span className="flex items-center gap-2 whitespace-nowrap">
        {url ? (
          <>
            <a href={url} target="_blank" rel="noreferrer" className="font-bold text-brand-700 underline">
              보기
            </a>
            <button
              type="button"
              disabled={busy || reading || !dbReady}
              onClick={() => onRead(kind)}
              className={actionBtn}
            >
              {reading ? '읽는 중…' : '채우기'}
            </button>
            <button type="button" disabled={busy || reading || !dbReady} onClick={() => inputRef.current?.click()} className={actionBtn}>
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
                '삭제하지 못했습니다.'
              )}
              className="text-tiny font-bold text-slate-400 transition hover:text-red-700 disabled:opacity-40"
            >
              삭제
            </button>
          </>
        ) : (
          <>
            <Empty kind="miss" />
            <button type="button" disabled={busy || reading || !dbReady} onClick={() => inputRef.current?.click()} className={actionBtn}>
              {busy ? '올리는 중…' : reading ? '읽는 중…' : '올리기'}
            </button>
          </>
        )}
      </span>
    </FactRow>
  );
}

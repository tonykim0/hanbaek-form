'use client';

/**
 * 협력사 정보 — 계정마다 사업자등록증·정산 계좌.
 *
 * 두 자리에서 쓴다: 협력사는 /settings 에서 자기 것 한 줄을, 한백은 설정(/admin/accounts)
 * 에서 전 계정을. 누가 남의 것을 고칠 수 있는지는 저장소(assertSelfOrAdmin)가 판정한다.
 *
 * 계좌·사업자등록번호는 표의 칸에서 바로 고치고(화면 규칙 4번의 예외 자리),
 * 서류(사업자등록증·통장사본)는 올리기·교체·지우기다. 파일은 Vercel Blob 랜덤 주소에
 * 있어 「보기」는 새 탭으로 연다.
 *
 * 비어 있으면 「미지정」(노랑) — 지급 처리 전에 채워야 하는 값이라 눈에 띄어야 한다.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from '@/lib/use-action';
import type { AccountView } from '@/lib/auth/types';
import type { PartnerDetailsView, PartnerFileKind } from '@/lib/auth/partner-details';
import { Blank, Empty, FIELD_CELL, Note, PANEL } from '@/components/ui';

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
        <div className={`overflow-hidden ${PANEL}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-base">
              <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 text-left">계정</th>
                  <th className="px-3 py-2.5 text-left">사업자등록번호</th>
                  <th className="px-3 py-2.5 text-left">은행</th>
                  <th className="px-3 py-2.5 text-left">계좌번호</th>
                  <th className="px-3 py-2.5 text-left">예금주</th>
                  <th className="px-3 py-2.5 text-left">사업자등록증</th>
                  <th className="px-3 py-2.5 text-left">통장사본</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a) => (
                  <PartnerRow
                    key={a.id}
                    account={a}
                    details={details[a.id] ?? EMPTY_DETAILS}
                    dbReady={dbReady}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function PartnerRow({
  account, details, dbReady,
}: {
  account: AccountView;
  details: PartnerDetailsView;
  dbReady: boolean;
}) {
  const { busy, error, run } = useAction();
  const [fileError, setFileError] = useState<string | null>(null);
  // 배포 설정(AUTH_USERS) 계정은 users 행이 없어 협력사 정보를 못 붙인다
  const fixed = !dbReady || account.source === '파일';

  const save = (field: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    const current = details[field as keyof PartnerDetailsView] ?? '';
    if (value === current) return;
    void run({
      url: '/api/admin/partner-details',
      method: 'PATCH',
      body: { userId: account.id, [field]: value },
      label: account.org ?? account.id,
    });
  };

  return (
    <>
      <tr className={account.active ? '' : 'bg-slate-50/60'}>
        <td className="px-3 py-2.5">
          <span className="block font-bold text-slate-900">{account.org ?? account.name}</span>
          <span className="block text-tiny text-slate-400">{account.id}</span>
        </td>

        {(['bizRegNo', 'bankName', 'bankAccountNo', 'bankHolder'] as const).map((field) => (
          <td key={field} className="px-3 py-2.5">
            {fixed ? (
              <ValOrMiss value={details[field]} />
            ) : (
              <input
                aria-label={`${account.id} ${field}`}
                defaultValue={details[field] ?? ''}
                disabled={busy}
                placeholder="미지정"
                onBlur={save(field)}
                className={`${FIELD_CELL} min-w-[96px] ${
                  field === 'bizRegNo' || field === 'bankAccountNo' ? 'tabular-nums' : ''
                } placeholder:text-amber-600/70`}
              />
            )}
          </td>
        ))}

        <FileCell
          account={account}
          kind="bizCert"
          url={details.bizCertUrl}
          fixed={fixed}
          onError={setFileError}
        />
        <FileCell
          account={account}
          kind="bankbook"
          url={details.bankbookUrl}
          fixed={fixed}
          onError={setFileError}
        />
      </tr>
      {(error || fileError) && (
        <tr>
          <td colSpan={7} className="px-3 pb-2.5 text-tiny font-semibold text-red-700">
            {error || fileError}
          </td>
        </tr>
      )}
    </>
  );
}

function ValOrMiss({ value }: { value: string | null }) {
  if (!value) return <Empty kind="miss" />;
  return <span className="font-semibold text-slate-800">{value}</span>;
}

const KIND_LABEL: Record<PartnerFileKind, string> = {
  bizCert: '사업자등록증',
  bankbook: '통장사본',
};

/**
 * 서류 한 칸 — 올리기 / 보기·교체·지우기.
 * useAction 은 JSON 만 보내서 파일은 여기서 직접 multipart 로 보낸다. 오류 모양은
 * 같은 줄의 오류 슬롯(onError)으로 모은다 — 누른 자리 곁에 떠야 한다(화면 규칙 9).
 */
function FileCell({
  account, kind, url, fixed, onError,
}: {
  account: AccountView;
  kind: PartnerFileKind;
  url: string | null;
  fixed: boolean;
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

  if (fixed) {
    return (
      <td className="px-3 py-2.5">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="font-bold text-brand-700 underline">
            보기
          </a>
        ) : (
          <Empty kind="miss" />
        )}
      </td>
    );
  }

  return (
    <td className="px-3 py-2.5">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = '';
        }}
      />
      {url ? (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <a href={url} target="_blank" rel="noreferrer" className="font-bold text-brand-700 underline">
            보기
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-ctl border border-slate-200 px-2 py-1 text-tiny font-bold text-slate-600 transition hover:border-brand-300 disabled:opacity-40"
          >
            {busy ? '올리는 중…' : '교체'}
          </button>
          <button
            type="button"
            disabled={busy}
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
        </span>
      ) : (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <Empty kind="miss" />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-ctl border border-slate-200 px-2 py-1 text-tiny font-bold text-slate-600 transition hover:border-brand-300 disabled:opacity-40"
          >
            {busy ? '올리는 중…' : '올리기'}
          </button>
        </span>
      )}
    </td>
  );
}

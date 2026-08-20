'use client';

/**
 * 협력사 계정 등록.
 *
 * 구분 세 가지 — 영업사 · 시공사 · 턴키업체(영업+시공 겸업). 관리자 계정은 여기서 만들지
 * 않는다. 화면에서 만들 수 있게 두면 실수 한 번으로 원가·마진을 보는 계정이 생긴다.
 *
 * ★소속이 이 화면의 핵심이다.★ 협력사가 보는 현장은 소속 문자열이 현장의 영업사·시공사와
 * 같은지로 갈린다(lib/roles.ts). 「에코일렉」과 「에코일렉 」은 다른 회사가 되고, 그 계정은
 * 로그인은 되는데 현장이 하나도 안 보인다. 그래서 쓰이고 있는 소속을 눌러 넣게 한다.
 *
 * 비밀번호는 만들 때 한 번만 화면에 있다. 저장하는 것은 해시뿐이라 다시 볼 수 없다 —
 * 잊으면 새로 발급해야 한다.
 */
import { useState } from 'react';
import { useAction } from '@/lib/use-action';
import type { AccountView } from '@/lib/auth/types';
import type { Role } from '@/lib/roles';

const KINDS: Array<{ role: Role; label: string; note: string }> = [
  { role: 'sales', label: '영업사', note: '영업비만 본다' },
  { role: 'cons', label: '시공사', note: '시공비만 본다' },
  { role: 'salesCons', label: '턴키업체', note: '영업·시공 겸업 — 둘 다 본다' },
];

const ROLE_TEXT: Record<Role, string> = {
  admin: '한백 관리자',
  salesCons: '턴키업체',
  cons: '시공사',
  sales: '영업사',
};

export default function AccountAdmin({
  accounts, knownOrgs, meId, dbReady,
}: {
  accounts: AccountView[];
  /** 지금 현장에 쓰이고 있는 소속 — 오타로 현장이 안 보이는 것을 막는다 */
  knownOrgs: string[];
  meId: string;
  dbReady: boolean;
}) {
  const { busy, error, run } = useAction();
  const [role, setRole] = useState<Role>('sales');
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(null);
    const ok = await run({
      url: '/api/admin/accounts',
      body: { id, name, role, org, password },
      fail: '계정을 만들지 못했습니다.',
    });
    if (!ok) return;
    setDone(`${id} 계정을 만들었습니다.`);
    setId('');
    setName('');
    setOrg('');
    setPassword('');
  }


  return (
    <div className="flex flex-col gap-7">
      <section>
        <h2 className="mb-3 text-base font-black tracking-[-0.02em] text-slate-900">계정 등록</h2>

        {!dbReady && (
          <p className="mb-3 rounded-xl border-l-[3px] border-amber-500 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
            지금은 파일 저장소로 돌고 있어 계정을 만들 수 없습니다. <code>DATABASE_URL</code> 이
            있어야 합니다.
          </p>
        )}

        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div>
            <p className="mb-2 text-tiny font-bold tracking-[0.08em] text-slate-400">구분</p>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.role}
                  type="button"
                  aria-pressed={role === k.role}
                  onClick={() => setRole(k.role)}
                  className={`rounded-xl border px-3.5 py-2 text-left transition ${
                    role === k.role
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span
                    className={`block text-sm font-bold ${role === k.role ? 'text-brand-800' : 'text-slate-700'}`}
                  >
                    {k.label}
                  </span>
                  <span className="block text-tiny text-slate-400">{k.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="로그인 ID" hint="소문자·숫자·하이픈 3~24자">
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                autoComplete="off"
                placeholder="ecoelec"
                className={inputClass}
              />
            </Field>
            <Field label="이름" hint="사람 이름까지 넣으면 감사 기록에서 알아보기 쉽습니다">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                placeholder="에코일렉 김현수"
                className={inputClass}
              />
            </Field>
          </div>

          <Field
            label="소속"
            hint="현장의 영업사·시공사 이름과 정확히 같아야 합니다 — 다르면 현장이 안 보입니다"
          >
            <input
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              autoComplete="off"
              placeholder="에코일렉"
              className={inputClass}
            />
            {knownOrgs.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-tiny text-slate-400">쓰이고 있는 소속</span>
                {knownOrgs.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOrg(o)}
                    className={`rounded-full border px-2 py-0.5 text-tiny font-bold transition ${
                      org === o
                        ? 'border-brand-500 bg-brand-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field label="비밀번호" hint="8자 이상. 저장되는 것은 해시뿐이라 나중에 다시 볼 수 없습니다">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>

          {error && (
            <p role="alert" className="text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          {done && <p className="text-sm font-semibold text-brand-800">{done}</p>}

          <div>
            <button
              type="submit"
              disabled={busy || !dbReady}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:bg-slate-300"
            >
              {busy ? '만드는 중…' : '계정 만들기'}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-base font-black tracking-[-0.02em] text-slate-900">계정</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 text-left">로그인 ID</th>
                  <th className="px-3 py-2.5 text-left">이름</th>
                  <th className="px-3 py-2.5 text-left">구분</th>
                  <th className="px-3 py-2.5 text-left">소속</th>
                  <th className="px-3 py-2.5 text-left">만든 날</th>
                  <th className="px-3 py-2.5 text-right">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a) => (
                  <AccountRow key={a.id} a={a} meId={meId} knownOrgs={knownOrgs} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          계정은 지우지 않고 중지합니다 — 감사 기록이 로그인 ID 를 가리키고 있어서, 지우면
          누가 한 일인지 알 수 없어집니다. 관리자 계정은 이 화면에서 만들 수 없습니다.
        </p>
      </section>
    </div>
  );
}

/**
 * 계정 한 줄.
 *
 * ★구분·소속을 여기서 고칠 수 있다.★
 * 이 두 값이 그 사람이 무엇을 보는지를 정한다 — 구분은 영업비·시공비 중 어느 쪽을,
 * 소속은 어느 현장을(문자열 일치). 만들 때 잘못 고르면 로그인 ID 가 primary key 라
 * 다시 만들 수도 없어서, 고치는 자리가 없으면 DB 를 직접 만지는 수밖에 없었다.
 *
 * 칸을 떠날 때 저장한다. 관리자 계정과 배포 설정 계정은 아예 입력칸을 주지 않는다 —
 * 못 하는 일은 눌리지 않게 한다.
 */
function AccountRow({
  a, meId, knownOrgs,
}: {
  a: AccountView;
  meId: string;
  knownOrgs: string[];
}) {
  const { busy, error, run } = useAction();
  const fixed = a.source === '파일' || a.role === 'admin';

  const patch = (body: Record<string, unknown>) =>
    void run({ url: '/api/admin/accounts', method: 'PATCH', body: { id: a.id, ...body } });

  return (
    <>
      <tr className={a.active ? '' : 'bg-slate-50/60'}>
        <td className="px-3 py-2.5 font-bold text-slate-900">
          {a.id}
          {a.id === meId && <span className="ml-1.5 text-micro font-bold text-brand-700">나</span>}
        </td>

        <td className="px-3 py-2.5 text-slate-600">
          {fixed ? (
            a.name
          ) : (
            <input
              aria-label={`${a.id} 이름`}
              defaultValue={a.name}
              disabled={busy}
              onBlur={(e) => {
                if (e.target.value.trim() !== a.name) patch({ name: e.target.value });
              }}
              className={cellInput}
            />
          )}
        </td>

        <td className="px-3 py-2.5">
          {fixed ? (
            <span
              className={`rounded-full px-2 py-0.5 text-tiny font-bold ${
                a.role === 'admin' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {ROLE_TEXT[a.role]}
            </span>
          ) : (
            <select
              aria-label={`${a.id} 구분`}
              value={a.role}
              disabled={busy}
              onChange={(e) => patch({ role: e.target.value })}
              className={`${cellInput} cursor-pointer font-bold`}
            >
              {KINDS.map((k) => (
                <option key={k.role} value={k.role}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </td>

        <td className="px-3 py-2.5 text-slate-600">
          {fixed ? (
            (a.org ?? '—')
          ) : (
            <>
              {/* 쓰이고 있는 소속을 골라 넣게 한다 — 손으로 적으면 「에코일렉」과 「에코일렉 」이 갈린다 */}
              <input
                aria-label={`${a.id} 소속`}
                defaultValue={a.org ?? ''}
                disabled={busy}
                list={`orgs-${a.id}`}
                onBlur={(e) => {
                  if (e.target.value.trim() !== (a.org ?? '')) patch({ org: e.target.value });
                }}
                className={cellInput}
              />
              <datalist id={`orgs-${a.id}`}>
                {knownOrgs.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </>
          )}
        </td>

        <td className="px-3 py-2.5 tabular-nums text-slate-400">
          {a.createdAt ?? <span title="환경변수·개발 시드 계정">배포 설정</span>}
        </td>

        <td className="px-3 py-2.5 text-right">
          {a.source === '파일' ? (
            <span
              className="text-tiny text-slate-400"
              title="배포 설정에 있는 계정이라 화면에서 못 바꿉니다"
            >
              고정
            </span>
          ) : (
            <button
              type="button"
              disabled={busy || a.id === meId}
              onClick={() => patch({ active: !a.active })}
              className={`rounded-lg border px-2.5 py-1 text-tiny font-bold transition disabled:opacity-40 ${
                a.active
                  ? 'border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-700'
                  : 'border-brand-300 bg-brand-50 text-brand-800'
              }`}
            >
              {a.active ? '사용 중 · 중지' : '중지됨 · 재개'}
            </button>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6} className="px-3 pb-2.5 text-tiny font-semibold text-red-700">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}

const cellInput =
  'w-full min-w-[92px] rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm text-slate-700 transition hover:border-slate-200 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-50';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';

function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-tiny font-bold tracking-[0.08em] text-slate-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-tiny text-slate-400">{hint}</span>}
    </label>
  );
}

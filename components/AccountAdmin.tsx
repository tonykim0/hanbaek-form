'use client';

/**
 * 계정설정 — 계정을 만들고, 구분·소속을 고치고, 사용을 중지한다.
 *
 * 구분 네 가지 — 영업사 · 시공사 · 턴키업체(영업+시공 겸업) · 열람 전용. 관리자 계정은
 * 여기서 만들지 않는다. 화면에서 만들 수 있게 두면 실수 한 번으로 원가·마진을 바꾸는
 * 계정이 생긴다. 열람 전용은 반대다 — 같은 것을 보되 손이 없어서, 잘못 만들어도
 * 되돌릴 수 없는 일이 생기지 않는다. 그래서 이 화면에 있다.
 *
 * ★소속이 이 화면의 핵심이다.★ 협력사가 보는 현장은 소속 문자열이 현장의 영업사·시공사와
 * 같은지로 갈린다(lib/roles.ts). 「에코일렉」과 「에코일렉 」은 다른 회사가 되고, 그 계정은
 * 로그인은 되는데 현장이 하나도 안 보인다. 그래서 쓰이고 있는 소속을 눌러 넣게 한다.
 * 한백 쪽(관리자·열람 전용)은 소속으로 가르지 않으므로 소속 칸 자체가 없다.
 *
 * 비밀번호는 만들 때 한 번만 화면에 있다. 저장하는 것은 해시뿐이라 다시 볼 수 없다 —
 * 잊으면 계정 줄의 「비밀번호 재설정」으로 새로 정한다.
 *
 * ★화면을 이렇게 바꾼 이유 (2026-08-22)★
 * - 등록 폼이 늘 펼쳐져 화면 위 절반을 먹었다. 계정을 만드는 것은 어쩌다 한 번이고 매번
 *   보는 것은 목록인데, 목록이 접힌 화면 밖으로 밀려 있었다 → 폼을 접었다.
 * - 「사용 중 · 중지」 한 단추가 상태와 동작을 같이 말했다. 지금이 사용 중이라는 것인지
 *   누르면 사용 중이 된다는 것인지 눌러 봐야 알았다 → 상태는 동글게, 동작은 각지게
 *   갈랐다(화면 규칙 11번).
 * - 중지된 계정이 목록 한가운데 섞여 있었다 → 아래로 내렸다.
 * - 계정이 늘면 눈으로 훑는 수밖에 없었다 → 검색칸과 구분 칩을 얹었다.
 */
import { useMemo, useState } from 'react';
import { useAction } from '@/lib/use-action';
import { useBackClose } from '@/lib/use-back-close';
import { PASSWORD_MIN_LEN, type AccountView } from '@/lib/auth/types';
import { isHanbaek, type Role } from '@/lib/roles';
import { Badge, Btn, Choice, Empty, Err, FIELD, FIELD_CELL, Note, PANEL, Saved, Td, Th } from '@/components/ui';

/** 이 화면에서 만들 수 있는 구분. 정본은 서버다(app/api/admin/accounts CREATABLE). */
const KINDS: Array<{ role: Role; label: string; note: string }> = [
  { role: 'sales', label: '영업사', note: '자기 현장 · 영업비' },
  { role: 'cons', label: '시공사', note: '자기 현장 · 시공비' },
  { role: 'salesCons', label: '턴키업체', note: '자기 현장 · 영업비 + 시공비' },
  { role: 'viewer', label: '열람 전용', note: '전 현장 · 원가까지 — 바꾸지는 못함' },
];

const ROLE_TEXT: Record<Role, string> = {
  admin: '한백 관리자',
  viewer: '열람 전용',
  salesCons: '턴키업체',
  cons: '시공사',
  sales: '영업사',
};

/** 목록 위의 구분 칩. 한백 관리자는 여기서 못 만들지만 목록에는 있으므로 거를 수 있어야 한다. */
const FILTERS: Array<{ key: Role | 'all'; label: string }> = [
  { key: 'all', label: '전체' },
  ...KINDS.map((k) => ({ key: k.role, label: k.label })),
  { key: 'admin' as const, label: '한백' },
];

export default function AccountAdmin({
  accounts, knownOrgs, meId, dbReady,
}: {
  accounts: AccountView[];
  /** 지금 현장에 쓰이고 있는 소속 — 오타로 현장이 안 보이는 것을 막는다 */
  knownOrgs: string[];
  meId: string;
  dbReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  // 새 계정 폼도 화면 윗부분을 대체하는 전환이다 — 뒤로 가기가 폼을 닫는다 (케이스 폼과 같은 이유)
  useBackClose(open, () => setOpen(false));
  const [done, setDone] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Role | 'all'>('all');

  const counts = useMemo(() => {
    const m = new Map<Role, number>();
    for (const a of accounts) m.set(a.role, (m.get(a.role) ?? 0) + 1);
    return m;
  }, [accounts]);

  /*
   * 중지된 계정은 아래로 내린다 — 지금 쓰는 계정 사이에 섞여 있으면 목록을 훑을 때마다
   * 회색 줄을 건너뛰며 읽어야 한다. 그 안의 순서는 저장소가 준 대로(로그인 ID) 둔다.
   */
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts
      .filter((a) => filter === 'all' || a.role === filter)
      .filter(
        (a) =>
          needle === ''
          || a.id.includes(needle)
          || a.name.toLowerCase().includes(needle)
          || (a.org ?? '').toLowerCase().includes(needle)
      )
      .sort((x, y) => Number(y.active) - Number(x.active));
  }, [accounts, filter, q]);

  return (
    <div className="flex flex-col gap-7">
      <section>
        {!dbReady && (
          <Note tone="warn" className="mb-3">
            지금은 파일 저장소로 돌고 있어 계정을 만들 수 없습니다. <code>DATABASE_URL</code> 이
            있어야 합니다.
          </Note>
        )}

        {open ? (
          <NewAccountForm
            knownOrgs={knownOrgs}
            dbReady={dbReady}
            onDone={(msg) => {
              setDone(msg);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <Btn disabled={!dbReady} onClick={() => setOpen(true)}>
              계정 만들기
            </Btn>
            {/* 「저장됨」은 잠깐 뜨고 사라지게 만들지 않는다 — 못 보고 지나친다(규칙 9번) */}
            {done && <Saved>{done}</Saved>}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">계정</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="계정 검색"
            placeholder="로그인 ID · 이름 · 소속"
            className={`${FIELD_CELL} w-52`}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => {
              const n = f.key === 'all' ? null : counts.get(f.key) ?? 0;
              return (
                <Choice key={f.key} on={filter === f.key} onClick={() => setFilter(f.key)}>
                  {f.label}
                  {n !== null && <span className="ml-1 tabular-nums opacity-70">{n}</span>}
                </Choice>
              );
            })}
          </div>
        </div>

        <div className={`overflow-hidden ${PANEL}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-base">
              <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
                <tr>
                  <Th>로그인 ID</Th>
                  <Th>이름</Th>
                  <Th>구분</Th>
                  <Th>소속</Th>
                  <Th>만든 날</Th>
                  <Th>상태</Th>
                  <Th num>동작</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => (
                  <AccountRow key={a.id} a={a} meId={meId} knownOrgs={knownOrgs} />
                ))}
                {rows.length === 0 && (
                  <tr>
                    {/* 세었고 없다 — 「아직 없습니다」라고 적지 않는다(규칙 6·10번) */}
                    <td colSpan={7} className="px-3 py-6 text-center text-small font-bold text-slate-400">
                      0건
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {/*
          * 계정은 지우지 않고 중지한다 — 감사 기록이 로그인 ID 를 가리키고 있어서, 지우면
          * 누가 한 일인지 알 수 없어진다. 관리자 계정은 이 화면에서 만들 수 없다.
          * 이 문장이 화면에 띠로 붙어 있었는데, 「중지」 단추와 없는 단추가 이미 그 말을
          * 하고 있어서 걷어냈다(화면 규칙 2번).
          */}
      </section>
    </div>
  );
}

/**
 * 계정 등록 폼 — 열면 나오고, 만들면 접힌다.
 *
 * 소속 칸은 구분을 따라 사라진다. 열람 전용은 소속으로 현장을 가르지 않아서 넣을 값이
 * 없다 — 흐리게 두면 왜 못 적는지 알 수 없으므로 칸 자체를 없앤다(화면 규칙 3번).
 */
function NewAccountForm({
  knownOrgs, dbReady, onDone, onCancel,
}: {
  knownOrgs: string[];
  dbReady: boolean;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const { busy, error, run } = useAction();
  const [role, setRole] = useState<Role>('sales');
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [password, setPassword] = useState('');

  const needsOrg = !isHanbaek(role);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run({
      url: '/api/admin/accounts',
      body: { id, name, role, org: needsOrg ? org : null, password },
      fail: '계정을 만들지 못했습니다.',
    });
    if (!ok) return;
    onDone(`${id} 계정을 만들었습니다.`);
  }

  return (
    <form onSubmit={submit} className={`flex flex-col gap-4 ${PANEL} p-5`}>
      <div>
        <p className="mb-2 text-tiny font-bold tracking-[0.08em] text-slate-400">구분</p>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map((k) => (
            <button
              key={k.role}
              type="button"
              aria-pressed={role === k.role}
              onClick={() => setRole(k.role)}
              className={`rounded-box border px-3.5 py-2 text-left transition ${
                role === k.role
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span
                className={`block text-lead font-bold ${role === k.role ? 'text-brand-800' : 'text-slate-700'}`}
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
            placeholder={needsOrg ? 'ecoelec' : 'hanbaek-view'}
            className={FIELD}
          />
        </Field>
        <Field label="이름" hint="사람 이름까지 넣으면 감사 기록에서 알아보기 쉽습니다">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            placeholder={needsOrg ? '에코일렉 김현수' : '한백 김대표'}
            className={FIELD}
          />
        </Field>
      </div>

      {needsOrg && (
        <Field
          label="소속"
          hint="현장의 영업사·시공사 이름과 정확히 같아야 합니다 — 다르면 현장이 안 보입니다"
        >
          <input
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            autoComplete="off"
            placeholder="에코일렉"
            className={FIELD}
          />
          {knownOrgs.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-tiny text-slate-400">쓰이고 있는 소속</span>
              {/* 켜고 끄는 것이라 Choice 다 — 동글게 그려 두어 못 누르는 배지와 같은 모양이었다 */}
              {knownOrgs.map((o) => (
                <Choice key={o} on={org === o} onClick={() => setOrg(o)}>{o}</Choice>
              ))}
            </div>
          )}
        </Field>
      )}

      <Field
        label="비밀번호"
        hint={`${PASSWORD_MIN_LEN}자 이상. 저장되는 것은 해시뿐이라 나중에 다시 볼 수 없습니다`}
      >
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className={FIELD}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2.5">
        <Btn type="submit" disabled={!dbReady} busy={busy} busyLabel="만드는 중…">
          계정 만들기
        </Btn>
        <Btn kind="quiet" disabled={busy} onClick={onCancel}>
          취소
        </Btn>
        <Err>{error}</Err>
      </div>
    </form>
  );
}

/**
 * 계정 한 줄.
 *
 * ★구분·소속을 여기서 고칠 수 있다.★
 * 이 두 값이 그 사람이 무엇을 보는지를 정한다 — 구분은 영업비·시공비 중 어느 쪽을(열람
 * 전용이면 전부), 소속은 어느 현장을(문자열 일치). 만들 때 잘못 고르면 로그인 ID 가
 * primary key 라 다시 만들 수도 없어서, 고치는 자리가 없으면 DB 를 직접 만지는 수밖에
 * 없었다.
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
  // 재설정은 따로 돈다 — 구분·소속 저장의 실패 문구와 섞이면 무엇이 틀렸는지 알 수 없다
  const pwAction = useAction();
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pwDone, setPwDone] = useState(false);
  const fixed = a.source === '파일' || a.role === 'admin';

  /*
   * 구분을 바꾸는 중의 임시값.
   *
   * 열람 전용 → 영업사처럼 소속이 없는 계정을 협력사로 내리면 소속이 반드시 있어야 한다
   * (서버가 막는다). 구분만 먼저 보내면 422 가 뜨는데 그 줄에는 소속 칸이 아직 없어서
   * 고칠 길이 없었다 — 막다른 길이다. 그래서 구분을 고르면 소속 칸부터 나타나고,
   * 둘을 한 번에 보낸다.
   */
  const [roleDraft, setRoleDraft] = useState<Role>(a.role);
  const draftNeedsOrg = !isHanbaek(roleDraft);
  const orgMissing = draftNeedsOrg && !a.org;

  const patch = (body: Record<string, unknown>) =>
    void run({ url: '/api/admin/accounts', method: 'PATCH', body: { id: a.id, ...body } });

  function onRoleChange(next: Role) {
    setRoleDraft(next);
    // 소속이 필요 없거나 이미 있으면 그대로 보낸다. 없으면 소속 칸이 열리고 거기서 같이 간다.
    if (isHanbaek(next) || a.org) patch({ role: next });
  }

  async function submitPw(e: React.FormEvent) {
    e.preventDefault();
    const ok = await pwAction.run({
      url: '/api/admin/accounts',
      method: 'PATCH',
      body: { id: a.id, password: pw },
      fail: '비밀번호를 바꾸지 못했습니다.',
    });
    if (!ok) return;
    setPw('');
    setPwDone(true);
  }

  const actAs = useAction();
  async function startActAs() {
    const ok = await actAs.run({
      url: '/api/admin/act-as',
      body: { id: a.id },
      fail: '이 계정으로 전환하지 못했습니다.',
    });
    // 눈이 통째로 바뀌므로 새로 고침이 아니라 그 계정의 첫 화면으로 간다
    if (ok) window.location.assign('/projects');
  }

  return (
    <>
      <tr className={a.active ? '' : 'bg-slate-50/60'}>
        <Td className="font-bold text-slate-900">
          {a.id}
          {a.id === meId && <span className="ml-1.5 text-micro font-bold text-brand-700">나</span>}
        </Td>

        <Td className="text-slate-600">
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
        </Td>

        <Td>
          {fixed ? (
            <Badge tone={a.role === 'admin' ? 'stage' : 'mute'}>{ROLE_TEXT[a.role]}</Badge>
          ) : (
            <select
              aria-label={`${a.id} 구분`}
              value={roleDraft}
              disabled={busy}
              onChange={(e) => onRoleChange(e.target.value as Role)}
              className={`${cellInput} cursor-pointer font-bold`}
            >
              {KINDS.map((k) => (
                <option key={k.role} value={k.role}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </Td>

        <Td className="text-slate-600">
          {fixed ? (
            /* 한백 관리자는 소속으로 가르지 않는다 — 빠뜨린 것이 아니라 규칙상 없는 것이다 */
            a.role === 'admin' ? <Empty kind="na" /> : a.org ?? <Empty kind="na" />
          ) : !draftNeedsOrg ? (
            <Empty kind="na" />
          ) : (
            <>
              {/* 쓰이고 있는 소속을 골라 넣게 한다 — 손으로 적으면 「에코일렉」과 「에코일렉 」이 갈린다 */}
              <input
                aria-label={`${a.id} 소속`}
                defaultValue={a.org ?? ''}
                disabled={busy}
                autoFocus={orgMissing}
                placeholder={orgMissing ? '소속을 넣어야 저장됩니다' : undefined}
                list={`orgs-${a.id}`}
                onBlur={(e) => {
                  const v = e.target.value;
                  // 구분이 함께 바뀌는 중이면 둘을 한 번에 보낸다(위 roleDraft 주석)
                  if (orgMissing) {
                    if (v.trim()) patch({ role: roleDraft, org: v });
                  } else if (v.trim() !== (a.org ?? '')) {
                    patch({ org: v });
                  }
                }}
                className={`${cellInput} ${orgMissing ? 'border-amber-400' : ''}`}
              />
              <datalist id={`orgs-${a.id}`}>
                {knownOrgs.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </>
          )}
        </Td>

        <Td className="tabular-nums text-slate-400">
          {a.createdAt ?? <span title="환경변수·개발 시드 계정">배포 설정</span>}
        </Td>

        {/* 동글면 상태 — 누르는 것이 아니다(화면 규칙 11번) */}
        <Td>
          {a.source === '파일' ? (
            <Badge tone="mute">고정</Badge>
          ) : a.active ? (
            <Badge tone="ok">사용 중</Badge>
          ) : (
            <Badge tone="hold">중지됨</Badge>
          )}
        </Td>

        <Td num>
          {a.source === '파일' ? (
            <span
              className="text-tiny text-slate-400"
              title="배포 설정에 있는 계정이라 화면에서 못 바꿉니다"
            >
              배포 설정 —
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {/* 대행 — 브라우저 두 개 없이 이 계정의 눈으로 본다. 돌아오는 길은 상단 띠에 */}
              {a.role !== 'admin' && (
                <Btn
                  kind="quiet"
                  size="sm"
                  disabled={!a.active}
                  busy={actAs.busy}
                  busyLabel="전환 중…"
                  onClick={startActAs}
                >
                  이 계정으로 보기
                </Btn>
              )}
              {/* 잊은 비밀번호는 되찾을 수 없다(해시만 저장) — 새로 정하는 자리가 이것뿐이다 */}
              {a.role !== 'admin' && (
                <Btn
                  kind="quiet"
                  size="sm"
                  aria-expanded={pwOpen}
                  onClick={() => {
                    setPwOpen((v) => !v);
                    setPwDone(false);
                  }}
                >
                  비밀번호 재설정
                </Btn>
              )}
              {/*
                * 되돌리기 어려운 것은 자주 누르는 것과 떼어 둔다(화면 규칙 8번).
                * 빨강 배경은 쓰지 않는다 — 중지는 되돌릴 수 있다(규칙 12번).
                */}
              <span className="ml-3">
                <Btn
                  kind="quiet"
                  size="sm"
                  disabled={busy || a.id === meId}
                  onClick={() => patch({ active: !a.active })}
                >
                  {a.id === meId ? '내 계정 — 중지 불가' : a.active ? '중지' : '재개'}
                </Btn>
              </span>
            </span>
          )}
        </Td>
      </tr>
      {pwOpen && (
        <tr>
          <td colSpan={7} className="px-3 pb-3">
            {pwDone ? (
              <span className="flex items-center gap-2.5">
                <Saved>
                  {a.id} 비밀번호를 바꿨습니다 — 새 비밀번호를 협력사에 직접 전해 주세요.
                </Saved>
                <Btn kind="quiet" size="sm" onClick={() => setPwOpen(false)}>
                  닫기
                </Btn>
              </span>
            ) : (
              <form onSubmit={submitPw} className="flex flex-wrap items-center gap-2">
                {/*
                  * 보이게 적는다 — 잊어서 온 자리인데 가린 채 오타를 내면 같은 일이
                  * 반복된다. 어차피 협력사에게 전달해야 하는 값이다.
                  */}
                <input
                  aria-label={`${a.id} 새 비밀번호`}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="off"
                  placeholder={`새 비밀번호 — ${PASSWORD_MIN_LEN}자 이상`}
                  className={`${FIELD_CELL} w-60`}
                />
                <Btn type="submit" size="sm" busy={pwAction.busy} busyLabel="바꾸는 중…">
                  재설정
                </Btn>
                <Btn
                  kind="quiet"
                  size="sm"
                  onClick={() => {
                    setPwOpen(false);
                    setPw('');
                  }}
                >
                  취소
                </Btn>
                <Err>{pwAction.error}</Err>
              </form>
            )}
          </td>
        </tr>
      )}
      {error && (
        <tr>
          <td colSpan={7} className="px-3 pb-2.5">
            <Err>{error}</Err>
          </td>
        </tr>
      )}
      {actAs.error && (
        <tr>
          <td colSpan={7} className="px-3 pb-2.5">
            <Err>{actAs.error}</Err>
          </td>
        </tr>
      )}
    </>
  );
}

const cellInput = `${FIELD_CELL} min-w-[92px]`;

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

/**
 * 계정 저장소.
 *
 * 데이터와 마찬가지로 인터페이스를 두고 구현을 갈아 끼운다.
 * 지금은 환경변수(운영) / 개발 시드(로컬)를 읽는다. 계정이 늘어나면 자체 DB 구현으로 교체한다.
 *
 * 계정을 노션에 두지 않는 이유: 노션은 현장 데이터의 정본이지 인증 저장소가 아니다.
 * (audit_log 를 자체 저장소에 두기로 한 것과 같은 이유 — SYSTEM_ARCHITECTURE §6)
 */
import { eq } from 'drizzle-orm';
import { isHanbaek, normalizeOrg, type Role } from '@/lib/roles';
import type { AccountView, Actor, NewAccount, User } from './types';
import { hashPassword, verifyPassword } from './crypto';
import { getDb, hasDatabase } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { writeAudit } from '@/lib/db/audit';
import { dayOf } from '@/lib/date';

interface StoredUser extends User {
  /** pbkdf2$iterations$salt$hash */
  hash: string;
}

export type { AccountView, NewAccount };

export interface UserStore {
  find(loginId: string): Promise<StoredUser | null>;
  authenticate(loginId: string, password: string): Promise<User | null>;
  /** 계정 목록. [한백 전용] — 부르는 쪽이 확인한다. */
  list(): Promise<AccountView[]>;
  /** 계정 만들기. [한백 전용] */
  create(input: NewAccount, actor: Actor): Promise<void>;
  /** 사용 중지·재개. [한백 전용] 지우지 않는다 — 감사 기록이 계정 ID 를 가리킨다. */
  setActive(loginId: string, active: boolean, actor: Actor): Promise<void>;
  /**
   * 구분·소속·이름 고치기. [한백 전용]
   *
   * ★고칠 수 있어야 하는 이유★
   * 이 두 값이 그 사람이 무엇을 보는지를 정한다 — 구분은 영업비·시공비 중 어느 쪽을 보는지,
   * 소속은 어느 현장을 보는지(문자열 일치). 만들 때 잘못 고르면 로그인 ID 가 primary key 라
   * 다시 만들 수도 없어서, 고치는 자리가 없으면 DB 를 직접 만지는 수밖에 없다.
   *
   * 로그인 ID 는 안 바꾼다 — 감사 기록이 그것을 가리키고 있다.
   */
  setProfile(
    loginId: string,
    patch: { role?: Role; org?: string | null; name?: string },
    actor: Actor
  ): Promise<void>;
  /**
   * 비밀번호 재설정. [한백 전용]
   *
   * 저장하는 것은 해시뿐이라 잊은 비밀번호는 되찾을 수 없다 — 새로 정하는 길만 있다.
   * 이 자리가 없으면 협력사가 잊을 때마다 DB 를 직접 만져야 한다(화면 규칙 7).
   * 관리자 계정은 여기서 못 바꾼다 — 그 길은 scripts/bootstrap-admin.ts 다.
   */
  resetPassword(loginId: string, password: string, actor: Actor): Promise<void>;
}

/**
 * 개발용 시드. 비밀번호는 전부 `dev1234!`.
 * 운영에서는 절대 쓰이지 않는다 — AUTH_USERS 가 없으면 로그인 자체가 막힌다.
 */
export const DEV_USERS: StoredUser[] = [
  {
    id: 'admin', name: '한백 관리자', role: 'admin' as Role, org: null,
    hash: 'pbkdf2$120000$XRC4k5ub1VYJNT8nKsY4Qw$toOTlsnRHvlRd1lhVCDRi00YFsQhRe6B94WZupc56qg',
  },
  {
    id: 'ecoelec', name: '에코일렉 김현수', role: 'salesCons' as Role, org: '에코일렉',
    hash: 'pbkdf2$120000$5LV-dNYkQO2n-7ugf4cNtw$ohuIdAsjblPBD_0-R-a6n7ZzsWAQOc_jy6xhq1NnLqc',
  },
  {
    id: 'daesang', name: '대상전력 박지훈', role: 'cons' as Role, org: '대상전력',
    hash: 'pbkdf2$120000$BKlRfJ_N_48qYrKmNgSN_A$cA7caAnb1e9GRBoB5O3CZB605OEbCv8L1x3zPXAXNX0',
  },
  {
    id: 'navy', name: '네이비인프라 이수정', role: 'sales' as Role, org: '네이비인프라',
    hash: 'pbkdf2$120000$GtQpXDPksONLxh8DODKcsA$u5_5TxeMviIOEu7MoF26jIlAUIvL6az0kiIUc3Vnwq0',
  },
  {
    // 열람 전용 — 소속이 없다. 전 현장을 보되 어떤 쓰기도 403 이다
    id: 'viewer', name: '한백 열람', role: 'viewer' as Role, org: null,
    hash: 'pbkdf2$120000$kXM1cr9kmQqCuHXAhmXvJg$C20yiJt67FosJtcZXIB9_ZBv0tGxUrSK6O6_BEEP6M8',
  },
];

/** AUTH_USERS = JSON 배열 [{ id, name, role, org, hash }] */
function loadUsers(): StoredUser[] {
  const raw = process.env.AUTH_USERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredUser[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      console.error('[auth] AUTH_USERS 가 비어 있습니다.');
    } catch {
      console.error('[auth] AUTH_USERS 파싱 실패 — JSON 배열이어야 합니다.');
    }
    return [];
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('[auth] 운영 환경에 AUTH_USERS 가 없습니다. 로그인이 차단됩니다.');
    return [];
  }
  return DEV_USERS;
}

/**
 * DB 에 있는 계정을 먼저 본다.
 *
 * 설정 화면에서 만든 계정은 DB 에 있고, 배포 설정(AUTH_USERS)·개발 시드는 파일에 있다.
 * DB 를 먼저 보고 없으면 파일로 내려간다 — 그래야 새 계정을 만들어도 기존 계정이 계속 되고,
 * DB 가 비어 있는 환경에서도 로그인이 살아 있다.
 *
 * ★네 가지 답을 가른다.★
 * 「없음」과 「사용중지」를 같은 답으로 두면 사용중지한 계정이 뒷단(AUTH_USERS·개발 시드)으로
 * 넘어가 그대로 로그인된다 — 같은 id 가 거기 남아 있는 한 화면에서 계정을 끌 수 없다.
 * 사용중지는 최종 판정이라 뒷단을 보지 않는다.
 *
 * 「없음」과 「못 봤음」도 가른다. 로그인은 둘 다 파일로 내려가면 되지만, 이미 로그인한
 * 세션을 확인할 때는 갈린다 — DB 가 잠깐 끊긴 것을 「계정이 없어졌다」로 읽으면 그 순간
 * 모두가 로그아웃된다(accountForSession).
 */
type DbLookup = StoredUser | 'disabled' | 'missing' | 'unavailable';

async function findInDb(id: string): Promise<DbLookup> {
  /*
   * DB 를 아예 안 쓰는 환경에서는 파일이 정본이므로 「없음」이다 — 「못 봤음」이 아니다.
   * 「못 봤음」은 봐야 할 DB 가 있는데 못 본 것(아래 catch)만 가리킨다.
   */
  if (!hasDatabase()) return 'missing';
  try {
    const [row] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) return 'missing';
    if (!row.active) return 'disabled';
    return {
      id: row.id, name: row.name, role: row.role as Role, org: row.org,
      hash: row.passwordHash,
    };
  } catch (err) {
    // DB 가 잠깐 끊겼다고 로그인이 통째로 막히면 안 된다 — 파일 쪽으로 내려간다
    console.error('[auth] 계정 조회 실패, 파일 계정으로 넘어갑니다:', err);
    return 'unavailable';
  }
}

/** 파일 쪽(AUTH_USERS·개발 시드)에 같은 id 가 있나 */
const findInFile = (id: string): StoredUser | null =>
  loadUsers().find((u) => u.id.toLowerCase() === id) ?? null;

/**
 * 세션에 실린 계정이 아직 쓸 수 있는가, 그리고 지금 값이 무엇인가.
 *
 * ★왜 필요한가★
 * 세션은 서명된 쿠키 하나다(서버 저장소가 없다). 그래서 계정을 중지하거나 지워도 이미
 * 발급된 쿠키는 만료(12시간)까지 그대로 통했다 — 지운 계정으로 화면이 계속 열렸다.
 *
 * 구분·소속도 여기서 다시 읽는다. 쿠키에 박힌 값을 그대로 믿으면, 관리자에서 협력사로
 * 내린 계정이 12시간 동안 원가·마진을 계속 본다.
 *
 *   'gone'     중지·삭제됨 → 세션을 끊는다
 *   'unknown'  DB 를 못 봤다 → 세션을 그대로 둔다. 한 번 끊긴 것으로 전원을 내보내지 않는다
 */
export async function accountForSession(
  loginId: string
): Promise<{ name: string; role: Role; org: string | null } | 'gone' | 'unknown'> {
  const id = loginId.trim().toLowerCase();
  const inDb = await findInDb(id);

  if (inDb === 'disabled') return 'gone';
  /* 못 본 것은 판정하지 않는다. 파일에 있으면 그 값을 쓰고, 없으면 세션을 그대로 둔다. */
  if (inDb === 'unavailable') {
    const file = findInFile(id);
    return file ? { name: file.name, role: file.role, org: file.org } : 'unknown';
  }
  /* 확인했고 없다 — 파일에도 없으면 지워진 계정이다 */
  if (inDb === 'missing') {
    const file = findInFile(id);
    return file ? { name: file.name, role: file.role, org: file.org } : 'gone';
  }
  return { name: inDb.name, role: inDb.role, org: inDb.org };
}

function assertAdmin(actor: Actor, what: string): void {
  if (actor.role !== 'admin') throw new Error(`${what}는 한백 관리자만 할 수 있습니다.`);
}

/** 로그인 ID 규칙 — 소문자·숫자·하이픈. 대소문자로 갈리는 계정이 생기지 않게 한다. */
const ID_RE = /^[a-z0-9][a-z0-9-]{2,23}$/;

export const userStore: UserStore = {
  async find(loginId) {
    const id = loginId.trim().toLowerCase();
    const inDb = await findInDb(id);
    if (inDb === 'disabled') return null;
    // 없거나 못 봤으면 파일로 내려간다 — DB 가 비어 있는 환경에서도 로그인이 살아 있어야 한다
    if (inDb === 'missing' || inDb === 'unavailable') return findInFile(id);
    return inDb;
  },

  async list() {
    const seed: AccountView[] = loadUsers().map((u) => ({
      id: u.id, name: u.name, role: u.role, org: u.org,
      active: true, createdAt: null, source: '파일',
    }));
    if (!hasDatabase()) return seed;

    const rows = await getDb().select().from(users);
    const fromDb: AccountView[] = rows.map((r) => ({
      id: r.id, name: r.name, role: r.role as Role, org: r.org,
      active: r.active, createdAt: dayOf(r.createdAt), source: 'db',
    }));
    // 같은 ID 가 양쪽에 있으면 DB 가 이긴다 — find 와 같은 순서여야 화면이 사실을 말한다
    const inDb = new Set(fromDb.map((u) => u.id));
    return [...fromDb, ...seed.filter((u) => !inDb.has(u.id))].sort((a, b) =>
      a.id.localeCompare(b.id)
    );
  },

  async create(input, actor) {
    assertAdmin(actor, '계정 만들기');
    if (!hasDatabase()) throw new Error('계정 저장소(DB)가 연결되지 않았습니다.');

    const id = input.id.trim().toLowerCase();
    if (!ID_RE.test(id)) {
      throw new Error('로그인 ID 는 소문자·숫자·하이픈 3~24자여야 합니다.');
    }
    if (!input.name.trim()) throw new Error('이름을 입력하세요.');
    if (input.password.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
    /*
     * 협력사 계정은 소속으로 현장을 가른다 — 비어 있으면 아무 현장도 못 본다.
     * 한백 쪽(관리자·열람 전용)은 반대다: 소속으로 가르지 않으므로 소속을 두지 않는다.
     * 넣어 두면 그 문자열이 어디선가 접근 키로 쓰일 때 뜻이 갈린다.
     */
    if (!isHanbaek(input.role) && !input.org?.trim()) {
      throw new Error('협력사 계정은 소속을 반드시 넣어야 합니다.');
    }
    if (await this.find(id)) throw new Error('이미 있는 로그인 ID 입니다.');

    await getDb().insert(users).values({
      id,
      name: input.name.trim(),
      role: input.role,
      org: isHanbaek(input.role) ? null : input.org!.trim(),
      passwordHash: await hashPassword(input.password),
      active: true,
    });
  },

  async setProfile(loginId, patch, actor) {
    assertAdmin(actor, '계정 고치기');
    if (!hasDatabase()) throw new Error('계정 저장소(DB)가 연결되지 않았습니다.');
    const id = loginId.trim().toLowerCase();

    const db = getDb();
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) {
      throw new Error('DB 에 없는 계정입니다 — 배포 설정(AUTH_USERS)에 있는 계정은 여기서 못 바꿉니다.');
    }

    /*
     * 관리자는 여기서 만들지도, 여기로 올리지도 못한다.
     * 만들기(create)를 막아놨는데 고치기로 올릴 수 있으면 그 방어가 없는 것과 같다 —
     * 협력사 계정 하나를 관리자로 바꾸면 원가·마진이 그대로 넘어간다.
     */
    const role = patch.role ?? (row.role as Role);
    if (role === 'admin' || row.role === 'admin') {
      throw new Error('관리자 계정의 구분은 이 화면에서 바꿀 수 없습니다.');
    }

    /*
     * 소속 규칙은 바뀐 뒤의 구분을 따른다.
     *
     * 협력사로 두면서 소속을 비우면 아무 현장도 못 본다 — 막는다. 반대로 열람 전용으로
     * 바꾸면 소속은 뜻을 잃으므로 여기서 지운다. 구분만 바꾸고 소속을 그대로 두면
     * 「소속이 있는데 전 현장이 보이는」 계정이 남아 다음 사람이 판정을 오해한다.
     */
    const org = isHanbaek(role)
      ? null
      : patch.org === undefined
        ? row.org
        : normalizeOrg(patch.org);
    if (!isHanbaek(role) && !org) {
      throw new Error('협력사 계정은 소속을 반드시 넣어야 합니다.');
    }

    const name = patch.name === undefined ? row.name : patch.name.trim();
    if (!name) throw new Error('이름을 입력하세요.');

    if (role === row.role && org === row.org && name === row.name) return;

    await db.update(users).set({ role, org, name }).where(eq(users.id, id));

    // 무엇이 무엇으로 바뀌었는지 남긴다 — 「그 사람이 무엇을 보는지」가 달라지는 변경이다
    for (const [field, before, after] of [
      ['role', row.role, role],
      ['org', row.org, org],
      ['name', row.name, name],
    ] as const) {
      if (before !== after) {
        await writeAudit(db, {
          projectId: null,
          actor,
          action: `계정 ${id}`,
          field,
          oldValue: before,
          newValue: after,
        });
      }
    }
  },

  async resetPassword(loginId, password, actor) {
    assertAdmin(actor, '비밀번호 재설정');
    if (!hasDatabase()) throw new Error('계정 저장소(DB)가 연결되지 않았습니다.');
    // 만들 때와 같은 규칙 — 두 자리의 규칙이 갈리면 재설정으로 못 만드는 비밀번호가 생긴다
    if (password.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
    const id = loginId.trim().toLowerCase();

    const db = getDb();
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) {
      throw new Error('DB 에 없는 계정입니다 — 배포 설정(AUTH_USERS)에 있는 계정은 여기서 못 바꿉니다.');
    }
    // 관리자 계정을 화면에서 바꿀 수 있으면 다른 관리자를 잠그고 들어가는 길이 된다
    if (row.role === 'admin') {
      throw new Error('관리자 계정 비밀번호는 이 화면에서 바꿀 수 없습니다.');
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, id));

    // 누가 언제 바꿨는지만 남긴다 — 값은 해시 밖으로 꺼내지 않는다
    await writeAudit(db, {
      projectId: null,
      actor,
      action: `계정 ${id}`,
      field: 'password',
      oldValue: null,
      newValue: '재설정',
    });
  },

  async setActive(loginId, active, actor) {
    assertAdmin(actor, '계정 사용 중지');
    if (!hasDatabase()) throw new Error('계정 저장소(DB)가 연결되지 않았습니다.');
    const id = loginId.trim().toLowerCase();
    if (id === actor.id) throw new Error('자기 계정은 중지할 수 없습니다.');

    const db = getDb();
    // 먼저 있는지 본다 — update 는 0행을 조용히 지나가서, 배포 설정 계정을 중지한 것처럼
    // 「됐다」고 답하게 된다. 화면은 그 계정에 버튼을 안 주지만 API 는 직접 불릴 수 있다.
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!row) {
      throw new Error('DB 에 없는 계정입니다 — 배포 설정(AUTH_USERS)에 있는 계정은 여기서 못 바꿉니다.');
    }
    await db.update(users).set({ active }).where(eq(users.id, id));
  },

  async authenticate(loginId, password) {
    const user = await this.find(loginId);
    // 사용자가 없어도 해시 검증을 한 번 돌려 응답 시간 차이로 ID 존재 여부가 새지 않게 한다
    const stored = user?.hash ?? 'pbkdf2$120000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const ok = await verifyPassword(password, stored);
    if (!user || !ok) return null;
    return { id: user.id, name: user.name, role: user.role, org: user.org };
  },
};

/** 개발 시드가 쓰이고 있는가 — 로그인 화면에 안내를 띄우기 위해 */
export function isUsingDevSeed(): boolean {
  return !process.env.AUTH_USERS && process.env.NODE_ENV !== 'production';
}

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
import type { Role } from '@/lib/roles';
import type { AccountView, Actor, NewAccount, User } from './types';
import { hashPassword, verifyPassword } from './crypto';
import { getDb, hasDatabase } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

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
 * ★「없음」과 「사용중지」를 가른다.★
 * 둘을 같은 답으로 두면 사용중지한 계정이 뒷단(AUTH_USERS·개발 시드)으로 넘어가 그대로
 * 로그인된다 — 같은 id 가 거기 남아 있는 한 화면에서 계정을 끌 수 없다는 뜻이다.
 * 사용중지는 최종 판정이라 뒷단을 보지 않는다.
 */
async function findInDb(id: string): Promise<StoredUser | 'disabled' | null> {
  if (!hasDatabase()) return null;
  try {
    const [row] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) return null;
    if (!row.active) return 'disabled';
    return {
      id: row.id, name: row.name, role: row.role as Role, org: row.org,
      hash: row.passwordHash,
    };
  } catch (err) {
    // DB 가 잠깐 끊겼다고 로그인이 통째로 막히면 안 된다 — 파일 쪽으로 내려간다
    console.error('[auth] 계정 조회 실패, 파일 계정으로 넘어갑니다:', err);
    return null;
  }
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
    return inDb ?? loadUsers().find((u) => u.id.toLowerCase() === id) ?? null;
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
      active: r.active, createdAt: r.createdAt.toISOString().slice(0, 10), source: 'db',
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
    // 협력사 계정은 소속으로 현장을 가른다 — 비어 있으면 아무 현장도 못 본다
    if (input.role !== 'admin' && !input.org?.trim()) {
      throw new Error('협력사 계정은 소속을 반드시 넣어야 합니다.');
    }
    if (await this.find(id)) throw new Error('이미 있는 로그인 ID 입니다.');

    await getDb().insert(users).values({
      id,
      name: input.name.trim(),
      role: input.role,
      org: input.role === 'admin' ? null : input.org!.trim(),
      passwordHash: await hashPassword(input.password),
      active: true,
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

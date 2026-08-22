/**
 * 로그인 시도 횟수 제한 — 전수 대입을 막는다.
 *
 * ★왜 필요한가★
 * 비밀번호 최소 길이를 4자로 내렸다(PASSWORD_MIN_LEN, 한백 요청 2026-08-22). 숫자 4자리면
 * 조합이 만 가지뿐이다. 해시는 pbkdf2 12만 회로 걸려 있지만 그것은 DB 가 새어나갔을 때를
 * 막는 장치고, 로그인 화면을 두드리는 쪽은 못 막는다 — 한 번에 40ms 라면 만 가지를
 * 7분이면 훑는다. 콘솔이 공개 주소에 있으니 그 문을 여기서 좁힌다.
 *
 * ★막는 방식★
 * 처음 4번은 그냥 틀리게 둔다 — 오타는 흔하고, 거기서 막으면 사람이 먼저 불편해진다.
 * 5번째부터 잠그고, 틀릴수록 잠금이 배로 길어진다(1분 → 2 → 4 → 8 → 16 → 30분에서 멈춘다).
 * 30분 상한이면 한 계정에 하루 200번쯤 시도할 수 있다 — 만 가지를 훑는 데 50일이다.
 *
 * ★두 가지 열쇠★
 *  id:<로그인ID>  그 계정을 지킨다 — 한 계정의 비밀번호를 훑는 것
 *  ip:<주소>      한 주소에서 여러 계정을 훑는 것 (계정마다 4번씩이면 잠금에 안 걸린다)
 *
 * ★DB 를 못 보면 통과시킨다★
 * 이 파일 때문에 로그인이 통째로 막히면 안 된다 — 표가 아직 없거나(배포가 db:push 보다
 * 앞설 수 있다) DB 가 잠깐 끊긴 것을 「막힘」으로 읽으면 아무도 못 들어온다.
 * lib/auth/users.ts 가 DB 조회 실패에 파일 계정으로 내려가는 것과 같은 판단이다.
 *
 * ★있는지 없는지 알려주지 않는다★
 * 잠금은 계정이 있든 없든 똑같이 걸리고 문구도 같다. 그래서 이 응답으로 ID 존재 여부를
 * 알아낼 수 없다 — 401 문구를 하나로 합쳐 둔 것과 같은 이유다.
 */
import { inArray, sql } from 'drizzle-orm';
import { getDb, hasDatabase } from '@/lib/db/client';
import { loginAttempts } from '@/lib/db/schema';

/** 이만큼은 틀려도 잠그지 않는다 — 오타 몫 */
const FREE_TRIES = 4;
/** 첫 잠금 길이. 이후 실패마다 배로 */
const FIRST_LOCK_MS = 60_000;
/** 잠금 상한 — 이보다 길게는 안 막는다. 사람이 아예 못 들어오는 일을 만들지 않는다 */
const MAX_LOCK_MS = 30 * 60_000;
/** 실패를 누적하는 창 — 마지막 실패로부터 이만큼 조용하면 처음부터 다시 센다 */
const WINDOW_MS = 30 * 60_000;
/** 한 주소가 여러 계정을 훑는 것 — 계정별 몫보다 넉넉해야 한 사무실이 같이 막히지 않는다 */
const IP_FREE_TRIES = 20;

const idKey = (loginId: string) => `id:${loginId.trim().toLowerCase()}`;
const ipKey = (addr: string) => `ip:${addr}`;

/**
 * 요청을 보낸 주소. Vercel 은 x-forwarded-for 맨 앞에 실제 주소를 넣는다.
 * 못 알아내면 IP 쪽 제한 없이 계정 쪽만 센다 — 없는 주소를 하나로 뭉치면
 * 서로 남남인 사람들이 같이 막힌다.
 */
function clientIp(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  const first = fwd?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip')?.trim() || null;
}

interface Row {
  key: string;
  fails: number;
  firstFailAt: Date;
  lockedUntil: Date | null;
}

/** 창이 지났으면 0부터 — 오래전 오타가 오늘의 잠금을 앞당기지 않는다 */
function failsInWindow(row: Row | undefined, now: number): number {
  if (!row) return 0;
  if (now - row.firstFailAt.getTime() > WINDOW_MS) return 0;
  return row.fails;
}

/** 계정 몫과 주소 몫이 같은 셈을 쓴다 — 넉넉함만 다르다 */
function lockMsFor(fails: number, freeTries: number): number | null {
  if (fails <= freeTries) return null;
  return Math.min(MAX_LOCK_MS, FIRST_LOCK_MS * 2 ** (fails - freeTries - 1));
}

function readRows(keys: string[]): Promise<Row[]> {
  return getDb().select().from(loginAttempts).where(inArray(loginAttempts.key, keys));
}

/** 인스턴스마다 한 번만 시도한다 */
let triedCreate = false;

/**
 * 표가 없으면 만든다.
 *
 * ★왜 코드가 표를 만드는가★
 * 스키마 변경은 원래 로컬 `db:push` + 프로덕션에 따로 반영이다(CLAUDE.md). 그런데 프로덕션
 * DATABASE_URL 은 Vercel 에서 Sensitive 로 잠겨 있어 값을 되읽을 수 없다 — CLI 로도 못
 * 가져오고, 접속 문자열은 대화에 남기지 않는다. 그래서 프로덕션 안에서 한 번 돌리는 길밖에
 * 없었고, 전에는 그때마다 일회용 라우트를 만들어 눌렀다가 걷어냈다(64951a1 → 62c2de7).
 * 표 하나 때문에 그 왕복을 또 하지 않는다.
 *
 * ★이 한 표에만 쓴다.★ 다른 표는 schema.ts 와 `db:push` 가 정본이다. 이 표가 예외인 것은
 * 로그인을 막지 않는 부속물이라서다 — 없으면 제한만 안 걸리고 로그인은 그대로 된다.
 * 아래 DDL 은 schema.ts 의 loginAttempts 와 같아야 한다. 둘이 갈리면 db:push 가 되돌린다.
 *
 * 돌아온 값은 「이번에 만들기를 시도했나」다. false 면 이미 시도한 적이 있어 다시 읽어도
 * 소용없다는 뜻이라, 부르는 쪽이 원래 오류를 그대로 던진다.
 */
async function ensureTable(): Promise<boolean> {
  if (triedCreate) return false;
  triedCreate = true;
  await getDb().execute(sql`
    create table if not exists login_attempts (
      key           text primary key,
      fails         integer not null default 0,
      first_fail_at timestamptz not null default now(),
      locked_until  timestamptz
    )
  `);
  console.warn('[auth] login_attempts 표가 없어 만들었습니다');
  return true;
}

export interface Throttle {
  /** 지금 막혀 있으면 남은 초. 아니면 null */
  lockedForSec: number | null;
  /** 이 시도가 틀렸을 때 부른다 */
  onFail: () => Promise<void>;
  /** 이 시도가 맞았을 때 부른다 — 센 것을 지운다 */
  onSuccess: () => Promise<void>;
}

const PASS: Throttle = {
  lockedForSec: null,
  onFail: async () => {},
  onSuccess: async () => {},
};

export async function checkLoginThrottle(request: Request, loginId: string): Promise<Throttle> {
  if (!hasDatabase()) return PASS;

  const ip = clientIp(request);
  const keys = ip ? [idKey(loginId), ipKey(ip)] : [idKey(loginId)];
  const now = Date.now();

  let rows: Row[];
  try {
    rows = await readRows(keys);
  } catch (first) {
    /*
     * 표가 없어서일 수 있다 — 그러면 만들고 한 번 다시 읽는다(ensureTable).
     * 그것도 안 되면 DB 가 끊긴 것이다. 세지 못하는 것을 「막힘」으로 읽지 않는다.
     */
    try {
      if (!(await ensureTable())) throw first;
      rows = await readRows(keys);
    } catch (err) {
      console.error('[auth] 시도 기록을 못 봤습니다, 제한 없이 진행합니다:', err);
      return PASS;
    }
  }

  const byKey = new Map(rows.map((r) => [r.key, r]));

  const lockedUntil = Math.max(
    0,
    ...rows.map((r) => (r.lockedUntil && r.lockedUntil.getTime() > now ? r.lockedUntil.getTime() : 0))
  );
  if (lockedUntil > now) {
    /*
     * 잠긴 동안의 시도는 세지 않는다 — 비밀번호를 아예 확인하지 않았으니 새 실패가 아니다.
     * 세면 두드리는 것만으로 잠금이 끝없이 늘어나 진짜 주인이 돌아올 자리가 없어진다.
     *
     * 그래도 아는 ID 를 계속 틀려 그 계정을 30분씩 막아 두는 것은 막지 못한다 —
     * 잠금 방식이 원래 지는 자리다. 상한을 30분으로 둔 이유이기도 하다.
     */
    return { ...PASS, lockedForSec: Math.ceil((lockedUntil - now) / 1000) };
  }

  const write = async (fn: (db: ReturnType<typeof getDb>) => Promise<unknown>) => {
    try {
      await fn(getDb());
    } catch (err) {
      // 세는 데 실패한 것으로 로그인 결과를 뒤집지 않는다
      console.error('[auth] 시도 기록을 못 남겼습니다:', err);
    }
  };

  return {
    lockedForSec: null,

    onFail: () =>
      write(async (db) => {
        const at = new Date();
        const values = keys.map((key) => {
          const free = key.startsWith('ip:') ? IP_FREE_TRIES : FREE_TRIES;
          const fails = failsInWindow(byKey.get(key), now) + 1;
          const lock = lockMsFor(fails, free);
          return {
            key,
            fails,
            // 창을 새로 시작한 실패면 그 시각이 창의 시작이다
            firstFailAt: fails === 1 ? at : (byKey.get(key)?.firstFailAt ?? at),
            lockedUntil: lock === null ? null : new Date(at.getTime() + lock),
          };
        });

        await db
          .insert(loginAttempts)
          .values(values)
          .onConflictDoUpdate({
            target: loginAttempts.key,
            set: {
              fails: sql`excluded.fails`,
              firstFailAt: sql`excluded.first_fail_at`,
              lockedUntil: sql`excluded.locked_until`,
            },
          });

        const locked = values.filter((v) => v.lockedUntil);
        if (locked.length > 0) {
          console.warn(
            `[auth] 로그인 잠금 — ${locked.map((v) => `${v.key} ${v.fails}회`).join(', ')}`
          );
        }
      }),

    /*
     * 맞았으면 지운다 — IP 쪽까지 지운다. 한 사무실에서 여러 사람이 오타를 내다
     * 주소가 막히는 쪽이, 유효한 계정 하나를 가진 사람이 IP 몫을 되돌리는 쪽보다
     * 실제로 더 자주 일어난다. 계정별 잠금이 전수 대입을 막는 본줄이다.
     */
    onSuccess: () =>
      rows.length === 0
        ? Promise.resolve()
        : write((db) => db.delete(loginAttempts).where(inArray(loginAttempts.key, keys))),
  };
}

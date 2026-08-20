/**
 * 첫 관리자 계정을 DB 에 심는다.
 *
 *   npm run auth:bootstrap -- --id admin --name '한백 관리자'
 *   npm run auth:bootstrap -- --id admin --reset          비밀번호만 다시 발급
 *
 * 비밀번호는 터미널에서 두 번 물어본다. 파이프로 넣으면 첫 줄을 쓴다(CI·검증용).
 *
 * ★이 스크립트가 있는 이유★
 * 계정은 화면(`/admin/accounts`)에서 만든다. 그런데 그 화면에 들어가려면 이미 관리자로
 * 로그인해 있어야 해서, 첫 한 명은 화면으로 만들 수 없다. 그 한 명만 여기서 심는다.
 *
 * ★AUTH_USERS 를 쓰지 않는 이유★
 * 그쪽은 로그인 조회의 뒷단이다(lib/auth/users.ts). 환경변수에 같은 id 가 남아 있으면
 * 화면에서 사용중지한 계정이 그 뒷단으로 넘어가 그대로 로그인된다 — 계정을 끌 수 없다.
 * 계정은 DB 한 곳에만 산다.
 *
 * 비밀번호는 입력할 때 화면에 찍히지 않고, 저장되는 것은 해시뿐이다.
 * 셸 히스토리에 남지 않도록 인자로 받지 않는다.
 */
import { loadEnvFile } from '../lib/env-file';

loadEnvFile();

import { createInterface } from 'node:readline';
import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db/client';
import { users } from '../lib/db/schema';
import { hashPassword } from '../lib/auth/crypto';

/** 화면 규칙과 같은 ID 규칙 — 대소문자로 갈리는 계정이 생기지 않게 한다 */
const ID_RE = /^[a-z0-9][a-z0-9-]{2,23}$/;
const MIN_PASSWORD = 8;

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : null;
}

/** 파이프로 들어온 첫 줄 — 사람이 아니라 스크립트가 부를 때 */
function readPiped(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => {
      const first = buf.split('\n')[0].trim();
      if (!first) reject(new Error('표준입력이 비어 있습니다.'));
      else resolve(first);
    });
    process.stdin.on('error', reject);
  });
}

/**
 * 비밀번호를 두 번 받는다 — 화면에 찍지 않는다.
 *
 * readline 은 하나만 만든다. 질문마다 새로 만들어 닫으면 첫 닫기에서 stdin 이 끝나고
 * 두 번째 질문은 답을 못 받는다.
 */
async function askTwice(label: string): Promise<[string, string]> {
  const out = process.stdout as unknown as { write: (s: string) => boolean };
  const write = out.write.bind(process.stdout);
  let quiet = false;
  out.write = (s: string) => (quiet ? true : write(s));

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  // 프롬프트는 보이고 입력 글자만 가린다 — 프롬프트까지 가리면 뭘 묻는지 안 보인다
  const ask = (prompt: string) =>
    new Promise<string>((resolve, reject) => {
      write(prompt);
      quiet = true;
      rl.question('', (answer) => {
        quiet = false;
        write('\n');
        resolve(answer);
      });
      rl.once('close', () => reject(new Error('입력이 끊겼습니다.')));
    });

  try {
    const first = await ask(`${label} (${MIN_PASSWORD}자 이상): `);
    const second = await ask('다시 한 번: ');
    return [first, second];
  } finally {
    quiet = false;
    out.write = write;
    rl.close();
  }
}

/**
 * 비밀번호를 받는다.
 *
 * 사람이 터미널에서 부르면 두 번 물어 확인한다. 파이프·CI 로 들어오면 첫 줄을 그대로
 * 쓴다 — 확인 삼아 다시 물을 상대가 없다.
 */
async function readPassword(label: string): Promise<string> {
  if (!process.stdin.isTTY) return readPiped();
  const [a, b] = await askTwice(label);
  if (a !== b) throw new Error('두 번 입력한 값이 다릅니다.');
  return a;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 이 없습니다. .env.local 에 Supabase 접속 문자열을 넣어주세요.'
    );
  }

  const id = (arg('id') ?? '').trim().toLowerCase();
  if (!ID_RE.test(id)) {
    throw new Error(
      `--id 가 규칙에 안 맞습니다: ${id || '(없음)'}\n` +
        '  소문자·숫자·하이픈 3~24자, 첫 글자는 소문자나 숫자.'
    );
  }

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const reset = process.argv.includes('--reset');

  if (existing && !reset) {
    throw new Error(
      `${id} 계정이 이미 있습니다.\n` +
        '  비밀번호만 다시 발급하려면 --reset 을 붙이세요.\n' +
        '  다른 사람을 추가하려면 콘솔의 계정 등록 화면을 쓰세요 (/admin/accounts).'
    );
  }

  const name = arg('name') ?? existing?.name ?? '한백 관리자';

  const pw = await readPassword(`${id} 의 비밀번호`);
  if (pw.length < MIN_PASSWORD) throw new Error(`${MIN_PASSWORD}자 이상이어야 합니다.`);

  const passwordHash = await hashPassword(pw);

  if (existing) {
    await db.update(users).set({ passwordHash, active: true }).where(eq(users.id, id));
    console.log(`\n${id} 의 비밀번호를 다시 발급했습니다.`);
  } else {
    await db.insert(users).values({
      id,
      name,
      role: 'admin',
      org: null, // 관리자는 소속이 없다 — 소속으로 현장을 거르지 않는다
      passwordHash,
      active: true,
    });
    console.log(`\n${id} (${name}) 관리자 계정을 만들었습니다.`);
  }

  const admins = (await db.select().from(users)).filter((u) => u.role === 'admin' && u.active);
  console.log(`쓸 수 있는 관리자 ${admins.length}명: ${admins.map((u) => u.id).join(', ')}`);
  console.log('다음 사람부터는 콘솔의 계정 등록 화면에서 추가하세요 — /admin/accounts');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(`\n${(err as Error).message}`);
  process.exit(1);
});

/**
 * .env.local 을 process.env 에 얹는다.
 *
 * Next 는 .env.local 을 자동으로 읽지만, drizzle-kit 과 시드 스크립트는
 * Next 밖에서 도는 별개의 프로세스라서 아무것도 읽지 않는다.
 * dotenv 를 의존성으로 넣지 않으려고 필요한 만큼만 직접 파싱한다.
 *
 * 이미 들어 있는 값은 덮지 않는다 — 셸에서 준 값이 파일보다 우선이다.
 */
import { readFileSync } from 'fs';
import path from 'path';

export function loadEnvFile(file = '.env.local'): void {
  let raw: string;
  try {
    raw = readFileSync(path.join(process.cwd(), file), 'utf8');
  } catch {
    return; // 파일이 없으면 조용히 넘어간다 (운영에서는 플랫폼이 환경변수를 준다)
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;

    let value = trimmed.slice(eq + 1).trim();
    // 따옴표로 감싼 값은 벗긴다. 비밀번호에 # 이 있어도 잘리지 않도록 주석은 처리하지 않는다.
    const q = value[0];
    if ((q === '"' || q === "'") && value.endsWith(q) && value.length > 1) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

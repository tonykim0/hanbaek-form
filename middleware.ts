/**
 * 주소 게이트 + 콘솔 구역 인증 게이트.
 *
 * 주소가 둘이고 배포는 하나다.
 *
 *   포털  hanbaek-form.vercel.app   협력사의 입구. 콘솔은 여기 없는 것으로 한다(404).
 *   콘솔  hanbaek-ev.vercel.app     한백의 자리. 포털 화면까지 다 열린다.
 *
 * ★왜 한쪽만 가르는가★ 콘솔이 포털 양식을 쓴다 — 「계약서 작성」(/contracts)과 재발행이
 * /hec · /nice · /sk · /pluglink 로 소속을 실어 보내고, 자료실 관리는 /materials 를 연다.
 * 콘솔 주소에서 그 경로를 막으면 콘솔의 흐름이 끊긴다. 가려야 하는 것은 반대쪽 하나다 —
 * 협력사가 보는 주소에 콘솔이 안 보이는 것.
 *
 * 모르는 호스트(localhost · 프리뷰 배포)는 옛 그대로 둘 다 열어 둔다 — 개발이 막히면 안 된다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { verifyPayload } from '@/lib/auth/crypto';
import { SESSION_COOKIE, type SessionPayload } from '@/lib/auth/types';
import { canWrite, isHanbaek } from '@/lib/roles';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  return 'dev-only-insecure-secret-do-not-ship';
}

/** 주소 목록은 환경변수로 덮는다 — 도메인을 얹을 때 코드를 안 고치려고(쉼표로 여러 개) */
function hostList(raw: string | undefined, fallback: string[]): string[] {
  const given = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return given.length ? given : fallback;
}

/** ev.hanbaek.co 는 아직 안 붙였다 — 붙는 날 배포 없이 살도록 미리 넣어 둔다 */
const CONSOLE_HOSTS = hostList(process.env.CONSOLE_HOSTS, ['hanbaek-ev.vercel.app', 'ev.hanbaek.co']);
const PORTAL_HOSTS = hostList(process.env.PORTAL_HOSTS, ['hanbaek-form.vercel.app']);

/*
 * 콘솔 구역 — 로그인(/login)까지 포함한다. 콘솔에 들어가려고 지나는 자리라 주소도 콘솔이다.
 * (admin) 그룹의 /admin · /design · /pricing · /receivables 도 여기 있다.
 * 포털 주소에서는 이 목록이 통째로 404 다.
 */
const CONSOLE_PATHS = [
  '/todos',
  '/dashboard',
  '/projects',
  '/construction',
  '/contracts',
  '/reissue',
  '/split',
  '/payments',
  '/payouts',
  '/receivables',
  '/statements',
  '/settings',
  '/pricing',
  '/admin',
  '/design',
  // 조회·자료 — 포털에도 같은 화면이 있지만 이쪽은 로그인 뒤에 둔다
  '/library',
  '/lookup',
  '/apartments',
  '/login',
];

/** 콘솔 구역이지만 세션 없이 들어가는 자리 — 여기서 세션을 물으면 로그인이 자기를 물게 된다 */
const OPEN_IN_CONSOLE = ['/login'];

function hits(path: string, list: string[]): boolean {
  return list.some((p) => path === p || path.startsWith(`${p}/`));
}

/** 없는 것처럼 보이게 한다 — 리다이렉트하면 저쪽에 무엇이 있다는 것을 알려주는 셈이다 */
function gone(request: NextRequest) {
  return NextResponse.rewrite(new URL('/_not-found', request.url));
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0];
  const zone = CONSOLE_HOSTS.includes(host)
    ? 'console'
    : PORTAL_HOSTS.includes(host)
      ? 'portal'
      : null;

  // 1) 주소로 가른다. 콘솔의 집은 /projects 다 — 콘솔 주소로 포털 첫 화면을 보여줄 이유가 없다.
  if (zone === 'console' && path === '/') {
    return NextResponse.redirect(new URL('/projects', request.url));
  }
  if (zone === 'portal' && hits(path, CONSOLE_PATHS)) {
    return gone(request);
  }

  // 2) 세션은 콘솔 경로만 본다. 포털은 옛 그대로 열려 있다 — 운영 중이라 동작을 바꾸지 않는다.
  if (!hits(path, CONSOLE_PATHS) || hits(path, OPEN_IN_CONSOLE)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyPayload<SessionPayload>(token, secret()) : null;

  if (session) {
    /*
     * 구역이 셋이다. 대행 중(asId)이면 눈이 협력사이므로 앞의 둘은 언제나 막힌다 —
     * 바탕이 관리자여도 그렇다.
     *
     *   adminOnly    쓰는 자리. 관리자만. (계정·자료실)
     *   hanbaekOnly  보는 자리. 관리자와 열람 전용. (기성·단가·디자인 기준·협력사 정보)
     *   writerOnly   내는 자리. 열람 전용만 못 들어간다. (접수·계약서 작성·사업자 정보)
     *
     * /payouts 는 어디에도 없다 — 협력사도 자기 몫을 본다(페이지가 줄을 가른다).
     * 여기는 엣지라 쿠키에 박힌 구분을 그대로 읽는다. 진짜 문은 레이아웃이다
     * (app/(console)/(admin)/layout.tsx · 그 아래 admin/(write)/layout.tsx).
     *
     * ★/admin 은 통째로 관리자 전용이고, 열어 준 주소만 뺀다(adminReadable).★
     * 재무팀(열람 전용)이 협력사 정보 — 사업자등록증·통장사본·정산 계좌 — 를 봐야 한다
     * (한백 지시 2026-08-25). 목록을 「열린 것만」으로 뒤집지 않는 이유는, 그러면 새로
     * 만드는 /admin 화면이 저절로 열리기 때문이다. 막는 쪽이 기본이어야 빠뜨려도 안전하다.
     */
    const starts = (list: string[]) => hits(path, list);

    const adminOnly = ['/admin'];
    /** /admin 이지만 한백의 눈이면 보는 자리 — 보기만 하고 쓰기는 API 가 막는다 */
    const adminReadable = ['/admin/partners'];
    const hanbaekOnly = ['/receivables', '/pricing', '/design'];
    /*
     * 재발행도 「내는 자리」다 — 서류를 만들어 내보내는 일이라 열람 전용의 자리가 아니다.
     * PDF 분류·분할도 같다: 부를 때마다 판독 비용이 나가므로 보기만 하는 계정에는 안 연다.
     */
    const writerOnly = ['/projects/new', '/contracts', '/reissue', '/split', '/scan', '/settings'];

    const blocked =
      (starts(adminOnly) && !starts(adminReadable) && (session.role !== 'admin' || session.asId))
      || ((starts(hanbaekOnly) || starts(adminReadable)) && (!isHanbaek(session.role) || session.asId))
      || (starts(writerOnly) && !canWrite(session.role));

    if (blocked) return NextResponse.redirect(new URL('/projects', request.url));
    return NextResponse.next();
  }

  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * 전 경로를 본다 — 주소로 구역을 가르려면 포털 경로도 한 번 지나야 한다.
     * api 는 뺀다(라우트마다 스스로 권한을 본다) · _next 와 점이 붙은 요청(정적 파일)도 뺀다.
     */
    '/((?!api/|_next/|.*\\.).*)',
  ],
};

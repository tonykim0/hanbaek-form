/**
 * 콘솔 구역 인증 게이트.
 *
 * hanbaek-form(포털)은 그대로 열어 둔다 — 협력사가 로그인 없이 계약서를 쓰고 접수한다.
 * 콘솔(/projects, /console)만 세션을 확인하고, 없으면 로그인으로 보낸다.
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

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyPayload<SessionPayload>(token, secret()) : null;

  if (session) {
    /*
     * 구역이 셋이다. 대행 중(asId)이면 눈이 협력사이므로 앞의 둘은 언제나 막힌다 —
     * 바탕이 관리자여도 그렇다.
     *
     *   adminOnly    쓰는 자리. 관리자만. (계정·자료실·재발행·협력사 정보)
     *   hanbaekOnly  보는 자리. 관리자와 열람 전용. (기성·단가·디자인 기준)
     *   writerOnly   내는 자리. 열람 전용만 못 들어간다. (접수·계약서 작성·협력사 정보)
     *
     * /payouts 는 어디에도 없다 — 협력사도 자기 몫을 본다(페이지가 줄을 가른다).
     * 여기는 엣지라 쿠키에 박힌 구분을 그대로 읽는다. 진짜 문은 레이아웃이다
     * (app/(console)/(admin)/layout.tsx · 그 아래 admin/layout.tsx).
     */
    const path = request.nextUrl.pathname;
    const starts = (list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));

    const adminOnly = ['/admin'];
    const hanbaekOnly = ['/receivables', '/pricing', '/design'];
    const writerOnly = ['/projects/new', '/contracts', '/settings'];

    const blocked =
      (starts(adminOnly) && (session.role !== 'admin' || session.asId))
      || (starts(hanbaekOnly) && (!isHanbaek(session.role) || session.asId))
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
    '/dashboard',
    '/projects/:path*',
    // 지급 명세는 협력사도 본다 — 위 세 목록 어디에도 넣지 않는다
    '/payments',
    // 협력사 정보 — 자기 것을 적는 자리라 열람 전용은 못 들어간다(writerOnly)
    '/settings',
    '/receivables/:path*',
    '/pricing',
    '/payouts/:path*',
    '/admin/:path*',
    // 콘솔 계약서 작성 진입점. 접수는 /projects/new 라서 위 /projects/:path* 에 들어간다.
    '/contracts',
    // 조회·자료 — 포털에도 같은 화면이 있지만 이쪽은 로그인 뒤에 둔다
    '/library',
    '/lookup',
    '/apartments',
    // 디자인 기준 — 안쪽 사람만 본다
    '/design',
  ],
};

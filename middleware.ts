/**
 * 콘솔 구역 인증 게이트.
 *
 * hanbaek-form(포털)은 그대로 열어 둔다 — 협력사가 로그인 없이 계약서를 쓰고 접수한다.
 * 콘솔(/projects, /console)만 세션을 확인하고, 없으면 로그인으로 보낸다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { verifyPayload } from '@/lib/auth/crypto';
import { SESSION_COOKIE, type SessionPayload } from '@/lib/auth/types';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  return 'dev-only-insecure-secret-do-not-ship';
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyPayload<SessionPayload>(token, secret()) : null;

  if (session) {
    // 관리자 전용 구역 — 로그인했더라도 협력사는 못 들어간다.
    // 대행 중(asId)의 눈은 협력사다 — 바탕이 관리자라도 여기는 못 들어간다.
    const path = request.nextUrl.pathname;
    const adminOnly = ['/admin', '/receivables', '/payouts', '/pricing', '/design'];
    if (adminOnly.some((p) => path.startsWith(p)) && (session.role !== 'admin' || session.asId)) {
      return NextResponse.redirect(new URL('/projects', request.url));
    }
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
    // 지급 명세는 협력사도 본다 — 아래 adminOnly 목록에 넣지 않는다
    '/payments',
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

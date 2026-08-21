/**
 * 대행 — 관리자가 협력사 계정의 눈으로 콘솔을 본다.
 *
 *   POST { id }   그 계정으로 보기 시작
 *   DELETE        관리자로 돌아오기
 *
 * 세션이 브라우저 쿠키 하나뿐이라, 두 계정을 나란히 시험하려면 브라우저를 두 개
 * 띄워야 했다. 쿠키의 바탕은 그대로 관리자고 asId 만 실린다 — 서명이 있어 협력사가
 * 위조할 수 없고, 돌아오기는 다시 로그인이 아니라 asId 를 벗는 것뿐이다.
 *
 * adminWrite 헬퍼를 안 쓴다 — 그것은 「지금 눈」의 권한을 보는데, 대행 중의 눈은
 * 협력사라 돌아오기가 막힌다. 여기는 「진짜 사람」이 관리자인지를 본다.
 */
import { NextResponse } from 'next/server';
import { createSessionToken, getSessionUser } from '@/lib/auth/session';
import { userStore } from '@/lib/auth/users';
import { SESSION_COOKIE, SESSION_TTL_SEC, type SessionPayload, type User } from '@/lib/auth/types';

/** 세션의 진짜 사람 — 대행 중이면 via 가 관리자다. 관리자가 아니면 null. */
function realAdminOf(session: SessionPayload): User | null {
  if (session.via) return { id: session.via.id, name: session.via.name, role: 'admin', org: null };
  if (session.role === 'admin') {
    return { id: session.id, name: session.name, role: 'admin', org: null };
  }
  return null;
}

function withSessionCookie(token: string): NextResponse {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SEC,
  });
  return response;
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  const admin = session && realAdminOf(session);
  if (!admin) {
    return NextResponse.json({ error: '한백 관리자만 대행할 수 있습니다.' }, { status: 403 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });
  }
  const targetId = body.id?.trim().toLowerCase() ?? '';
  if (!targetId) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  // 중지된 계정은 find 가 null 이다 — 로그인 못 하는 계정은 대행도 못 한다
  const target = await userStore.find(targetId);
  if (!target) {
    return NextResponse.json({ error: '없거나 중지된 계정입니다.' }, { status: 404 });
  }
  // 관리자를 대행할 이유가 없다 — 자기가 이미 관리자다. 길을 열어 두면 감사 기록만 흐려진다.
  if (target.role === 'admin') {
    return NextResponse.json({ error: '관리자 계정은 대행할 수 없습니다.' }, { status: 400 });
  }

  return withSessionCookie(await createSessionToken(admin, target.id));
}

export async function DELETE() {
  const session = await getSessionUser();
  if (!session?.via) {
    return NextResponse.json({ error: '대행 중이 아닙니다.' }, { status: 400 });
  }
  const admin: User = { id: session.via.id, name: session.via.name, role: 'admin', org: null };
  return withSessionCookie(await createSessionToken(admin));
}

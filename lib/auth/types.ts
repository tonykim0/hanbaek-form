/**
 * 콘솔 사용자.
 *
 * hanbaek-form(포털)은 로그인이 없다 — 협력사가 익명으로 계약서를 쓰고 접수한다.
 * 콘솔은 반대로 전부 로그인 뒤에 있고, 한백과 협력사가 같은 화면을 다르게 본다.
 */
import type { Role } from '@/lib/roles';

export interface User {
  /** 로그인 ID */
  id: string;
  name: string;
  role: Role;
  /** 협력사 소속. 한백 관리자는 null — 소속으로 현장을 가르지 않는다. */
  org: string | null;
}

/** 세션 쿠키에 담기는 것 (비밀번호 해시는 절대 안 들어간다) */
export interface SessionPayload {
  id: string;
  name: string;
  role: Role;
  org: string | null;
  /** 만료 시각 (epoch seconds) */
  exp: number;
  /**
   * 대행 — 관리자가 이 협력사 계정의 눈으로 보는 중이다.
   * 쿠키에는 이 표시만 실리고(바탕은 그대로 관리자), 화면·권한이 쓰는 값(id·role·org)은
   * getSessionUser 가 매 요청 그 계정의 지금 값으로 바꿔 낸다.
   */
  asId?: string;
  /** 대행 중일 때만 — 진짜 사람(관리자). 쿠키에 싣지 않고 매 요청 유도한다. */
  via?: { id: string; name: string };
}

/**
 * 쓰기를 일으킨 사람 — 저장소 계층까지 들고 내려가 감사 로그에 남긴다.
 * 이름만으로는 동명이인을 가릴 수 없어 로그인 ID 를 함께 갖는다.
 */
export interface Actor {
  id: string;
  name: string;
  role: Role;
  org: string | null;
}

/** 데이터 접근 시 「누가 보는가」 — 저장소 계층까지 권한을 들고 내려간다 */
export interface Viewer {
  role: Role;
  org: string | null;
}

/**
 * 설정 화면이 보는 계정 한 줄. 해시는 절대 나가지 않는다.
 *
 * ★이 타입이 여기 있는 이유★ — lib/auth/users.ts 는 drizzle·node crypto 를 들여오는
 * 서버 전용 모듈이다. 클라이언트 컴포넌트가 거기서 타입을 가져오면 번들러가 그 모듈을
 * 클라이언트 그래프로 끌어와 React 가 둘이 되고, 화면이 useContext 에서 죽는다.
 * 타입은 양쪽이 읽어도 되는 자리에 둔다.
 */
export interface AccountView extends User {
  active: boolean;
  createdAt: string | null;
  /**
   * 어디서 온 계정인가.
   *   db   — 설정 화면에서 만든 것. 여기서 끄고 켤 수 있다.
   *   파일 — 환경변수·개발 시드. 배포 설정이므로 화면에서 손댈 수 없다.
   */
  source: 'db' | '파일';
}

export interface NewAccount {
  id: string;
  name: string;
  role: Role;
  org: string | null;
  password: string;
}

export const SESSION_COOKIE = 'hb_session';
/** 12시간 */
export const SESSION_TTL_SEC = 12 * 60 * 60;

/**
 * 비밀번호 최소 길이.
 *
 * 한 자리에만 적는다 — 만들기(create)·재설정(resetPassword)·화면 안내가 갈리면
 * 「만들 때는 되는데 재설정은 안 되는」 값이 생긴다.
 *
 * 8 → 4 (한백 요청 2026-08-22). 협력사에 전화로 알려주는 값이라 짧아야 한다는 판단이다.
 * 대신 이 값이 짧은 만큼 계정을 지키는 것은 다른 자리다 — 비밀번호는 pbkdf2 12만 회로
 * 해시해 저장하고(해시만 저장한다), 로그인 응답은 ID 존재 여부를 알려주지 않는다.
 */
export const PASSWORD_MIN_LEN = 4;

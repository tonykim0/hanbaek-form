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

/**
 * 콘솔 화면 부품 — 모양을 정하는 곳은 여기 하나다.
 *
 * ★왜 만드는가★
 * 「디자인 기준」 페이지(/design)에 단추·배지·띠 모양을 적어 뒀는데도 코드가 갈렸다.
 * 세어 보니 배지 18 모양, 주 단추 10 모양, 입력칸 8 모양(테두리가 slate-200 과 300 두 벌),
 * 띠 7 모양, 실패 문구 4 모양이었다. 페이지가 클래스를 손으로 베껴 적은 그림이라서,
 * 코드가 어긋나도 페이지는 어긋난 줄 모른다.
 *
 * 그래서 규칙을 문장이 아니라 부품으로 둔다(화면 규칙 2번과 같은 이유 — 규칙은 동작으로
 * 보이게 만든다). /design 페이지도 이 부품을 그린다. 두 벌을 유지하지 않는다.
 *
 * ★없는 모양이 필요하면★
 * 자리에서 클래스를 적지 말고 여기에 추가한다. 그래야 다음 화면이 같은 것을 고르고,
 * 값을 바꿀 때 한 곳만 고친다.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/* ── 말투(tone) ────────────────────────────────────────────────────────────
 * 색은 뜻이다. 빨강은 막는 것·틀린 것, 노랑은 사람이 봐야 하는 것, 초록은 진행·확인,
 * 하늘은 계약 단계, 진한 회색은 멈춤, 그냥 회색은 그 밖의 전부.
 * /design 의 색 규칙과 같다 — 일곱 번째 뜻을 만들지 않는다.
 */
export type Tone = 'stop' | 'warn' | 'ok' | 'mute' | 'stage' | 'hold';

const BADGE: Record<Tone, string> = {
  stop: 'bg-red-100 text-red-800',
  warn: 'bg-amber-100 text-amber-900',
  ok: 'bg-brand-100 text-brand-900',
  mute: 'bg-slate-100 text-slate-500',
  stage: 'bg-sky-100 text-sky-900',
  /* 멈춤은 진한 회색이다 — 색이 아니라 무게로 말한다. 보류는 어느 단계도 아니기 때문이다 */
  hold: 'bg-slate-800 text-white',
};

const NOTE: Record<Tone, string> = {
  stop: 'border-red-500 bg-red-50 text-red-800 font-semibold',
  warn: 'border-amber-500 bg-amber-50/70 text-amber-900',
  ok: 'border-brand-500 bg-brand-50/60 text-brand-900',
  mute: 'border-slate-300 bg-slate-50 text-slate-600',
  stage: 'border-sky-500 bg-sky-50 text-sky-900',
  hold: 'border-slate-800 bg-slate-100 text-slate-800',
};

/* ── 단추 ──────────────────────────────────────────────────────────────────
 * 네 가지다. 더 만들지 않는다.
 *   do    그 화면에서 하는 일. 한 상자에 하나만 둔다.
 *   side  같이 있는 다른 길 (취소·닫기)
 *   stop  되돌리기 어려운 일을 확정한다 (반려 확정). ★빨강 배경은 여기에만.★
 *   quiet 그 자리를 열고 닫는다 (고치기·취소). 글자만 — hover 는 초록.
 *   undo  되돌리거나 되돌릴 것을 연다 (확인 취소·반려·삭제). 글자만 — hover 는 빨강.
 *
 * 글자만인 단추가 둘인 이유는 hover 색이 뜻이기 때문이다. 「고치기」에 손을 얹었을 때
 * 빨개지면 지우는 것처럼 읽힌다.
 *
 * 예전에는 반려 하나에 빨강이 세 모양이었다 — 여는 단추도 빨강 테두리, 확정도 빨강 배경,
 * 사유 수정도 빨강 테두리. 다 빨가면 어느 것이 되돌릴 수 없는 것인지 알 수 없다.
 *
 * 크기는 두 가지다. 표·카드 안의 좁은 자리는 sm 을 쓴다 — 세로로 늘어선 칸에
 * 큰 단추를 넣으면 칸이 밀린다. 세 번째 크기를 만들지 않는다.
 *
 * `busy` 를 주면 눌리지 않고 이름이 「…중」으로 바뀐다 — 누른 뒤 무엇이 되고 있는지
 * 그 자리에 보여야 한다(화면 규칙 9번).
 */
type BtnKind = 'do' | 'side' | 'stop' | 'quiet' | 'undo';

const BTN: Record<BtnKind, string> = {
  do: 'rounded-ctl bg-brand-600 font-bold text-white transition hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400',
  side: 'rounded-ctl border border-slate-300 bg-white font-bold text-slate-700 transition hover:bg-slate-50 disabled:border-slate-200 disabled:text-slate-300',
  stop: 'rounded-ctl bg-red-600 font-bold text-white transition hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400',
  /*
   * 곁다리 동작(수정·취소)의 모양 — 밑줄 글자였는데 고스트 칩으로 바꿨다(한백 확인).
   * 밑줄은 링크로 읽히고, 「각지면 누르는 것」(화면 규칙 11)과도 어긋났다.
   */
  quiet:
    'rounded-ctl border border-slate-200 bg-white font-bold text-slate-500 transition hover:border-brand-300 hover:text-brand-800 disabled:border-slate-100 disabled:text-slate-300',
  undo: 'font-bold text-slate-400 underline decoration-slate-300 transition hover:text-red-700 disabled:text-slate-300 disabled:no-underline',
};

/** 글자만인 단추(undo)는 패딩이 없다 — 안쪽 여백을 주면 눌리는 상자처럼 보인다 */
const BTN_SIZE: Record<'md' | 'sm', Record<'box' | 'chip' | 'text', string>> = {
  md: { box: 'px-3.5 py-2 text-lead', chip: 'px-2.5 py-1 text-small', text: 'text-small' },
  sm: { box: 'px-2.5 py-1 text-small', chip: 'px-1.5 py-0.5 text-tiny', text: 'text-tiny' },
};

export function Btn({
  kind = 'do',
  size = 'md',
  busy = false,
  busyLabel,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: BtnKind;
  size?: 'md' | 'sm';
  busy?: boolean;
  /** 도는 중에 보일 이름. 안 주면 「처리 중…」이다 */
  busyLabel?: string;
}) {
  const dim = BTN_SIZE[size][kind === 'undo' ? 'text' : kind === 'quiet' ? 'chip' : 'box'];
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={`${BTN[kind]} ${dim} disabled:cursor-not-allowed ${className}`}
    >
      {busy ? (busyLabel ?? '처리 중…') : children}
    </button>
  );
}

/* ── 배지 ──────────────────────────────────────────────────────────────────
 * 두 모양이고, 갈라지는 기준은 「몇 개인가」다.
 *   Badge(동글)  그 현장이 지금 있는 자리. 한 건에 하나뿐이다 (계약 / 시공 / 멈춤)
 *   Tag(각진)    그 안에서 세어진 것. 여럿이 나란히 붙는다 (반려 2 · 단가 미지정)
 * 동글면 상태, 각지면 셈이다. 누르는 것은 둘 다 아니다 — 누르는 것은 rounded-ctl 이다.
 *
 * 배지 크기는 두 가지다. lg 는 그 화면에서 제일 먼저 읽어야 하는 자리 하나에만 쓴다 —
 * 지금은 현장 상세 머리말의 단계뿐이다. 세 번째 크기를 만들지 않는다.
 */
const BADGE_SIZE = {
  md: 'px-2.5 py-1 text-tiny font-bold',
  lg: 'px-3 py-1 text-base font-black',
};

/** 좁은 표 칸에서 「트리거 대기」가 두 줄로 접혔다 — 배지·꼬리표는 줄을 바꾸지 않는다 */
const PILL = 'inline-block whitespace-nowrap';

export function Badge({
  tone = 'mute',
  size = 'md',
  children,
}: {
  tone?: Tone;
  size?: keyof typeof BADGE_SIZE;
  children: ReactNode;
}) {
  return (
    <span className={`${PILL} rounded-full ${BADGE_SIZE[size]} ${BADGE[tone]}`}>{children}</span>
  );
}

export function Tag({ tone = 'mute', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`${PILL} rounded-tag px-1.5 py-0.5 text-micro font-bold ${BADGE[tone]}`}>{children}</span>
  );
}

/* ── 띠 ────────────────────────────────────────────────────────────────────
 * 왼쪽 선 + 연한 배경 한 모양이다. 사방 테두리를 두르지 않는다 — 카드 안에 들어가는
 * 것이라 테두리를 더하면 상자가 두 겹이 된다(화면 규칙 1번: 약한 것부터).
 */
export function Note({
  tone = 'warn',
  className = '',
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-box border-l-[3px] px-4 py-2.5 text-base ${NOTE[tone]} ${className}`}>
      {children}
    </div>
  );
}

/* ── 고르는 칩 ─────────────────────────────────────────────────────────────
 * 여럿 중에 켜고 끄는 것 (필터 · 다중 선택). 고른 상태는 채운 초록 한 모양이다 —
 * 연한 초록·테두리만 등 「골랐다」의 모양이 화면마다 갈리기 시작해서 여기로 모았다.
 * 각지다: 누르는 것이다(규칙 11).
 */
export function Choice({
  on, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      aria-pressed={on}
      className={`rounded-ctl border px-2.5 py-1.5 text-small font-bold transition ${
        on
          ? 'border-brand-500 bg-brand-600 text-white'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

/* ── 실패 문구 ─────────────────────────────────────────────────────────────
 * 누른 단추 옆에 붙는다. 화면 위쪽 한 곳에 모아 두면 무엇을 누르다 틀렸는지 모른다.
 * 빈 값이면 자리도 차지하지 않는다 — 늘 있는 빈 줄은 눈이 무시하게 된다.
 */
export function Err({ children, className = '' }: { children?: string | null; className?: string }) {
  if (!children) return null;
  return (
    <span role="alert" className={`text-tiny font-semibold text-red-700 ${className}`}>
      {children}
    </span>
  );
}

/** 저장됨 — 실패 문구와 같은 자리에 뜬다. 잠깐 뜨고 사라지게 만들지 않는다(못 보고 지나친다). */
export function Saved({ children = '저장됨' }: { children?: ReactNode }) {
  return <span className="text-tiny font-bold text-brand-700">{children}</span>;
}

/* ── 빈 값 ─────────────────────────────────────────────────────────────────
 * 네 가지고 서로 다른 말이다. 하나로 뭉치면 「빠뜨린 것」과 「원래 없는 것」이 같아 보인다.
 *
 *   miss  넣어야 하는데 안 넣음        「미지정」 노랑 — 눈에 띄어야 한다
 *   wait  아직 올 때가 아님            「—」     회색
 *   na    이 현장에는 규칙상 없음       「해당없음」 더 연한 회색 + 고치는 자리를 주지 않는다
 *   zero  세었고 없음                  「0건」   — 「아직 없습니다」라고 적지 않는다
 */
export type EmptyKind = 'miss' | 'wait' | 'na';

const EMPTY: Record<EmptyKind, { label: string; cls: string }> = {
  miss: { label: '미지정', cls: 'text-amber-700' },
  wait: { label: '—', cls: 'text-slate-400' },
  na: { label: '해당없음', cls: 'text-slate-300' },
};

export function Empty({ kind, label }: { kind: EmptyKind; label?: string }) {
  const e = EMPTY[kind];
  return <span className={`font-bold ${e.cls}`}>{label ?? e.label}</span>;
}

/** 값이 있으면 값, 없으면 그 없음의 종류를 보여준다. 빈 자리를 지운 적이 없어야 한다. */
export function Val({
  value,
  when = 'wait',
  className = '',
}: {
  value: string | number | null | undefined;
  /** 비었을 때 무슨 없음인가 */
  when?: EmptyKind;
  className?: string;
}) {
  if (value === null || value === undefined || value === '') {
    return <Empty kind={when} />;
  }
  return <span className={`font-bold text-slate-800 ${className}`}>{value}</span>;
}

/* ── 아무것도 없는 목록 ────────────────────────────────────────────────────
 * 목록이 비었을 때만 쓴다. 값 한 칸이 빈 것은 위의 Empty 다.
 */
export function Blank({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-box border border-dashed border-slate-200 py-8 text-center text-base text-slate-400">
      {children}
    </p>
  );
}

/* ── 입력칸 ────────────────────────────────────────────────────────────────
 * input·textarea·select 이 같은 테두리를 쓴다. 예전에는 slate-200 과 slate-300 두 벌이
 * 섞여서, 같은 표 안에서 칸 테두리 진하기가 달랐다.
 *
 * 부품이 아니라 클래스 이름으로 둔다 — input 은 넘길 속성이 자리마다 너무 다르다.
 */
export const FIELD =
  'w-full rounded-ctl border border-slate-200 px-3 py-2 text-base text-slate-900 placeholder:text-slate-300 transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400';

/**
 * 표 안에서 여러 개가 붙는 좁은 칸 (화면 규칙 4번의 예외 자리 — 여러 건을 쭉 넣는다).
 * 숫자 칸에는 부르는 자리에서 tabular-nums 를 더한다.
 *
 * 테두리는 평소에도 보인다. 「hover 하면 나타나는 테두리」로 만들었던 적이 있는데,
 * 그러면 어디를 고칠 수 있는지 마우스를 얹어 봐야 알 수 있다.
 */
export const FIELD_CELL =
  'w-full rounded-ctl border border-slate-200 px-2 py-1 text-small text-slate-900 transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400';

/* ── 카드 ──────────────────────────────────────────────────────────────────
 * 화면 단위 상자는 panel, 그 안의 표·구역은 box 다. 상자 안에 상자를 넣지 않는다 —
 * 안쪽을 나눌 때는 여백과 얇은 선(HR)을 쓴다(화면 규칙 1번).
 */
export const PANEL = 'rounded-panel border border-slate-200 bg-white';

/** 카드 안에서 층을 나누는 가장 약한 수단. 배경색·테두리보다 먼저 이것을 쓴다. */
export function HR({ className = '' }: { className?: string }) {
  return <div className={`border-t border-slate-100 ${className}`} />;
}

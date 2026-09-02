import Link from 'next/link';
import Image from 'next/image';

type ActiveSection =
  | 'home'
  | 'contracts'
  | 'intake'
  | 'materials'
  | 'kapt'
  | 'charger-history'
  /* 안내문은 새 탭으로 열려 이 머리말을 떠나지 않는다 — 켜진 자리가 될 일이 없다 */
  | 'notice';

const navItems: Array<{
  href: string;
  label: string;
  shortLabel: string;
  section: ActiveSection;
  /**
   * 새 탭으로 여는가 — public/ 의 정적 안내문이 그렇다.
   *
   * 앱 껍데기(이 머리말) 밖이라 같은 탭에서 열면 돌아오는 길이 브라우저 뒤로가기뿐이다.
   * next/link 도 쓰지 않는다: 라우터가 아는 자리가 아니라 보통 앵커로 열어야 한다.
   */
  blank?: boolean;
}> = [
  { href: '/#contracts', label: '계약서 작성', shortLabel: '계약서', section: 'contracts' },
  /*
   * 접수는 콘솔에서 받는다 (한백 지시 2026-08-26) — 메뉴에서 내린다.
   * 주소(/intake)는 남는다: 돌아다니는 링크로 들어온 사람에게 어디로 가야 하는지
   * 말해주는 안내 화면이다. 메뉴에까지 두면 아직 여기서 받는 것처럼 읽힌다.
   */
  { href: '/materials', label: '자료실', shortLabel: '자료실', section: 'materials' },
  {
    href: '/charger-history',
    label: '이력조회',
    shortLabel: '이력',
    section: 'charger-history',
  },
  { href: '/kapt', label: '단지조회', shortLabel: '단지', section: 'kapt' },
  /*
   * 기설치 안내문 — 첫 화면 본문에 있던 것을 여기로 올렸다(한백 지시 2026-09-02).
   * 본문에 두면 첫 화면에서만 보이는데, 이 글이 필요한 순간은 서류를 챙기다 「무엇을
   * 내야 하나」가 막힐 때다 — 어느 화면에 있든 손이 닿아야 한다. 이력조회 옆이다:
   * 같은 일의 두 쪽이라(무엇을 내는가 · 그 이력을 어떻게 찾는가) 떨어뜨리면 하나를
   * 보고 다른 하나를 다시 찾는다. 콘솔 상단바도 같은 자리에 같은 글을 건다(TopBar).
   */
  {
    href: '/notices/legacy-charger-history.html',
    label: '제출안내',
    shortLabel: '안내',
    section: 'notice',
    blank: true,
  },
];

export default function SiteHeader({ active }: { active: ActiveSection }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[#f7f8f4]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link href="/" className="group flex min-w-0 shrink items-center gap-2.5">
          <Image
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            className="shrink-0 rounded-xl"
            priority
          />
          <span className="hidden min-w-0 sm:block">
            <span className="block text-micro font-bold tracking-[0.18em] text-brand-700">
              HANBAEK
            </span>
            <span className="block truncate text-sm font-bold leading-none text-slate-900">
              EV 업무 포털
            </span>
          </span>
        </Link>

        {/*
          메뉴가 5개라 좁은 화면에서는 줄이 넘칩니다. 글자를 줄이는 대신 가로 스크롤로
          두어(스크롤바는 감춤) 항목이 눌리거나 잘리지 않게 합니다.
        */}
        <nav
          aria-label="주요 메뉴"
          className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {navItems.map((item) => {
            const isActive = active === item.section;
            const cls = `flex-none whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${
              isActive
                ? 'bg-brand-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-brand-50 hover:text-brand-800'
            }`;
            const inner = (
              <>
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </>
            );
            return item.blank ? (
              <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>
                {inner}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cls}
              >
                {inner}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

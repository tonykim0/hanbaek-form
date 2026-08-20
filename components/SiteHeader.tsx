import Link from 'next/link';
import Image from 'next/image';

type ActiveSection =
  | 'home'
  | 'contracts'
  | 'intake'
  | 'materials'
  | 'kapt'
  | 'charger-history';

const navItems: Array<{
  href: string;
  label: string;
  shortLabel: string;
  section: ActiveSection;
}> = [
  { href: '/#contracts', label: '계약서 작성', shortLabel: '계약서', section: 'contracts' },
  { href: '/intake', label: '계약서 접수', shortLabel: '접수', section: 'intake' },
  { href: '/materials', label: '자료실', shortLabel: '자료실', section: 'materials' },
  {
    href: '/charger-history',
    label: '이력조회',
    shortLabel: '이력',
    section: 'charger-history',
  },
  { href: '/kapt', label: '단지조회', shortLabel: '단지', section: 'kapt' },
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
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex-none whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                  isActive
                    ? 'bg-brand-700 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-brand-50 hover:text-brand-800'
                }`}
              >
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

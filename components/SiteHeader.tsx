import Link from 'next/link';
import Image from 'next/image';

type ActiveSection = 'home' | 'contracts' | 'intake' | 'materials';

const navItems: Array<{
  href: string;
  label: string;
  shortLabel: string;
  section: ActiveSection;
}> = [
  { href: '/#contracts', label: '계약서 작성', shortLabel: '계약서', section: 'contracts' },
  { href: '/intake', label: '계약서 접수', shortLabel: '접수', section: 'intake' },
  { href: '/materials', label: '자료실', shortLabel: '자료실', section: 'materials' },
];

export default function SiteHeader({ active }: { active: ActiveSection }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[#f7f8f4]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link href="/" className="group flex min-w-0 items-center gap-2.5">
          <Image src="/logo.png" alt="" width={36} height={36} className="rounded-xl" priority />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold tracking-[0.18em] text-brand-700">
              HANBAEK
            </span>
            <span className="hidden text-sm font-bold leading-none text-slate-900 sm:block">
              EV 업무 포털
            </span>
          </span>
        </Link>

        <nav aria-label="주요 메뉴" className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {navItems.map((item) => {
            const isActive = active === item.section;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${
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

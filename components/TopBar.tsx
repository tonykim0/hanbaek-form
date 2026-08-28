'use client';

/**
 * 상단 바 — 조회 도구.
 *
 * 사이드바는 일의 흐름(진행·접수·정산·관리)만 남기고, 어느 화면에서든 잠깐 찾아보는
 * 조회·자료(자료실·이력·아파트)는 여기로 올렸다. 흐름과 참고를 한 기둥에 섞으면
 * 메뉴가 길어져 정작 매일 누르는 것이 묻힌다.
 *
 * 「할 일」은 여기 없다 (한백 확인 2026-08-24) — 대시보드(/todos)가 생기면서 드롭다운은
 * 같은 것을 두 벌 보여주는 자리가 됐다. 배지(건수)는 사이드바의 할 일 항목이 단다.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/roles';

const TOOLS: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: '/library', label: '운영사 자료실' },
  // 사이드바 관리 묶음에서 옮겼다 — 보는 자리(자료실) 바로 옆이 올리는 자리여야 찾는다
  { href: '/admin/materials', label: '자료실 관리', adminOnly: true },
  { href: '/lookup', label: '기설치 이력조회' },
  { href: '/apartments', label: 'K-APT 정보' },
];

/** 접수·재발행은 협력사에게 사이드바(주 업무)지만 한백에게는 가끔 있는 일이라 여기다 */
const ADMIN_INTAKE = [
  { href: '/projects/new', label: '서류 접수' },
  { href: '/contracts', label: '계약서 작성' },
  // 사이드바 관리에 있던 것을 올렸다(한백 확인) — 접수·계약서와 같은 「가끔 하는 서류 일」이다
  { href: '/admin/reissue', label: '서류 재발행' },
];

export default function TopBar({ role, onMenu }: {
  role: Role;
  /** 좁은 화면에서 사이드바 서랍을 연다 — 넓은 화면에는 사이드바가 늘 서 있어 단추가 없다 */
  onMenu?: () => void;
}) {
  const pathname = usePathname();

  return (
    /*
     * 로고 그린 배경 · 흰 글자 — 크롬(바)과 내용(흰 카드)을 색으로 가른다.
     * 로고 원색(brand-400)은 흰 글자가 안 읽혀서 같은 계열의 진한 톤을 쓴다.
     * 조회 도구는 왼쪽 — 본문 제목과 같은 여백에서 시작한다.
     */
    <header className="sticky top-0 z-30 flex h-12 items-center gap-1 bg-brand-700 px-5 sm:px-7 print:hidden">
      {/* 좁은 화면에서는 사이드바가 서랍이라 여는 자리가 필요하다 — 메뉴 옆이 그 자리다 */}
      {onMenu && (
        <button
          type="button"
          onClick={onMenu}
          aria-label="메뉴 열기"
          className="-ml-1.5 mr-0.5 shrink-0 rounded-ctl px-2 py-1.5 text-lead font-bold text-white/85 transition hover:bg-white/10 hover:text-white md:hidden"
        >
          ☰
        </button>
      )}
      {/*
        * 좁은 화면에서는 바로가기가 옆으로 흐른다 — 접히면 상단 바 높이(h-12)를 넘어
        * 글자가 잘린다. 스크롤바는 감춘다(포털 SiteHeader 와 같은 방식).
        */}
      <nav
        aria-label="바로가기"
        className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {role === 'admin' && (
          <>
            {ADMIN_INTAKE.map((t) => (
              <BarLink key={t.href} href={t.href} label={t.label} active={pathname.startsWith(t.href)} />
            ))}
            <div className="mx-1 h-5 w-px shrink-0 bg-white/25" />
          </>
        )}
        {TOOLS.filter((t) => !t.adminOnly || role === 'admin').map((t) => (
          <BarLink key={t.href} href={t.href} label={t.label} active={pathname.startsWith(t.href)} />
        ))}
      </nav>
    </header>
  );
}

function BarLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`shrink-0 whitespace-nowrap rounded-ctl px-2.5 py-1.5 text-small font-bold transition ${
        active ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}

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
import { useEffect, useState } from 'react';
import { isHanbaek, type Role } from '@/lib/roles';

const TOOLS: { href: string; label: string; adminOnly?: boolean; blank?: boolean }[] = [
  { href: '/library', label: '운영사 자료실' },
  // 사이드바 관리 묶음에서 옮겼다 — 보는 자리(자료실) 바로 옆이 올리는 자리여야 찾는다
  { href: '/admin/materials', label: '자료실 관리', adminOnly: true },
  { href: '/lookup', label: '기설치 이력조회' },
  /*
   * 기설치 안내문 (한백 지시 2026-09-02) — 조회 바로 옆이다: 같은 일의 두 쪽이라
   * (무엇을 내야 하는가 · 그 이력을 어떻게 찾는가) 떨어뜨리면 하나를 보고 다른 하나를
   * 다시 찾는다. 포털 첫 화면에도 같은 글이 서 있다(app/(portal)/page.tsx 의 notices).
   *
   * ★새 탭이다★ — public/notices/ 의 정적 HTML 이라 콘솔 껍데기(사이드바·상단바) 밖이다.
   * 같은 탭에서 열면 돌아오는 길이 브라우저 뒤로가기뿐이다. 콘솔·포털 두 주소가 한
   * 배포라 이 경로는 양쪽에서 다 열린다(둘 다 200 확인, 2026-09-02).
   */
  { href: '/notices/legacy-charger-history.html', label: '기설치 제출 안내', blank: true },
  { href: '/apartments', label: 'K-APT 정보' },
];

/**
 * 접수·계약서 작성은 협력사에게 사이드바(주 업무)지만 한백에게는 가끔 있는 일이라 여기다.
 * ★현장과 계약을 만드는 자리라 관리자만★ — 여기까지 열면 「열람 전용」이 아니게 된다.
 */
const ADMIN_INTAKE = [
  { href: '/projects/new', label: '서류 접수' },
  { href: '/contracts', label: '계약서 작성' },
];

/**
 * 서류를 손질하는 도구 — ★한백의 눈이면 다 쓴다★ (한백 지시 2026-08-31).
 *
 * 셋 다 우리 DB 에 아무것도 안 쓴다: 재발행은 포털 양식으로 보내는 링크 모음이고,
 * 분할·스캔은 파일을 갈라 받아 가는 자리다. 「내는 자리」라는 이유로 관리자에게만
 * 두었는데 그것은 자리의 성격이지 권한이 아니었다 — 재무(열람 전용)가 받은 서류를
 * 갈라 보고 사진을 스캔본으로 고칠 일이 있다.
 */
const TOOLS_DOC = [
  // 사이드바 관리에 있던 것을 올렸다(한백 확인) — 접수·계약서와 같은 「가끔 하는 서류 일」이다
  { href: '/reissue', label: '서류 재발행' },
  // 스캔 묶음을 종류별로 가르는 자리 (한백 지시 2026-08-29) — 재발행과 같은 서류 손질이다
  { href: '/split', label: 'PDF 분류·분할' },
  // 찍은 사진을 스캔본으로 (한백 지시 2026-08-31) — 재발행·분할과 같은 서류 손질이다
  { href: '/scan', label: '사진 → 스캔본' },
];

export default function TopBar({ role, onMenu }: {
  role: Role;
  /** 좁은 화면에서 사이드바 서랍을 연다 — 넓은 화면에는 사이드바가 늘 서 있어 단추가 없다 */
  onMenu?: () => void;
}) {
  const pathname = usePathname();

  /*
   * 안 읽은 공지 수 — ★확인 전에는 배지가 서 있어야 한다★ (한백 지시 2026-09-03).
   * 사이드바의 할 일 배지(/api/todos)와 같은 방식으로 화면을 옮길 때마다 다시 센다.
   * 공지 화면에 서 있으면 그 화면이 읽음을 찍는 중이므로 0 으로 접는다 — 읽고 있는데
   * 배지가 남아 있으면 거짓말이다(찍기와 세기의 경주를 화면 판정으로 끊는다).
   */
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (pathname.startsWith('/notices')) {
      setUnread(0);
      return;
    }
    let alive = true;
    void fetch('/api/notices/unread')
      .then((r) => (r.ok ? (r.json() as Promise<{ count: number }>) : null))
      .then((d) => {
        if (alive && d) setUnread(d.count);
      })
      .catch(() => {
        /* 배지가 안 뜰 뿐 — 상단바가 화면을 막으면 안 된다 */
      });
    return () => {
      alive = false;
    };
  }, [pathname]);

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
        {/* 공지가 맨 앞이다 — 안 읽은 것이 있으면 배지가 서고, 어느 화면에서든 먼저 눈에 들어와야 한다 */}
        <BarLink href="/notices" label="공지" active={pathname.startsWith('/notices')} badge={unread} />
        {role === 'admin' && ADMIN_INTAKE.map((t) => (
          <BarLink key={t.href} href={t.href} label={t.label} active={pathname.startsWith(t.href)} />
        ))}
        {isHanbaek(role) && (
          <>
            {TOOLS_DOC.map((t) => (
              <BarLink key={t.href} href={t.href} label={t.label} active={pathname.startsWith(t.href)} />
            ))}
            {/* 가르는 선 — 서류를 손질하는 일과 조회 도구는 다른 갈래다 */}
            <div className="mx-1 h-5 w-px shrink-0 bg-white/25" />
          </>
        )}
        {TOOLS.filter((t) => !t.adminOnly || role === 'admin').map((t) => (
          <BarLink
            key={t.href}
            href={t.href}
            label={t.label}
            blank={t.blank}
            /* 새 탭으로 여는 것은 이 화면을 떠나지 않는다 — 켜진 표시를 하지 않는다 */
            active={!t.blank && pathname.startsWith(t.href)}
          />
        ))}
      </nav>
    </header>
  );
}

function BarLink({ href, label, active, blank = false, badge = 0 }: {
  href: string;
  label: string;
  active: boolean;
  /**
   * 새 탭으로 여는가 — 콘솔 껍데기 밖의 것(정적 안내문)이 그렇다.
   *
   * next/link 로 열면 앱 안 이동으로 다루려다 통째로 새로 그린다. 정적 파일은 라우터가
   * 아는 자리가 아니므로 보통 앵커로 연다.
   */
  blank?: boolean;
  /** 안 읽은 수 — 0 이면 안 그린다(늘 서 있는 0 은 초록 바에서 소음이다) */
  badge?: number;
}) {
  const cls = `shrink-0 whitespace-nowrap rounded-ctl px-2.5 py-1.5 text-small font-bold transition ${
    active ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
  }`;
  /* 사이드바의 할 일 배지와 같은 말투 — 주황이 「있음」이다 */
  const chip = badge > 0 && (
    <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-micro font-black tabular-nums text-white">
      {badge}
    </span>
  );
  if (blank) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {label}
      {chip}
    </Link>
  );
}

'use client';

/**
 * 콘솔 껍데기 — 왼쪽 사이드바 대시보드.
 *
 * 가로 바에서 옮긴 이유: 항목 여섯 개가 위계 없이 한 줄에 늘어서 있었다.
 * 성격이 다른 세 종류(진행 · 돈 · 관리)를 묶어야 어디를 눌러야 할지 눈이 먼저 찾는다.
 *
 * ★가운데 정렬(max-w-6xl)을 버렸다.★ 사이드바를 넣고 폭을 1152px 로 묶으면 남는 폭이
 * 872px 이라 보드의 시공 5칸(1088px)이 다시 화면 밖으로 나간다 — 개행으로 겨우 넣은 것이
 * 도로 무너진다. 전체 폭으로 두면 1440px 이상에서는 지금보다 넓어진다.
 *
 * 접을 수 있어야 하는 이유도 같다. 1280px 노트북에서는 펼친 사이드바(240px)로는 보드가
 * 안 들어가고, 접으면(64px) 1176px 이 남아 들어간다.
 *
 * 「협력사 포털」은 이 콘솔의 화면이 아니다 — 로그인 없이 협력사가 쓰는 다른 사이트다.
 * 그런데 계약접수 칸에 현장이 올라오는 출발점이 거기라서, 흐름이 끊겨 보이지 않게
 * 자리를 만들어 두고 바깥으로 나가는 표시를 붙였다.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/roles';
import { ROLE_LABEL } from '@/lib/roles';

const COLLAPSE_KEY = 'hb-console-sidebar-collapsed';

interface Item {
  href: string;
  label: string;
  /** 콘솔 밖으로 나가는 링크 (협력사 포털) */
  external?: boolean;
  /** 접었을 때 보이는 글자 — 아이콘 대신 두 글자를 쓴다 */
  short: string;
  note?: string;
  /** 한백만 — 묶음은 열려 있는데 항목만 막을 때 쓴다(정산의 기성·지급 관리) */
  adminOnly?: boolean;
}

interface Group {
  label: string;
  adminOnly?: boolean;
  partnerOnly?: boolean;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    label: '진행',
    items: [
      { href: '/dashboard', label: '대시보드', short: '대시' },
      { href: '/projects', label: '프로젝트', short: '프로' },
    ],
  },
  {
    /*
     * 접수는 협력사가 하지만 한백도 쓴다 — 계정 없는 업체의 건을 간혹 대신 받는다.
     * 그때는 업체 이름만 적고 현장을 만든다(components/IntakeForm 의 「접수 업체」).
     *
     * 예전에는 여기가 포털로 나가는 바깥 링크였다. 로그인한 협력사를 남의 사이트로 보내면
     * 소속을 다시 적어야 하고, 낸 것이 어디로 갔는지도 알 수 없다. 그래서 안으로 들였다.
     */
    label: '접수',
    items: [
      { href: '/projects/new', label: '서류 접수', short: '접수', note: '접수하면 계약접수 칸으로' },
      { href: '/contracts', label: '계약서 작성', short: '계약' },
    ],
  },
  {
    /*
     * 조회·자료 — 포털에도 같은 화면이 있지만 여기서는 콘솔 안에서 본다.
     * 바깥 링크로 두면 로그인해서 들어온 사람이 남의 사이트로 나가고 돌아올 길이 없다.
     * 한백도 쓰는 도구라 협력사 전용으로 두지 않는다.
     */
    label: '조회·자료',
    items: [
      { href: '/library', label: '자료실', short: '자료' },
      { href: '/lookup', label: '이력 조회', short: '이력' },
      { href: '/apartments', label: '아파트 정보', short: '아파트' },
    ],
  },
  {
    /*
     * 정산은 한백만 보는 묶음이었다. 지급 명세만 협력사에게도 연다 —
     * 자기가 언제 얼마 받는지는 물어보지 않고도 알아야 한다.
     * 기성(운영사에게서 받는 돈)과 지급 관리(전체)는 한백만 본다.
     */
    label: '정산',
    items: [
      { href: '/payments', label: '지급 명세', short: '명세' },
      { href: '/payouts', label: '하도급사 지급', short: '지급', adminOnly: true },
      { href: '/receivables', label: '운영사 기성', short: '기성', adminOnly: true },
      // 지급액의 뿌리 — 케이스가 없으면 위 두 화면의 금액도 없다
      { href: '/pricing', label: '단가 케이스', short: '단가', adminOnly: true },
    ],
  },
  {
    label: '관리',
    adminOnly: true,
    items: [
      { href: '/admin/materials', label: '자료실 관리', short: '관리' },
      { href: '/admin/reissue', label: '서류 재발행', short: '재발' },
      { href: '/admin/accounts', label: '설정', short: '설정' },
      /*
       * 디자인 기준(/design)은 메뉴에 없다 — 화면을 만드는 사람의 도구라서
       * 주소를 아는 사람만 연다(한백 확인 2026-08-20). 페이지 자체는 (admin) 그룹에
       * 그대로 있고, 부품(components/ui.tsx)의 정본 역할도 그대로다.
       */
    ],
  },
];

export default function ConsoleShell({
  org, role, children,
}: {
  org: string | null;
  role: Role;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);

  // 접은 상태를 기억한다 — 좁은 화면에서 매번 다시 접게 만들면 안 쓴다
  useEffect(() => {
    setOpen(localStorage.getItem(COLLAPSE_KEY) !== '1');
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(COLLAPSE_KEY, open ? '0' : '1');
  }, [open, ready]);

  const groups = GROUPS.filter(
    (g) => (!g.adminOnly || role === 'admin') && (!g.partnerOnly || role !== 'admin')
  );

  return (
    <div className="min-h-screen bg-[#f7f8f4] text-slate-900">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white text-base transition-[width] duration-150 ${
          open ? 'w-[184px]' : 'w-[56px]'
        }`}
      >
        <div className={`flex h-14 shrink-0 items-center ${open ? 'gap-2 px-3' : 'justify-center'}`}>
          <Link href="/projects" className="flex min-w-0 items-center gap-2">
            <Image src="/logo.png" alt="한백" width={24} height={24} className="flex-none" priority />
            {open && (
              <span className="min-w-0 leading-tight">
                <span className="block text-base font-bold text-slate-900">한백</span>
                <span className="block truncate text-micro text-slate-500">전기차사업관리</span>
              </span>
            )}
          </Link>
        </div>

        <nav aria-label="콘솔 메뉴" className="flex-1 overflow-y-auto px-2 py-2">
          {groups.map((g) => (
            <div key={g.label} className="mb-3">
              {open ? (
                <p className="px-2 pb-1 text-micro font-bold tracking-[0.12em] text-slate-400">
                  {g.label}
                </p>
              ) : (
                <div className="mx-2 mb-1.5 border-t border-slate-100" />
              )}
              <ul className="flex flex-col gap-0.5">
                {g.items.filter((it) => !it.adminOnly || role === 'admin').map((it) => {
                  const active = !it.external && pathname.startsWith(it.href) && it.href !== '/';
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        target={it.external ? '_blank' : undefined}
                        rel={it.external ? 'noopener' : undefined}
                        title={open ? it.note : `${it.label}${it.note ? ` — ${it.note}` : ''}`}
                        className={`flex items-center rounded-ctl font-semibold transition ${
                          open ? 'gap-2 px-2 py-1.5' : 'justify-center py-2'
                        } ${
                          active
                            ? 'bg-brand-50 text-brand-800'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        {open ? (
                          <>
                            <span className="truncate">{it.label}</span>
                            {it.external && (
                              <span aria-hidden className="ml-auto text-tiny text-slate-300">
                                ↗
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-tiny font-bold">{it.short}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-2">
          {/*
            * 사람 이름은 적지 않는다 — 회사마다 계정이 하나라 늘 같은 이름이고,
            * 정작 알아야 하는 것은 「어느 회사·어떤 권한으로 보고 있나」다.
            */}
          {open && (
            <p className="truncate px-1.5 pb-2 text-tiny font-bold leading-tight text-slate-500">
              {org ? `${org} · ` : ''}
              {ROLE_LABEL[role]}
            </p>
          )}
          <div className={`flex gap-1 ${open ? '' : 'flex-col'}`}>
            <form action="/api/auth/logout" method="post" className={open ? 'flex-1' : ''}>
              <button
                type="submit"
                title="로그아웃"
                className="w-full rounded-ctl border border-slate-200 py-1.5 text-tiny font-bold text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
              >
                {open ? '로그아웃' : '나감'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              title={open ? '사이드바 접기' : '사이드바 펼치기'}
              className="rounded-ctl border border-slate-200 px-2 py-1.5 text-tiny font-bold text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
            >
              {open ? '«' : '»'}
            </button>
          </div>
        </div>
      </aside>

      {/* 본문은 전체 폭을 쓴다 — 보드의 칸이 화면 밖으로 나가지 않게 */}
      <div className={`transition-[padding] duration-150 ${open ? 'pl-[184px]' : 'pl-[56px]'}`}>
        <main className="px-5 pb-16 pt-8 sm:px-7 sm:pt-9">{children}</main>
        <footer className="border-t border-slate-200 px-6 py-6 text-center text-small text-slate-400">
          한백 전기차충전사업 · 내부 업무용
        </footer>
      </div>
    </div>
  );
}

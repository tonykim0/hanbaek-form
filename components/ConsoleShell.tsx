'use client';

/**
 * 콘솔 껍데기 — 왼쪽 사이드바.
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
import { canWrite, isHanbaek, ROLE_LABEL } from '@/lib/roles';
import TopBar from '@/components/TopBar';

const COLLAPSE_KEY = 'hb-console-sidebar-collapsed';

interface Item {
  href: string;
  label: string;
  /** 콘솔 밖으로 나가는 링크 (협력사 포털) */
  external?: boolean;
  /** 접었을 때 보이는 글자 — 아이콘 대신 두 글자를 쓴다 */
  short: string;
  note?: string;
  /** 한백의 눈만 — 묶음은 열려 있는데 항목만 막을 때 쓴다(정산의 기성) */
  hanbaekOnly?: boolean;
  /** 관리자만 — 바꾸는 자리다. 열람 전용에게도 안 보인다 */
  adminOnly?: boolean;
  /** 쓰는 사람만 — 열람 전용에게만 안 보인다 */
  writerOnly?: boolean;
}

/**
 * 묶음의 문도 항목과 같은 세 가지다.
 *
 *   hanbaekOnly  전 현장을 보는 눈 (관리자 · 열람 전용)
 *   adminOnly    바꾸는 손 (관리자)
 *   partnerOnly  협력사 — 한백 쪽(관리자 · 열람 전용)에게는 안 보인다
 */
interface Group {
  label: string;
  hanbaekOnly?: boolean;
  adminOnly?: boolean;
  partnerOnly?: boolean;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    /*
     * 접수는 협력사의 주 업무라 사이드바에 둔다. 한백도 쓰지만(계정 없는 업체의 건을
     * 간혹 대신 받는다) 가끔 있는 일이라 한백에게는 상단 바(TopBar)에 있다.
     *
     * 예전에는 여기가 포털로 나가는 바깥 링크였다. 로그인한 협력사를 남의 사이트로 보내면
     * 소속을 다시 적어야 하고, 낸 것이 어디로 갔는지도 알 수 없다. 그래서 안으로 들였다.
     *
     * ★진행 위에 둔다 (한백 확인 2026-08-24).★ 협력사에게 일의 순서는 접수 → 계약 →
     * 시공 → 정산인데 진행(계약·시공)이 위에 있어 순서가 거꾸로였다. 한백에게는 이
     * 묶음이 안 보이므로(partnerOnly) 한백의 사이드바는 진행이 그대로 첫 묶음이다.
     */
    label: '접수',
    partnerOnly: true,
    items: [
      /*
       * 계약서 작성이 먼저다 (한백 확인 2026-08-24) — 계약서를 쓰고 그것을 포함한 서류를
       * 접수한다. 접수를 위에 두면 묶음 안에서만 순서가 거꾸로다.
       *
       * 짧은 이름이 '계약' 이면 접힌 사이드바에서 진행 묶음의 「계약」(보드)과 같은
       * 글자다 — 협력사는 둘을 같이 본다. 이 자리는 쓰는 일이라 '작성' 이 맞다.
       */
      { href: '/contracts', label: '계약서 작성', short: '작성' },
      { href: '/projects/new', label: '서류 접수', short: '접수', note: '접수하면 계약접수 칸으로' },
    ],
  },
  {
    label: '진행',
    items: [
      // 내 차례인 것 전부 — 국면으로 묶인 작업대. 상단 바 드롭다운은 훑는 자리다 (2026-08-25)
      { href: '/todos', label: '할 일', short: '할일' },
      // 「대시보드」였다 — 이 화면이 보여주는 것은 수주 대수(월별·누적)뿐이라
      // 이름이 무엇을 보는 자리인지 말하지 않았다 (한백 확인 2026-08-24)
      { href: '/dashboard', label: '수주 현황', short: '수주' },
      // 계약과 시공을 페이지로 가른다 — 한 화면에 접으면 띠 높이가 반쪽이다 (한백 확인)
      { href: '/projects', label: '계약', short: '계약' },
      { href: '/construction', label: '시공', short: '시공' },
    ],
  },
  /*
   * 조회·자료(자료실·이력 조회·아파트 정보)는 상단 바(TopBar)에 있다 —
   * 흐름(진행·접수·정산)과 참고 도구를 한 기둥에 섞으면 매일 누르는 것이 묻힌다.
   */
  {
    /*
     * 정산은 한백만 보는 묶음이었다. 지급 내역만 협력사에게도 연다 —
     * 자기가 언제 얼마 받는지는 물어보지 않고도 알아야 한다.
     * 기성(운영사에게서 받는 돈)과 지급 관리(전체)는 한백만 본다.
     */
    label: '정산',
    items: [
      // 「지급 및 기성관리」였다 — 이 화면에 기성이 없다(한백 확인 2026-08-24). 기성은 운영사 기성관리다
      { href: '/payments', label: '지급 내역', short: '내역' },
      // 협력사도 연다(한백 확인) — 자기가 받을 지급의 회차·금액·지급시기를 본다
      { href: '/payouts', label: '협력사 지급관리', short: '지급' },
      /*
       * 거래명세서를 지급관리 바로 밑에 둔다 (한백 요청 2026-08-24) — 지급관리에서 만든
       * 배치가 여기서 명세서 한 장이 된다. 사이에 운영사 기성관리(받는 쪽)가 끼면
       * 협력사에게 주는 한 흐름이 두 동으로 갈린다.
       *
       * 배치를 만들고 보관하는 작업대다 — 협력사도 자기 배치(최종 확인분)를 여기서 본다.
       */
      { href: '/statements', label: '협력사 거래명세서', short: '명세' },
      { href: '/receivables', label: '운영사 기성관리', short: '기성', hanbaekOnly: true },
    ],
  },
  {
    // 협력사가 자기 사업자등록증·정산 계좌를 적는 자리 — 한백의 「계정설정」은 기준·계정 묶음에 있다
    label: '설정',
    partnerOnly: true,
    items: [
      // 「협력사 정보」였다 — 보는 사람이 곧 그 협력사라 3인칭이 어색했고, 기준·계정 묶음의
      // 「협력사 정보」(한백이 전 업체를 보는 화면)와 이름이 겹쳤다 (한백 확인 2026-08-24)
      { href: '/settings', label: '사업자 정보', short: '정보', note: '정산 계좌 · 사업자등록증' },
    ],
  },
  {
    /*
     * 기준 · 계정 — 기준값과 계정. 묶음은 한백의 눈에게 열어 두고 항목마다 다시 가른다.
     *
     * ★이름이 「관리」였다 (한백 확인 2026-08-24).★ 바로 위 정산 묶음에 「협력사
     * 지급관리」·「운영사 기성관리」가 있어서 같은 말이 한 사이드바에서 두 뜻으로 쓰였다 —
     * 항목의 관리는 매일 하는 일이고 이 묶음은 어쩌다 만지는 기준값이다. 그래서
     * 「관리」로 끝나는 화면을 찾으러 이 묶음을 열면 거기엔 없었다.
     * 열람 전용에게 남는 것은 단가 케이스 하나뿐이다(읽기). 계정·협력사 정보는
     * 바꾸는 자리라 주소부터 막혀 있다(app/(console)/(admin)/admin/layout.tsx).
     * 자료실 관리는 상단 바의 자료실 옆으로 옮겼다 — 보는 자리 옆이 올리는 자리다.
     */
    label: '기준 · 계정',
    hanbaekOnly: true,
    items: [
      // 정산 묶음에서 옮겼다(한백 확인) — 매일 도는 흐름이 아니라 어쩌다 만지는 기준값이다
      { href: '/pricing', label: '단가표', short: '단가' },
      // 계정설정(/admin/accounts)에서 뗐다(한백 확인) — 지급 전마다 보는 값이라 계정 등록과 결이 다르다
      { href: '/admin/partners', label: '협력사 정보', short: '협력', adminOnly: true },
      { href: '/admin/accounts', label: '계정설정', short: '계정', adminOnly: true },
      /*
       * 디자인 기준(/design)은 메뉴에 없다 — 화면을 만드는 사람의 도구라서
       * 주소를 아는 사람만 연다(한백 확인 2026-08-20). 페이지 자체는 (admin) 그룹에
       * 그대로 있고, 부품(components/ui.tsx)의 정본 역할도 그대로다.
       */
    ],
  },
];

export default function ConsoleShell({
  org, role, actAs = null, children,
}: {
  org: string | null;
  role: Role;
  /** 대행 중이면 그 계정 이름 — 관리자가 협력사의 눈으로 보고 있다 */
  actAs?: { name: string } | null;
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

  /*
   * 할 일 건수 배지 — 상단 바의 「할 일」 버튼에 있던 것을 사이드바 항목으로 옮겼다
   * (한백 확인 2026-08-24). 대시보드(/todos)가 생기면서 드롭다운은 같은 것을 두 벌
   * 보여주는 자리가 됐다 — 남긴 것은 배지(건수)뿐이다.
   * 화면을 옮기면 다시 센다 — 방금 처리한 것이 배지에 남아 있으면 거짓말이다.
   */
  const [todoCount, setTodoCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch('/api/todos')
      .then((r) => (r.ok ? (r.json() as Promise<{ items: unknown[] }>) : null))
      .then((d) => {
        if (alive && d) setTodoCount(d.items.length);
      })
      .catch(() => {
        /* 배지가 안 뜰 뿐 — 사이드바가 화면을 막으면 안 된다 */
      });
    return () => {
      alive = false;
    };
  }, [pathname]);
  useEffect(() => {
    if (ready) localStorage.setItem(COLLAPSE_KEY, open ? '0' : '1');
  }, [open, ready]);

  /*
   * 묶음과 항목이 같은 판정을 쓴다 — 묶음만 열고 항목을 안 걸러 두면 빈 제목이 남는다.
   * 항목을 다 거른 묶음은 제목째 사라진다(아래 filter).
   */
  const allow = (x: { hanbaekOnly?: boolean; adminOnly?: boolean; writerOnly?: boolean; partnerOnly?: boolean }) =>
    (!x.hanbaekOnly || isHanbaek(role))
    && (!x.adminOnly || role === 'admin')
    && (!x.writerOnly || canWrite(role))
    && (!x.partnerOnly || !isHanbaek(role));

  const groups = GROUPS.filter(allow)
    .map((g) => ({ ...g, items: g.items.filter(allow) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-[#f7f8f4] text-slate-900">
      {/* 인쇄에서는 껍데기를 걷는다 — 거래명세서(/payments/statement)를 그대로 인쇄물로 쓴다 */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white text-base transition-[width] duration-150 print:hidden ${
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
                {g.items.map((it) => {
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
                            {/* 할 일 건수 — 상단 바 배지와 같은 말투(주황 = 있음, 회색 = 없음) */}
                            {it.href === '/todos' && todoCount !== null && (
                              <span
                                className={`ml-auto rounded-tag px-1.5 py-0.5 text-tiny font-bold tabular-nums ${
                                  todoCount > 0 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {todoCount}
                              </span>
                            )}
                            {it.external && (
                              <span aria-hidden className="ml-auto text-tiny text-slate-300">
                                ↗
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="relative text-tiny font-bold">
                            {it.short}
                            {/* 접힌 채로도 있음은 보인다 — 숫자까지는 좁아서 못 싣는다 */}
                            {it.href === '/todos' && (todoCount ?? 0) > 0 && (
                              <span
                                aria-hidden
                                className="absolute -right-2 -top-1 h-1.5 w-1.5 rounded-full bg-amber-500"
                              />
                            )}
                          </span>
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
      <div className={`transition-[padding] duration-150 print:pl-0 ${open ? 'pl-[184px]' : 'pl-[56px]'}`}>
        <TopBar role={role} />
        {/*
          * 대행 띠 — 지금 눈이 내 것이 아님을 어느 화면에서든 보인다. 사이드바에 관리
          * 묶음이 사라지므로(눈이 협력사다) 돌아오는 길은 이 띠 하나뿐이다.
          */}
        {actAs && (
          <div className="sticky top-12 z-20 flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-1.5 sm:px-7 print:hidden">
            <span className="text-small font-bold text-amber-900">
              {actAs.name} 계정으로 보는 중
            </span>
            <ActAsExit />
          </div>
        )}
        {/* 바닥글은 걷어냈다(한백 확인) — 내부 도구에 매 페이지 같은 문장과 선은 자리만 먹는다 */}
        <main className="px-5 pb-16 pt-8 sm:px-7 sm:pt-9">{children}</main>
      </div>
    </div>
  );
}

/** 대행을 벗고 관리자로 — 다시 로그인이 아니라 쿠키의 asId 를 지우는 것뿐이다 */
function ActAsExit() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch('/api/admin/act-as', { method: 'DELETE' });
        if (res.ok) window.location.reload();
        else setBusy(false);
      }}
      className="ml-auto rounded-ctl border border-amber-300 bg-white px-2.5 py-1 text-tiny font-bold text-amber-900 transition hover:border-amber-400 disabled:opacity-40"
    >
      {busy ? '돌아가는 중…' : '관리자로 돌아가기'}
    </button>
  );
}

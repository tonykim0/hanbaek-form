'use client';

/**
 * 상단 바 — 조회 도구와 「내 차례」.
 *
 * 사이드바는 일의 흐름(진행·접수·정산·관리)만 남기고, 어느 화면에서든 잠깐 찾아보는
 * 조회·자료(자료실·이력·아파트)는 여기로 올렸다. 흐름과 참고를 한 기둥에 섞으면
 * 메뉴가 길어져 정작 매일 누르는 것이 묻힌다.
 *
 * 「내 차례」는 알림함이 아니라 유도값이다 — 공 차례(court)가 나에게 있는 현장을
 * /api/todos 가 그때그때 계산한다. 읽음·안읽음이 없고, 처리하면 저절로 사라진다.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/roles';

const TOOLS = [
  { href: '/library', label: '충전사업자 자료실' },
  { href: '/lookup', label: '기설치 이력조회' },
  { href: '/apartments', label: 'K-APT 정보' },
];

/** 접수는 협력사에게 사이드바(주 업무)지만 한백에게는 가끔 있는 일이라 여기다 */
const ADMIN_INTAKE = [
  { href: '/projects/new', label: '서류 접수' },
  { href: '/contracts', label: '계약서 작성' },
];

interface Todo {
  id: string;
  name: string;
  what: string;
  stalledDays: number;
}

const SHOW_MAX = 8;

export default function TopBar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [todos, setTodos] = useState<Todo[] | null>(null); // null = 아직 못 받음
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch('/api/todos');
      if (!res.ok) return;
      const data = (await res.json()) as { items: Todo[] };
      setTodos(data.items);
    } catch {
      /* 배지가 안 뜰 뿐 — 상단 바가 화면을 막으면 안 된다 */
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // 화면을 옮기면 목록을 다시 계산한다 — 방금 처리한 현장이 배지에 남아 있으면 거짓말이다
  useEffect(() => {
    if (todos !== null) void load();
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const count = todos?.length ?? 0;

  return (
    /*
     * 로고 그린 배경 · 흰 글자 — 크롬(바)과 내용(흰 카드)을 색으로 가른다.
     * 로고 원색(brand-400)은 흰 글자가 안 읽혀서 같은 계열의 진한 톤을 쓴다.
     * 조회 도구는 왼쪽 — 본문 제목과 같은 여백에서 시작한다. 「내 차례」만 오른쪽 끝.
     */
    <header className="sticky top-0 z-30 flex h-12 items-center gap-1 bg-brand-700 px-5 sm:px-7 print:hidden">
      {/* 할 일이 맨 왼쪽 — 시선이 시작하는 자리다. 있으면 흰 바탕으로 초록 바에서 가장 밝다. */}
      <div ref={boxRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            if (!open) void load();
          }}
          aria-expanded={open}
          className={`flex items-center gap-1.5 rounded-ctl px-3 py-1.5 text-small font-bold transition ${
            count > 0
              ? 'bg-white text-brand-900 shadow-sm hover:bg-brand-50'
              : 'border border-white/30 text-white/85 hover:bg-white/10 hover:text-white'
          }`}
        >
          할 일
          {todos !== null && (
            <span
              className={`rounded-tag px-1.5 py-0.5 text-tiny font-bold tabular-nums ${
                count > 0 ? 'bg-amber-500 text-white' : 'bg-white/15 text-white/70'
              }`}
            >
              {count}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1.5 w-80 rounded-panel border border-slate-200 bg-white py-1 shadow-lg">
            {todos === null || todos.length === 0 ? (
              <p className="px-3 py-3 text-small text-slate-400">
                지금 움직일 차례인 현장 <span className="font-bold">0건</span>
              </p>
            ) : (
              <>
                <ul className="max-h-96 overflow-y-auto">
                  {todos.slice(0, SHOW_MAX).map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/projects/${t.id}`}
                        onClick={() => setOpen(false)}
                        className="block px-3 py-2 transition hover:bg-slate-50"
                      >
                        <span className="block truncate text-small font-bold text-slate-900">
                          {t.name}
                        </span>
                        <span className="block text-tiny text-slate-500">
                          {t.what}
                          {t.stalledDays > 0 && (
                            <span className={t.stalledDays >= 7 ? 'font-bold text-red-600' : ''}>
                              {' '}· {t.stalledDays}일 정체
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {todos.length > SHOW_MAX && (
                  <Link
                    href="/projects"
                    onClick={() => setOpen(false)}
                    className="block border-t border-slate-100 px-3 py-2 text-tiny font-bold text-brand-700 hover:bg-slate-50"
                  >
                    {todos.length - SHOW_MAX}건 더 — 현장 보드에서 보기
                  </Link>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="mx-1.5 h-5 w-px bg-white/25" />

      <nav aria-label="바로가기" className="flex items-center gap-1">
        {role === 'admin' && (
          <>
            {ADMIN_INTAKE.map((t) => (
              <BarLink key={t.href} href={t.href} label={t.label} active={pathname.startsWith(t.href)} />
            ))}
            <div className="mx-1 h-5 w-px bg-white/25" />
          </>
        )}
        {TOOLS.map((t) => (
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
      className={`rounded-ctl px-2.5 py-1.5 text-small font-bold transition ${
        active ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}

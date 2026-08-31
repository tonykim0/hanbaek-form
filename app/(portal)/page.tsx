import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';

/**
 * 포털 첫 화면 — 협력사가 계약서를 쓰러 오는 자리.
 *
 * ★한 기둥으로 세운다★ (한백 지시 2026-08-29). 예전에는 본문 + 오른쪽 사이드바 + 맨 아래
 * 「업데이트 안내」 여덟 줄이었고, 카드마다 영문 아이브로우(CONTRACT · LOOKUP · RESOURCES ·
 * NEXT STEP)와 제 색(brand/sky/amber)이 따로 있었다. 매일 오는 사람이 여기서 하는 일은
 * 하나(계약서 작성)인데 화면은 넷을 같은 무게로 내밀고 있었다.
 *
 * 그래서 콘솔의 화면 규칙을 여기에도 적용한다:
 *   · 설명 문구를 두지 않는다 — 제목이 곧 하는 일이다 (규칙 2)
 *   · 색은 뜻이 있을 때만 — 초록은 한백, 노랑은 안내. 그 밖은 흰 카드 한 겹 (규칙 1·11)
 *   · 같은 것을 두 번 말하지 않는다 — 제목·설명·「보러 가기」가 같은 말이었다 (규칙 5)
 *
 * ★접수로 보내는 자리는 두지 않는다★ (한백 지시 2026-08-29). 접수는 콘솔의 일이고, 콘솔에
 * 들어가는 사람은 로그인부터 한다 — 포털 첫 화면에 띠를 세워 둬도 그 사람은 여기를 지나지
 * 않는다. 옛 링크로 /intake 에 닿은 사람에게는 그 화면이 콘솔로 가는 길을 말한다.
 *
 * 업데이트 안내는 걷어냈다 (한백 지시) — 손으로 적어 넣는 목록이라 늘 낡아 있었고,
 * 정작 지금 해야 할 일(계약서 작성)을 아래로 밀어냈다.
 */

/*
 * 포털은 협력사가 보는 얼굴이라 이름이 콘솔과 다르다 — 루트 레이아웃의 기본값이
 * 콘솔 이름(한백 전기차사업관리시스템)이 되었으므로 여기서 제 이름을 적는다.
 */
export const metadata = { title: '한백 전기차충전사업' };

/** 계약서 작성 — 운영사별. 이 화면의 본론이다 */
const cpos = [
  { name: '플러그링크', code: 'PL', href: '/pluglink' },
  { name: '현대엔지니어링', code: 'HEC', href: '/hec' },
  { name: '나이스인프라', code: 'NICE', href: '/nice' },
  { name: 'SK일렉링크', code: 'SK', href: '/sk' },
];

/** 조회·자료 — 계약서를 쓰기 전후에 들르는 자리 */
const tools = [
  { href: '/charger-history', title: '충전기 · 보조금 이력', hint: '주소로 조회' },
  { href: '/kapt', title: '아파트 단지 정보', hint: '단지명으로 조회' },
  { href: '/materials', title: '운영사 자료실', hint: '영업자료 · 시방서' },
];

/**
 * 안내문 — public/notices/ 의 정적 HTML 이라 새 탭으로 연다.
 * 비면 이 구역은 통째로 사라진다 — 빈 상자를 두지 않는다.
 */
const notices = [
  {
    href: '/notices/legacy-charger-history.html',
    title: '기설치 충전기 설치이력 제출 안내',
    date: '2026. 08. 09.',
  },
];

/** 구역 머리 — 제목과 곁말이 한 줄에 선다 */
function Head({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="text-xl font-black tracking-[-0.02em] text-slate-900">{title}</h2>
      {hint && <p className="text-sm text-slate-400">{hint}</p>}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7f8f4] text-slate-900">
      <SiteHeader active="home" />

      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-5 pb-16 pt-8 sm:px-6 sm:pt-10">
        {notices.length > 0 && (
          <section aria-label="안내" className="flex flex-col gap-2">
            {notices.map((notice) => (
              <a
                key={notice.href}
                href={notice.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-2xl border-l-[3px] border-amber-400 bg-white px-4 py-3 ring-1 ring-slate-200 transition hover:ring-amber-300"
              >
                <span className="min-w-0 flex-1 break-keep text-sm font-bold leading-snug text-slate-900">
                  {notice.title}
                </span>
                <span className="hidden flex-none text-xs tabular-nums text-slate-400 sm:block">
                  {notice.date}
                </span>
                <span aria-hidden className="flex-none text-slate-300 transition group-hover:text-amber-700">
                  ↗
                </span>
              </a>
            ))}
          </section>
        )}

        <section id="contracts" className="scroll-mt-20">
          <Head title="계약서 작성" hint="운영사를 고르세요" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cpos.map((cpo) => (
              <Link
                key={cpo.href}
                href={cpo.href}
                className="group flex min-h-28 flex-col rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-400"
              >
                <span className="flex h-9 w-fit items-center rounded-lg bg-brand-50 px-2.5 text-xs font-black text-brand-700">
                  {cpo.code}
                </span>
                <span className="mt-auto pt-4 text-base font-bold tracking-[-0.02em] text-slate-900">
                  {cpo.name}
                </span>
                <span className="text-tiny text-slate-400">보조금 · 자체투자</span>
              </Link>
            ))}
          </div>
        </section>

        <section id="lookup" className="scroll-mt-20">
          <Head title="조회 · 자료" />
          <div className="grid gap-3 sm:grid-cols-3">
            {tools.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group flex items-baseline gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 transition hover:border-brand-400"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold tracking-[-0.02em] text-slate-900">
                    {t.title}
                  </span>
                  <span className="block text-tiny text-slate-400">{t.hint}</span>
                </span>
                <span aria-hidden className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600">
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white/50 px-6 py-7 text-center text-xs text-slate-400">
        한백 EV Infra Solutions · Internal Operations
      </footer>
    </div>
  );
}

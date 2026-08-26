import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import { CONSOLE_URL } from '@/lib/portal-intake';

/** 계약서 작성 — 운영사별 */
const cpos = [
  { name: '플러그링크', code: 'PL', href: '/pluglink' },
  { name: '현대엔지니어링', code: 'HEC', href: '/hec' },
  { name: '나이스인프라', code: 'NICE', href: '/nice' },
  { name: 'SK일렉링크', code: 'SK', href: '/sk' },
];

/** 조회 — 영업 전 현장 확인용 */
const lookups = [
  {
    href: '/charger-history',
    eyebrow: 'CHARGER',
    title: '충전기 · 보조금 이력',
    description: '주소로 기설치 충전기와 보조금 지원 이력을 확인합니다.',
    cta: '주소로 조회',
  },
  {
    href: '/kapt',
    eyebrow: 'K-APT',
    title: '아파트 단지 정보',
    description: '단지 기본정보와 전기차 충전시설 현황을 확인합니다.',
    cta: '단지명으로 조회',
  },
];

/**
 * 안내문 — 자료실 아래에 붙습니다.
 * public/notices/ 의 정적 HTML 이라 새 탭으로 엽니다.
 */
const notices = [
  {
    href: '/notices/legacy-charger-history.html',
    title: '기설치 충전기 설치이력 제출 안내',
    date: '2026. 08. 09.',
  },
];

const updates = [
  {
    date: '2026. 08. 09.',
    title: '기설치 충전기 설치이력 제출 안내 전면 개편',
    href: '/notices/legacy-charger-history.html',
    note: '상황별 작성 요령 · 증빙 인정 예시 · 반려 사유 추가',
    isNew: true,
  },
  {
    date: '2026. 08. 07.',
    title: '충전기 · 보조금 이력 조회 신설',
    href: '/charger-history',
    note: '기준일 2026. 08. 05.',
    isNew: true,
  },
  {
    date: '2026. 08. 07.',
    title: '아파트 정보 조회(K-apt) 내부 기능으로 통합',
    href: '/kapt',
    isNew: true,
  },
  {
    date: '2026. 08. 05.',
    title: '운영사별 영업자료 · 시방서 자료실 신설',
    href: '/materials',
  },
  {
    date: '2026. 07. 29.',
    title: '기설치 충전기 이력 작성 및 증빙자료 제출 안내 최초 게시',
    href: '/notices/legacy-charger-history.html',
  },
  {
    date: '2026. 07. 28.',
    title: '현대엔지니어링 별지1(사진대지)·별지2(사전체크리스트) 추가',
    note: '2026. 08. 01.부터 적용',
  },
  {
    date: '2026. 07. 27.',
    title: '플러그링크 자체투자 계약서 추가',
  },
  {
    date: '2026. 07. 26.',
    title: '현대엔지니어링 운영서비스 계약서 업데이트',
  },
];

/** 섹션 머리말 — 아이브로우 + 제목을 같은 리듬으로 */
function SectionHead({
  eyebrow,
  title,
  hint,
  tone = 'brand',
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  tone?: 'brand' | 'sky';
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <p
          className={`text-xs font-bold tracking-[0.14em] ${
            tone === 'sky' ? 'text-sky-700' : 'text-brand-700'
          }`}
        >
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-slate-900">{title}</h2>
      </div>
      {hint && <p className="shrink-0 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/**
 * 기능 카드 — 조회 · 자료실이 같은 형태를 씁니다.
 * 「보러 가기」 줄은 mt-auto 로 내려, 카드 높이가 달라도 한 줄에 맞춰집니다.
 */
const TONES = {
  sky: {
    eyebrow: 'text-sky-700',
    surface: 'bg-[#f8fbff]',
    border: 'hover:border-sky-300',
    cta: 'text-sky-800',
  },
  amber: {
    eyebrow: 'text-amber-700',
    surface: 'bg-[#fffdf8]',
    border: 'hover:border-amber-300',
    cta: 'text-amber-800',
  },
} as const;

function FeatureCard({
  href,
  eyebrow,
  title,
  description,
  cta,
  tone,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  tone: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border border-slate-200 ${t.surface} p-5 transition ${t.border}`}
    >
      <span className={`text-tiny font-bold tracking-[0.12em] ${t.eyebrow}`}>{eyebrow}</span>
      <h3 className="mt-2 text-lg font-black tracking-[-0.02em] text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-5 text-slate-500">{description}</p>
      <span
        className={`mt-auto inline-flex items-center gap-1 pt-4 text-sm font-bold ${t.cta} group-hover:underline`}
      >
        {cta}
        <span aria-hidden className="transition group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f7f8f4] text-slate-900">
      <SiteHeader active="home" />

      <main className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-6 sm:pt-10">
        {notices.length > 0 && (
          <section aria-label="안내" className="mb-8 flex flex-col gap-2">
            {notices.map((notice) => (
              <a
                key={notice.href}
                href={notice.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-2xl border border-amber-200 bg-[#fffdf8] px-4 py-3.5 transition hover:border-amber-400 hover:bg-[#fffaf0] sm:px-5"
              >
                <span className="flex-none rounded-lg bg-amber-100 px-2 py-1 text-micro font-black tracking-[0.1em] text-amber-800">
                  안내
                </span>
                <span className="min-w-0 flex-1 break-keep text-sm font-bold leading-snug text-slate-900 group-hover:text-amber-900">
                  {notice.title}
                </span>
                <span className="hidden flex-none text-xs tabular-nums text-slate-400 sm:block">
                  {notice.date}
                </span>
                <span
                  aria-hidden
                  className="flex-none text-amber-700 transition group-hover:translate-x-0.5"
                >
                  ↗
                </span>
              </a>
            ))}
          </section>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
          <div className="flex flex-col gap-10">
            <section id="contracts" className="scroll-mt-24">
              <SectionHead eyebrow="CONTRACT" title="계약서 작성" hint="운영사를 선택하세요" />
              <div className="grid gap-3 sm:grid-cols-2">
                {cpos.map((cpo) => (
                  <Link
                    key={cpo.href}
                    href={cpo.href}
                    className="group relative flex min-h-32 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.5)] transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[0_18px_36px_-24px_rgba(49,106,64,0.55)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-brand-50 px-2 text-xs font-black text-brand-700 ring-1 ring-brand-100">
                        {cpo.code}
                      </span>
                      <span
                        aria-hidden
                        className="text-xl text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-600"
                      >
                        →
                      </span>
                    </div>
                    <h3 className="mt-auto pt-5 text-lg font-bold tracking-[-0.02em] text-slate-900">
                      {cpo.name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">보조금 · 자체투자</p>
                  </Link>
                ))}
              </div>
            </section>

            <section id="lookup" className="scroll-mt-24">
              <SectionHead
                eyebrow="LOOKUP"
                title="현장 조회"
                hint="영업 전 확인"
                tone="sky"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {lookups.map((item) => (
                  <FeatureCard key={item.href} {...item} tone="sky" />
                ))}
              </div>
            </section>
          </div>

          <aside className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <h2 className="sr-only">바로가기</h2>

            {/*
              * 접수는 콘솔에서 받는다 (한백 지시 2026-08-26). 포털에서 ZIP 을 받던 자리다 —
              * 그 문을 닫았으므로 여기서도 콘솔로 보낸다. 카드를 지우지 않는 이유는,
              * 계약서를 작성한 사람이 다음에 할 일이 접수이기 때문이다: 다음 걸음이
              * 안 보이면 어디로 가야 하는지 물어야 한다.
              */}
            <a
              href={`${CONSOLE_URL}/projects/new`}
              className="group flex flex-col rounded-2xl bg-brand-700 p-5 text-white shadow-[0_16px_35px_-24px_rgba(34,69,45,0.9)] transition hover:bg-brand-800"
            >
              <span className="inline-flex self-start rounded-full bg-white/10 px-2.5 py-1 text-tiny font-bold text-brand-100">
                NEXT STEP
              </span>
              <h3 className="mt-4 text-xl font-black tracking-[-0.03em]">작성 완료본 접수</h3>
              <p className="mt-2 text-sm leading-5 text-brand-100">
                접수는 콘솔에서 받습니다. 로그인한 소속으로 서류를 냅니다.
              </p>
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-bold">
                콘솔에서 접수
                <span aria-hidden className="transition group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </a>

            <FeatureCard
              href="/materials"
              eyebrow="RESOURCES"
              title="영업자료 · 시방서"
              description="운영사별 최신 자료를 검색하고 내려받습니다."
              cta="자료실 열기"
              tone="amber"
            />

          </aside>
        </div>

        <section className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <p className="text-tiny font-bold tracking-[0.14em] text-amber-700">UPDATES</p>
              <h2 className="mt-0.5 text-lg font-black tracking-[-0.02em]">업데이트 안내</h2>
            </div>
            <span className="text-xs text-slate-400">최근 변경사항</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {updates.map((update) => {
              // 공지(정적 HTML)만 새 탭으로 엽니다
              const isNotice = update.href?.startsWith('/notices/');
              return (
                <li
                  key={`${update.date}-${update.title}`}
                  className="grid gap-1 px-5 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-6"
                >
                  <span className="flex items-center gap-2 text-xs tabular-nums text-slate-400">
                    {update.date}
                    {update.isNew && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-micro font-black text-amber-800">
                        NEW
                      </span>
                    )}
                  </span>
                  {update.href ? (
                    <Link
                      href={update.href}
                      target={isNotice ? '_blank' : undefined}
                      rel={isNotice ? 'noopener noreferrer' : undefined}
                      className="text-sm font-semibold leading-5 text-slate-700 hover:text-brand-700 hover:underline"
                    >
                      {update.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium leading-5 text-slate-700">{update.title}</p>
                  )}
                  {update.note && (
                    <span className="justify-self-start rounded-md bg-slate-100 px-2 py-1 text-tiny font-semibold text-slate-600 sm:justify-self-end">
                      {update.note}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white/50 px-6 py-7 text-center text-xs text-slate-400">
        한백 EV Infra Solutions · Internal Operations
      </footer>
    </div>
  );
}

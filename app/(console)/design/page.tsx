/**
 * 디자인 기준 — 이 콘솔이 쓰는 색·활자·부품을 한 화면에 모아둔다.
 *
 * ★문서가 아니라 화면이다.★ 따로 적어 둔 문서는 코드와 어긋나는 순간 쓸모가 없어진다.
 * 이 페이지는 실제 클래스로 그려지므로, 토큰을 바꾸면 여기가 같이 바뀐다.
 *
 * 새 화면을 만들 때 여기서 고른다. 여기 없는 값을 쓰고 싶으면 먼저 여기(그리고
 * tailwind.config.js)에 추가한다 — 그래야 다음 사람이 같은 것을 고른다.
 */
export const metadata = { title: '디자인 기준 — 한백 전기차사업관리' };

/*
 * 클래스 이름은 통째로 적는다.
 * Tailwind 는 소스를 글자로 훑어서 쓰이는 클래스만 만든다 — `bg-brand-${n}` 처럼 이어붙이면
 * 그 클래스가 만들어지지 않아 색이 안 나온다.
 */
const BRAND: Array<[string, string]> = [
  ['50', 'bg-brand-50'], ['100', 'bg-brand-100'], ['200', 'bg-brand-200'],
  ['300', 'bg-brand-300'], ['400', 'bg-brand-400'], ['500', 'bg-brand-500'],
  ['600', 'bg-brand-600'], ['700', 'bg-brand-700'], ['800', 'bg-brand-800'],
  ['900', 'bg-brand-900'],
];
const SLATE_USE: Array<[string, string, string]> = [
  ['slate-900', 'bg-slate-900', '제목·값 (가장 진한 글자)'],
  ['slate-800', 'bg-slate-800', '본문 강조'],
  ['slate-700', 'bg-slate-700', '표 안의 값'],
  ['slate-600', 'bg-slate-600', '보조 값'],
  ['slate-500', 'bg-slate-500', '라벨'],
  ['slate-400', 'bg-slate-400', '설명·비활성 글자'],
  ['slate-300', 'bg-slate-300', '빈 값 (—)'],
  ['slate-200', 'bg-slate-200', '경계선'],
  ['slate-100', 'bg-slate-100', '표 구분선·연한 배경'],
  ['slate-50', 'bg-slate-50', '표 머리글 배경'],
];
const TYPE: Array<[string, string, string]> = [
  ['text-h1', '24px', '화면에서 가장 큰 숫자·현장명'],
  ['text-h2', '18px', '화면 제목'],
  ['text-h3', '16px', '구역 제목'],
  ['text-lead', '14px', '카드 표제·단추'],
  ['text-base', '13px', '본문·카드 내용'],
  ['text-small', '12px', '표 안의 값'],
  ['text-tiny', '11px', '라벨·보조 설명'],
  ['text-micro', '10px', '배지·단위'],
];

export default function DesignPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-h1 font-black text-slate-900">디자인 기준</h1>
        <p className="mt-1.5 text-base text-slate-500">
          새 화면은 여기서 고른 것으로만 만듭니다. 없는 값이 필요하면 먼저 여기에 추가합니다.
        </p>
      </header>

      <Section title="색" note="브랜드 초록은 「진행·확인」에만, 나머지는 회색으로 말한다">
        <div className="flex flex-wrap gap-1.5">
          {BRAND.map(([n, cls]) => (
            <div key={n} className="w-[68px]">
              <div className={`h-12 rounded-ctl ${cls}`} />
              <p className="mt-1 text-micro font-bold text-slate-500">{n}</p>
            </div>
          ))}
        </div>
        <ul className="mt-3 flex flex-col gap-1 text-tiny text-slate-500">
          <li>· <b className="text-slate-700">brand-600</b> 기본 단추·켜진 필터 · <b className="text-slate-700">brand-700</b> hover</li>
          <li>· <b className="text-slate-700">brand-100/50</b> 배지·연한 강조 배경</li>
          <li>· 빨강은 <b className="text-slate-700">반려·오류</b>만, 노랑은 <b className="text-slate-700">확인 필요</b>만. 그 밖에 쓰지 않는다</li>
        </ul>

        <div className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {SLATE_USE.map(([name, cls, use]) => (
            <div key={name} className="flex items-center gap-2 border-b border-slate-100 py-1.5">
              <span className={`h-4 w-4 shrink-0 rounded border border-slate-200 ${cls}`} />
              <code className="w-20 shrink-0 text-micro font-bold text-slate-600">{name}</code>
              <span className="text-tiny text-slate-500">{use}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="활자" note="Pretendard 하나만 쓴다. 여덟 단계 밖으로 나가지 않는다">
        <div className="flex flex-col divide-y divide-slate-100">
          {TYPE.map(([cls, px, use]) => (
            <div key={cls} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
              <code className="w-24 shrink-0 text-micro font-bold text-brand-700">{cls}</code>
              <span className="w-12 shrink-0 text-micro tabular-nums text-slate-400">{px}</span>
              <span className={`${cls} font-bold text-slate-800`}>한백 전기차사업관리 0123</span>
              <span className="ml-auto text-tiny text-slate-400">{use}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-tiny text-slate-500">
          굵기는 <b className="text-slate-700">font-black</b>(제목·숫자) ·{' '}
          <b className="text-slate-700">font-bold</b>(라벨·값) · 보통 셋만 쓴다. 숫자는{' '}
          <b className="text-slate-700">tabular-nums</b> 로 폭을 고정한다.
        </p>
      </Section>

      <Section title="모서리와 간격" note="세 단계 밖으로 나가지 않는다">
        <div className="flex flex-wrap gap-3">
          {[['rounded-ctl', '8px', '단추·배지·입력칸'], ['rounded-box', '12px', '카드·표·패널'], ['rounded-panel', '16px', '화면 단위 큰 상자']].map(
            ([cls, px, use]) => (
              <div key={cls} className="w-[190px]">
                <div className={`flex h-16 items-center justify-center border border-slate-200 bg-slate-50 ${cls}`}>
                  <code className="text-micro font-bold text-slate-500">{cls}</code>
                </div>
                <p className="mt-1 text-tiny text-slate-400">{px} · {use}</p>
              </div>
            )
          )}
        </div>
        <p className="mt-3 text-tiny text-slate-500">
          안쪽 여백은 <b className="text-slate-700">p-2.5</b>(카드) ·{' '}
          <b className="text-slate-700">p-4</b>(패널) · <b className="text-slate-700">p-5/6</b>(화면 상자),
          사이 간격은 <b className="text-slate-700">gap-2</b> ·{' '}
          <b className="text-slate-700">gap-4</b> · <b className="text-slate-700">gap-7</b>(구역 사이).
        </p>
      </Section>

      <Section title="부품" note="같은 일에는 같은 모양을 쓴다">
        <div className="flex flex-col gap-5">
          <Part label="단추">
            <button type="button" className="rounded-ctl bg-brand-600 px-3.5 py-2 text-lead font-bold text-white transition hover:bg-brand-700">
              기본 (하는 일)
            </button>
            <button type="button" className="rounded-ctl border border-slate-300 bg-white px-3 py-1.5 text-small font-bold text-slate-700 transition hover:bg-slate-50">
              보조
            </button>
            <button type="button" className="text-tiny font-bold text-slate-400 underline decoration-slate-300 transition hover:text-red-700">
              되돌릴 수 없는 일
            </button>
            <button type="button" disabled className="rounded-ctl bg-slate-200 px-3.5 py-2 text-lead font-bold text-slate-400">
              막힌 단추
            </button>
          </Part>

          <Part label="배지">
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-tiny font-bold text-sky-900">계약 단계</span>
            <span className="rounded-full bg-brand-100 px-2.5 py-1 text-tiny font-bold text-brand-900">시공 단계</span>
            <span className="rounded-full bg-slate-800 px-2.5 py-1 text-tiny font-bold text-white">멈춤</span>
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-micro font-bold text-red-800">반려 2</span>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-micro font-bold text-amber-900">확인 필요</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-micro font-bold text-slate-500">단가 미지정</span>
          </Part>

          <Part label="입력칸">
            <input placeholder="비어 있음" className="w-[180px] rounded-ctl border border-slate-200 px-3 py-2 text-base text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" />
            <input defaultValue="채워진 값" className="w-[180px] rounded-ctl border border-slate-200 px-3 py-2 text-base text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" />
            <input defaultValue="아직 안 적음" className="w-[180px] rounded-ctl border border-dashed border-slate-300 px-3 py-2 text-base text-slate-500" />
          </Part>

          <Part label="상태 알림">
            <p className="rounded-box border-l-[3px] border-red-500 bg-red-50 px-4 py-2.5 text-base font-semibold text-red-800">
              막는 것 — 무엇이 왜 안 되는지 적는다
            </p>
            <p className="rounded-box border-l-[3px] border-amber-500 bg-amber-50/70 px-4 py-2.5 text-base text-amber-900">
              확인할 것 — 접수·저장을 막지는 않는다
            </p>
          </Part>

          <Part label="빈 상태">
            <p className="w-full rounded-box border border-dashed border-slate-200 py-8 text-center text-base text-slate-400">
              조건에 맞는 현장이 없습니다
            </p>
          </Part>
        </div>
      </Section>

      <Section title="쓰지 않는 것" note="이미 한 번 걷어낸 것들이다">
        <ul className="flex flex-col gap-1.5 text-base text-slate-600">
          <li>· <b>설명 문구</b>를 화면에 늘어놓지 않는다. 규칙은 동작으로 보이게 만든다.</li>
          <li>· <b>같은 숫자를 두 곳</b>에 적지 않는다. 필터를 걸면 둘이 다른 말을 한다.</li>
          <li>· <b>사람 이름</b>을 남기지 않는다. 회사마다 계정이 하나라 이름이 늘 같다 — 소속만 남긴다.</li>
          <li>· <b>승인 단추</b>를 만들지 않는다. 검수는 문제 있는 것만 반려하는 방식이다.</li>
          <li>· 그림자(shadow)는 떠 있는 것(드롭다운)에만. 카드는 경계선으로 나눈다.</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-h3 font-black text-slate-900">{title}</h2>
        <p className="mt-0.5 text-tiny text-slate-400">{note}</p>
      </div>
      {children}
    </section>
  );
}

function Part({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <span className="w-16 shrink-0 text-tiny font-bold text-slate-400">{label}</span>
      {children}
    </div>
  );
}

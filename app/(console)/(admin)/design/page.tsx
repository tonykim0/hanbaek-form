/**
 * 디자인 기준 — 이 콘솔이 쓰는 색·활자·부품을 한 화면에 모아둔다.
 *
 * ★문서가 아니라 화면이다.★ 따로 적어 둔 문서는 코드와 어긋나는 순간 쓸모가 없어진다.
 * 이 페이지는 실제 클래스로 그려지므로, 토큰을 바꾸면 여기가 같이 바뀐다.
 *
 * ★그림을 그리지 않고 부품을 그린다.★
 * 예전에는 여기서 단추 클래스를 손으로 베껴 적었다. 그래서 이 페이지가 「단추는
 * bg-brand-600 px-3.5 py-2」라고 말하는 동안 코드에는 단추가 10 모양, 배지가 18 모양
 * 있었다 — 그림은 코드가 어긋난 줄 모른다. 지금은 components/ui.tsx 의 부품을 그대로
 * 불러다 그린다. 여기서 보이는 것이 화면에 나가는 것이다.
 *
 * 새 화면을 만들 때 여기서 고른다. 여기 없는 값이 필요하면 자리에서 클래스를 적지 말고
 * components/ui.tsx(모양) 와 tailwind.config.js(토큰) 에 먼저 추가한다.
 */
import {
  Badge, Blank, Btn, Choice, Empty, Err, FIELD, FIELD_CELL, HR, Note, Saved, Tag, Td, Th, Val,
} from '@/components/ui';

export const metadata = { title: '디자인 기준 — 한백 전기차사업관리시스템' };

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
  ['text-lead', '14px', '카드 표제 · 하는 일 단추 · 목록 행 제목'],
  ['text-base', '13px', '본문 · 표 안의 값 · 입력칸'],
  ['text-small', '12px', '보조 설명 · 보조 단추 · 좁은 표 칸'],
  ['text-tiny', '11px', '라벨 · 표 머리 · 실패 문구'],
  ['text-micro', '10px', '꼬리표 · 단위'],
];

/* 빈 값 네 가지 — 무엇이 없는지가 아니라 「왜 없는지」로 갈린다 */
const EMPTY_KINDS: Array<[React.ReactNode, string, string]> = [
  [<Empty key="m" kind="miss" />, '넣어야 하는데 안 넣음', '영업사 이름 · 단가 케이스 — 노랑이라 눈에 걸린다'],
  [<Empty key="w" kind="wait" />, '아직 올 때가 아님', '환경부 대기번호 — 접수 뒤에 오는 값'],
  [<Empty key="n" kind="na" />, '이 현장에는 규칙상 없음', '자체투자의 대기번호 · 기설치 조사'],
  [<span key="z" className="font-bold text-slate-800">0건</span>, '세었고 없음', '「아직 없습니다」라고 적지 않는다 — 0건이 그 말이다'],
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
          <li>· 색은 다섯 개다 — <b className="text-slate-700">회색</b>(그 밖의 전부) ·{' '}
            <b className="text-slate-700">초록</b>(진행·확인) · <b className="text-slate-700">빨강</b>(막는 것) ·{' '}
            <b className="text-slate-700">노랑</b>(봐야 하는 것) · <b className="text-slate-700">하늘</b>(계약 단계).
            여섯 번째 색을 쓰고 싶으면 뜻이 겹치는 것이다</li>
        </ul>

        <div className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {SLATE_USE.map(([name, cls, use]) => (
            <div key={name} className="flex items-center gap-2 border-b border-slate-100 py-1.5">
              <span className={`h-4 w-4 shrink-0 rounded-tag border border-slate-200 ${cls}`} />
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

      <Section title="모서리와 간격" note="동글면 상태, 각지면 누르는 것. 네 단계 밖으로 나가지 않는다">
        <div className="flex flex-wrap gap-3">
          {[['rounded-tag', '4px', '꼬리표 (셈)'], ['rounded-ctl', '8px', '누르는 것·입력칸'], ['rounded-box', '12px', '카드 안의 표·띠'], ['rounded-panel', '16px', '화면 단위 상자'], ['rounded-full', '동글', '상태 배지 (못 누름)']].map(
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

      <Section title="부품" note="여기 보이는 것이 components/ui.tsx 다. 자리에서 클래스를 적지 않는다">
        <div className="flex flex-col gap-5">
          <Part label="단추">
            <Btn>하는 일</Btn>
            <Btn kind="side">다른 길</Btn>
            <Btn kind="warn">누락 서류 4건 보완요청</Btn>
            <Btn kind="stop">반려 확정</Btn>
            <Btn kind="quiet">고치기</Btn>
            <Btn kind="undo">확인 취소</Btn>
            <Btn disabled>단가 미지정 — 확인 불가</Btn>
            <Btn busy busyLabel="저장 중…">저장</Btn>
          </Part>

          <Part label="좁은 자리">
            <Btn size="sm">올리기</Btn>
            <Btn size="sm" kind="side">닫기</Btn>
            <Btn size="sm" kind="warn">보완요청</Btn>
            <Btn size="sm" kind="stop">반려 확정</Btn>
            <Btn size="sm" kind="quiet">입력</Btn>
            <Btn size="sm" kind="undo">삭제</Btn>
            <span className="text-tiny text-slate-400">표·카드 안 — 크기는 이 둘뿐이다</span>
          </Part>

          <Part label="배지">
            <Badge tone="stage">계약</Badge>
            <Badge tone="ok">시공</Badge>
            <Badge tone="warn">받을 수 있음</Badge>
            {/* 멈춤은 색이 아니라 무게로 말한다 — 어느 단계도 아니기 때문이다 */}
            <Badge tone="hold">보류</Badge>
            <span className="text-tiny text-slate-400">한 건에 하나 — 지금 있는 자리</span>
          </Part>

          <Part label="큰 배지">
            <Badge tone="stage" size="lg">계약검토</Badge>
            <span className="text-tiny text-slate-400">
              그 화면에서 제일 먼저 읽는 자리 하나에만 — 지금은 현장 상세 머리말의 단계뿐이다
            </span>
          </Part>

          <Part label="꼬리표">
            <Tag tone="stop">반려 2</Tag>
            <Tag tone="warn">확인 필요</Tag>
            <Tag tone="mute">단가 미지정</Tag>
            <span className="text-tiny text-slate-400">여럿이 붙는다 — 그 안에서 세어진 것</span>
          </Part>

          <Part label="고르는 칩">
            <Choice on>플러그링크</Choice>
            <Choice on={false}>SK일렉링크</Choice>
            <span className="text-tiny text-slate-400">
              여럿 중에 켜고 끄는 것(필터 · 다중 선택) — 고른 것은 채운 초록 한 모양이다
            </span>
          </Part>

          <Part label="값">
            <Val value="플러그링크" />
            <Val value={null} when="miss" />
            <Val value={null} when="wait" />
            <span className="text-tiny text-slate-400">
              값이 있으면 값, 없으면 그 없음의 종류를 보여준다 — 빈 자리를 지우지 않는다
            </span>
          </Part>

          <Part label="입력칸">
            <input placeholder="비어 있음" className={`${FIELD} w-[180px]`} />
            <input defaultValue="채워진 값" className={`${FIELD} w-[180px]`} />
            <input defaultValue="1,250,000" className={`${FIELD_CELL} w-[110px]`} />
            <span className="text-tiny text-slate-400">좁은 칸은 표 안에서만</span>
          </Part>

          <Part label="띠">
            <Note tone="stop" className="w-full">막는 것 — 무엇이 왜 안 되는지 적는다</Note>
            <Note tone="warn" className="w-full">확인할 것 — 저장을 막지는 않는다</Note>
            <Note tone="ok" className="w-full">끝난 것 — 언제 누가 했는지 적는다</Note>
          </Part>

          <Part label="누른 뒤">
            <Err>고치지 못했습니다.</Err>
            <Saved />
            <span className="text-tiny text-slate-400">누른 단추 옆에 붙인다. 화면 위에 모아 두지 않는다</span>
          </Part>

          <Part label="빈 목록">
            <Blank>조건에 맞는 현장이 0건</Blank>
          </Part>

          <Part label="나누는 선">
            <div className="w-full">
              <p className="pb-2 text-base text-slate-600">카드 안에서 층을 나누는 가장 약한 수단</p>
              <HR />
              <p className="pt-2 text-tiny text-slate-400">
                여백 → 얇은 선(HR) → 배경색 → 테두리. 테두리는 마지막 수단이다(화면 규칙 1)
              </p>
            </div>
          </Part>
        </div>
      </Section>

      <Section title="표의 칸" note="세는 것은 오른쪽, 그 밖은 왼쪽. 머리는 제 몸을 따른다 (화면 규칙 13)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-base">
            <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
              <tr>
                <Th>현장</Th>
                <Th num>총 지급액</Th>
                <Th>지급일</Th>
                <Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {[
                ['경기 수원 포레나 영흥숲', '14,700,000', '2026-08-25', <Badge key="a" tone="ok">확정</Badge>],
                ['충북 청주 율량동 현대아파트', '2,940,000', '—', <Badge key="b" tone="mute">대기</Badge>],
              ].map(([name, won, day, tag], i) => (
                <tr key={String(name)} className={i === 0 ? '' : 'border-t border-slate-100'}>
                  <Td className="font-semibold text-slate-900">{name}</Td>
                  <Td num className="font-black text-slate-900">{won}</Td>
                  <Td className="text-slate-500">{day}</Td>
                  <Td>{tag}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pt-2 text-tiny text-slate-400">
          날짜를 오른쪽으로 밀면 칸 왼쪽에 빈 띠가 생기고, 그 띠가 옆 열과의 사이를 벌린다.
          머리는 접히지 않는다 — 좁으면 표가 가로로 밀린다.
        </p>
      </Section>

      <Section title="빈 값" note="네 가지고 서로 다른 말이다. 하나로 뭉치면 빠뜨린 것과 원래 없는 것이 같아 보인다">
        <div className="flex flex-col divide-y divide-slate-100">
          {EMPTY_KINDS.map(([node, when, why]) => (
            <div key={when} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
              <span className="w-24 shrink-0">{node}</span>
              <span className="w-40 shrink-0 text-tiny font-bold text-slate-600">{when}</span>
              <span className="text-tiny text-slate-400">{why}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-tiny text-slate-500">
          「해당없음」에는 <b className="text-slate-700">고치는 자리를 주지 않는다</b> — 못 하는 일은
          눌리지 않게 한다. 칸 자체를 지우지도 않는다.
        </p>
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

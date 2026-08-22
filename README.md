# 한백 EV — 포털 · 콘솔

EV 충전 사업의 접수 → 시공 → 정산을 하나의 현장(project) 모델로 관리하는 Next.js 앱.
한 저장소에 두 얼굴이 있다:

- **포털** (`app/(portal)/`, 로그인 없음) — 협력사의 입구. 운영사별 계약서를 자동으로 채워
  만들고(플러그링크·나이스인프라·현대엔지니어링·SK·자체투자), 서류를 접수한다(`/intake`).
  접수 서류는 Anthropic API 로 자동분류되어 **지금은 노션에 저장**된다.
- **콘솔** (`app/(console)/`, 로그인) — 한백이 현장을 진행시키는 곳. 검수·반려, 단가·정산 규칙
  지정, 공정 보드, 지급·기성 관리. 정본은 자체 Postgres(Supabase).
  협력사도 로그인해 **자기 현장만** 본다 — 원가·마진·기성은 저장소 계층에서 지워서 내려간다.

## 방향

**노션 병행 → 콘솔 픽스 → 노션 이관·접수 컷오버 → 콘솔로 일원화.**
그 뒤에도 포털은 협력사의 로그인 없는 입구로 남는다. 자세한 단계와 작업 규칙은 `CLAUDE.md`.

## 실행

```bash
npm install
npm run dev    # http://localhost:3000
```

`.env.local` 이 필요하다 — DATABASE_URL(Supabase), 노션·Anthropic 키(포털 접수용).
값은 커밋·대화에 남기지 않는다.

> ⚠️ 지금 `.env.local` 의 DATABASE_URL 은 **실서비스 DB** 를 가리킨다.
> `npm run db:seed -- --reset` 을 돌리면 실데이터가 초기화된다.
> 화면만 눌러볼 때는 DATABASE_URL 을 주석 처리하면 파일 저장소(시드 5건) +
> 개발 계정(`admin`/`ecoelec`/`daesang`/`navy`, `dev1234!`)으로 돈다. — `CLAUDE.md` 참조

첫 관리자 계정: `npm run auth:bootstrap -- --id admin --name '한백 관리자'`
(그다음 사람부터는 콘솔의 `/admin/accounts` 에서)

## 배포

`main` 에 푸시하면 Vercel 이 자동 배포한다. 주소가 둘이고 배포는 하나다:

- 포털 https://hanbaek-form.vercel.app — 협력사의 입구. 콘솔 경로는 404 다.
- 콘솔 https://hanbaek-ev.vercel.app — 한백의 자리. `/` 는 `/projects` 로 보낸다.
함수 지역은 `icn1`(서울) — DB 와 같은 도시여야 한다 (`vercel.json`, 이유는 `CLAUDE.md` 코드 규칙).

## 스택

Next.js(App Router) · TypeScript · Tailwind · Drizzle + Supabase Postgres · Vercel · Anthropic API(서류 자동분류)

## 문서

| | |
|---|---|
| `CLAUDE.md` | 작업 규칙 정본 — 큰 그림 · 화면 규칙 12개 · 코드 규칙 |
| `doc/` | 착수 시점(2026-08) 사양서 — 역사 문서. 구현이 갈라진 곳이 있어 정본은 코드다 |

문의: Tony Kim (한백 EV Infra Solutions)

# 한백 계약서 접수 시스템 — 인수인계 문서

**프로젝트**: 한백 EV 충전 인프라 사업의 영업자 계약서 자동 인테이크 시스템
**경로**: 기존 `hanbaek-form.vercel.app` 에 `/intake` 라우트 추가
**개발 단계**: MVP 설계 완료, 구현 시작 전
**작성일**: 2026-04-15

---

## 1. 무엇을 만드는가

### 한 줄 정의
영업자가 카톡으로 보내던 계약서 PDF/ZIP을 웹 폼으로 받아, AI가 자동 분류·네이밍해서 노션 DB에 저장하는 인테이크 시스템.

### 해결하는 문제
카톡 인테이크의 4가지 구조적 결함:
- 메타데이터 부재 (누가/언제/어느 현장 추적 불가)
- 파일 분실 (채팅 흐름에 묻힘)
- 책임 모호 (한백/영업자 경계 불분명)
- 감사 불가 (분쟁 시 입증 어려움)

### 사용자
- **영업자 (외부)**: 에코일렉, 푸름, 이음 플러스 등 30여 영업사 소속 담당자
- **Tony (내부)**: 한백 EV 인프라 사업부장. 검수 + 운영 DB 승격 담당
- **김지용 (내부, 향후)**: 검수 권한 위임 예정

---

## 2. MVP 스코프

### IN
- 웹 폼: 영업자 정보 (이름·소속) + PDF/ZIP 업로드
- 서버: ZIP 풀기, 파일 SHA256 해시로 중복 차단
- AI: 12개 카테고리 자동 분류 + 메타데이터 추출 + 표준 네이밍
- 노션: 기존 `전기차 실사관리` DB에 entry 자동 생성 + 파일 첨부
- Tony 검수: 노션 `*진행상태 = 신규생성` view에서 확인 → 진행상태 변경

### OUT (Phase 2)
- CPO별 추출 프롬프트 분기 (MVP는 단일 프롬프트)
- 자동 운영 DB 승격 (수동 진행상태 변경)
- 영업자별 진행 상태 대시보드
- HWP 파일 처리 (영업자에게 PDF 변환 안내로 우회)
- XLSX 처리 (MVP는 PDF만)

---

## 3. 화면 설계 (3개)

### A. 업로드 화면 (`/intake`)
- 헤더: "계약서 접수" + "한백 EV 충전 인프라 사업" 부제
- 영업자 정보: 이름 + 소속 텍스트 입력 2개. localStorage에 저장, 다음 방문 시 자동 채움
- 파일 업로드: PDF 또는 ZIP 드래그-드롭 영역
- 안내 문구: "ZIP 안의 서류는 자동으로 분류·정리됩니다"
- 파일 리스트 미리보기: 선택된 파일 표시 + 삭제 가능
- 접수 버튼 + 안내: "1~2일 내 한백 담당자가 회신드립니다"
- 메모 필드: **없음** (의도적으로 제외)
- 서류 종류 선택: **없음** (계약서 단일이므로)

### B. 완료 화면 (`/intake/complete`)
- 큰 체크 아이콘 + "접수 완료"
- 회신 안내: "1~2일 내 한백 담당자가 회신드립니다"
- 접수 정보 박스:
  - 접수번호 (HBPI-XXXX)
  - 접수자 (이름 · 소속)
  - 접수일시
  - 서류 (총 N건 분류 완료)
- "분류 결과 보기" 토글 (기본 접힘) → 펼치면 분류된 파일명 리스트
- "다른 건 추가 접수" 버튼 → 화면 A로 복귀, 영업자 정보 유지

### C. 에러 화면
- 빨간 ! 아이콘 + "접수에 실패했습니다"
- 에러 내용 박스 (에러 코드 포함)
- "다시 시도" 버튼 (파란) + "처음으로 돌아가기" (회색)
- 하단 fallback: "문제가 계속되면 한백 김정우 010-XXXX-XXXX"

### 디자인 결정 사항
- 모바일 우선, 데스크톱 호환 (반응형)
- 영업자 부담 최소화 원칙: 입력 필드 최소, AI에 위임
- 비즈니스 도구 톤: "감사합니다" 같은 인사 제거

---

## 4. 자동 분류·네이밍 규칙

### 분류 카테고리 (12개)
1. 계약서 (필수, 주 문서)
2. 합의서 (계약서 부속)
3. 직인사용 동의서
4. 행위신고 업무대행 동의서
5. 전기차충전시설 설치신청서
6. 개인정보 동의서
7. 사전현장컨설팅 결과서
8. 입주자대표회의 회의록
9. 한전 전기요금 청구서
10. 건축물대장
11. 실사보고서
12. 기타 (분류 실패 시 fallback)

### 네이밍 규칙
형식: `{현장명}_{서류종류}_{날짜YYYYMMDD}.pdf`

예시:
- `신안비치팔레스1차_계약서_20260410.pdf`
- `신안비치팔레스1차_회의록_20260331.pdf`
- `신안비치팔레스1차_한전청구서_20251217.pdf`

날짜 추출 우선순위:
- 계약서: 계약일
- 회의록: 회의일
- 한전청구서: 청구월 (해당 월 마지막 날)
- 건축물대장: 발급일
- 실사보고서: 조사일

### 분류 실패 처리
- "기타"로 분류해서 그대로 노션 첨부
- Tony가 검수 단계에서 수동 재분류

---

## 5. 기술 스택

| 레이어 | 기술 | 비고 |
|---|---|---|
| 프론트엔드 | Next.js 14 (App Router) + React | 기존 `hanbaek-form` repo 그대로 |
| 호스팅 | Vercel Pro | 60초 timeout 필요. 기존 사용 중 |
| AI 추출 | Anthropic API + Claude Sonnet 4.6 | Console 가입 + API 키 + $20 충전 완료 |
| 노션 DB | Notion API (Internal Integration) | 한백 워크스페이스 (테스트는 Tony 개인 워크스페이스 복제본 사용) |
| ZIP 처리 | jszip | npm 패키지 |
| 파일 저장 | Notion 첨부 직접 사용 | **Vercel Blob 미사용** (불필요) |

### 신규 npm 의존성
```
@anthropic-ai/sdk
@notionhq/client
jszip
react-dropzone
zod (런타임 타입 검증, 선택)
```

---

## 6. 노션 DB 정보

### 운영 DB (한백 워크스페이스)
- 이름: `전기차 실사관리`
- ID: `977acd58-afca-4c05-9dfc-939f7ab537b9`
- Data Source ID: `787c5a9c-d5d0-4c86-a930-6889b99e8545`
- 핵심 select 옵션 (코드 작성 시 정확히 매칭 필요):
  - `*CPO`: 플러그링크, 대영채비, 신세계아이앤씨, 에버온, 파킹클라우드, 한화솔루션, LG U+, 현대엔지니어링, 한솔엠에스, SK일렉링크, 나이스인프라
  - `*소재지`: 서울, 경기, 강원, 인천, 경북, 대구, 경남, 울산, 부산, 광주, 전남, 전북, 대전, 세종, 충남, 충북, 제주
  - `*건축물 유형`: 공동주택, 상업시설
  - `*진행상태`: 신규생성, 실사요청, 재실사요청, 실사완료, DROP, 최종보고서 제출완료, 계약완료, 타업체 선정, 영업필요, 보류
  - `*전력인입`: 모자분리 + 한전수전, 한전수전, 모자분리
  - `*사업연도`: 2025년, 2024년, 2023년, 2022년, 2026년

### 테스트 DB (Tony 개인 워크스페이스)
- ID: `cc3e926696db83a88b360183c923bfdb`
- 운영 DB 복제본 (스키마만, 데이터 없음)
- relation 필드 깨진 상태 (운영 전환 시 복구)
- Internal Integration: `한백 EV 인테이크 (테스트)` 권한 부여 완료

### Entry 생성 시 자동 채워야 할 필드
| 필드 | 출처 |
|---|---|
| `현장명` (title) | AI 추출 |
| `*진행상태` | "신규생성" 고정 |
| `*사업연도` | 현재 연도 자동 |
| `*영업자` | 웹폼 입력값 |
| `*영업자(소속)` | 웹폼 입력값 |
| `*영업사` | 소속과 정확 매칭되면 select, 아니면 빈값 (Tony가 검수에서 처리) |
| `*CPO` | AI 추출 (multi_select) |
| `*주소` | AI 추출 |
| `*우편번호` | AI 추출 |
| `*소재지` | AI 추출 (주소에서 시도 추출) |
| `*건축물 유형` | AI 추출 |
| `*총 주차면 수` | AI 추출 |
| `*계약대수` | AI 추출 |
| `*전력인입` | AI 추출 |
| `*현장 담당자` | AI 추출 |
| `*현장 연락처(유선)` | AI 추출 |
| `*설치위치` | AI 추출 |
| `비고(특이사항)` | AI 추출 |

---

## 7. 환경변수 (`.env.local`)

```bash
# Anthropic API
ANTHROPIC_API_KEY=sk-ant-api03-...

# Notion Integration
NOTION_API_KEY=secret_...
NOTION_DB_ID=cc3e926696db83a88b360183c923bfdb  # 테스트 DB. 운영 전환 시 운영 DB ID로 교체

# 영업자 인증 (단순 비밀번호, 스팸 차단용)
INTAKE_PASSWORD=hbplug2026

# 환경 구분
NEXT_PUBLIC_ENV=test  # production 전환 시 변경
```

---

## 8. 파일 구조 (제안)

```
hanbaek-form/
├── app/
│   ├── intake/
│   │   ├── page.tsx          # A. 업로드 화면
│   │   ├── complete/
│   │   │   └── page.tsx      # B. 완료 화면
│   │   └── error.tsx         # C. 에러 화면
│   └── api/
│       └── intake/
│           └── route.ts      # 메인 API 엔드포인트
├── components/
│   ├── UploadZone.tsx        # 드래그-드롭 컴포넌트
│   ├── SalesRepForm.tsx      # 영업자 정보 입력
│   └── FilePreview.tsx       # 선택된 파일 리스트
├── lib/
│   ├── claude.ts             # Anthropic API 클라이언트
│   ├── notion.ts             # Notion API 클라이언트
│   ├── files.ts              # ZIP 풀기, 해시, 네이밍
│   └── prompts.ts            # 12개 카테고리 분류 + 메타데이터 추출 프롬프트
├── types/
│   └── intake.ts             # 공용 TypeScript 타입
└── .env.local
```

---

## 9. API 흐름 (`/api/intake`)

```
1. POST multipart/form-data 수신
   - files: File[]
   - salesRep: { name, company }

2. 파일 정규화
   - ZIP은 jszip으로 풀어서 내부 PDF 추출
   - 각 PDF SHA256 해시 계산
   - 노션 DB 조회로 중복 차단

3. Claude Sonnet 4.6 호출 (PDF vision)
   - 입력: PDF 파일들 (base64)
   - 출력: JSON
     {
       현장명, 주소, 우편번호, CPO, 계약대수, ...,
       files: [
         { 원본명, 분류: "계약서" | "회의록" | ..., 날짜: "20260410" }
       ],
       confidence: { 현장명: 0.95, 계약대수: 0.88, ... }
     }

4. 노션 entry 생성
   - properties 채우기 (위 필드 매핑)
   - 진행상태 = "신규생성"

5. 파일 첨부 (Notion File Upload API, 2단계)
   - 각 파일마다:
     a. 표준 네이밍 적용: {현장명}_{분류}_{날짜}.pdf
     b. notion.fileUploads.create()
     c. notion.fileUploads.send() (binary 전송)
     d. notion.blocks.children.append() (page에 첨부)
   - rate limit (3 req/sec) 주의: 파일 간 1초 sleep

6. 응답
   {
     success: true,
     intakeId: "HBPI-XXXX",
     notionUrl: "https://notion.so/...",
     classifiedFiles: [...],
     warnings: [...]
   }
```

---

## 10. 에러 처리 전략 (3단계 fallback)

| 단계 | 시나리오 | 대응 |
|---|---|---|
| 1차 | Claude API 일시 장애 | 메타데이터 없이 entry만 생성 + Tony 수동 검수 |
| 2차 | Notion 첨부 실패 | 첨부 없이 entry 생성 + 영업자에게 부분 성공 응답 |
| 3차 | 전체 실패 | 영업자에게 명확한 에러 + Tony 직통 연락처 |

---

## 11. 비용 추정 (월 20건 기준)

| 항목 | 월 비용 |
|---|---|
| Anthropic API (Sonnet 4.6) | $5~15 |
| Vercel Pro | $0 추가 (기존) |
| Notion (Plus) | $0 추가 (기존) |
| **합계** | **$5~15** |

비교: Tony가 수동으로 처리 시 월 17만원 상당 시간 비용. ROI 약 8배.

---

## 12. 개발 순서 (제안)

### Sprint 1 — API 백본 (3~5일)
1. `lib/files.ts`: ZIP 풀기, 해시 계산
2. `lib/prompts.ts`: 추출 프롬프트 작성
3. `lib/claude.ts`: Anthropic API 호출
4. `lib/notion.ts`: 노션 entry 생성 + 파일 첨부
5. `app/api/intake/route.ts`: 위 4개 통합
6. **테스트**: curl 또는 Postman으로 PDF 업로드 → 노션 entry 확인

### Sprint 2 — UI (2~3일)
7. `components/UploadZone.tsx`: react-dropzone
8. `components/SalesRepForm.tsx`: localStorage 저장
9. `components/FilePreview.tsx`: 선택 파일 리스트
10. `app/intake/page.tsx`: A 화면 조립
11. `app/intake/complete/page.tsx`: B 화면
12. `app/intake/error.tsx`: C 화면

### Sprint 3 — 폴리싱 + 배포 (1~2일)
13. 로딩 상태 UX
14. 에러 처리 개선
15. Vercel 환경변수 등록
16. 베타 테스트 (영업자 1~2명)
17. 정식 운영

---

## 13. 결정된 Q&A 기록

| 질문 | 답 |
|---|---|
| 영업자 정보 받는 방식 | 매번 보이는 입력 필드, 마지막 입력값 자동 채움 (localStorage) |
| 서류 종류 | 계약서 단일 (사용자 선택 X) |
| 메모 필드 | 없음 |
| 파일 형식 | PDF, ZIP만 (HWP는 PDF 변환 안내) |
| 분류 결과 영업자에게 보여주기 | 토글로 숨김 (선택적 노출) |
| 추가 접수 시 영업자 정보 | 유지 |
| 처리 중 화면 | 단순 스피너 |
| 분류 실패 시 | "기타"로 첨부 + Tony 검수 재분류 |
| 노션 별도 DB? | 기존 운영 DB 그대로 사용 (`*진행상태 = 신규생성`) |
| 영업자가 받는 ID 체계 | HBPI-XXXX (운영 DB의 `*실사관리번호` 그대로 사용) |
| Vercel Blob 백업? | 사용 안 함 (노션 직접 첨부) |

---

## 14. 미해결 / Phase 2 결정 사항

- 운영 환경 전환 시 한백 워크스페이스 Owner에게 통합 토큰 발급 요청 필요
- HWP 정책 영업자 통보 (카톡/메일 공지문 작성)
- 자동 승격 임계값 (confidence > 0.95이면 자동 승격할지)
- 김지용씨 검수 권한 부여 시점
- Slack 알림 (신규 접수 시 Tony Slack DM)
- 운영 시 첫 1주 비용 실측 → Sonnet 유지 vs Haiku 전환 결정

---

## 15. Claude Code에 첫 프롬프트 (제안)

```
이 프로젝트의 HANDOFF.md를 읽어주세요.

작업 시작 전에:
1. HANDOFF.md를 모두 이해했음을 확인해주세요
2. 기존 hanbaek-form 프로젝트 구조 (package.json, app/ 디렉토리 등)를 살펴주세요
3. Sprint 1 (API 백본)에 추가/수정해야 할 파일 목록과 각 파일의 역할을 제안해주세요

3번까지 완료한 후 멈추고, 제 확인을 받은 다음에 실제 코드 작성을 시작해주세요.
```

이 프롬프트로 시작하면 Claude Code가 컨텍스트를 충분히 잡고 시작합니다.

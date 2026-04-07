# 한백 EV 충전기 계약서 자동생성 도구

플러그링크 2026년 계약서류 6개 문서를 한 번의 폼 입력으로 자동 채우는 웹앱입니다.

## 핵심 특징

- 약 20개 필드 입력 → 51개 필드 6개 문서 자동 채움
- 클라이언트 사이드 처리 (고객 정보가 외부 서버로 안 나감)
- 서버 불필요, Vercel 무료 호스팅
- 배포 후 영업담당자가 URL 한 번 받으면 끝

---

## 📱 배포 방법 — 데스크탑 권장

배포 자체는 데스크탑에서 진행하는 게 편합니다 (모바일에서도 가능하지만 GitHub 파일 업로드가 번거로움).

### Step 1: GitHub에 코드 올리기 (5분)

#### 방법 A: GitHub 웹 UI로 업로드 ⭐ Git 명령어 모르면 이거

1. [github.com](https://github.com) 로그인
2. 우측 상단 **+** → **New repository**
3. Repository name: `hanbaek-form` (원하는 이름)
4. **Private** 선택 (한백 내부용)
5. **Create repository** 클릭
6. 새 화면에서 **uploading an existing file** 링크 클릭
7. 이 zip을 풀어서 나온 모든 파일/폴더를 드래그앤드롭
   - ⚠️ `node_modules` 폴더는 절대 업로드하지 마세요 (zip에는 없음, 정상)
8. **Commit changes** 클릭

#### 방법 B: Git 명령어로

```bash
cd hanbaek-form
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/hanbaek-form.git
git push -u origin main
```

### Step 2: Vercel에 연결 (3분)

1. [vercel.com](https://vercel.com) 접속 → GitHub 계정으로 로그인
2. 대시보드에서 **Add New** → **Project**
3. GitHub 저장소 목록에서 `hanbaek-form` 찾기 → **Import**
4. 설정 페이지가 나오면:
   - **Framework Preset**: `Vite` (자동 감지됨)
   - **Build Command**: `npm run build` (기본값)
   - **Output Directory**: `dist` (기본값)
5. **Environment Variables** 섹션을 펼쳐 한백 정보 추가 (선택):

| Name | Value |
|---|---|
| `VITE_DEFAULT_SALES_COMPANY` | `한백` |
| `VITE_DEFAULT_SALES_NAME` | (담당자명) |
| `VITE_DEFAULT_SALES_TEL` | (한백 연락처) |
| `VITE_DEFAULT_SURVEYOR_COMPANY` | `한백` |
| `VITE_DEFAULT_SURVEYOR_NAME` | (담당자명) |
| `VITE_DEFAULT_SURVEYOR_TEL` | (한백 연락처) |

6. **Deploy** 클릭
7. 1~2분 후 배포 완료. `https://hanbaek-form-xxxx.vercel.app` 형식 URL 발급

### Step 3: 영업담당자에게 공유

발급된 URL을 카카오톡으로 공유. 영업담당자는 모바일/데스크탑 어디서든 접속 가능. PWA로 홈화면 추가도 가능.

### Step 4 (선택): 커스텀 도메인

Vercel Project Settings → **Domains** → `form.hanbaek.co.kr` 같은 한백 도메인 연결 가능.

---

## 🖥 로컬에서 미리 테스트 (선택)

배포 전에 본인 컴퓨터에서 먼저 돌려보고 싶으면:

```bash
cd hanbaek-form
npm install     # 약 20초
npm run dev     # 개발 서버 시작
```

브라우저에서 `http://localhost:5173` 접속.

요구 사항: Node.js 18 이상

---

## 📋 사용 방법 (영업담당자용)

1. URL 접속
2. 고객사 정보, 계약 정보, 환경공단 정보 입력 (약 20개 필드)
3. **계약서 생성 및 다운로드** 클릭
4. .docx 파일 자동 다운로드
5. 워드에서 열어 체크박스만 토글 후 고객에게 전달

### 워드에서 수동 처리해야 하는 항목

폼에서 자동 채울 수 없는 것 (체크박스류):

- 별지5호 결제방식 (현장결제 / 후불청구)
- 별지5호 개인정보 동의
- 별지7호 건물형태 / 설치위치 / 소유여부 / 전력인입 / 설치타입
- 별지7호 중복설치 여부

총 약 35개 체크박스. 단지마다 거의 동일한 패턴이라 1분 이내 처리 가능.

---

## 🔧 템플릿 업데이트

플러그링크가 새 폼 버전을 발급한 경우:

1. 새 .docx 파일을 `public/template.docx`로 교체
2. SDT ID가 바뀌었는지 확인 (보통 안 바뀜)
3. GitHub에 푸시하면 Vercel 자동 재배포

---

## ⚙️ 기술 스택

| 항목 | 기술 |
|---|---|
| 프론트엔드 | Vite + React 18 + TypeScript |
| 스타일링 | Tailwind CSS |
| 폼 관리 | react-hook-form |
| .docx 처리 | JSZip + DOMParser |
| 호스팅 | Vercel (무료 hobby plan) |
| 비용 | 월 $0 |

빌드 결과: 약 280KB JS (gzip 90KB) + 130KB 템플릿 = 총 ~410KB

---

## 🔒 보안

- **고객 정보 외부 전송 없음**: 모든 .docx 처리가 브라우저 안에서 일어남
- **데이터 저장 없음**: 새로고침하면 입력값 사라짐
- **`.env` 절대 커밋 금지**: 한백 직원 정보는 Vercel 대시보드에서만 관리. `.gitignore`에 포함되어 있음

---

## 🚀 향후 확장

| Phase | 내용 |
|---|---|
| 1 (현재) | MVP — 단일 폼, 클라이언트 사이드 처리 |
| 2 | 입력 이력 저장 (Supabase), 영업담당 로그인 |
| 3 | 사업자번호 자동조회, 도로명주소 자동완성 |
| 4 | PDF 자동 변환, 카카오톡 공유 링크 |
| 5 | 다른 CPO 폼 추가 (나이스인프라, 에버온 등) |

---

문의: Tony Kim (한백 EV Infra Solutions)

# 현대엔지니어링 계약서 자동생성 도구 — 핸드오프 v2

**프로젝트**: 기존 `hanbaek-form` repo에 현대엔지니어링(HEC) 계약서 자동생성 기능 추가
**경로**: `/hec` 라우트 신규 + 기존 루트를 `/pluglink`로 이전
**작성일**: 2026-04-17

---

## 1. 개요

플러그링크 자동생성 도구(`/`)와 동일한 패턴. 1개 통합 docx 템플릿에 폼 데이터를 SDT로 채워서 1개 docx 출력.

### 템플릿 파일
`public/hec/template.docx` (= `현대엔지니어링_운영서비스계약서_통합.docx`)

### 통합 문서 내 6개 섹션 (순서대로)
1. 운영서비스계약서 + 약관 (포괄적승계 v5)
2. 설치신청서 (별지5호)
3. 직인사용 동의서
4. 개인정보수집동의서
5. 사전현장 컨설팅결과서 (별지7호)
6. 수량공문

---

## 2. SDT 현황

### 이미 삽입된 SDT (67개) — 건드리지 말 것

별지5호 17개 + 개인정보동의서 3개 + 별지7호 47개.
기존 `lib/schema.ts`의 ID와 **100% 일치**하므로 `buildSdtMaps()` 로직을 그대로 재활용.

#### 별지5호 텍스트 SDT (17개)
| # | ID | schema key | 내용 |
|---|-----|-----------|------|
| 1 | 831731575 | custName_b5_apt | 아파트/사업자명 |
| 2 | 1461920188 | parkingLotCount_b5 | 보유 주차면수 |
| 3 | 2085950294 | CB: b5_loc1_apt | 설치희망지 공동주택 |
| 4 | 550437745 | CB: b5_loc1_biz | 설치희망지 사업장 |
| 5 | 868034671 | CB: (미사용) | 설치희망지 소상공인 |
| 6 | -176436175 | CB: b5_loc1_etc | 설치희망지 기타 |
| 7 | -1640952418 | installAddr_b5 | 도로명 주소 |
| 8 | 1151491943 | custName_b5_app | 신청자 상호 |
| 9 | -944686474 | custBizId_b5 | 사업자등록번호 |
| 10 | 1309512896 | custTel_b5 | 연락처 |
| 11 | 1917981892 | salesCompany_b5 | 모집대행사 회사명 |
| 12 | -626934252 | salesName_b5 | 모집대행사 담당자명 |
| 13 | -1602870797 | salesTel_b5 | 모집대행사 연락처 |
| 14 | 1751003065 | smartChargerQty_b5 | 스마트충전기 수량 (7~11kW) |
| 15 | -331451839 | contractMonth_b5sign | 서명 월 |
| 16 | 1586042883 | contractDay_b5sign | 서명 일 |
| 17 | 604467492 | custName_b5privacy | 신청자 서명 상호 |

#### 개인정보동의서 SDT (3개)
| # | ID | schema key | 내용 |
|---|-----|-----------|------|
| 18 | 1036239247 | contractMonth_b5privacy | 동의 월 |
| 19 | 885302165 | contractDay_b5privacy | 동의 일 |
| 20 | 1499070229 | custName_privacy (신규) | 신청자 상호 |

#### 별지7호 텍스트 SDT (15개)
| # | ID | schema key | 내용 |
|---|-----|-----------|------|
| 21 | 1897010284 | custName_b7_b | 성명 (상호) |
| 22 | -189372705 | custTel_b7 | 연락처 |
| 23 | -1528866009 | custAddr_b7 | 주소 |
| 24 | 483050426 | smartQty_b7 | 스마트충전기 수량 |
| 25 | 350158903 | parkingLotCount_b7 | 주차면수 |
| 30 | -1480913900 | facilityName_b5 | 시설명 placeholder 1 (클리어) |
| 31 | 1954517277 | installAddr_b7 | 설치장소 주소 |
| 50 | -561410159 | facilityName_other | 시설명 placeholder 2 (클리어) |
| 55 | 2064678604 | dupFastQty | 중복-급속 수량 |
| 57 | 1393619667 | dupSlowQty | 중복-완속 수량 |
| 59 | -602881735 | dupDistQty | 중복-전력분배형 수량 |
| 61 | 1226803090 | dupOutletQty | 중복-과금형콘센트 수량 |
| 64 | 1414659046 | surveyorCompany | 조사자 상호 |
| 65 | -632096669 | surveyorTel | 조사자 연락처 |
| 66 | 140012807 | surveyorName | 조사자 성명 |
| 67 | -501512409 | surveyDate | 조사일 |

#### 별지7호 체크박스 SDT (32개)
| ID | schema key | 내용 | 기본값 |
|----|-----------|------|--------|
| -322042069 | b5_loc2_apt | 장소: 공동주택 | ☐ |
| -629096557 | b5_loc2_biz | 장소: 사업장 | ☐ |
| 850464996 | (미사용) | 장소: 소상공인 | ☐ |
| -697774570 | b5_loc2_etc | 장소: 기타 | ☐ |
| -1430114800 | bldDanok | 건물: 단독주택 | ☐ |
| 1613170918 | bldApt | 건물: 아파트 | ■ |
| -2100858647 | bldYeonlip | 건물: 연립주택 | ☐ |
| 575708064 | bldSangga | 건물: 상가 | ☐ |
| -1855254905 | bldEtc | 건물: 기타 | ☐ |
| 1703440318 | locIndoor | 설치위치: 실내,지하 | ☐ |
| 2078551633 | locOutdoor | 설치위치: 실외,노상 | ☐ |
| 1315296875 | ownOwn | 소유여부: 소유 | ■ |
| -94944360 | ownRent | 소유여부: 임대 | ☐ |
| 1173694114 | relSelf | 관계: 본인 | ■ |
| -1758897530 | relFamily | 관계: 가족 | ☐ |
| 420457414 | relFriend | 관계: 지인 | ☐ |
| -1654982638 | relEmployee | 관계: 직원 | ☐ |
| -1730915888 | relNone | 관계: 무관 | ☐ |
| -6213483 | powerMoja | 전력인입: 모자분할 | ☐ |
| 1212161000 | powerHanjeon | 전력인입: 한전불입 | ☐ |
| 1167367960 | typeWall | 설치타입: 벽부형 | ☐ |
| -176657065 | typeStand | 설치타입: 스탠드 | ☐ |
| 1944100893 | (주차확보) | 주차공간 확보 | ■ (고정) |
| -980231648 | highVoltConfirm | 고압 변압기 확인 | ☐ |
| -1940137475 | lowVoltConfirm | 저압 계약전력 확인 | ☐ |
| -251354294 | dupFast | 중복: 급속충전기 | ☐ |
| -1361963411 | dupSlow | 중복: 완속충전기 | ☐ |
| 731112624 | dupDist | 중복: 전력분배형 | ☐ |
| 940579513 | dupOutlet | 중복: 과금형콘센트 | ☐ |
| 2136826911 | dupKiosk | 중복: 키오스크 | ☐ |
| -1538116413 | dupNone | 중복: 해당사항없음 | ■ |

---

### 신규 SDT 삽입 필요 (~40개)

3개 섹션에 SDT를 새로 박아야 함. 방법: `unpack.py` → XML 편집으로 `<w:sdt>` 삽입 → `pack.py`.

#### 섹션 1: 운영서비스계약서 (~25개)

**헤더 표 — 부지제공자 정보:**
| 위치 텍스트 | schema key | 비고 |
|-------------|-----------|------|
| 법인명 (빈칸) | custName_oc_header | |
| 주소 (빈칸) | custAddr_oc_header | |
| 사업자등록번호 (빈칸) | custBizId_oc | |
| 담당자 (빈칸) | siteManager_oc | 관리소장 등 |
| 전화번호 (빈칸) | custTel_oc | |
| 이메일 (빈칸) | custEmail_oc | |

**헤더 표 — 계약내용:**
| 위치 텍스트 | schema key | 비고 |
|-------------|-----------|------|
| 완속 : __년 | contractTerm_oc | |
| 급속 : __년 | — | **비워두기** (수동) |
| 설치장소 (빈칸) | installAddr_oc | |
| 완속 ( ) 면 | parkingSlotsSlow_oc | |
| 급속 ( ) 면 | — | **비워두기** (수동) |
| 완속충전기 __대 | installQty_oc | |
| 모델명 : __ | — | **비워두기** (수동) |

**주요 계약사항:**
| 위치 텍스트 | schema key | 비고 |
|-------------|-----------|------|
| "운영시작일로부터 __년" | contractTerm_oc_body | = contractTerm_oc |

**약관 서두:**
| 위치 텍스트 | schema key | 비고 |
|-------------|-----------|------|
| "______(이하 부지제공자)" | custName_oc_yakgwan | |

**서명부 ×2 (계약서 하단 + 약관 하단):**
| 위치 텍스트 | schema key | 비고 |
|-------------|-----------|------|
| __년 | contractYear_oc_sign1, _sign2 | 2곳 |
| __월 | contractMonth_oc_sign1, _sign2 | 2곳 |
| __일 | contractDay_oc_sign1, _sign2 | 2곳 |
| 주소: | custAddr_oc_sign1, _sign2 | 2곳 |
| 상호: | custName_oc_sign1, _sign2 | 2곳 |
| 대표자: __(인) | custRep_oc_sign1, _sign2 | 2곳 |

#### 섹션 3: 직인사용 동의서 (~5개)
| 위치 텍스트 | schema key | 비고 |
|-------------|-----------|------|
| 상호: __ 관리사무소 | custName_seal | |
| 주소: __ | custAddr_seal | |
| 대표자: __ | custRep_seal | |
| __년 | contractYear_seal | |
| __월 __일 | contractMonth_seal, contractDay_seal | |

#### 섹션 6: 수량공문 (~10개)
| 위치 텍스트 | schema key | 비고 |
|-------------|-----------|------|
| 발신: __ 관리사무소 | custName_letter_from | |
| 일자: __년 __월 __일 | contractYear_letter, Month, Day | 계약일과 동일 |
| 기준일자: __년 __월 | contractYear_letter_ref, Month_ref | 계약 연/월 |
| 등록 대수: __대 | evCount_letter | |
| 하단: __ 관리사무소 (인) | custName_letter_sign | = 발신 |
| TEL: | custTel_letter | |
| E-MAIL: | custEmail_letter | |

**주의: 수량공문에서 FAX 행 삭제 필요 (XML에서 해당 `<w:tr>` 제거).**
**주의: 담당자는 "관리소장" 고정 텍스트 (SDT 불필요).**
**주의: CPO별 충전기 표는 Word 수동 기입 (SDT 불필요).**

---

## 3. 입력 폼 필드

### 기존 플러그링크와 공유 (schema.ts에서 복사)
| 필드 | 타입 | 사용처 |
|------|------|--------|
| custName | text | 전 섹션 |
| custBizId | text (XXX-XX-XXXXX) | 운영계약서, 별지5호 |
| custAddr | text | 운영계약서, 직인동의서, 별지7호 |
| custTel | text | 운영계약서, 별지5호, 수량공문, 별지7호 |
| custEmail | text | 운영계약서, 수량공문 |
| installAddr | text | 운영계약서, 별지5호, 별지7호 |
| installQty | number | 운영계약서, 별지5호, 별지7호 |
| contractTerm | select 7/10 | 운영계약서 |
| contractYear/Month/Day | date parts | 전 섹션 날짜 |
| parkingLotCount | number | 별지5호, 별지7호 |
| salesCompany/Name/Tel | text ×3 | 별지5호 |
| surveyorCompany/Name/Tel | text ×3 | 별지7호 |
| buildingType | radio | 별지5호 CB, 별지7호 CB |
| installLocation | radio | 별지7호 CB |
| ownership / ownerRelation | radio | 별지7호 CB |
| powerSupply | radio | 별지7호 CB |
| installTypeWall/Stand | checkbox | 별지7호 CB |
| dupFast/Slow/Dist/Outlet/Kiosk | checkbox + qty | 별지7호 |

### 현대엔지니어링 전용 (신규)
| 필드 | 타입 | 사용처 |
|------|------|--------|
| custRepresentative | text | 운영계약서 서명부 ×2, 직인동의서 |
| siteManager | text | 운영계약서 헤더 담당자 |
| parkingSlotsSlow | number | 운영계약서 완속 주차면 |
| evCount | number | 수량공문 전기차 등록대수 |

---

## 4. 라우팅

### Before
```
/           → 플러그링크 폼
/intake     → 계약서 접수
```

### After
```
/           → CPO 선택 랜딩 (신규)
/pluglink   → 플러그링크 폼 (이전)
/hec        → 현대엔지니어링 폼 (신규)
/intake     → 계약서 접수 (유지)
```

### 리팩토링 필요사항
1. `app/page.tsx` → `app/pluglink/page.tsx`
2. `public/template.docx` → `public/pluglink/template.docx`
3. `lib/fillDocx.ts` 내 `fetch('/template.docx')` → `fetch('/pluglink/template.docx')`
4. 루트 `app/page.tsx` = CPO 선택 랜딩 페이지

---

## 5. 코드 구조

### 신규 파일
```
public/hec/template.docx          ← 통합 템플릿 (현재 현대엔지니어링_운영서비스계약서_통합.docx)
lib/schema-hec.ts                 ← HEC 전용 필드 + SDT ID 맵
lib/fillDocx-hec.ts               ← (선택) 또는 fillDocx.ts에 CPO 분기
app/page.tsx                      ← CPO 선택 랜딩
app/pluglink/page.tsx             ← 기존 플러그링크 폼 (이동)
app/hec/page.tsx                  ← HEC 폼 (신규)
```

### fillDocx 로직
플러그링크와 동일 패턴:
```
1. fetch('/hec/template.docx')
2. JSZip.loadAsync()
3. DOMParser로 document.xml 파싱
4. buildSdtMaps(form) → text map + checkbox map
5. SDT 순회하며 fillTextSdt / toggleCheckboxSdt
6. zip.generateAsync() → Blob → downloadBlob()
```

출력 파일명: `{contractYear}년_계약서류_HEC_{custName}.docx`

### schema-hec.ts 구조
- 기존 `schema.ts`의 별지5호·7호 TEXT_IDS, CB_IDS 전부 복사
- 운영계약서·직인동의서·수량공문의 신규 SDT ID 추가
- `ContractFormData` 인터페이스에 신규 필드 4개 추가
- `buildSdtMaps()` 확장

---

## 6. 기본값 차이 (플러그링크 vs HEC)

| 필드 | 플러그링크 | HEC |
|------|-----------|-----|
| salesCompany | 한비 | (빈값 or Vercel 환경변수) |
| salesName | 김종혁 | (빈값 or Vercel 환경변수) |
| salesTel | 010-3627-7047 | (빈값 or Vercel 환경변수) |
| contractTerm | 7 | 7 (동일) |

---

## 7. 작업 순서

### Phase 0 — 리팩토링
1. 기존 플러그링크를 `/pluglink`로 이동
2. 루트에 CPO 선택 랜딩 생성
3. `npm run build` 검증

### Phase 1 — 템플릿 SDT 삽입 (3개 섹션)
1. `unpack.py`로 통합 템플릿 언팩
2. document.xml에서 운영계약서·직인동의서·수량공문 섹션에 `<w:sdt>` 삽입
3. 수량공문 FAX 행 `<w:tr>` 제거
4. `pack.py`로 리팩
5. 삽입된 SDT ID를 `schema-hec.ts`에 기록

### Phase 2 — schema-hec.ts + fillDocx-hec.ts
1. 기존 schema.ts 복사 → 확장
2. fillDocx.ts 복사 → 템플릿 경로 변경
3. 신규 필드 매핑 추가

### Phase 3 — app/hec/page.tsx
1. 기존 app/page.tsx (플러그링크) 복사
2. 신규 필드 4개 추가
3. 불필요 필드 조정 (행위신고 동의서 관련 제거 등)

### Phase 4 — 빌드 + 테스트

---

## 8. Claude Code 첫 프롬프트

```
이 프로젝트의 HANDOFF-HEC.md를 읽어주세요.

작업 시작 전에:
1. HANDOFF-HEC.md를 모두 이해했음을 확인해주세요
2. 기존 코드 (lib/schema.ts, lib/fillDocx.ts, app/page.tsx)를 살펴주세요
3. 통합 템플릿(public/hec/template.docx)을 unpack해서 현재 SDT 67개가 정상인지 확인해주세요
4. Phase 0 (리팩토링) 변경사항 목록을 정리해주세요

4번까지 완료한 후 멈추고, 제 확인을 받은 다음에 코드 작성을 시작해주세요.
```

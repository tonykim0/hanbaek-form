# scripts/ — 무엇이 앞으로 쓸 것이고 무엇이 끝난 일인가

스물일곱 개가 한 폴더에 있어서, 처음 보는 사람은 어느 것을 돌려도 되는지 알 수 없다.
**옮기지 않고 여기 적는다** — 지금 이 폴더에서 이관 작업이 돌고 있어(정산 이관) 파일을
옮기면 그쪽과 부딪힌다. 새 스크립트를 더할 때 이 표에 한 줄 같이 적는다.

## 1. 늘 쓰는 것 — `package.json` 에 걸려 있다

| 스크립트 | 명령 | 무엇 |
|---|---|---|
| `migrate.ts` | `npm run db:migrate` · `npm run build` | 마이그레이션 러너. **빌드가 먼저 돌려 DB 를 코드보다 앞세운다** |
| `build-charger-index.ts` | `npm run index:charger` | 충전기 이력 CSV → 조회 인덱스 |
| `build-subsidy-index.ts` | `npm run index:subsidy` | 보조금 이력 CSV → 조회 인덱스 |
| `verify-charger-index.ts` | `npm run index:charger:verify` | 위 인덱스와 원본을 맞춰 본다 |
| `bootstrap-admin.ts` | `npm run auth:bootstrap` | 첫 관리자 계정 |
| `check-partner-leak.ts` | `npm run check:leak` | 협력사 응답에 한백 전용 값이 새는지 |
| `check-orient.ts` | `npm run check:orient` | 스캔 방향 감지 검사 — ★API 를 부르므로 돈이 든다★ |
| `perf.ts` | `npm run perf` | 주요 조회 응답 시간 |
| `backfill-contract-confirm.ts` | `npm run db:backfill-confirm` | 계약 확인 도입 전 현장 채우기 |
| `csv-rows.ts` | (라이브러리) | 인덱스 생성기들이 함께 쓰는 CSV 리더 — 혼자 못 돈다 |
| `hash-password.mjs` | 직접 | 계정 비밀번호 해시 |

## 2. 필요할 때 쓰는 것 — 정책·데이터 반영

정책이 바뀌면 **정의 파일 → 이 생성기 → `migrations/000N_*.sql`** 순서다(CLAUDE.md).
찍기만 하고 DB 는 안 건드린다 — 적용은 마이그레이션 러너가 한다.

| 스크립트 | 무엇 |
|---|---|
| `print-nice-h2-sql.ts` · `print-plhec-h2-sql.ts` · `print-sk-h2-sql.ts` · `print-everon-h2-sql.ts` · `print-link-h2-sql.ts` | 운영사별 정책 SQL 생성기 |
| `delete-pricing-case.ts` | 잘못 만든 단가 케이스 삭제 — **참조가 없을 때만** |
| `tidy-materials.ts` | 자료실 파일 이름 규칙·분류 정리 |
| `snapshot-notion.ts` | 노션 데이터베이스를 파일로 받아 둔다(읽기 전용) — 이관 전 스냅샷 |
| `archive-blob.ts` | ★프로덕션 파일 아카이브★ (읽기 전용). Vercel Blob 전부를 오프사이트 폴더로 누적 복사하고 매니페스트(경로·주소·어느 표의 어느 행)를 같이 남긴다 — Blob 에는 버전도 휴지통도 없고 서류 주소의 대부분이 임의 접미사라 매니페스트 없이는 복구가 안 된다. `.env.prod-blob` 필요 |
| `check-settlement-terms.ts` | ★노션 정산관리 ↔ 콘솔 지급조건 대조★ (읽기 전용, 쓰는 갈래 없음). 케이스 이름·대수·턴키·영업비·시공비·나간 1차를 141행 한꺼번에 본다 — 이관이 축으로 케이스를 다시 고른 탓에 정책 시기(상반기/하반기)가 틀어진 자리를 찾는다 |

## 3. 끝난 일 · 진행 중인 이관 — 함부로 돌리지 않는다

**이 칸의 스크립트는 한 번 도는 것을 전제로 쓰였다.** 다시 돌리기 전에 그 파일 머리말의
멱등성 설명을 먼저 읽는다(대개 `mgmt_no` 같은 열쇠로 중복을 막지만, 전부 그렇지는 않다).

| 스크립트 | 언제 | 상태 |
|---|---|---|
| `import-notion-2026.ts` | 2026-08-24 현장 140건 이관 | 끝남 (멱등 — 열쇠는 mgmt_no) |
| `import-notion-files.ts` | 2026-08-24 서류 파일 이관 | 끝남 |
| `sync-notion-notes.ts` | 노션 「현재상황」 → 진행 메모 | 컷오버 전 보조용 |
| `import-notion-settlements.ts` | 노션 정산 198건 이관 | **진행 중** (이관 후속 ①) |
| `merge-self-repl-lines.ts` | 2026-08-27 교체유형으로 갈린 자투 라인 합치기 | 끝남 (드라이런이 기본, `--write` 로 실행) |
| `migrate-channel-rule-names.ts` | 2026-08-21 단가 화면 개편 데이터 이관 | 끝남 |
| `apply-nice-h2-pricing.ts` | 나이스 하반기 정책 최초 반영(개발 DB) | 끝남 — 지금은 마이그레이션이 그 일을 한다 |

## 프로덕션에 붙일 때

`--env .env.prod-db` 로 접속 문자열을 준다(CLAUDE.md). **드라이런이 있는 스크립트는 먼저
드라이런**을 돌리고, 무엇이 바뀌는지 눈으로 본 뒤 `--write` 한다.

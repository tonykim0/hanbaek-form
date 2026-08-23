-- 배치 최종 확정 (2026-08-24) — 가확정 → (세금계산서 첨부) → 확정 두 단계.
-- 확정 시각을 세금계산서 행에 둔다: 첨부 없이 확정할 수 없다는 규칙이 자리로 강제된다.
-- 멱등: 이미 반영된 DB 에서 다시 돌아도 같은 결과다.
alter table tax_invoices
  add column if not exists finalized_at text;

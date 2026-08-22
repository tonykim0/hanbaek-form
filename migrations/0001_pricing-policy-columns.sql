-- 단가 케이스의 정책 조건 여섯 칸 (2026-08-22, lib/db/schema.ts 의 pricingRules 와 한 벌)
--
-- 프로덕션에는 이미 SQL Editor 로 반영됐다 — IF NOT EXISTS 라 no-op 으로 지나가고,
-- 원장이 비어 있는 첫 실행에서도 안전하다. 새 환경에서는 여기서 생긴다.
-- 전부 nullable — 이 칸이 생기기 전에 만든 케이스는 「아직 안 적음」이 맞다.

alter table pricing_rules
  add column if not exists supply_items        text,
  add column if not exists promo               jsonb,
  add column if not exists promo_extend_deduct integer,
  add column if not exists charge_rate         integer,
  add column if not exists install_terms       text,
  add column if not exists other_support       text;

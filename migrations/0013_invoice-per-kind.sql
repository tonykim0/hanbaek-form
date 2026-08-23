-- 세금계산서를 구분(영업비/시공비)별로 (2026-08-24, 한백 확인 — 영업·시공은 계산서를
-- 따로 끊는다). 배치 단위가 (지급처 × 지급일)에서 (지급처 × 구분 × 지급일)로 갈라진다.
--
-- 기존 행 백필: 지금 콘솔 데이터는 전부 시험 데이터라(CLAUDE.md 정본 지도) 구분을
-- 알 수 없는 옛 행은 '영업비'로 임의 표기한다 — 틀렸으면 지우고 다시 첨부하면 된다.
-- 멱등: 이미 반영된 DB 에서 다시 돌아도 같은 결과다.
alter table tax_invoices
  add column if not exists kind text not null default '영업비';
drop index if exists tax_invoices_batch_idx;
create unique index if not exists tax_invoices_batch_kind_idx
  on tax_invoices (org, pay_date, kind);

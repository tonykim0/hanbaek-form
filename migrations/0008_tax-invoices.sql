-- 세금계산서 보관 — 배치(지급처 × 지급일)마다 한 장. lib/db/schema.ts taxInvoices 와 짝.
-- 멱등: 이미 반영된 DB 에서 다시 돌아도 같은 결과다.
CREATE TABLE IF NOT EXISTS tax_invoices (
  id text PRIMARY KEY,
  org text NOT NULL,
  pay_date text NOT NULL,
  blob_url text NOT NULL,
  filename text NOT NULL,
  supply_amount integer,
  tax_amount integer,
  total_amount integer,
  uploaded_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS tax_invoices_batch_idx ON tax_invoices (org, pay_date);

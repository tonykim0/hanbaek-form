-- 최종 확정을 세금계산서에서 뗀다 (2026-08-24, 한백 확인 — 계산서는 검토 없이 명세서마다
-- 붙여 두는 보관용일 뿐, 확정은 계산서와 무관하게 한백이 한다).
-- 확정 상태가 계산서 행에 살면 「첨부해야 확정된다」가 자리로 강제되는데, 그 규칙 자체를
-- 걷어냈으므로 확정은 제 테이블을 갖는다. 기존 확정 상태는 옮기고 옛 칸은 지운다.
-- 멱등: 이미 반영된 DB 에서 다시 돌아도 같은 결과다.
CREATE TABLE IF NOT EXISTS batch_finals (
  id text PRIMARY KEY,
  org text NOT NULL,
  kind text NOT NULL,
  pay_date text NOT NULL,
  finalized_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS batch_finals_batch_idx ON batch_finals (org, kind, pay_date);

INSERT INTO batch_finals (id, org, kind, pay_date, finalized_at)
SELECT gen_random_uuid()::text, org, kind, pay_date, finalized_at
FROM tax_invoices
WHERE finalized_at IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE tax_invoices DROP COLUMN IF EXISTS finalized_at;

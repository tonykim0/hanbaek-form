-- 발주 수량과 수령 수량을 가른다 (한백 지시 2026-08-26)
--
-- 예전에는 수량 칸이 한 벌(charger_qty·modem_qty)이었고 그것이 「수령한 수량」이었다.
-- 실무는 두 자리다: ★한백이 몇 대를 발주했는지 적고, 협력사가 몇 대를 받았는지 적는다★.
-- 한 칸에 담으면 발주와 수령이 다를 때(부분 입고·오배송) 어느 숫자가 남는지 알 수 없다.
--
-- 기존 charger_qty·modem_qty 는 수령 수량으로 그대로 둔다 — 이미 적힌 값이 그 뜻이다.
alter table processes add column if not exists charger_order_qty integer;
alter table processes add column if not exists modem_order_qty integer;

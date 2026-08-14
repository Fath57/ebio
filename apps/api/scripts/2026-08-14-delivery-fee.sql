-- Adds the flat delivery fee charged per shop.
--
-- `suppliers.delivery_fee` is the fee applied to a delivery order, and
-- `free_delivery_from` the items subtotal above which it is waived (null keeps
-- the fee always due). `orders.delivery_fee` records what was actually charged,
-- copied at order time so a later price change never rewrites past orders.
--
-- Existing orders keep a fee of 0 by default: their totals stay untouched.
--
-- Idempotent through IF NOT EXISTS. The repository has no migration history, so
-- this is applied by hand:
--   ssh digit_immo_server "dokku postgres:connect ebio-postgres" < this-file.sql

BEGIN;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS delivery_fee double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_delivery_from double precision;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_fee double precision NOT NULL DEFAULT 0;

\echo '--- suppliers ---'
SELECT count(*) AS shops,
       count(*) FILTER (WHERE delivery_fee > 0) AS charging_for_delivery
FROM suppliers;

\echo '--- orders (expected: every existing order at 0) ---'
SELECT count(*) AS orders,
       count(*) FILTER (WHERE delivery_fee > 0) AS with_a_fee
FROM orders;

COMMIT;

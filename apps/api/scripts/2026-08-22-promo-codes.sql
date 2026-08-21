-- Promo codes: platform-wide (admin) or per-shop (supplier).
-- Spec: specs/004-promo-codes/plan.md. Idempotent.
BEGIN;

CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL,
  -- NULL supplier = platform code, created by an admin.
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('PERCENT', 'FIXED')),
  value real NOT NULL CHECK (value > 0),
  max_discount real,
  min_order_amount real NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  max_uses int,
  max_uses_per_user int NOT NULL DEFAULT 1,
  use_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW()
);
-- A code is unique within its scope: one per shop, and one platform-wide.
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_shop_code_idx
  ON promo_codes (supplier_id, code) WHERE supplier_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_platform_code_idx
  ON promo_codes (code) WHERE supplier_id IS NULL;

-- One redemption per order: the ledger the counters are audited against.
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  amount_discounted real NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS promo_redemptions_user_idx ON promo_redemptions (promo_code_id, user_id);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES promo_codes(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount real NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_funded_by text
  CHECK (discount_funded_by IN ('SUPPLIER', 'PLATFORM'));

-- Platform-funded discounts are paid back to the shop through its wallet.
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('TOPUP', 'ORDER_PAYMENT', 'SALE_CREDIT', 'COMMISSION_DEBIT',
                  'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'REFUND', 'ADJUSTMENT', 'PROMO_COMPENSATION'));

COMMIT;

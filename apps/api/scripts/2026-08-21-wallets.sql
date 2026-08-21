-- Portefeuilles internes : la comptabilité qui dit à qui appartient l'argent
-- détenu sur le compte FedaPay de la plateforme. Spec : specs/003-wallet/plan.md
BEGIN;

CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id),
  supplier_id uuid UNIQUE REFERENCES suppliers(id),
  balance numeric(12,2) NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
  -- Exactly one owner: a personal wallet or a shop wallet, never both.
  CONSTRAINT wallet_single_owner CHECK (num_nonnulls(user_id, supplier_id) = 1)
);

-- Append-only ledger. balance_after makes every balance auditable.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id),
  type text NOT NULL CHECK (type IN (
    'TOPUP', 'ORDER_PAYMENT', 'SALE_CREDIT', 'COMMISSION_DEBIT',
    'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'REFUND', 'ADJUSTMENT'
  )),
  amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  order_id uuid REFERENCES orders(id),
  payment_id uuid REFERENCES payments(id),
  withdrawal_id uuid,
  description varchar(255) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_idx
  ON wallet_transactions (wallet_id, "createdAt" DESC);

CREATE TABLE IF NOT EXISTS payout_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  phone_number varchar(20) NOT NULL,
  operator varchar(20) NOT NULL,
  holder_name varchar(100) NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VALIDATED', 'REJECTED')),
  rejection_reason varchar(255),
  validated_by uuid,
  validated_at timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_id, phone_number)
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  wallet_id uuid NOT NULL REFERENCES wallets(id),
  payout_number_id uuid NOT NULL REFERENCES payout_numbers(id),
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED', 'CANCELLED'
  )),
  fedapay_payout_id varchar(64),
  provider_reference varchar(128),
  rejection_reason varchar(255),
  processed_by uuid,
  processed_at timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS withdrawal_requests_status_idx ON withdrawal_requests (status);
-- One active request per supplier: the partial unique index is the arbiter,
-- not application code.
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_requests_one_active_idx
  ON withdrawal_requests (supplier_id)
  WHERE status IN ('PENDING', 'PROCESSING');

COMMIT;

-- Wallet top-ups: FedaPay payments with no order behind them.
CREATE TABLE IF NOT EXISTS wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id),
  user_id uuid NOT NULL REFERENCES users(id),
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  fedapay_transaction_id varchar(64),
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wallet_topups_fedapay_idx ON wallet_topups (fedapay_transaction_id);

-- WALLET joins the order payment methods.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method = ANY (ARRAY['FEDAPAY'::text, 'CASH_ON_DELIVERY'::text, 'WALLET'::text]));

-- Orders whose online payment never completed must not look like real orders.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY['PENDING_PAYMENT','PLACED','ACCEPTED','PREPARING','READY','IN_DELIVERY','DELIVERED','CANCELLED','DISPUTED']::text[]));

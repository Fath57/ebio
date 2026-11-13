import { Migration } from '@mikro-orm/migrations'

const NOTIFICATION_TYPES = [
  'ORDER_PLACED',
  'ORDER_ACCEPTED',
  'ORDER_REJECTED',
  'ORDER_READY',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'PAYMENT_RECEIVED',
  'PAYMENT_RELEASED',
  'DISPUTE_OPENED',
  'DISPUTE_RESOLVED',
  'SUPPLIER_VALIDATED',
  'SUPPLIER_REJECTED',
  'SUPPLIER_COMPLEMENT',
  'STOCK_ALERT',
  'STOCK_AVAILABLE',
  'NEW_MESSAGE',
  'NEW_REVIEW',
  'PRODUCT_REVIEW_INVITE',
  'CART_REMINDER',
  'ESCROW_REMINDER',
  'PROMOTIONAL',
  'SYSTEM',
  'DELIVERY_OFFER',
  'DELIVERY_ASSIGNED',
  'DELIVERY_PICKED_UP',
  'DELIVERY_FAILED',
  'DELIVERY_REASSIGNED',
  'DELIVERY_PICKUP_REMINDER',
  'DELIVERY_WINDOW_CHANGED',
  'COURIER_VALIDATED',
  'COURIER_REJECTED',
  'COURIER_SUSPENDED',
  'COURIER_EARNING',
  'COURIER_PAYOUT',
  'COURIER_RATED',
  'COURIER_TIP',
  'REFERRAL_REWARD',
  'BANNER_APPROVED',
  'BANNER_REJECTED',
  'GIFT_DELIVERED',
  'GIFT_DELIVERY_FAILED',
  'FAMILY_WALLET_TOPUP',
  'FAMILY_WALLET_PURCHASE',
  'FAMILY_WALLET_LOW_BALANCE',
  'FAMILY_WALLET_MEMBER_JOINED',
  'FAMILY_WALLET_MEMBER_PENDING',
  'FAMILY_WALLET_STATUS',
]

const WALLET_TRANSACTION_TYPES = [
  'TOPUP',
  'ORDER_PAYMENT',
  'SALE_CREDIT',
  'COMMISSION_DEBIT',
  'WITHDRAWAL',
  'WITHDRAWAL_REFUND',
  'REFUND',
  'ADJUSTMENT',
  'PROMO_COMPENSATION',
  'DELIVERY_EARNING',
  'DELIVERY_COMMISSION',
  'TIP_PAYMENT',
  'TIP_EARNING',
  'DELIVERY_SPONSORSHIP',
  'BANNER_PAYMENT',
  'BANNER_REFUND',
  'REFERRAL_REWARD',
  'PLATFORM_COMMISSION',
  'PLATFORM_DELIVERY_SHARE',
  'PLATFORM_BANNER',
  'PLATFORM_MARKETING',
  'FAMILY_TRANSFER_OUT',
  'FAMILY_TRANSFER_IN',
  'FAMILY_CLOSURE_OUT',
  'FAMILY_CLOSURE_IN',
]

const PAYMENT_METHODS = ['FEDAPAY', 'CASH_ON_DELIVERY', 'WALLET', 'FAMILY_WALLET']

const FAMILY_ONLY_NOTIFICATIONS = new Set(NOTIFICATION_TYPES.filter(type => type.startsWith('FAMILY_WALLET_')))
const FAMILY_ONLY_TRANSACTIONS = new Set(WALLET_TRANSACTION_TYPES.filter(type => type.startsWith('FAMILY_')))

function quoteList(values: string[]): string {
  return values.map(value => `'${value}'`).join(', ')
}

/**
 * Family wallet (010-family-wallet): a payer's balance, spent by the relatives
 * they added, within limits.
 *
 * The balance is an ordinary `wallets` row with a fifth owner kind, so it
 * inherits the row lock, the ledger and the top-up flow. The members, their
 * limits and the checkout that names who paid are new.
 *
 * Additive, and replayable: every constraint is dropped before it is added.
 * Production gets the same statements from
 * `scripts/2026-11-15-family-wallet.sql` (the ledger is out of sync).
 */
export class Migration20261115090000 extends Migration {
  override async up(): Promise<void> {
    // ===== FAMILY WALLETS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "family_wallets" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "payer_id" uuid NOT NULL REFERENCES "users" ("id"),
      "status" varchar(10) NOT NULL DEFAULT 'ACTIVE',
      "suspended_by_admin" boolean NOT NULL DEFAULT false,
      "low_balance_threshold" numeric(12,2) NOT NULL DEFAULT 5000,
      "low_balance_alerted" boolean NOT NULL DEFAULT false,
      "default_monthly_cap" numeric(12,2) NULL,
      "default_order_max" numeric(12,2) NULL,
      "default_category_ids" uuid[] NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      "closed_at" timestamptz NULL,
      CONSTRAINT "family_wallets_pkey" PRIMARY KEY ("id")
    );`)
    // One family wallet per payer (FR-001), whatever its status.
    this.addSql(`ALTER TABLE "family_wallets" DROP CONSTRAINT IF EXISTS "family_wallets_payer_id_unique";`)
    this.addSql(`ALTER TABLE "family_wallets" ADD CONSTRAINT "family_wallets_payer_id_unique" UNIQUE ("payer_id");`)
    this.addSql(`ALTER TABLE "family_wallets" DROP CONSTRAINT IF EXISTS "family_wallets_status_check";`)
    this.addSql(`ALTER TABLE "family_wallets" ADD CONSTRAINT "family_wallets_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'CLOSED'));`)
    this.addSql(`ALTER TABLE "family_wallets" DROP CONSTRAINT IF EXISTS "family_wallets_limits_check";`)
    this.addSql(`ALTER TABLE "family_wallets" ADD CONSTRAINT "family_wallets_limits_check" CHECK (
      "low_balance_threshold" >= 0
      AND ("default_monthly_cap" IS NULL OR "default_monthly_cap" > 0)
      AND ("default_order_max" IS NULL OR "default_order_max" > 0)
      AND ("default_category_ids" IS NULL OR cardinality("default_category_ids") > 0));`)

    // ===== MEMBERS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "family_wallet_members" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "family_wallet_id" uuid NOT NULL REFERENCES "family_wallets" ("id") ON DELETE CASCADE,
      "saved_relative_id" uuid NULL REFERENCES "saved_relatives" ("id") ON DELETE SET NULL,
      "nickname" varchar(40) NOT NULL,
      "phone" varchar(16) NOT NULL,
      "user_id" uuid NULL REFERENCES "users" ("id"),
      "status" varchar(10) NOT NULL DEFAULT 'PENDING',
      "monthly_cap" numeric(12,2) NULL,
      "order_max" numeric(12,2) NULL,
      "category_ids" uuid[] NULL,
      "invited_at" timestamptz NULL,
      "pending_reminded_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "family_wallet_members_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "family_wallet_members_wallet_idx" ON "family_wallet_members" ("family_wallet_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "family_wallet_members_user_idx" ON "family_wallet_members" ("user_id") WHERE "user_id" IS NOT NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "family_wallet_members_phone_idx" ON "family_wallet_members" ("phone");`)
    // A relative is a member at most once per wallet; a removed one may come back (FR-003).
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "family_wallet_members_wallet_phone_unique" ON "family_wallet_members" ("family_wallet_id", "phone") WHERE "status" <> 'REMOVED';`)
    this.addSql(`ALTER TABLE "family_wallet_members" DROP CONSTRAINT IF EXISTS "family_wallet_members_phone_check";`)
    this.addSql(`ALTER TABLE "family_wallet_members" ADD CONSTRAINT "family_wallet_members_phone_check" CHECK ("phone" ~ '^\\+229[0-9]{10}$');`)
    this.addSql(`ALTER TABLE "family_wallet_members" DROP CONSTRAINT IF EXISTS "family_wallet_members_status_check";`)
    // Pending means no account yet; active or suspended means one. A removed
    // member keeps whatever it had.
    this.addSql(`ALTER TABLE "family_wallet_members" ADD CONSTRAINT "family_wallet_members_status_check" CHECK (
      ("status" = 'PENDING' AND "user_id" IS NULL)
      OR ("status" IN ('ACTIVE', 'SUSPENDED') AND "user_id" IS NOT NULL)
      OR "status" = 'REMOVED');`)
    this.addSql(`ALTER TABLE "family_wallet_members" DROP CONSTRAINT IF EXISTS "family_wallet_members_limits_check";`)
    this.addSql(`ALTER TABLE "family_wallet_members" ADD CONSTRAINT "family_wallet_members_limits_check" CHECK (
      ("monthly_cap" IS NULL OR "monthly_cap" > 0)
      AND ("order_max" IS NULL OR "order_max" > 0)
      AND ("category_ids" IS NULL OR cardinality("category_ids") > 0));`)

    // ===== WALLETS: fifth owner =====
    this.addSql(`ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "family_wallet_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_family_wallet_id_foreign";`)
    this.addSql(`ALTER TABLE "wallets" ADD CONSTRAINT "wallets_family_wallet_id_foreign" FOREIGN KEY ("family_wallet_id") REFERENCES "family_wallets" ("id");`)
    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_family_wallet_id_unique";`)
    this.addSql(`ALTER TABLE "wallets" ADD CONSTRAINT "wallets_family_wallet_id_unique" UNIQUE ("family_wallet_id");`)
    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallet_single_owner";`)
    this.addSql(`ALTER TABLE "wallets" ADD CONSTRAINT "wallet_single_owner"
      CHECK (num_nonnulls("user_id", "supplier_id", "courier_profile_id", "platform_account", "family_wallet_id") = 1);`)

    // ===== WALLET TRANSACTIONS: the member behind a purchase or refund =====
    this.addSql(`ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "family_member_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_family_member_id_foreign";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_family_member_id_foreign" FOREIGN KEY ("family_member_id") REFERENCES "family_wallet_members" ("id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "wallet_transactions_family_member_idx" ON "wallet_transactions" ("family_member_id", "createdAt") WHERE "family_member_id" IS NOT NULL;`)
    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN (${quoteList(WALLET_TRANSACTION_TYPES)}));`)

    // ===== CHECKOUTS: which member paid =====
    this.addSql(`ALTER TABLE "checkouts" ADD COLUMN IF NOT EXISTS "family_member_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_family_member_id_foreign";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_family_member_id_foreign" FOREIGN KEY ("family_member_id") REFERENCES "family_wallet_members" ("id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "checkouts_family_member_idx" ON "checkouts" ("family_member_id") WHERE "family_member_id" IS NOT NULL;`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_family_member_check";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_family_member_check" CHECK (("payment_method" = 'FAMILY_WALLET') = ("family_member_id" IS NOT NULL));`)

    // ===== PAYMENT METHOD =====
    this.addSql(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_payment_method_check";`)
    this.addSql(`ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_check" CHECK ("payment_method" IN (${quoteList(PAYMENT_METHODS)}));`)
    // The checkouts column has never carried one; regenerated only where it exists.
    this.addSql(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_payment_method_check') THEN
        ALTER TABLE "checkouts" DROP CONSTRAINT "checkouts_payment_method_check";
        ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_payment_method_check" CHECK ("payment_method" IN (${quoteList(PAYMENT_METHODS)}));
      END IF;
    END $$;`)

    // ===== SAVED RELATIVES: address and point optional =====
    this.addSql(`ALTER TABLE "saved_relatives"
      ALTER COLUMN "address" DROP NOT NULL,
      ALTER COLUMN "latitude" DROP NOT NULL,
      ALTER COLUMN "longitude" DROP NOT NULL;`)
    this.addSql(`ALTER TABLE "saved_relatives" DROP CONSTRAINT IF EXISTS "saved_relatives_address_check";`)
    this.addSql(`ALTER TABLE "saved_relatives" ADD CONSTRAINT "saved_relatives_address_check" CHECK ("address" IS NULL OR char_length("address") >= 10);`)
    this.addSql(`ALTER TABLE "saved_relatives" DROP CONSTRAINT IF EXISTS "saved_relatives_point_check";`)
    this.addSql(`ALTER TABLE "saved_relatives" ADD CONSTRAINT "saved_relatives_point_check" CHECK (("latitude" IS NULL) = ("longitude" IS NULL));`)

    // ===== NOTIFICATIONS =====
    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN (${quoteList(NOTIFICATION_TYPES)}));`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN (${quoteList(NOTIFICATION_TYPES.filter(type => !FAMILY_ONLY_NOTIFICATIONS.has(type)))}));`)

    // Relatives without an address cannot go back to NOT NULL: left nullable.
    this.addSql(`ALTER TABLE "saved_relatives" DROP CONSTRAINT IF EXISTS "saved_relatives_point_check";`)

    this.addSql(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_payment_method_check";`)
    this.addSql(`ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_check" CHECK ("payment_method" IN ('FEDAPAY', 'CASH_ON_DELIVERY', 'WALLET'));`)

    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_family_member_check";`)
    this.addSql(`DROP INDEX IF EXISTS "checkouts_family_member_idx";`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_family_member_id_foreign";`)
    this.addSql(`ALTER TABLE "checkouts" DROP COLUMN IF EXISTS "family_member_id";`)

    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN (${quoteList(WALLET_TRANSACTION_TYPES.filter(type => !FAMILY_ONLY_TRANSACTIONS.has(type)))}));`)
    this.addSql(`DROP INDEX IF EXISTS "wallet_transactions_family_member_idx";`)
    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_family_member_id_foreign";`)
    this.addSql(`ALTER TABLE "wallet_transactions" DROP COLUMN IF EXISTS "family_member_id";`)

    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallet_single_owner";`)
    this.addSql(`ALTER TABLE "wallets" ADD CONSTRAINT "wallet_single_owner"
      CHECK (num_nonnulls("user_id", "supplier_id", "courier_profile_id", "platform_account") = 1);`)
    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_family_wallet_id_unique";`)
    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_family_wallet_id_foreign";`)
    this.addSql(`ALTER TABLE "wallets" DROP COLUMN IF EXISTS "family_wallet_id";`)

    this.addSql(`DROP TABLE IF EXISTS "family_wallet_members";`)
    this.addSql(`DROP TABLE IF EXISTS "family_wallets";`)
  }
}

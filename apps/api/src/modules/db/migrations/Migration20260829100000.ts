import { Migration } from '@mikro-orm/migrations'

/**
 * Courier wallet (shared eBio fleet):
 * - A wallet, payout numbers and withdrawal requests can now be owned by a
 *   courier profile (exactly one owner per row, enforced by CHECKs).
 * - Ledger lines can point at a delivery; two new movement types
 *   (DELIVERY_EARNING, DELIVERY_COMMISSION). PROMO_COMPENSATION was only
 *   ever added by a hand-written script, so the CHECK is rebuilt in full.
 * - Deliveries snapshot the buyer-paid fee and the courier's share of it.
 * - platform_settings key/value table seeded with the delivery commission rate.
 */
export class Migration20260829100000 extends Migration {
  override async up(): Promise<void> {
    // ===== WALLETS: courier owner =====
    this.addSql(`ALTER TABLE "wallets"
      ADD COLUMN IF NOT EXISTS "courier_profile_id" uuid NULL REFERENCES "courier_profiles" ("id") ON DELETE CASCADE;`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "wallets_courier_profile_id_unique" ON "wallets" ("courier_profile_id");`)
    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallet_single_owner";`)
    this.addSql(`ALTER TABLE "wallets" ADD CONSTRAINT "wallet_single_owner"
      CHECK (num_nonnulls("user_id", "supplier_id", "courier_profile_id") = 1);`)

    // ===== WALLET TRANSACTIONS: delivery link + new types =====
    this.addSql(`ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "delivery_id" uuid NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "wallet_transactions_delivery_idx"
      ON "wallet_transactions" ("delivery_id") WHERE "delivery_id" IS NOT NULL;`)
    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check"
      CHECK ("type" IN (
        'TOPUP', 'ORDER_PAYMENT', 'SALE_CREDIT', 'COMMISSION_DEBIT',
        'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'REFUND', 'ADJUSTMENT', 'PROMO_COMPENSATION',
        'DELIVERY_EARNING', 'DELIVERY_COMMISSION'
      ));`)

    // ===== PAYOUT NUMBERS: supplier or courier owner =====
    this.addSql(`ALTER TABLE "payout_numbers" ALTER COLUMN "supplier_id" DROP NOT NULL;`)
    this.addSql(`ALTER TABLE "payout_numbers"
      ADD COLUMN IF NOT EXISTS "courier_profile_id" uuid NULL REFERENCES "courier_profiles" ("id") ON DELETE CASCADE;`)
    this.addSql(`ALTER TABLE "payout_numbers" DROP CONSTRAINT IF EXISTS "payout_numbers_single_owner";`)
    this.addSql(`ALTER TABLE "payout_numbers" ADD CONSTRAINT "payout_numbers_single_owner"
      CHECK (num_nonnulls("supplier_id", "courier_profile_id") = 1);`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "payout_numbers_courier_phone_unique"
      ON "payout_numbers" ("courier_profile_id", "phone_number");`)

    // ===== WITHDRAWAL REQUESTS: supplier or courier owner =====
    this.addSql(`ALTER TABLE "withdrawal_requests" ALTER COLUMN "supplier_id" DROP NOT NULL;`)
    this.addSql(`ALTER TABLE "withdrawal_requests"
      ADD COLUMN IF NOT EXISTS "courier_profile_id" uuid NULL REFERENCES "courier_profiles" ("id") ON DELETE CASCADE;`)
    this.addSql(`ALTER TABLE "withdrawal_requests" DROP CONSTRAINT IF EXISTS "withdrawal_requests_single_owner";`)
    this.addSql(`ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_single_owner"
      CHECK (num_nonnulls("supplier_id", "courier_profile_id") = 1);`)
    // One active request per courier — the partial unique index is the
    // arbiter, mirroring withdrawal_requests_one_active_idx for suppliers.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_requests_one_active_courier_idx"
      ON "withdrawal_requests" ("courier_profile_id")
      WHERE "status" IN ('PENDING', 'PROCESSING') AND "courier_profile_id" IS NOT NULL;`)

    // ===== DELIVERIES: fee snapshot =====
    this.addSql(`ALTER TABLE "deliveries"
      ADD COLUMN IF NOT EXISTS "delivery_fee" double precision NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "courier_fee" double precision NOT NULL DEFAULT 0;`)
    // Backfill the buyer-paid fee from the order. courier_fee deliberately
    // stays 0 on legacy rows: those runs were never settled through the
    // courier wallet, and inventing a share after the fact would credit money
    // nobody accounted for.
    this.addSql(`UPDATE "deliveries" d SET "delivery_fee" = o."delivery_fee"
      FROM "orders" o
      WHERE o."id" = d."order_id" AND d."delivery_fee" = 0 AND o."delivery_fee" > 0;`)

    // ===== PLATFORM SETTINGS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "platform_settings" (
      "key" varchar(64) NOT NULL,
      "value" text NOT NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
    );`)
    this.addSql(`INSERT INTO "platform_settings" ("key", "value")
      VALUES ('delivery_commission_rate', '0.10')
      ON CONFLICT ("key") DO NOTHING;`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "platform_settings";`)

    this.addSql(`ALTER TABLE "deliveries"
      DROP COLUMN IF EXISTS "delivery_fee",
      DROP COLUMN IF EXISTS "courier_fee";`)

    this.addSql(`DROP INDEX IF EXISTS "withdrawal_requests_one_active_courier_idx";`)
    this.addSql(`ALTER TABLE "withdrawal_requests" DROP CONSTRAINT IF EXISTS "withdrawal_requests_single_owner";`)
    this.addSql(`DELETE FROM "withdrawal_requests" WHERE "supplier_id" IS NULL;`)
    this.addSql(`ALTER TABLE "withdrawal_requests" DROP COLUMN IF EXISTS "courier_profile_id";`)
    this.addSql(`ALTER TABLE "withdrawal_requests" ALTER COLUMN "supplier_id" SET NOT NULL;`)

    this.addSql(`DROP INDEX IF EXISTS "payout_numbers_courier_phone_unique";`)
    this.addSql(`ALTER TABLE "payout_numbers" DROP CONSTRAINT IF EXISTS "payout_numbers_single_owner";`)
    this.addSql(`DELETE FROM "payout_numbers" WHERE "supplier_id" IS NULL;`)
    this.addSql(`ALTER TABLE "payout_numbers" DROP COLUMN IF EXISTS "courier_profile_id";`)
    this.addSql(`ALTER TABLE "payout_numbers" ALTER COLUMN "supplier_id" SET NOT NULL;`)

    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`DELETE FROM "wallet_transactions" WHERE "type" IN ('DELIVERY_EARNING', 'DELIVERY_COMMISSION');`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check"
      CHECK ("type" IN (
        'TOPUP', 'ORDER_PAYMENT', 'SALE_CREDIT', 'COMMISSION_DEBIT',
        'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'REFUND', 'ADJUSTMENT', 'PROMO_COMPENSATION'
      ));`)
    this.addSql(`DROP INDEX IF EXISTS "wallet_transactions_delivery_idx";`)
    this.addSql(`ALTER TABLE "wallet_transactions" DROP COLUMN IF EXISTS "delivery_id";`)

    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallet_single_owner";`)
    this.addSql(`DELETE FROM "wallets" WHERE "courier_profile_id" IS NOT NULL;`)
    this.addSql(`DROP INDEX IF EXISTS "wallets_courier_profile_id_unique";`)
    this.addSql(`ALTER TABLE "wallets" DROP COLUMN IF EXISTS "courier_profile_id";`)
    this.addSql(`ALTER TABLE "wallets" ADD CONSTRAINT "wallet_single_owner"
      CHECK (num_nonnulls("user_id", "supplier_id") = 1);`)
  }
}

import { Migration } from '@mikro-orm/migrations'

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
]

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
  'ESCROW_REMINDER',
  'PROMOTIONAL',
  'SYSTEM',
  'DELIVERY_OFFER',
  'DELIVERY_ASSIGNED',
  'DELIVERY_PICKED_UP',
  'DELIVERY_FAILED',
  'DELIVERY_REASSIGNED',
  'COURIER_VALIDATED',
  'COURIER_REJECTED',
  'COURIER_SUSPENDED',
  'COURIER_EARNING',
  'COURIER_PAYOUT',
  'COURIER_RATED',
  'COURIER_TIP',
]

/**
 * Courier feedback from the buyer once a run is delivered: a 1–5 rating
 * (aggregated on the courier profile) and an optional tip paid from the
 * buyer's personal wallet straight into the courier wallet, commission-free.
 */
export class Migration20260910100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "courier_profiles"
      ADD COLUMN IF NOT EXISTS "rating_avg" float NULL,
      ADD COLUMN IF NOT EXISTS "rating_count" int NOT NULL DEFAULT 0;`)

    this.addSql(`ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "tip_amount" float NOT NULL DEFAULT 0;`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "courier_ratings" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      "delivery_id" uuid NOT NULL UNIQUE REFERENCES "deliveries" ("id") ON DELETE CASCADE,
      "courier_id" uuid NOT NULL REFERENCES "courier_profiles" ("id") ON DELETE CASCADE,
      "buyer_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "order_id" uuid NOT NULL REFERENCES "orders" ("id") ON DELETE CASCADE,
      "rating" smallint NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
      "comment" text NULL,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "courier_ratings_courier_idx" ON "courier_ratings" ("courier_id", "created_at");`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "courier_tips" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      "delivery_id" uuid NOT NULL UNIQUE REFERENCES "deliveries" ("id") ON DELETE CASCADE,
      "courier_id" uuid NOT NULL REFERENCES "courier_profiles" ("id") ON DELETE CASCADE,
      "buyer_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "order_id" uuid NOT NULL REFERENCES "orders" ("id") ON DELETE CASCADE,
      "amount" int NOT NULL CHECK ("amount" > 0),
      "created_at" timestamptz NOT NULL DEFAULT now()
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "courier_tips_courier_idx" ON "courier_tips" ("courier_id", "created_at");`)

    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check"
      CHECK ("type" IN (${WALLET_TRANSACTION_TYPES.map(t => `'${t}'`).join(', ')}));`)

    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
      CHECK ("type" IN (${NOTIFICATION_TYPES.map(t => `'${t}'`).join(', ')}));`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "courier_tips";`)
    this.addSql(`DROP TABLE IF EXISTS "courier_ratings";`)
    this.addSql(`ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "tip_amount";`)
    this.addSql(`ALTER TABLE "courier_profiles" DROP COLUMN IF EXISTS "rating_avg", DROP COLUMN IF EXISTS "rating_count";`)
    // The widened CHECKs stay: narrowing them back would reject existing rows.
  }
}

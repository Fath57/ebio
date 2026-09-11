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
  'DELIVERY_SPONSORSHIP',
  'BANNER_PAYMENT',
  'BANNER_REFUND',
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
  'BANNER_APPROVED',
  'BANNER_REJECTED',
]

/**
 * Sponsored banners: a shop asks for a home-carousel slot, pays from its
 * wallet, eBio approves (dates fixed) or rejects (refund). Banners gain an
 * owner, a schedule and impression/click counters.
 */
export class Migration20260910180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "banners"
      ADD COLUMN IF NOT EXISTS "supplier_id" uuid NULL REFERENCES "suppliers" ("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "sponsored" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "starts_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "ends_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "impressions" int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "clicks" int NOT NULL DEFAULT 0;`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "banner_requests" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      "supplier_id" uuid NOT NULL REFERENCES "suppliers" ("id") ON DELETE CASCADE,
      "title" varchar(255) NOT NULL,
      "subtitle" varchar(255) NULL,
      "image_url" varchar(1024) NOT NULL,
      "target_type" varchar(16) NOT NULL,
      "target_id" uuid NULL,
      "duration_days" int NOT NULL,
      "price" int NOT NULL,
      "requested_start_at" timestamptz NULL,
      "status" varchar(16) NOT NULL DEFAULT 'PENDING',
      "rejection_reason" varchar(500) NULL,
      "banner_id" uuid NULL REFERENCES "banners" ("id") ON DELETE SET NULL,
      "paid_at" timestamptz NULL,
      "refunded_at" timestamptz NULL,
      "reviewed_by" varchar(255) NULL,
      "reviewed_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "banner_requests_supplier_idx" ON "banner_requests" ("supplier_id", "created_at");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "banner_requests_status_idx" ON "banner_requests" ("status");`)

    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check"
      CHECK ("type" IN (${WALLET_TRANSACTION_TYPES.map(t => `'${t}'`).join(', ')}));`)
    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
      CHECK ("type" IN (${NOTIFICATION_TYPES.map(t => `'${t}'`).join(', ')}));`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "banner_requests";`)
    this.addSql(`ALTER TABLE "banners"
      DROP COLUMN IF EXISTS "supplier_id", DROP COLUMN IF EXISTS "sponsored", DROP COLUMN IF EXISTS "starts_at",
      DROP COLUMN IF EXISTS "ends_at", DROP COLUMN IF EXISTS "impressions", DROP COLUMN IF EXISTS "clicks";`)
    // The widened CHECKs stay: narrowing them back would reject existing rows.
  }
}

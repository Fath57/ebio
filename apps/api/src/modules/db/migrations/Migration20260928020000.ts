import { Migration } from '@mikro-orm/migrations'

/**
 * Referrals: who brought whom, and what it earned them.
 *
 * The referee is unique — one is referred only once. The sponsor's code
 * lives on the account, null until someone asks for it: most accounts will
 * never need one.
 */
export class Migration20260928020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_code" varchar(16) NULL;`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_unique" ON "users" ("referral_code") WHERE "referral_code" IS NOT NULL;`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "referrals" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "sponsor_id" uuid NOT NULL,
      "referee_id" uuid NOT NULL,
      "code" varchar(16) NOT NULL,
      "status" varchar(16) NOT NULL DEFAULT 'PENDING',
      "sponsor_amount" int NOT NULL DEFAULT 0,
      "referee_amount" int NOT NULL DEFAULT 0,
      "order_id" uuid NULL,
      "rewarded_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
    );`)

    this.addSql(`ALTER TABLE "referrals" DROP CONSTRAINT IF EXISTS "referrals_sponsor_id_foreign";`)
    this.addSql(`ALTER TABLE "referrals" ADD CONSTRAINT "referrals_sponsor_id_foreign"
      FOREIGN KEY ("sponsor_id") REFERENCES "users" ("id") ON DELETE CASCADE;`)
    this.addSql(`ALTER TABLE "referrals" DROP CONSTRAINT IF EXISTS "referrals_referee_id_foreign";`)
    this.addSql(`ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_foreign"
      FOREIGN KEY ("referee_id") REFERENCES "users" ("id") ON DELETE CASCADE;`)

    // One referee, one sponsor, for good: the constraint decides even when
    // two requests arrive at once.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "referrals_referee_unique" ON "referrals" ("referee_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "referrals_sponsor_idx" ON "referrals" ("sponsor_id");`)
    this.addSql(`ALTER TABLE "referrals" DROP CONSTRAINT IF EXISTS "referrals_status_check";`)
    this.addSql(`ALTER TABLE "referrals" ADD CONSTRAINT "referrals_status_check"
      CHECK ("status" IN ('PENDING', 'REWARDED'));`)
    // Nobody refers themselves, and the database knows it too.
    this.addSql(`ALTER TABLE "referrals" DROP CONSTRAINT IF EXISTS "referrals_not_self";`)
    this.addSql(`ALTER TABLE "referrals" ADD CONSTRAINT "referrals_not_self"
      CHECK ("sponsor_id" <> "referee_id");`)

    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check"
      CHECK ("type" IN ('TOPUP', 'ORDER_PAYMENT', 'SALE_CREDIT', 'COMMISSION_DEBIT', 'WITHDRAWAL',
        'WITHDRAWAL_REFUND', 'REFUND', 'ADJUSTMENT', 'PROMO_COMPENSATION', 'DELIVERY_EARNING',
        'DELIVERY_COMMISSION', 'TIP_PAYMENT', 'TIP_EARNING', 'DELIVERY_SPONSORSHIP', 'BANNER_PAYMENT',
        'BANNER_REFUND', 'REFERRAL_REWARD', 'PLATFORM_COMMISSION', 'PLATFORM_DELIVERY_SHARE',
        'PLATFORM_BANNER', 'PLATFORM_MARKETING'));`)

    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
      CHECK ("type" IN ('ORDER_PLACED', 'ORDER_ACCEPTED', 'ORDER_REJECTED', 'ORDER_READY',
        'ORDER_DELIVERED', 'ORDER_CANCELLED', 'PAYMENT_RECEIVED', 'PAYMENT_RELEASED', 'DISPUTE_OPENED',
        'DISPUTE_RESOLVED', 'SUPPLIER_VALIDATED', 'SUPPLIER_REJECTED', 'SUPPLIER_COMPLEMENT',
        'STOCK_ALERT', 'STOCK_AVAILABLE', 'NEW_MESSAGE', 'NEW_REVIEW', 'PRODUCT_REVIEW_INVITE',
        'CART_REMINDER', 'ESCROW_REMINDER', 'PROMOTIONAL', 'SYSTEM', 'DELIVERY_OFFER',
        'DELIVERY_ASSIGNED', 'DELIVERY_PICKED_UP', 'DELIVERY_FAILED', 'DELIVERY_REASSIGNED',
        'COURIER_VALIDATED', 'COURIER_REJECTED', 'COURIER_SUSPENDED', 'COURIER_EARNING',
        'COURIER_PAYOUT', 'COURIER_RATED', 'COURIER_TIP', 'REFERRAL_REWARD', 'BANNER_APPROVED',
        'BANNER_REJECTED'));`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "referrals";`)
    this.addSql(`DROP INDEX IF EXISTS "users_referral_code_unique";`)
    this.addSql(`ALTER TABLE "users" DROP COLUMN IF EXISTS "referral_code";`)
  }
}

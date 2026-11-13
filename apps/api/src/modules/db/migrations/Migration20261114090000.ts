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
]

const PROOF_TYPES = ['CODE', 'PHOTO', 'CODE_AND_PHOTO']

const DISPLAY_CURRENCIES = ['XOF', 'EUR', 'USD', 'CAD']

function quoteList(values: string[]): string {
  return values.map(value => `'${value}'`).join(', ')
}

/**
 * Ordering for a relative (009-diaspora-gift-order): the address book of
 * relatives, the recipient and the frozen exchange rate on the checkout, the
 * hand-over proof (code + photo + position) on the delivery, and the verified
 * phone and display currency on the user.
 *
 * Additive: the running code ignores every new column until deployed.
 * Production gets the same statements from
 * `scripts/2026-11-14-diaspora-gift-order.sql` (the ledger is out of sync).
 */
export class Migration20261114090000 extends Migration {
  override async up(): Promise<void> {
    // ===== SAVED RELATIVES =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "saved_relatives" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "owner_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "nickname" varchar(40) NOT NULL,
      "name" varchar(120) NOT NULL,
      "phone" varchar(16) NOT NULL,
      "address" text NOT NULL,
      "latitude" double precision NOT NULL,
      "longitude" double precision NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "saved_relatives_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "saved_relatives_owner_idx" ON "saved_relatives" ("owner_id");`)
    this.addSql(`ALTER TABLE "saved_relatives" DROP CONSTRAINT IF EXISTS "saved_relatives_owner_phone_unique";`)
    this.addSql(`ALTER TABLE "saved_relatives" ADD CONSTRAINT "saved_relatives_owner_phone_unique" UNIQUE ("owner_id", "phone");`)
    this.addSql(`ALTER TABLE "saved_relatives" DROP CONSTRAINT IF EXISTS "saved_relatives_phone_check";`)
    this.addSql(`ALTER TABLE "saved_relatives" ADD CONSTRAINT "saved_relatives_phone_check" CHECK ("phone" ~ '^\\+229[0-9]{10}$');`)
    this.addSql(`ALTER TABLE "saved_relatives" DROP CONSTRAINT IF EXISTS "saved_relatives_address_check";`)
    this.addSql(`ALTER TABLE "saved_relatives" ADD CONSTRAINT "saved_relatives_address_check" CHECK (char_length("address") >= 10);`)

    // ===== CHECKOUTS: recipient and frozen display currency =====
    this.addSql(`ALTER TABLE "checkouts"
      ADD COLUMN IF NOT EXISTS "recipient_name" varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS "recipient_phone" varchar(16) NULL,
      ADD COLUMN IF NOT EXISTS "saved_relative_id" uuid NULL,
      ADD COLUMN IF NOT EXISTS "tracking_token" varchar(32) NULL,
      ADD COLUMN IF NOT EXISTS "recipient_sms_resend_count" smallint NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "payer_time_zone" varchar(64) NULL,
      ADD COLUMN IF NOT EXISTS "display_currency" varchar(3) NOT NULL DEFAULT 'XOF',
      ADD COLUMN IF NOT EXISTS "fx_rate" numeric(14,6) NULL,
      ADD COLUMN IF NOT EXISTS "fx_margin_bps" smallint NULL,
      ADD COLUMN IF NOT EXISTS "display_total" numeric(12,2) NULL;`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_saved_relative_id_foreign";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_saved_relative_id_foreign" FOREIGN KEY ("saved_relative_id") REFERENCES "saved_relatives" ("id") ON DELETE SET NULL;`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_tracking_token_unique";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_tracking_token_unique" UNIQUE ("tracking_token");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "checkouts_recipient_phone_idx" ON "checkouts" ("recipient_phone") WHERE "recipient_phone" IS NOT NULL;`)
    // Name, phone and tracking token come together or not at all.
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_recipient_check";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_recipient_check" CHECK (("recipient_name" IS NULL) = ("recipient_phone" IS NULL) AND ("recipient_phone" IS NULL) = ("tracking_token" IS NULL));`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_recipient_sms_resend_count_check";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_recipient_sms_resend_count_check" CHECK ("recipient_sms_resend_count" BETWEEN 0 AND 3);`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_gift_payment_check";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_gift_payment_check" CHECK ("recipient_phone" IS NULL OR "payment_method" <> 'CASH_ON_DELIVERY');`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_display_currency_check";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_display_currency_check" CHECK ("display_currency" IN (${quoteList(DISPLAY_CURRENCIES)}));`)
    // XOF carries no rate; any other currency carries its frozen rate and total.
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_display_fx_check";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_display_fx_check" CHECK (("display_currency" = 'XOF') = ("fx_rate" IS NULL AND "display_total" IS NULL));`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_fx_margin_bps_check";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_fx_margin_bps_check" CHECK ("fx_margin_bps" IS NULL OR "fx_margin_bps" BETWEEN 0 AND 1000);`)

    // ===== DELIVERIES: hand-over proof =====
    // Production still has the original varchar(10): CODE_AND_PHOTO is 14 characters.
    this.addSql(`ALTER TABLE "deliveries" ALTER COLUMN "proof_type" TYPE varchar(20);`)
    this.addSql(`ALTER TABLE "deliveries"
      ADD COLUMN IF NOT EXISTS "proof_latitude" double precision NULL,
      ADD COLUMN IF NOT EXISTS "proof_longitude" double precision NULL,
      ADD COLUMN IF NOT EXISTS "proof_taken_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "proof_distance_m" integer NULL,
      ADD COLUMN IF NOT EXISTS "proof_far" boolean NOT NULL DEFAULT false;`)
    this.addSql(`ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_proof_type_check";`)
    this.addSql(`ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_proof_type_check" CHECK ("proof_type" IN (${quoteList(PROOF_TYPES)}));`)
    // The photo itself is not required here: the 90-day purge nulls
    // `proof_media_id` while the rest of the proof stays for the record.
    this.addSql(`ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_gift_proof_check";`)
    this.addSql(`ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_gift_proof_check" CHECK ("proof_type" IS DISTINCT FROM 'CODE_AND_PHOTO' OR ("proof_latitude" IS NOT NULL AND "proof_longitude" IS NOT NULL AND "proof_taken_at" IS NOT NULL));`)

    // ===== USERS: verified phone and display currency =====
    this.addSql(`ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "phone_verified_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "display_currency" varchar(3) NOT NULL DEFAULT 'XOF';`)
    this.addSql(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_display_currency_check";`)
    this.addSql(`ALTER TABLE "users" ADD CONSTRAINT "users_display_currency_check" CHECK ("display_currency" IN (${quoteList(DISPLAY_CURRENCIES)}));`)
    // Accounts created by SMS code carry a placeholder e-mail: their phone was proven.
    this.addSql(`UPDATE "users" SET "phone_verified_at" = "createdAt" WHERE "phone_verified_at" IS NULL AND "phone" IS NOT NULL AND "email" LIKE '%@phone.ebio.app';`)

    // ===== NOTIFICATIONS =====
    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN (${quoteList(NOTIFICATION_TYPES)}));`)
  }

  override async down(): Promise<void> {
    const previousNotifications = NOTIFICATION_TYPES.filter(type => type !== 'GIFT_DELIVERED' && type !== 'GIFT_DELIVERY_FAILED')
    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN (${quoteList(previousNotifications)}));`)

    this.addSql(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_display_currency_check";`)
    this.addSql(`ALTER TABLE "users" DROP COLUMN IF EXISTS "display_currency", DROP COLUMN IF EXISTS "phone_verified_at";`)

    this.addSql(`ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_gift_proof_check";`)
    this.addSql(`ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_proof_type_check";`)
    this.addSql(`UPDATE "deliveries" SET "proof_type" = 'PHOTO' WHERE "proof_type" = 'CODE_AND_PHOTO';`)
    this.addSql(`ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_proof_type_check" CHECK ("proof_type" IN ('CODE', 'PHOTO'));`)
    this.addSql(`ALTER TABLE "deliveries"
      DROP COLUMN IF EXISTS "proof_far",
      DROP COLUMN IF EXISTS "proof_distance_m",
      DROP COLUMN IF EXISTS "proof_taken_at",
      DROP COLUMN IF EXISTS "proof_longitude",
      DROP COLUMN IF EXISTS "proof_latitude";`)

    for (const name of ['fx_margin_bps', 'display_fx', 'display_currency', 'gift_payment', 'recipient_sms_resend_count', 'recipient']) {
      this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_${name}_check";`)
    }
    this.addSql(`DROP INDEX IF EXISTS "checkouts_recipient_phone_idx";`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_tracking_token_unique";`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_saved_relative_id_foreign";`)
    this.addSql(`ALTER TABLE "checkouts"
      DROP COLUMN IF EXISTS "display_total",
      DROP COLUMN IF EXISTS "fx_margin_bps",
      DROP COLUMN IF EXISTS "fx_rate",
      DROP COLUMN IF EXISTS "display_currency",
      DROP COLUMN IF EXISTS "payer_time_zone",
      DROP COLUMN IF EXISTS "recipient_sms_resend_count",
      DROP COLUMN IF EXISTS "tracking_token",
      DROP COLUMN IF EXISTS "saved_relative_id",
      DROP COLUMN IF EXISTS "recipient_phone",
      DROP COLUMN IF EXISTS "recipient_name";`)

    this.addSql(`DROP TABLE IF EXISTS "saved_relatives";`)
  }
}

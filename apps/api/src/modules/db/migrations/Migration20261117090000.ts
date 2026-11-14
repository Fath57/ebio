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
  'EXPORT_SHIPMENT_UPDATE',
  'EXPORT_DEPARTURE_OPEN',
  'EXPORT_DEADLINE_REMINDER',
  'EXPORT_WEIGHT_SUPPLEMENT',
  'EXPORT_PRODUCT_REVIEWED',
  'EXPORT_DEPARTURE_FILL',
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
  'EXPORT_SHIPPING_INCOME',
  'EXPORT_INSURANCE_INCOME',
  'EXPORT_LOSS',
  'EXPORT_PACK_COMPENSATION',
]

const PLATFORM_ACCOUNTS = ['SALES_COMMISSION', 'DELIVERY_COMMISSION', 'BANNERS', 'MARKETING', 'EXPORT']

const PICKUP_MODES = ['ON_SITE', 'DELIVERY', 'EXPORT']

const SHIPMENT_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'COLLECTING',
  'PACKED',
  'DROPPED_AT_AGENCY',
  'DEPARTED',
  'ARRIVED',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'HANDED_OVER',
  'LOST',
  'DAMAGED',
  'CANCELLED',
]

const EXPORT_ONLY = (value: string): boolean => value.startsWith('EXPORT')

function quoteList(values: string[]): string {
  return values.map(value => `'${value}'`).join(', ')
}

/**
 * Terroir export (011-terroir-export): products shipped from Benin to France
 * and Belgium through partner agencies.
 *
 * Eleven tables (catalogue, logistics, parcels), a third pickup mode `EXPORT`
 * that keeps these orders away from the local couriers, and an `EXPORT`
 * platform account carrying the shipping money (never a shop's).
 *
 * Additive, and replayable: every constraint is dropped before it is added.
 * Production gets the same statements from
 * `scripts/2026-11-17-terroir-export.sql` (the ledger is out of sync).
 */
export class Migration20261117090000 extends Migration {
  override async up(): Promise<void> {
    // ===== CATALOGUE =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "export_profiles" (
      "product_id" uuid NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
      "status" varchar(10) NOT NULL DEFAULT 'PENDING',
      "packed_weight_g" integer NOT NULL,
      "length_cm" integer NULL,
      "width_cm" integer NULL,
      "height_cm" integer NULL,
      "shelf_life_days" integer NOT NULL,
      "origin_producer" varchar(120) NULL,
      "origin_place" varchar(120) NULL,
      "origin_year" smallint NULL,
      "origin_method" varchar(300) NULL,
      "origin_photos" jsonb NOT NULL DEFAULT '[]',
      "label_photo" text NULL,
      "checklist" jsonb NOT NULL DEFAULT '{}',
      "reviewed_by" uuid NULL REFERENCES "users" ("id"),
      "reviewed_at" timestamptz NULL,
      "rejection_reason" varchar(500) NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "export_profiles_pkey" PRIMARY KEY ("product_id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "export_profiles_status_idx" ON "export_profiles" ("status");`)
    this.addSql(`ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_status_check";`)
    this.addSql(`ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'));`)
    this.addSql(`ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_sizes_check";`)
    this.addSql(`ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_sizes_check" CHECK (
      "packed_weight_g" > 0
      AND "shelf_life_days" > 0
      AND ("length_cm" IS NULL OR "length_cm" > 0)
      AND ("width_cm" IS NULL OR "width_cm" > 0)
      AND ("height_cm" IS NULL OR "height_cm" > 0)
      AND jsonb_array_length("origin_photos") <= 3);`)
    // No approval without the label photo (FR-002).
    this.addSql(`ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_label_check";`)
    this.addSql(`ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_label_check" CHECK ("status" <> 'APPROVED' OR "label_photo" IS NOT NULL);`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "export_packs" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "supplier_id" uuid NULL REFERENCES "suppliers" ("id"),
      "name" varchar(120) NOT NULL,
      "description" text NULL,
      "photos" jsonb NOT NULL DEFAULT '[]',
      "price" numeric(12,2) NOT NULL,
      "status" varchar(10) NOT NULL DEFAULT 'PENDING',
      "rejection_reason" varchar(500) NULL,
      "reviewed_by" uuid NULL REFERENCES "users" ("id"),
      "reviewed_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "export_packs_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "export_packs_supplier_idx" ON "export_packs" ("supplier_id");`)
    this.addSql(`ALTER TABLE "export_packs" DROP CONSTRAINT IF EXISTS "export_packs_status_check";`)
    this.addSql(`ALTER TABLE "export_packs" ADD CONSTRAINT "export_packs_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'RETIRED'));`)
    this.addSql(`ALTER TABLE "export_packs" DROP CONSTRAINT IF EXISTS "export_packs_price_check";`)
    this.addSql(`ALTER TABLE "export_packs" ADD CONSTRAINT "export_packs_price_check" CHECK ("price" > 0);`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "export_pack_items" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "pack_id" uuid NOT NULL REFERENCES "export_packs" ("id") ON DELETE CASCADE,
      "product_id" uuid NOT NULL REFERENCES "products" ("id"),
      "variant_id" uuid NULL REFERENCES "product_variants" ("id"),
      "quantity" integer NOT NULL,
      CONSTRAINT "export_pack_items_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "export_pack_items_pack_idx" ON "export_pack_items" ("pack_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "export_pack_items_product_idx" ON "export_pack_items" ("product_id");`)
    this.addSql(`ALTER TABLE "export_pack_items" DROP CONSTRAINT IF EXISTS "export_pack_items_quantity_check";`)
    this.addSql(`ALTER TABLE "export_pack_items" ADD CONSTRAINT "export_pack_items_quantity_check" CHECK ("quantity" > 0);`)

    // ===== LOGISTICS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "export_agencies" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "name" varchar(120) NOT NULL,
      "contact_name" varchar(120) NULL,
      "contact_phone" varchar(30) NULL,
      "contact_email" varchar(200) NULL,
      "notes" text NULL,
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "export_agencies_pkey" PRIMARY KEY ("id")
    );`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "export_pickup_points" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "agency_id" uuid NOT NULL REFERENCES "export_agencies" ("id"),
      "country" varchar(2) NOT NULL,
      "city" varchar(80) NOT NULL,
      "address" text NOT NULL,
      "opening_hours" text NULL,
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "export_pickup_points_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "export_pickup_points_agency_idx" ON "export_pickup_points" ("agency_id");`)
    this.addSql(`ALTER TABLE "export_pickup_points" DROP CONSTRAINT IF EXISTS "export_pickup_points_country_check";`)
    this.addSql(`ALTER TABLE "export_pickup_points" ADD CONSTRAINT "export_pickup_points_country_check" CHECK ("country" IN ('FR', 'BE'));`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "export_departures" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "agency_id" uuid NOT NULL REFERENCES "export_agencies" ("id"),
      "departs_on" date NOT NULL,
      "deposit_deadline" timestamptz NOT NULL,
      "transit_min_days" smallint NOT NULL,
      "transit_max_days" smallint NOT NULL,
      "capacity_kg" numeric(8,2) NULL,
      "status" varchar(10) NOT NULL DEFAULT 'OPEN',
      "fill_alerted_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "export_departures_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "export_departures_status_idx" ON "export_departures" ("status", "departs_on");`)
    this.addSql(`ALTER TABLE "export_departures" DROP CONSTRAINT IF EXISTS "export_departures_status_check";`)
    this.addSql(`ALTER TABLE "export_departures" ADD CONSTRAINT "export_departures_status_check" CHECK ("status" IN ('OPEN', 'FULL', 'CANCELLED', 'DEPARTED'));`)
    this.addSql(`ALTER TABLE "export_departures" DROP CONSTRAINT IF EXISTS "export_departures_transit_check";`)
    this.addSql(`ALTER TABLE "export_departures" ADD CONSTRAINT "export_departures_transit_check" CHECK (
      "transit_min_days" >= 0
      AND "transit_min_days" <= "transit_max_days"
      AND ("capacity_kg" IS NULL OR "capacity_kg" > 0));`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "export_departure_rates" (
      "departure_id" uuid NOT NULL REFERENCES "export_departures" ("id") ON DELETE CASCADE,
      "country" varchar(2) NOT NULL,
      "price_per_kg" numeric(12,2) NOT NULL,
      "min_billed_kg" numeric(6,2) NOT NULL DEFAULT 0,
      "max_weight_kg" numeric(6,2) NULL,
      "home_delivery_fee" numeric(12,2) NULL,
      CONSTRAINT "export_departure_rates_pkey" PRIMARY KEY ("departure_id", "country")
    );`)
    this.addSql(`ALTER TABLE "export_departure_rates" DROP CONSTRAINT IF EXISTS "export_departure_rates_country_check";`)
    this.addSql(`ALTER TABLE "export_departure_rates" ADD CONSTRAINT "export_departure_rates_country_check" CHECK ("country" IN ('FR', 'BE'));`)
    this.addSql(`ALTER TABLE "export_departure_rates" DROP CONSTRAINT IF EXISTS "export_departure_rates_amounts_check";`)
    this.addSql(`ALTER TABLE "export_departure_rates" ADD CONSTRAINT "export_departure_rates_amounts_check" CHECK (
      "price_per_kg" > 0
      AND "min_billed_kg" >= 0
      AND ("max_weight_kg" IS NULL OR "max_weight_kg" > 0)
      AND ("home_delivery_fee" IS NULL OR "home_delivery_fee" >= 0));`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "export_departure_alerts" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "country" varchar(2) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "sent_at" timestamptz NULL,
      CONSTRAINT "export_departure_alerts_pkey" PRIMARY KEY ("id")
    );`)
    // One pending alert per buyer and country (FR-032: sent once).
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "export_departure_alerts_pending_unique" ON "export_departure_alerts" ("user_id", "country") WHERE "sent_at" IS NULL;`)
    this.addSql(`ALTER TABLE "export_departure_alerts" DROP CONSTRAINT IF EXISTS "export_departure_alerts_country_check";`)
    this.addSql(`ALTER TABLE "export_departure_alerts" ADD CONSTRAINT "export_departure_alerts_country_check" CHECK ("country" IN ('FR', 'BE'));`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "export_checkout_drafts" (
      "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "departure_id" uuid NULL REFERENCES "export_departures" ("id") ON DELETE SET NULL,
      "country" varchar(2) NOT NULL,
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      "reminded_at" timestamptz NULL,
      CONSTRAINT "export_checkout_drafts_pkey" PRIMARY KEY ("user_id")
    );`)
    this.addSql(`ALTER TABLE "export_checkout_drafts" DROP CONSTRAINT IF EXISTS "export_checkout_drafts_country_check";`)
    this.addSql(`ALTER TABLE "export_checkout_drafts" ADD CONSTRAINT "export_checkout_drafts_country_check" CHECK ("country" IN ('FR', 'BE'));`)

    // ===== ORDERS AND CHECKOUTS: third pickup mode =====
    this.addSql(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_pickup_mode_check";`)
    this.addSql(`ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_mode_check" CHECK ("pickup_mode" IN (${quoteList(PICKUP_MODES)}));`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_delivery_mode_check";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_delivery_mode_check" CHECK ("delivery_mode" IN (${quoteList(PICKUP_MODES)}));`)
    // An EXPORT order never carries a delivery fee: the shipping lives on the
    // parcel, or it would be paid out to the shop (research §3).
    this.addSql(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_export_fee_check";`)
    this.addSql(`ALTER TABLE "orders" ADD CONSTRAINT "orders_export_fee_check" CHECK ("pickup_mode" <> 'EXPORT' OR "delivery_fee" = 0);`)
    this.addSql(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "export_pack_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_export_pack_id_foreign";`)
    this.addSql(`ALTER TABLE "orders" ADD CONSTRAINT "orders_export_pack_id_foreign" FOREIGN KEY ("export_pack_id") REFERENCES "export_packs" ("id") ON DELETE SET NULL;`)

    // ===== PARCELS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "export_shipments" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "checkout_id" uuid NOT NULL REFERENCES "checkouts" ("id"),
      "buyer_id" uuid NOT NULL REFERENCES "users" ("id"),
      "departure_id" uuid NOT NULL REFERENCES "export_departures" ("id"),
      "country" varchar(2) NOT NULL,
      "reception" varchar(8) NOT NULL DEFAULT 'PICKUP',
      "pickup_point_id" uuid NULL REFERENCES "export_pickup_points" ("id"),
      "home_address" text NULL,
      "estimated_weight_g" integer NOT NULL,
      "actual_weight_g" integer NULL,
      "price_per_kg" numeric(12,2) NOT NULL,
      "min_billed_kg" numeric(6,2) NOT NULL,
      "shipping_price" numeric(12,2) NOT NULL,
      "home_delivery_fee" numeric(12,2) NOT NULL DEFAULT 0,
      "insured" boolean NOT NULL DEFAULT false,
      "insurance_price" numeric(12,2) NOT NULL DEFAULT 0,
      "declared_value" numeric(12,2) NOT NULL,
      "gift_recipient_name" varchar(120) NULL,
      "gift_recipient_email" varchar(200) NULL,
      "gift_recipient_phone" varchar(20) NULL,
      "gift_message" varchar(300) NULL,
      "status" varchar(20) NOT NULL DEFAULT 'PENDING_PAYMENT',
      "supplement_status" varchar(12) NOT NULL DEFAULT 'NONE',
      "supplement_amount" numeric(12,2) NULL,
      "supplement_requested_at" timestamptz NULL,
      "pickup_reminded_at" timestamptz NULL,
      "tracking_token" varchar(32) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "export_shipments_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_checkout_id_unique";`)
    this.addSql(`ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_checkout_id_unique" UNIQUE ("checkout_id");`)
    this.addSql(`ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_tracking_token_unique";`)
    this.addSql(`ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_tracking_token_unique" UNIQUE ("tracking_token");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "export_shipments_departure_idx" ON "export_shipments" ("departure_id", "status");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "export_shipments_buyer_idx" ON "export_shipments" ("buyer_id", "created_at");`)
    this.addSql(`ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_country_check";`)
    this.addSql(`ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_country_check" CHECK ("country" IN ('FR', 'BE'));`)
    this.addSql(`ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_status_check";`)
    this.addSql(`ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_status_check" CHECK ("status" IN (${quoteList(SHIPMENT_STATUSES)}));`)
    this.addSql(`ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_supplement_status_check";`)
    this.addSql(`ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_supplement_status_check" CHECK ("supplement_status" IN ('NONE', 'REQUESTED', 'PAID', 'WAIVED', 'ITEM_REMOVED'));`)
    this.addSql(`ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_reception_check";`)
    this.addSql(`ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_reception_check" CHECK (
      ("reception" = 'PICKUP' AND "pickup_point_id" IS NOT NULL)
      OR ("reception" = 'HOME' AND "home_address" IS NOT NULL));`)
    this.addSql(`ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_amounts_check";`)
    this.addSql(`ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_amounts_check" CHECK (
      "estimated_weight_g" > 0
      AND ("actual_weight_g" IS NULL OR "actual_weight_g" > 0)
      AND "shipping_price" >= 0
      AND "home_delivery_fee" >= 0
      AND "insurance_price" >= 0
      AND "declared_value" >= 0);`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "export_shipment_events" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "shipment_id" uuid NOT NULL REFERENCES "export_shipments" ("id") ON DELETE CASCADE,
      "step" varchar(20) NULL,
      "message" text NULL,
      "pickup_point_snapshot" text NULL,
      "author_id" uuid NULL REFERENCES "users" ("id"),
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "export_shipment_events_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "export_shipment_events_shipment_idx" ON "export_shipment_events" ("shipment_id", "created_at");`)
    this.addSql(`ALTER TABLE "export_shipment_events" DROP CONSTRAINT IF EXISTS "export_shipment_events_content_check";`)
    this.addSql(`ALTER TABLE "export_shipment_events" ADD CONSTRAINT "export_shipment_events_content_check" CHECK ("step" IS NOT NULL OR "message" IS NOT NULL);`)
    this.addSql(`ALTER TABLE "export_shipment_events" DROP CONSTRAINT IF EXISTS "export_shipment_events_step_check";`)
    this.addSql(`ALTER TABLE "export_shipment_events" ADD CONSTRAINT "export_shipment_events_step_check" CHECK ("step" IS NULL OR "step" IN (${quoteList(SHIPMENT_STATUSES)}));`)

    // ===== MONEY: the EXPORT platform account =====
    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_platform_account_check";`)
    this.addSql(`ALTER TABLE "wallets" ADD CONSTRAINT "wallets_platform_account_check" CHECK ("platform_account" IS NULL OR "platform_account" IN (${quoteList(PLATFORM_ACCOUNTS)}));`)
    this.addSql(`INSERT INTO "wallets" ("id", "platform_account", "balance", "createdAt", "updatedAt")
      SELECT gen_random_uuid(), 'EXPORT', 0, NOW(), NOW()
      WHERE NOT EXISTS (SELECT 1 FROM "wallets" WHERE "platform_account" = 'EXPORT');`)
    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN (${quoteList(WALLET_TRANSACTION_TYPES)}));`)

    // ===== NOTIFICATIONS =====
    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN (${quoteList(NOTIFICATION_TYPES)}));`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN (${quoteList(NOTIFICATION_TYPES.filter(type => !EXPORT_ONLY(type)))}));`)
    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN (${quoteList(WALLET_TRANSACTION_TYPES.filter(type => !EXPORT_ONLY(type)))}));`)
    // The EXPORT wallet keeps its ledger: books are never deleted, only the constraint goes.
    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_platform_account_check";`)

    this.addSql(`DROP TABLE IF EXISTS "export_shipment_events";`)
    this.addSql(`DROP TABLE IF EXISTS "export_shipments";`)

    this.addSql(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_export_pack_id_foreign";`)
    this.addSql(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "export_pack_id";`)
    this.addSql(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_export_fee_check";`)
    this.addSql(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_pickup_mode_check";`)
    this.addSql(`ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_mode_check" CHECK ("pickup_mode" IN ('ON_SITE', 'DELIVERY'));`)
    this.addSql(`ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_delivery_mode_check";`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_delivery_mode_check" CHECK ("delivery_mode" IN ('DELIVERY', 'ON_SITE'));`)

    this.addSql(`DROP TABLE IF EXISTS "export_checkout_drafts";`)
    this.addSql(`DROP TABLE IF EXISTS "export_departure_alerts";`)
    this.addSql(`DROP TABLE IF EXISTS "export_departure_rates";`)
    this.addSql(`DROP TABLE IF EXISTS "export_departures";`)
    this.addSql(`DROP TABLE IF EXISTS "export_pickup_points";`)
    this.addSql(`DROP TABLE IF EXISTS "export_agencies";`)
    this.addSql(`DROP TABLE IF EXISTS "export_pack_items";`)
    this.addSql(`DROP TABLE IF EXISTS "export_packs";`)
    this.addSql(`DROP TABLE IF EXISTS "export_profiles";`)
  }
}

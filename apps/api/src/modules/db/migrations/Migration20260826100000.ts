import { Migration } from '@mikro-orm/migrations'

/**
 * Night batch 2026-08-26:
 * - Product composition (ingredients, allergens, labels, origin, conservation,
 *   nutrition facts) for the full product sheet.
 * - Courier declared zone (map center + radius) and plain lat/lng copies of
 *   the live position for the buyer tracking map.
 * - Delivery pickup lat/lng snapshot for the tracking map.
 * - device_tokens table: the entity existed but no migration ever created it,
 *   so push registration crashed on any migration-built database.
 */
export class Migration20260826100000 extends Migration {
  override async up(): Promise<void> {
    // ===== PRODUCTS: composition =====
    this.addSql(`ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "ingredients" text NULL,
      ADD COLUMN IF NOT EXISTS "allergens" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "labels" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "origin" varchar(255) NULL,
      ADD COLUMN IF NOT EXISTS "conservation" text NULL,
      ADD COLUMN IF NOT EXISTS "nutritional_values" jsonb NULL;`)

    // ===== COURIER PROFILES: declared zone + plain position =====
    this.addSql(`ALTER TABLE "courier_profiles"
      ADD COLUMN IF NOT EXISTS "zone_latitude" double precision NULL,
      ADD COLUMN IF NOT EXISTS "zone_longitude" double precision NULL,
      ADD COLUMN IF NOT EXISTS "zone_radius_km" double precision NULL,
      ADD COLUMN IF NOT EXISTS "last_latitude" double precision NULL,
      ADD COLUMN IF NOT EXISTS "last_longitude" double precision NULL;`)

    // ===== DELIVERIES: pickup snapshot =====
    this.addSql(`ALTER TABLE "deliveries"
      ADD COLUMN IF NOT EXISTS "pickup_latitude" double precision NULL,
      ADD COLUMN IF NOT EXISTS "pickup_longitude" double precision NULL;`)
    // Backfill from the geography column for deliveries created before this.
    this.addSql(`UPDATE "deliveries" SET
      "pickup_latitude" = ST_Y("pickup_location"::geometry),
      "pickup_longitude" = ST_X("pickup_location"::geometry)
      WHERE "pickup_location" IS NOT NULL AND "pickup_latitude" IS NULL;`)

    // ===== DEVICE TOKENS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "device_tokens" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "userId" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "token" varchar(255) NOT NULL,
      "platform" varchar(255) NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT NOW(),
      "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "device_tokens_token_unique" UNIQUE ("token")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "device_tokens_user_idx" ON "device_tokens" ("userId");`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "products"
      DROP COLUMN IF EXISTS "ingredients",
      DROP COLUMN IF EXISTS "allergens",
      DROP COLUMN IF EXISTS "labels",
      DROP COLUMN IF EXISTS "origin",
      DROP COLUMN IF EXISTS "conservation",
      DROP COLUMN IF EXISTS "nutritional_values";`)
    this.addSql(`ALTER TABLE "courier_profiles"
      DROP COLUMN IF EXISTS "zone_latitude",
      DROP COLUMN IF EXISTS "zone_longitude",
      DROP COLUMN IF EXISTS "zone_radius_km",
      DROP COLUMN IF EXISTS "last_latitude",
      DROP COLUMN IF EXISTS "last_longitude";`)
    this.addSql(`ALTER TABLE "deliveries"
      DROP COLUMN IF EXISTS "pickup_latitude",
      DROP COLUMN IF EXISTS "pickup_longitude";`)
    this.addSql(`DROP TABLE IF EXISTS "device_tokens";`)
  }
}

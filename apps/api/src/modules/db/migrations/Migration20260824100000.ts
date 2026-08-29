import { Migration } from '@mikro-orm/migrations'

export class Migration20260824100000 extends Migration {
  override async up(): Promise<void> {
    // ===== COURIER PROFILES =====
    // Statuses are varchar like every other table (no PG enums); the COURIER
    // value added to UserRole needs no schema change (users.role is varchar).
    this.addSql(`CREATE TABLE IF NOT EXISTS "courier_profiles" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "full_name" varchar(255) NOT NULL,
      "phone" varchar(30) NOT NULL,
      "vehicle_type" varchar(20) NOT NULL,
      "zone" varchar(255) NOT NULL,
      "identity_document" varchar(255) NULL,
      "validation_status" varchar(30) NOT NULL DEFAULT 'PENDING',
      "rejection_reason" text NULL,
      "is_available" boolean NOT NULL DEFAULT false,
      "last_known_location" geography(Point, 4326) NULL,
      "last_location_at" timestamptz NULL,
      "validated_at" timestamptz NULL,
      "validated_by" varchar(255) NULL,
      "createdAt" timestamptz NOT NULL DEFAULT NOW(),
      "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "courier_profiles_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "courier_profiles_user_unique" UNIQUE ("user_id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "courier_profiles_location_gist" ON "courier_profiles" USING GIST ("last_known_location");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "courier_profiles_status_idx" ON "courier_profiles" ("validation_status", "is_available");`)

    // ===== DELIVERIES =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "deliveries" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "order_id" uuid NOT NULL UNIQUE REFERENCES "orders" ("id") ON DELETE CASCADE,
      "courier_id" uuid NULL REFERENCES "courier_profiles" ("id"),
      "status" varchar(20) NOT NULL DEFAULT 'AWAITING_COURIER',
      "pickup_address" text NOT NULL,
      "pickup_location" geography(Point, 4326) NULL,
      "dropoff_address" text NOT NULL,
      "confirmation_code" varchar(4) NULL,
      "proof_type" varchar(10) NULL,
      "proof_media_id" varchar(255) NULL,
      "fail_reason" varchar(30) NULL,
      "fail_comment" text NULL,
      "offered_at" timestamptz NOT NULL DEFAULT NOW(),
      "accepted_at" timestamptz NULL,
      "picked_up_at" timestamptz NULL,
      "in_transit_at" timestamptz NULL,
      "delivered_at" timestamptz NULL,
      "failed_at" timestamptz NULL,
      "reassignment_count" int NOT NULL DEFAULT 0,
      "broadcast_radius_km" float NOT NULL DEFAULT 5,
      "createdAt" timestamptz NOT NULL DEFAULT NOW(),
      "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "deliveries_status_idx" ON "deliveries" ("status");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "deliveries_courier_idx" ON "deliveries" ("courier_id", "status");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "deliveries_pickup_location_gist" ON "deliveries" USING GIST ("pickup_location");`)

    // ===== DELIVERY EVENTS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "delivery_events" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "delivery_id" uuid NOT NULL REFERENCES "deliveries" ("id") ON DELETE CASCADE,
      "type" varchar(20) NOT NULL,
      "actor_user_id" uuid NULL,
      "payload" jsonb NULL,
      "occurred_at" timestamptz NOT NULL DEFAULT NOW(),
      "createdAt" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "delivery_events_delivery_idx" ON "delivery_events" ("delivery_id", "occurred_at");`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "delivery_events" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "deliveries" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "courier_profiles" CASCADE;`)
  }
}

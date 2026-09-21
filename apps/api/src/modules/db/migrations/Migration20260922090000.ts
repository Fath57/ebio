import { Migration } from '@mikro-orm/migrations'

/**
 * The run becomes the unit of dispatch.
 *
 * Two structural choices here:
 *
 * 1. Offers stay in `delivery_offers`, with a run column next to the delivery
 *    one. A separate table would have read more cleanly, but a courier's
 *    acceptance rate is computed on this table: leaving them here guarantees
 *    that a run offer counts like the others. An offer targets one or the
 *    other, never both.
 *
 * 2. The run gets the same dispatch columns as the delivery — pickup point,
 *    radius, offer round, targeted courier. The mechanism is identical; only
 *    the object being dispatched changes.
 */
export class Migration20260922090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "delivery_offers" ALTER COLUMN "delivery_id" DROP NOT NULL;`)
    this.addSql(`ALTER TABLE "delivery_offers" ADD COLUMN IF NOT EXISTS "delivery_run_id" uuid NULL
      REFERENCES "delivery_runs" ("id") ON DELETE CASCADE;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "delivery_offers_run_idx" ON "delivery_offers" ("delivery_run_id");`)
    // An offer targets a delivery or a run. Both at once would leave two
    // possible answers for a single refusal.
    this.addSql(`ALTER TABLE "delivery_offers" DROP CONSTRAINT IF EXISTS "delivery_offers_target_check";`)
    this.addSql(`ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_target_check"
      CHECK (("delivery_id" IS NULL) <> ("delivery_run_id" IS NULL));`)

    this.addSql(`ALTER TABLE "delivery_runs"
      ADD COLUMN IF NOT EXISTS "pickup_location" geography(Point, 4326) NULL,
      ADD COLUMN IF NOT EXISTS "offer_round" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "offered_to_courier_id" uuid NULL REFERENCES "courier_profiles" ("id"),
      ADD COLUMN IF NOT EXISTS "offered_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "dispatch_started_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "accepted_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "broadcast_radius_km" double precision NOT NULL DEFAULT 5;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "delivery_runs_pickup_gix"
      ON "delivery_runs" USING GIST ("pickup_location");`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "delivery_runs_pickup_gix";`)
    this.addSql(`ALTER TABLE "delivery_runs"
      DROP COLUMN IF EXISTS "pickup_location",
      DROP COLUMN IF EXISTS "offer_round",
      DROP COLUMN IF EXISTS "offered_to_courier_id",
      DROP COLUMN IF EXISTS "offered_at",
      DROP COLUMN IF EXISTS "dispatch_started_at",
      DROP COLUMN IF EXISTS "accepted_at",
      DROP COLUMN IF EXISTS "broadcast_radius_km";`)
    this.addSql(`ALTER TABLE "delivery_offers" DROP CONSTRAINT IF EXISTS "delivery_offers_target_check";`)
    this.addSql(`DROP INDEX IF EXISTS "delivery_offers_run_idx";`)
    this.addSql(`ALTER TABLE "delivery_offers" DROP COLUMN IF EXISTS "delivery_run_id";`)
    this.addSql(`ALTER TABLE "delivery_offers" ALTER COLUMN "delivery_id" SET NOT NULL;`)
  }
}

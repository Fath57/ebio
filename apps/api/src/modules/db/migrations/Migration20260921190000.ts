import { Migration } from '@mikro-orm/migrations'

/**
 * Grouping into runs is bounded: two shops, and no more than 3 km between
 * their pickup points.
 *
 * Direct consequence on the schema: a cart no longer yields one run but as
 * many as its split holds. `delivery_runs.checkout_id` therefore loses its
 * uniqueness, and the run gains the shops it collects from — which is what
 * lets each delivery join the right one when its order is born, before any
 * delivery exists.
 *
 * Purely additive for the data: no run in the database holds more than one
 * shop, and `supplier_ids` is filled from the deliveries already attached.
 */
export class Migration20260921190000 extends Migration {
  override async up(): Promise<void> {
    // One cart, several runs. The constraint name depends on how the table was
    // created: both spellings are covered.
    this.addSql(`ALTER TABLE "delivery_runs" DROP CONSTRAINT IF EXISTS "delivery_runs_checkout_id_key";`)
    this.addSql(`ALTER TABLE "delivery_runs" DROP CONSTRAINT IF EXISTS "delivery_runs_checkout_id_unique";`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "delivery_runs_checkout_idx" ON "delivery_runs" ("checkout_id");`)

    this.addSql(`ALTER TABLE "delivery_runs" ADD COLUMN IF NOT EXISTS "supplier_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;`)
    this.addSql(`ALTER TABLE "delivery_runs" ADD COLUMN IF NOT EXISTS "delivery_fee" numeric(12,2) NOT NULL DEFAULT 0;`)
    // Gap between the two farthest pickups. Measurement: the thresholds are
    // set, and these figures serve to tune them on facts.
    this.addSql(`ALTER TABLE "delivery_runs" ADD COLUMN IF NOT EXISTS "pickup_spread_km" double precision NULL;`)

    // Backfill: existing runs get their shops from their deliveries. Without
    // it, a delivery created afterwards would not find its run.
    this.addSql(`UPDATE "delivery_runs" r
      SET "supplier_ids" = COALESCE((
        SELECT jsonb_agg(DISTINCT o."supplier_id")
        FROM "deliveries" d
        JOIN "orders" o ON o."id" = d."order_id"
        WHERE d."delivery_run_id" = r."id"
      ), '[]'::jsonb)
      WHERE r."supplier_ids" = '[]'::jsonb;`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "delivery_runs_checkout_idx";`)
    this.addSql(`ALTER TABLE "delivery_runs" DROP COLUMN IF EXISTS "pickup_spread_km";`)
    this.addSql(`ALTER TABLE "delivery_runs" DROP COLUMN IF EXISTS "delivery_fee";`)
    this.addSql(`ALTER TABLE "delivery_runs" DROP COLUMN IF EXISTS "supplier_ids";`)
    this.addSql(`ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_checkout_id_key" UNIQUE ("checkout_id");`)
  }
}

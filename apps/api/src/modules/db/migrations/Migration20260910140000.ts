import { Migration } from '@mikro-orm/migrations'

/**
 * Early dispatch: the shop declares a preparation time when it starts
 * preparing, the run is created at once in a SCHEDULED phase and the courier
 * search starts a few minutes before the parcel is ready.
 */
export class Migration20260910140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "estimated_ready_at" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "deliveries"
      ADD COLUMN IF NOT EXISTS "pickup_ready_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "dispatch_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "dispatch_started_at" timestamptz NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "deliveries_scheduled_dispatch_idx"
      ON "deliveries" ("dispatch_at") WHERE "dispatch_phase" = 'SCHEDULED';`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "deliveries"
      DROP COLUMN IF EXISTS "pickup_ready_at",
      DROP COLUMN IF EXISTS "dispatch_at",
      DROP COLUMN IF EXISTS "dispatch_started_at";`)
    this.addSql(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "estimated_ready_at";`)
  }
}

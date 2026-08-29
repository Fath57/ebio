import { Migration } from '@mikro-orm/migrations'

/** Delivery drop-off point picked on the map at checkout. */
export class Migration20260829300000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "delivery_latitude" double precision NULL,
      ADD COLUMN IF NOT EXISTS "delivery_longitude" double precision NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "delivery_latitude",
      DROP COLUMN IF EXISTS "delivery_longitude";`)
  }
}

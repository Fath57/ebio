import { Migration } from '@mikro-orm/migrations'

/**
 * 011, wave 3: a terroir parcel's weight supplement paid by card goes
 * through a wallet top-up (the INTRAM hosted page); the parcel remembers
 * which one, so crediting it settles the supplement. Lines taken out after
 * their shop was paid, and cancelled orders already deducted, are listed on
 * the parcel so a replay deducts nothing twice.
 */
export class Migration20261118090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "export_shipments" ADD COLUMN IF NOT EXISTS "supplement_topup_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "export_shipments" ADD COLUMN IF NOT EXISTS "removed_item_ids" jsonb NOT NULL DEFAULT '[]';`)
    this.addSql(`ALTER TABLE "export_shipments" ADD COLUMN IF NOT EXISTS "removed_order_ids" jsonb NOT NULL DEFAULT '[]';`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "export_shipments_supplement_topup_idx" ON "export_shipments" ("supplement_topup_id") WHERE "supplement_topup_id" IS NOT NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "export_shipments_supplement_topup_idx";`)
    this.addSql(`ALTER TABLE "export_shipments" DROP COLUMN IF EXISTS "removed_order_ids";`)
    this.addSql(`ALTER TABLE "export_shipments" DROP COLUMN IF EXISTS "removed_item_ids";`)
    this.addSql(`ALTER TABLE "export_shipments" DROP COLUMN IF EXISTS "supplement_topup_id";`)
  }
}

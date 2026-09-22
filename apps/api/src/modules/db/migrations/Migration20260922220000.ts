import { Migration } from '@mikro-orm/migrations'

/**
 * The permanent support thread.
 *
 * The chat only knew two counterparties: a shop and a courier. A buyer who
 * opened it with neither had nobody to talk to. SUPPORT is eBio itself —
 * one thread per buyer, answered by whoever is on duty in the back-office.
 *
 * It carries no supplier and no courier, which the existing CHECK forbade;
 * the constraint gains that third shape. Written by hand and purely
 * additive, with the DROP before the ADD so the production script and this
 * migration can both run.
 */
export class Migration20260922220000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_kind_owner";`)
    this.addSql(`ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_owner"
      CHECK (
        ("kind" = 'SUPPLIER' AND "supplier_id" IS NOT NULL)
        OR ("kind" = 'COURIER' AND "courier_profile_id" IS NOT NULL AND "delivery_id" IS NOT NULL)
        OR ("kind" = 'SUPPORT' AND "supplier_id" IS NULL AND "courier_profile_id" IS NULL)
      );`)

    // One support thread per buyer, for good: the history has to stay in one
    // place, and a second thread would split it.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "conversations_support_buyer_unique"
      ON "conversations" ("buyer_id") WHERE "kind" = 'SUPPORT';`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "conversations_support_buyer_unique";`)
    this.addSql(`ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_kind_owner";`)
    this.addSql(`ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_owner"
      CHECK (
        ("kind" = 'SUPPLIER' AND "supplier_id" IS NOT NULL)
        OR ("kind" = 'COURIER' AND "courier_profile_id" IS NOT NULL AND "delivery_id" IS NOT NULL)
      );`)
  }
}

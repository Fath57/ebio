import { Migration } from '@mikro-orm/migrations'

/**
 * Courier ↔ buyer chat: a conversation is now either a SUPPLIER thread
 * (buyer ↔ shop) or a COURIER thread (buyer ↔ courier, one per delivery).
 */
export class Migration20260829500000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL DEFAULT 'SUPPLIER';`)
    this.addSql(`ALTER TABLE "conversations" ALTER COLUMN "supplier_id" DROP NOT NULL;`)
    this.addSql(`ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "courier_profile_id" uuid NULL REFERENCES "courier_profiles" ("id") ON DELETE SET NULL;`)
    this.addSql(`ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "delivery_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_kind_owner";`)
    this.addSql(`ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_owner" CHECK (
      (kind = 'SUPPLIER' AND supplier_id IS NOT NULL)
      OR (kind = 'COURIER' AND courier_profile_id IS NOT NULL AND delivery_id IS NOT NULL)
    );`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "conversations_delivery_uidx" ON "conversations" ("delivery_id") WHERE "delivery_id" IS NOT NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "conversations_courier_idx" ON "conversations" ("courier_profile_id", "last_message_at" DESC);`)
  }

  override async down(): Promise<void> {
    // COURIER threads have no supplier: they must go before NOT NULL comes back
    this.addSql(`DELETE FROM "messages" WHERE "conversation_id" IN (SELECT "id" FROM "conversations" WHERE "kind" = 'COURIER');`)
    this.addSql(`DELETE FROM "conversations" WHERE "kind" = 'COURIER';`)
    this.addSql(`DROP INDEX IF EXISTS "conversations_courier_idx";`)
    this.addSql(`DROP INDEX IF EXISTS "conversations_delivery_uidx";`)
    this.addSql(`ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_kind_owner";`)
    this.addSql(`ALTER TABLE "conversations" DROP COLUMN IF EXISTS "delivery_id";`)
    this.addSql(`ALTER TABLE "conversations" DROP COLUMN IF EXISTS "courier_profile_id";`)
    this.addSql(`ALTER TABLE "conversations" ALTER COLUMN "supplier_id" SET NOT NULL;`)
    this.addSql(`ALTER TABLE "conversations" DROP COLUMN IF EXISTS "kind";`)
  }
}

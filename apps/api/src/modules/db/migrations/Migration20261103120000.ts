import { Migration } from '@mikro-orm/migrations'

/**
 * eBio's moderation of products: pending review, refused, or withdrawn from
 * the apps. Every existing product starts APPROVED, so nothing disappears on
 * deploy. Additive only: the running code ignores the columns until deployed.
 */
export class Migration20261103120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "moderation_status" text NOT NULL DEFAULT 'APPROVED';`)
    this.addSql(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "moderation_reason" text NULL;`)
    this.addSql(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "moderated_at" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_moderation_status_check";`)
    this.addSql(`ALTER TABLE "products" ADD CONSTRAINT "products_moderation_status_check" CHECK ("moderation_status" IN ('APPROVED', 'PENDING', 'REJECTED', 'WITHDRAWN'));`)
    // The review queue reads only the few rows that are not approved.
    this.addSql(`CREATE INDEX IF NOT EXISTS "products_moderation_pending_idx" ON "products" ("moderation_status") WHERE "moderation_status" <> 'APPROVED';`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "products_moderation_pending_idx";`)
    this.addSql(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_moderation_status_check";`)
    this.addSql(`ALTER TABLE "products" DROP COLUMN IF EXISTS "moderated_at";`)
    this.addSql(`ALTER TABLE "products" DROP COLUMN IF EXISTS "moderation_reason";`)
    this.addSql(`ALTER TABLE "products" DROP COLUMN IF EXISTS "moderation_status";`)
  }
}

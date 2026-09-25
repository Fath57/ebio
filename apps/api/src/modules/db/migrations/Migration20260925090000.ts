import { Migration } from '@mikro-orm/migrations'

/**
 * The count of invitations to review the products.
 *
 * The review was asked for right after the order rating, at delivery — so a
 * product was rated before it had been opened. It now goes out hours later,
 * and these two columns hold what is needed to stop reminding forever.
 */
export class Migration20260925090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "review_invites_sent" integer NOT NULL DEFAULT 0')
    this.addSql('ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "review_invite_last_sent_at" timestamptz NULL')
    this.addSql(`CREATE INDEX IF NOT EXISTS "orders_review_invite_idx"
      ON "orders" ("status", "delivered_at")
      WHERE "status" = 'DELIVERED'`)
  }

  override async down(): Promise<void> {
    this.addSql('ALTER TABLE "orders" DROP COLUMN IF EXISTS "review_invites_sent"')
    this.addSql('ALTER TABLE "orders" DROP COLUMN IF EXISTS "review_invite_last_sent_at"')
  }
}

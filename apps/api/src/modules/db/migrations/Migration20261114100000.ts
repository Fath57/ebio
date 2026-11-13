import { Migration } from '@mikro-orm/migrations'

/**
 * What was already texted to a relative (009-diaspora-gift-order), so that a
 * replayed payment confirmation, a second pickup or a repeated cancellation
 * never sends the same SMS twice.
 *
 * Additive. Production gets the same statements from the end of
 * `scripts/2026-11-14-diaspora-gift-order.sql`.
 */
export class Migration20261114100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "checkouts"
      ADD COLUMN IF NOT EXISTS "recipient_announced_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "recipient_code_sent" varchar(4) NULL,
      ADD COLUMN IF NOT EXISTS "recipient_cancel_sent_at" timestamptz NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "checkouts"
      DROP COLUMN IF EXISTS "recipient_cancel_sent_at",
      DROP COLUMN IF EXISTS "recipient_code_sent",
      DROP COLUMN IF EXISTS "recipient_announced_at";`)
  }
}

import { Migration } from '@mikro-orm/migrations'

/**
 * The record of the terms being accepted.
 *
 * The sign-up screen already carried the checkbox, but it never left the
 * phone: it disabled the button and nothing more. In a dispute there was
 * nothing to produce.
 */
export class Migration20260925100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamptz NULL')
    this.addSql('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_from" varchar(32) NULL')
    this.addSql('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_version" varchar(32) NULL')
  }

  override async down(): Promise<void> {
    // Dropping these columns would destroy the evidence.
  }
}

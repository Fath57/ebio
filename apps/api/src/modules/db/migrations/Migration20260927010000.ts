import { Migration } from '@mikro-orm/migrations'

/**
 * The words a shop uses about itself.
 *
 * A name and a distance say where a shop is, never who it is. Nullable and
 * without a default: a shop that has not written anything has not written
 * anything, and an empty string would be indistinguishable from a deliberate
 * blank.
 */
export class Migration20260927010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "suppliers" add column if not exists "description" text null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "suppliers" drop column if exists "description";`)
  }
}

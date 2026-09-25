import { Migration } from '@mikro-orm/migrations'

/**
 * The `unaccent` extension, so search ignores accents.
 *
 * The catalogue is typed without accents — "Tomates fraiches", "Panier de
 * legumes" — while speech dictation adds them. So "légumes" found nothing, and
 * the assistant announced a shortage that did not exist.
 *
 * `unaccent` has been marked *trusted* since PostgreSQL 13: the database owner
 * can create it without being a superuser.
 */
export class Migration20260924001500 extends Migration {
  override async up(): Promise<void> {
    this.addSql('CREATE EXTENSION IF NOT EXISTS unaccent')
  }

  override async down(): Promise<void> {
    // Left in place: other queries already rely on it, and dropping it would
    // break search rather than roll anything back cleanly.
  }
}

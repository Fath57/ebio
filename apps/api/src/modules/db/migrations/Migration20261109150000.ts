import { Migration } from '@mikro-orm/migrations'

/**
 * Trigram similarity, for « Vouliez-vous dire … ? » when a search finds
 * nothing: « tomatte » must lead to « tomate ». A trusted extension, so the
 * database owner can create it. No index: the catalogue is a few hundred
 * products, read only when a search comes back empty.
 */
export class Migration20261109150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP EXTENSION IF EXISTS pg_trgm;`)
  }
}

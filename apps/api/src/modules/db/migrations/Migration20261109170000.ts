import { Migration } from '@mikro-orm/migrations'

/**
 * A shop's own payment delay for its online sales, in hours after delivery
 * (0 = at delivery); null follows the platform setting.
 *
 * The platform setting itself moves from days to hours: a row still in the
 * old shape no longer validates and the new default applies (24 h at most,
 * at once when both sides confirmed). It is removed so the back-office shows
 * the delay actually in force.
 */
export class Migration20261109170000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS escrow_release_hours integer NULL;`)
    this.addSql(`ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_escrow_release_hours_check;`)
    this.addSql(`ALTER TABLE suppliers ADD CONSTRAINT suppliers_escrow_release_hours_check CHECK (escrow_release_hours IS NULL OR escrow_release_hours BETWEEN 0 AND 1440);`)
    this.addSql(`DELETE FROM platform_settings WHERE key = 'escrow_release' AND value LIKE '%joursMaximum%';`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_escrow_release_hours_check;`)
    this.addSql(`ALTER TABLE suppliers DROP COLUMN IF EXISTS escrow_release_hours;`)
  }
}

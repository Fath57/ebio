import { Migration } from '@mikro-orm/migrations'

/**
 * 011: a terroir parcel keeps its cart as the buyer filled it (products and
 * whole packs, with their quantities). Checkout unfolds packs into the
 * shops' orders, so without it « Refaire cette valise » could not offer a
 * pack back as one line. Idempotent: replayed by the prod SQL script.
 */
export class Migration20261120090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "export_shipments" ADD COLUMN IF NOT EXISTS "cart_lines" jsonb NOT NULL DEFAULT '[]';`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "export_shipments" DROP COLUMN IF EXISTS "cart_lines";`)
  }
}

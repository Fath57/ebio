import { Migration } from '@mikro-orm/migrations'

/**
 * A format sold by the pack: « Pack de 6 » draws 6 units from the product's
 * own stock instead of keeping a stock of its own. NULL keeps the variant as
 * before (a size, a flavour, with its own stock). Additive only: the running
 * code ignores the column until it is deployed.
 */
export class Migration20261031120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "pack_size" int NULL;`)
    this.addSql(`ALTER TABLE "product_variants" DROP CONSTRAINT IF EXISTS "product_variants_pack_size_check";`)
    this.addSql(`ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_pack_size_check" CHECK ("pack_size" IS NULL OR "pack_size" BETWEEN 2 AND 1000);`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "product_variants" DROP CONSTRAINT IF EXISTS "product_variants_pack_size_check";`)
    this.addSql(`ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "pack_size";`)
  }
}

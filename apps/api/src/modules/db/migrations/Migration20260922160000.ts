import { Migration } from '@mikro-orm/migrations'

/**
 * A scheduled promotion stops discounting the product before it starts.
 *
 * `products` only ever mirrored the end of a promotion, so a price cut created
 * for next week applied the same evening: the promo price showed on the card,
 * on the detail and in the "En promotion" section. The start joins the end,
 * and a null start keeps the old meaning — applies at once — which is what the
 * legacy `setPromotion` path writes and what every existing row means.
 */
export class Migration20260922160000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "promotion_starts_at" timestamptz NULL;`)

    // Existing scheduled promotions: bring the start back from the row that
    // created them, so a promotion already leaking stops today.
    this.addSql(`UPDATE "products" p
      SET "promotion_starts_at" = pp."starts_at"
      FROM "product_promotions" pp
      WHERE pp."product_id" = p."id"
        AND pp."is_active" = true
        AND pp."type" = 'PRICE'
        AND pp."starts_at" > NOW()
        AND p."promotional_price" IS NOT NULL;`)

    // The "En promotion" section reads both shapes now: the mirrored discount
    // and the promotion rows a 1+1 or a free delivery live in.
    this.addSql(`CREATE INDEX IF NOT EXISTS "product_promotions_live_idx"
      ON "product_promotions" ("product_id", "is_active", "starts_at", "ends_at");`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "product_promotions_live_idx";`)
    this.addSql(`ALTER TABLE "products" DROP COLUMN IF EXISTS "promotion_starts_at";`)
  }
}

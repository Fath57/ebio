import { Migration } from '@mikro-orm/migrations'

/**
 * Product reviews.
 *
 * Reviews were a shop affair: one per order, on four criteria meant for a
 * seller. Nothing tied them to what was actually bought, so a product page
 * showed its shop's rating. A buyer now rates each product they received.
 *
 * The review hangs off the order line, unique: "one review per purchase"
 * becomes a database constraint rather than a check the code can forget.
 *
 * Written by hand rather than generated. `migration:create` diffs the whole
 * schema, and this one carries years of drift applied through `schema:update`
 * — the generated file wanted to drop `commission_rates` and 90 constraints
 * across the database. Purely additive here: nothing is dropped.
 *
 * Every constraint is dropped before being added: the equivalent SQL script is
 * applied to production before the container swaps, so this migration runs a
 * second time on a database that already carries them, only to register its
 * name.
 */
export class Migration20260922180442 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS "product_reviews" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "order_item_id" uuid NOT NULL REFERENCES "order_items" ("id"),
      "product_id" uuid NOT NULL REFERENCES "products" ("id"),
      "buyer_id" uuid NOT NULL REFERENCES "users" ("id"),
      "rating" smallint NOT NULL,
      "comment" text NULL,
      "is_hidden" boolean NOT NULL DEFAULT false,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    );`)

    // One review per purchase, enforced by the database.
    this.addSql(`ALTER TABLE "product_reviews" DROP CONSTRAINT IF EXISTS "product_reviews_order_item_unique";`)
    this.addSql(`ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_order_item_unique"
      UNIQUE ("order_item_id");`)

    this.addSql(`ALTER TABLE "product_reviews" DROP CONSTRAINT IF EXISTS "product_reviews_rating_check";`)
    this.addSql(`ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_rating_check"
      CHECK ("rating" BETWEEN 1 AND 5);`)

    // The reading path of the product page, in its own sort order.
    this.addSql(`CREATE INDEX IF NOT EXISTS "product_reviews_product_idx"
      ON "product_reviews" ("product_id", "is_hidden", "createdAt" DESC);`)

    this.addSql(`CREATE INDEX IF NOT EXISTS "product_reviews_buyer_idx"
      ON "product_reviews" ("buyer_id");`)

    // The aggregate the product page and the search sort read, denormalised
    // exactly like `suppliers.global_rating` / `total_reviews`. The average
    // stays null below three reviews, which drops those products to the end
    // of a `NULLS LAST` ordering without any extra code.
    this.addSql(`ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "rating_avg" real NULL,
      ADD COLUMN IF NOT EXISTS "rating_count" integer NOT NULL DEFAULT 0;`)

    // A reported product review is filed under its own type: moderation must
    // never confuse it with a shop review.
    this.addSql(`ALTER TABLE "content_reports" DROP CONSTRAINT IF EXISTS "content_reports_target_type_check";`)
    this.addSql(`ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_target_type_check"
      CHECK ("target_type" = ANY (ARRAY['PRODUCT', 'REVIEW', 'PRODUCT_REVIEW', 'PUBLICATION', 'MESSAGE']::text[]));`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "content_reports" DROP CONSTRAINT IF EXISTS "content_reports_target_type_check";`)
    this.addSql(`ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_target_type_check"
      CHECK ("target_type" = ANY (ARRAY['PRODUCT', 'REVIEW', 'PUBLICATION', 'MESSAGE']::text[]));`)
    this.addSql(`ALTER TABLE "products"
      DROP COLUMN IF EXISTS "rating_avg",
      DROP COLUMN IF EXISTS "rating_count";`)
    this.addSql(`DROP TABLE IF EXISTS "product_reviews" CASCADE;`)
  }
}

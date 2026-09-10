import { Migration } from '@mikro-orm/migrations'

const WALLET_TRANSACTION_TYPES = [
  'TOPUP',
  'ORDER_PAYMENT',
  'SALE_CREDIT',
  'COMMISSION_DEBIT',
  'WITHDRAWAL',
  'WITHDRAWAL_REFUND',
  'REFUND',
  'ADJUSTMENT',
  'PROMO_COMPENSATION',
  'DELIVERY_EARNING',
  'DELIVERY_COMMISSION',
  'TIP_PAYMENT',
  'TIP_EARNING',
  'DELIVERY_SPONSORSHIP',
]

/**
 * Product promotions as first-class rows: price cut, buy-X-get-Y and free
 * delivery, dated, created by the shop or by eBio (who pays follows who
 * created). Legacy promotional_price columns are kept in sync as a projection
 * for older app versions and seeded from them here.
 */
export class Migration20260910160000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS "product_promotions" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      "product_id" uuid NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
      "supplier_id" uuid NOT NULL REFERENCES "suppliers" ("id") ON DELETE CASCADE,
      "created_by" varchar(16) NOT NULL,
      "type" varchar(16) NOT NULL,
      "promo_price" float NULL,
      "buy_qty" int NULL,
      "get_qty" int NULL,
      "starts_at" timestamptz NOT NULL DEFAULT now(),
      "ends_at" timestamptz NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "product_promotions_product_idx" ON "product_promotions" ("product_id", "is_active");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "product_promotions_supplier_idx" ON "product_promotions" ("supplier_id", "ends_at");`)

    // Existing price promotions become rows so nothing changes for shops.
    this.addSql(`INSERT INTO "product_promotions" ("product_id", "supplier_id", "created_by", "type", "promo_price", "ends_at")
      SELECT p.id, p.supplier_id, 'SUPPLIER', 'PRICE', p.promotional_price, p.promotion_expires_at
      FROM "products" p
      WHERE p.promotional_price IS NOT NULL
        AND (p.promotion_expires_at IS NULL OR p.promotion_expires_at > now())
        AND NOT EXISTS (SELECT 1 FROM "product_promotions" pp WHERE pp.product_id = p.id AND pp.type = 'PRICE');`)

    this.addSql(`ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "delivery_sponsor" varchar(16) NULL,
      ADD COLUMN IF NOT EXISTS "sponsored_delivery_fee" float NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "platform_promo_compensation" float NOT NULL DEFAULT 0;`)
    this.addSql(`ALTER TABLE "order_items"
      ADD COLUMN IF NOT EXISTS "promotion_id" uuid NULL REFERENCES "product_promotions" ("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "is_gift" boolean NOT NULL DEFAULT false;`)

    this.addSql(`INSERT INTO permissions (id, action, subject, description, created_at)
      VALUES (gen_random_uuid(), 'manage', 'Promotion', 'Créer des promotions eBio sur les produits', NOW())
      ON CONFLICT (action, subject) DO UPDATE SET description = EXCLUDED.description;`)

    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check"
      CHECK ("type" IN (${WALLET_TRANSACTION_TYPES.map(t => `'${t}'`).join(', ')}));`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "promotion_id", DROP COLUMN IF EXISTS "is_gift";`)
    this.addSql(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_sponsor", DROP COLUMN IF EXISTS "sponsored_delivery_fee", DROP COLUMN IF EXISTS "platform_promo_compensation";`)
    this.addSql(`DROP TABLE IF EXISTS "product_promotions";`)
    // The widened CHECK stays: narrowing it back would reject existing rows.
  }
}

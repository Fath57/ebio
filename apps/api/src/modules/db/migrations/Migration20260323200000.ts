import { Migration } from '@mikro-orm/migrations'

export class Migration20260323200000 extends Migration {
  override async up(): Promise<void> {
    // Categories table
    this.addSql(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "icon" varchar(255) NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
      );
    `)
    this.addSql(`CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" ("slug");`)

    // Suppliers table
    this.addSql(`
      CREATE TABLE "suppliers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "shop_name" varchar(255) NOT NULL,
        "type" varchar(255) NOT NULL,
        "cover_photo" varchar(255) NULL,
        "profile_photo" varchar(255) NULL,
        "location" geography(Point, 4326) NULL,
        "address" varchar(255) NULL,
        "neighborhood" varchar(255) NULL,
        "mobile_money_number" varchar(255) NULL,
        "validation_status" varchar(255) NOT NULL DEFAULT 'PENDING',
        "mode" varchar(255) NOT NULL DEFAULT 'CONTACT',
        "opening_hours" jsonb NULL,
        "global_rating" real NULL,
        "total_reviews" int NOT NULL DEFAULT 0,
        "identity_document" varchar(255) NULL,
        "business_proof" varchar(255) NULL,
        "validated_at" timestamptz NULL,
        "validated_by" varchar(255) NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "suppliers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE NO ACTION
      );
    `)
    this.addSql(`CREATE INDEX "suppliers_location_index" ON "suppliers" USING GiST ("location");`)

    // Products table
    this.addSql(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "supplier_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text NULL,
        "voice_description_url" varchar(255) NULL,
        "photos" jsonb NOT NULL DEFAULT '[]',
        "price_per_unit" real NOT NULL,
        "unit" varchar(255) NOT NULL,
        "stock" int NOT NULL DEFAULT 0,
        "stock_alert_threshold" int NOT NULL DEFAULT 5,
        "status" varchar(255) NOT NULL DEFAULT 'ACTIVE',
        "promotional_price" real NULL,
        "promotion_expires_at" timestamptz NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON UPDATE CASCADE ON DELETE NO ACTION,
        CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON UPDATE CASCADE ON DELETE NO ACTION
      );
    `)
    this.addSql(`CREATE INDEX "products_supplier_category_status_index" ON "products" ("supplier_id", "category_id", "status");`)

    // Product variants table
    this.addSql(`
      CREATE TABLE "product_variants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "label" varchar(255) NOT NULL,
        "price_per_unit" real NOT NULL,
        "stock" int NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON UPDATE CASCADE ON DELETE NO ACTION
      );
    `)

    // Full-text search GIN indexes for T039
    this.addSql(`CREATE INDEX "products_name_search_index" ON "products" USING GIN (to_tsvector('french', "name"));`)
    this.addSql(`CREATE INDEX "suppliers_shop_name_search_index" ON "suppliers" USING GIN (to_tsvector('french', "shop_name"));`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "product_variants" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "products" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "suppliers" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "categories" CASCADE;`)
  }
}

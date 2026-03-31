import { Migration } from '@mikro-orm/migrations'

export class Migration20260326100000 extends Migration {
  override async up(): Promise<void> {
    // ===== MEDIA =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "media" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "uploaded_by" uuid NULL REFERENCES "users" ("id") ON DELETE SET NULL,
      "type" varchar(20) NOT NULL,
      "context" varchar(30) NOT NULL,
      "status" varchar(20) NOT NULL DEFAULT 'PENDING',
      "original_name" varchar(255) NOT NULL,
      "mime_type" varchar(100) NOT NULL,
      "original_size" int NOT NULL,
      "s3_key" varchar(500) NOT NULL,
      "s3_bucket" varchar(100) NOT NULL,
      "optimized_key" varchar(500) NULL,
      "optimized_size" int NULL,
      "thumbnail_key" varchar(500) NULL,
      "width" int NULL,
      "height" int NULL,
      "duration" float NULL,
      "entity_type" varchar(50) NULL,
      "entity_id" uuid NULL,
      "public_url" varchar(500) NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "media_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "media_entity_idx" ON "media" ("entity_type", "entity_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "media_uploaded_by_idx" ON "media" ("uploaded_by");`)

    // ===== STOCK ALERTS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "stock_alerts" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "buyer_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "product_id" uuid NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
      "notified_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "stock_alerts_buyer_product_unique" UNIQUE ("buyer_id", "product_id")
    );`)

    // ===== DELIVERY ZONES =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "delivery_zones" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "supplier_id" uuid NOT NULL REFERENCES "suppliers" ("id") ON DELETE CASCADE,
      "polygon" geography(Polygon, 4326) NULL,
      "delivery_fee" float NOT NULL DEFAULT 0,
      "estimated_minutes" int NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "delivery_zones_polygon_gist" ON "delivery_zones" USING GIST ("polygon");`)

    // ===== ORDERS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "orders" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "order_number" varchar(30) NOT NULL UNIQUE,
      "buyer_id" uuid NOT NULL REFERENCES "users" ("id"),
      "supplier_id" uuid NOT NULL REFERENCES "suppliers" ("id"),
      "status" varchar(20) NOT NULL DEFAULT 'PLACED',
      "pickup_mode" varchar(20) NOT NULL,
      "payment_method" varchar(20) NOT NULL,
      "delivery_address" text NULL,
      "delivery_slot" varchar(200) NULL,
      "total_amount" float NOT NULL,
      "commission_rate" float NOT NULL DEFAULT 0,
      "commission_amount" float NOT NULL DEFAULT 0,
      "delivery_confirmed_by_buyer" boolean NOT NULL DEFAULT false,
      "delivery_confirmed_by_supplier" boolean NOT NULL DEFAULT false,
      "accepted_at" timestamptz NULL,
      "delivered_at" timestamptz NULL,
      "escrow_released_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "orders_buyer_status_idx" ON "orders" ("buyer_id", "status");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "orders_supplier_status_idx" ON "orders" ("supplier_id", "status");`)

    // ===== ORDER ITEMS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "order_items" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "order_id" uuid NOT NULL REFERENCES "orders" ("id") ON DELETE CASCADE,
      "product_id" uuid NOT NULL REFERENCES "products" ("id"),
      "variant_id" uuid NULL REFERENCES "product_variants" ("id"),
      "quantity" int NOT NULL,
      "unit_price" float NOT NULL,
      "total_price" float NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
    );`)

    // ===== PAYMENTS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "payments" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "order_id" uuid NOT NULL UNIQUE REFERENCES "orders" ("id"),
      "amount" float NOT NULL,
      "provider" varchar(50) NOT NULL DEFAULT 'fedapay',
      "provider_transaction_id" varchar(255) NULL,
      "provider_reference" varchar(255) NULL,
      "provider_payment_method_id" varchar(255) NULL,
      "payment_method" varchar(50) NOT NULL DEFAULT 'fedapay_checkout',
      "operator" varchar(20) NULL,
      "phone_number" varchar(20) NULL,
      "status" varchar(20) NOT NULL DEFAULT 'PENDING',
      "paid_at" timestamptz NULL,
      "released_at" timestamptz NULL,
      "refunded_at" timestamptz NULL,
      "receipt_url" varchar(500) NULL,
      "createdAt" timestamptz NOT NULL DEFAULT NOW(),
      "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_provider_transaction_id_unique" ON "payments" ("provider", "provider_transaction_id") WHERE "provider_transaction_id" IS NOT NULL;`)

    // ===== DISPUTES =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "disputes" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "order_id" uuid NOT NULL UNIQUE REFERENCES "orders" ("id"),
      "opened_by" uuid NOT NULL REFERENCES "users" ("id"),
      "reason" text NOT NULL,
      "status" varchar(20) NOT NULL DEFAULT 'OPEN',
      "admin_notes" text NULL,
      "resolved_at" timestamptz NULL,
      "resolved_by" uuid NULL REFERENCES "users" ("id"),
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
    );`)

    // ===== CONVERSATIONS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "conversations" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "buyer_id" uuid NOT NULL REFERENCES "users" ("id"),
      "supplier_id" uuid NOT NULL REFERENCES "suppliers" ("id"),
      "order_id" uuid NULL,
      "last_message_at" timestamptz NULL,
      "archived_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "conversations_buyer_idx" ON "conversations" ("buyer_id", "last_message_at" DESC);`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "conversations_supplier_idx" ON "conversations" ("supplier_id", "last_message_at" DESC);`)

    // ===== MESSAGES =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "messages" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "conversation_id" uuid NOT NULL REFERENCES "conversations" ("id") ON DELETE CASCADE,
      "sender_id" uuid NOT NULL REFERENCES "users" ("id"),
      "type" varchar(20) NOT NULL DEFAULT 'TEXT',
      "content" text NULL,
      "media_url" varchar(500) NULL,
      "latitude" float NULL,
      "longitude" float NULL,
      "read_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "messages_conversation_idx" ON "messages" ("conversation_id", "created_at");`)

    // ===== REVIEWS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "reviews" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "buyer_id" uuid NOT NULL REFERENCES "users" ("id"),
      "supplier_id" uuid NOT NULL REFERENCES "suppliers" ("id"),
      "order_id" uuid NULL REFERENCES "orders" ("id"),
      "transaction_type" varchar(20) NOT NULL,
      "quality_rating" smallint NOT NULL,
      "delay_rating" smallint NOT NULL,
      "communication_rating" smallint NOT NULL,
      "conformity_rating" smallint NOT NULL,
      "comment" text NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "reviews_buyer_order_unique" UNIQUE ("buyer_id", "order_id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "reviews_supplier_idx" ON "reviews" ("supplier_id", "created_at" DESC);`)

    // ===== BADGES =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "badges" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "supplier_id" uuid NOT NULL REFERENCES "suppliers" ("id") ON DELETE CASCADE,
      "type" varchar(20) NOT NULL,
      "granted_at" timestamptz NOT NULL DEFAULT NOW(),
      "granted_by" varchar(100) NULL,
      "expires_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
    );`)

    // ===== COMMUNITY GROUPS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "community_groups" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "name" varchar(100) NOT NULL,
      "type" varchar(20) NOT NULL,
      "sector" varchar(50) NULL,
      "region" varchar(100) NULL,
      "commune" varchar(100) NULL,
      "member_count" int NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "community_groups_pkey" PRIMARY KEY ("id")
    );`)

    // ===== GROUP MEMBERSHIPS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "group_memberships" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "group_id" uuid NOT NULL REFERENCES "community_groups" ("id") ON DELETE CASCADE,
      "joined_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "group_memberships_user_group_unique" UNIQUE ("user_id", "group_id")
    );`)

    // ===== PUBLICATIONS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "publications" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "author_id" uuid NOT NULL REFERENCES "users" ("id"),
      "group_id" uuid NOT NULL REFERENCES "community_groups" ("id") ON DELETE CASCADE,
      "type" varchar(30) NOT NULL,
      "content" text NOT NULL,
      "media_urls" jsonb NOT NULL DEFAULT '[]',
      "report_count" int NOT NULL DEFAULT 0,
      "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
    );`)

    // ===== TRAINING MODULES =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "training_modules" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "title" varchar(200) NOT NULL,
      "theme" varchar(100) NOT NULL,
      "format" varchar(20) NOT NULL,
      "duration_seconds" int NOT NULL,
      "content_url" varchar(500) NOT NULL,
      "thumbnail_url" varchar(500) NOT NULL,
      "quiz_data" jsonb NULL,
      "downloadable" boolean NOT NULL DEFAULT true,
      "download_count" int NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "training_modules_pkey" PRIMARY KEY ("id")
    );`)

    // ===== TRAINING COMPLETIONS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "training_completions" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "module_id" uuid NOT NULL REFERENCES "training_modules" ("id") ON DELETE CASCADE,
      "quiz_score" float NOT NULL,
      "completed_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "training_completions_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "training_completions_user_module_unique" UNIQUE ("user_id", "module_id")
    );`)

    // ===== SUBSCRIPTION PLANS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "subscription_plans" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "name" varchar(30) NOT NULL UNIQUE,
      "price_monthly" int NOT NULL DEFAULT 0,
      "max_products" int NULL,
      "order_mode_enabled" boolean NOT NULL DEFAULT false,
      "advanced_analytics" boolean NOT NULL DEFAULT false,
      "free_commission_orders" int NOT NULL DEFAULT 0,
      "max_members" int NOT NULL DEFAULT 1,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
    );`)

    // ===== SUBSCRIPTIONS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "subscriptions" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "supplier_id" uuid NOT NULL REFERENCES "suppliers" ("id"),
      "plan_id" uuid NOT NULL REFERENCES "subscription_plans" ("id"),
      "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
      "start_date" timestamptz NOT NULL DEFAULT NOW(),
      "end_date" timestamptz NOT NULL,
      "auto_renew" boolean NOT NULL DEFAULT true,
      "payment_id" varchar(100) NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
    );`)

    // ===== CONTENT REPORTS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "content_reports" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "reporter_id" uuid NOT NULL REFERENCES "users" ("id"),
      "target_type" varchar(30) NOT NULL,
      "target_id" uuid NOT NULL,
      "reason" text NOT NULL,
      "status" varchar(20) NOT NULL DEFAULT 'PENDING',
      "admin_note" text NULL,
      "resolved_by" uuid NULL REFERENCES "users" ("id"),
      "resolved_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
    );`)

    // ===== NOTIFICATIONS =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "notifications" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "type" varchar(30) NOT NULL,
      "title" varchar(200) NOT NULL,
      "body" text NOT NULL,
      "data" jsonb NULL,
      "channel" varchar(20) NOT NULL,
      "read_at" timestamptz NULL,
      "sent_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" ("user_id", "read_at");`)

    // ===== COMMISSION RATES =====
    this.addSql(`CREATE TABLE IF NOT EXISTS "commission_rates" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "category_slug" varchar(50) NOT NULL UNIQUE,
      "rate" float NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("id")
    );`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "commission_rates" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "notifications" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "content_reports" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "subscriptions" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "subscription_plans" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "training_completions" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "training_modules" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "publications" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "group_memberships" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "community_groups" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "badges" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "reviews" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "messages" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "conversations" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "disputes" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "payments" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "order_items" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "orders" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "delivery_zones" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "stock_alerts" CASCADE;`)
    this.addSql(`DROP TABLE IF EXISTS "media" CASCADE;`)
  }
}

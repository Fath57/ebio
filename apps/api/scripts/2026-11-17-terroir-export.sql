-- Terroir vers l'étranger (011-terroir-export).
--
-- Équivalent SQL de Migration20261117090000, à appliquer AVANT la bascule du
-- conteneur : le registre `mikro_orm_migrations` de production est
-- désynchronisé, donc `migration:up` sans `--only` échoue sur les anciennes.
-- Une fois ce fichier joué, enregistrer le nom avec
-- `migration:up --only Migration20261117090000` (les ordres sont idempotents).
-- Contient aussi Migration20261118090000, Migration20261119090000 (table
-- `export_countries` : les CHECK (FR, BE) deviennent des clés étrangères),
-- Migration20261120090000 (panier d'origine du colis) et Migration20261121090000
-- (validation d'export automatique), à enregistrer de la même façon.
--
-- Purement additif : onze tables (catalogue d'export, agences, départs,
-- colis), une colonne `orders.export_pack_id`, un troisième mode de retrait
-- `EXPORT`, le compte plateforme `EXPORT` (solde 0) et des contraintes
-- d'énumération élargies. Rien n'est supprimé. Toute contrainte est précédée
-- de son `DROP ... IF EXISTS` : le fichier se rejoue sans erreur.
--
-- Le module reste fermé (`terroir_export_enabled` absent = faux).
--
--   ssh digit_immo_server "dokku postgres:connect ebio-postgres" < this-file.sql

BEGIN;

CREATE TABLE IF NOT EXISTS "export_profiles" (
  "product_id" uuid NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
  "status" varchar(10) NOT NULL DEFAULT 'PENDING',
  "packed_weight_g" integer NOT NULL,
  "length_cm" integer NULL,
  "width_cm" integer NULL,
  "height_cm" integer NULL,
  "shelf_life_days" integer NOT NULL,
  "origin_producer" varchar(120) NULL,
  "origin_place" varchar(120) NULL,
  "origin_year" smallint NULL,
  "origin_method" varchar(300) NULL,
  "origin_photos" jsonb NOT NULL DEFAULT '[]',
  "label_photo" text NULL,
  "checklist" jsonb NOT NULL DEFAULT '{}',
  "reviewed_by" uuid NULL REFERENCES "users" ("id"),
  "reviewed_at" timestamptz NULL,
  "rejection_reason" varchar(500) NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "export_profiles_pkey" PRIMARY KEY ("product_id")
);
CREATE INDEX IF NOT EXISTS "export_profiles_status_idx" ON "export_profiles" ("status");
ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_status_check";
-- Anciens et nouveaux statuts admis ici pour que le fichier se rejoue après Migration20261121090000,
-- qui resserre la liste plus bas.
ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPORTABLE', 'INCOMPLETE', 'WITHDRAWN'));
ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_sizes_check";
ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_sizes_check" CHECK (
  "packed_weight_g" > 0
  AND "shelf_life_days" > 0
  AND ("length_cm" IS NULL OR "length_cm" > 0)
  AND ("width_cm" IS NULL OR "width_cm" > 0)
  AND ("height_cm" IS NULL OR "height_cm" > 0)
  AND jsonb_array_length("origin_photos") <= 3);
ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_label_check";
ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_label_check" CHECK ("status" <> 'APPROVED' OR "label_photo" IS NOT NULL);
CREATE TABLE IF NOT EXISTS "export_packs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "supplier_id" uuid NULL REFERENCES "suppliers" ("id"),
  "name" varchar(120) NOT NULL,
  "description" text NULL,
  "photos" jsonb NOT NULL DEFAULT '[]',
  "price" numeric(12,2) NOT NULL,
  "status" varchar(10) NOT NULL DEFAULT 'PENDING',
  "rejection_reason" varchar(500) NULL,
  "reviewed_by" uuid NULL REFERENCES "users" ("id"),
  "reviewed_at" timestamptz NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "export_packs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "export_packs_supplier_idx" ON "export_packs" ("supplier_id");
ALTER TABLE "export_packs" DROP CONSTRAINT IF EXISTS "export_packs_status_check";
ALTER TABLE "export_packs" ADD CONSTRAINT "export_packs_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'RETIRED', 'EXPORTABLE', 'INCOMPLETE', 'WITHDRAWN'));
ALTER TABLE "export_packs" DROP CONSTRAINT IF EXISTS "export_packs_price_check";
ALTER TABLE "export_packs" ADD CONSTRAINT "export_packs_price_check" CHECK ("price" > 0);
CREATE TABLE IF NOT EXISTS "export_pack_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "pack_id" uuid NOT NULL REFERENCES "export_packs" ("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products" ("id"),
  "variant_id" uuid NULL REFERENCES "product_variants" ("id"),
  "quantity" integer NOT NULL,
  CONSTRAINT "export_pack_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "export_pack_items_pack_idx" ON "export_pack_items" ("pack_id");
CREATE INDEX IF NOT EXISTS "export_pack_items_product_idx" ON "export_pack_items" ("product_id");
ALTER TABLE "export_pack_items" DROP CONSTRAINT IF EXISTS "export_pack_items_quantity_check";
ALTER TABLE "export_pack_items" ADD CONSTRAINT "export_pack_items_quantity_check" CHECK ("quantity" > 0);
CREATE TABLE IF NOT EXISTS "export_agencies" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" varchar(120) NOT NULL,
  "contact_name" varchar(120) NULL,
  "contact_phone" varchar(30) NULL,
  "contact_email" varchar(200) NULL,
  "notes" text NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "export_agencies_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "export_pickup_points" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "agency_id" uuid NOT NULL REFERENCES "export_agencies" ("id"),
  "country" varchar(2) NOT NULL,
  "city" varchar(80) NOT NULL,
  "address" text NOT NULL,
  "opening_hours" text NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "export_pickup_points_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "export_pickup_points_agency_idx" ON "export_pickup_points" ("agency_id");
ALTER TABLE "export_pickup_points" DROP CONSTRAINT IF EXISTS "export_pickup_points_country_check";
ALTER TABLE "export_pickup_points" ADD CONSTRAINT "export_pickup_points_country_check" CHECK ("country" IN ('FR', 'BE'));
CREATE TABLE IF NOT EXISTS "export_departures" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "agency_id" uuid NOT NULL REFERENCES "export_agencies" ("id"),
  "departs_on" date NOT NULL,
  "deposit_deadline" timestamptz NOT NULL,
  "transit_min_days" smallint NOT NULL,
  "transit_max_days" smallint NOT NULL,
  "capacity_kg" numeric(8,2) NULL,
  "status" varchar(10) NOT NULL DEFAULT 'OPEN',
  "fill_alerted_at" timestamptz NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "export_departures_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "export_departures_status_idx" ON "export_departures" ("status", "departs_on");
ALTER TABLE "export_departures" DROP CONSTRAINT IF EXISTS "export_departures_status_check";
ALTER TABLE "export_departures" ADD CONSTRAINT "export_departures_status_check" CHECK ("status" IN ('OPEN', 'FULL', 'CANCELLED', 'DEPARTED'));
ALTER TABLE "export_departures" DROP CONSTRAINT IF EXISTS "export_departures_transit_check";
ALTER TABLE "export_departures" ADD CONSTRAINT "export_departures_transit_check" CHECK (
  "transit_min_days" >= 0
  AND "transit_min_days" <= "transit_max_days"
  AND ("capacity_kg" IS NULL OR "capacity_kg" > 0));
CREATE TABLE IF NOT EXISTS "export_departure_rates" (
  "departure_id" uuid NOT NULL REFERENCES "export_departures" ("id") ON DELETE CASCADE,
  "country" varchar(2) NOT NULL,
  "price_per_kg" numeric(12,2) NOT NULL,
  "min_billed_kg" numeric(6,2) NOT NULL DEFAULT 0,
  "max_weight_kg" numeric(6,2) NULL,
  "home_delivery_fee" numeric(12,2) NULL,
  CONSTRAINT "export_departure_rates_pkey" PRIMARY KEY ("departure_id", "country")
);
ALTER TABLE "export_departure_rates" DROP CONSTRAINT IF EXISTS "export_departure_rates_country_check";
ALTER TABLE "export_departure_rates" ADD CONSTRAINT "export_departure_rates_country_check" CHECK ("country" IN ('FR', 'BE'));
ALTER TABLE "export_departure_rates" DROP CONSTRAINT IF EXISTS "export_departure_rates_amounts_check";
ALTER TABLE "export_departure_rates" ADD CONSTRAINT "export_departure_rates_amounts_check" CHECK (
  "price_per_kg" > 0
  AND "min_billed_kg" >= 0
  AND ("max_weight_kg" IS NULL OR "max_weight_kg" > 0)
  AND ("home_delivery_fee" IS NULL OR "home_delivery_fee" >= 0));
CREATE TABLE IF NOT EXISTS "export_departure_alerts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "country" varchar(2) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "sent_at" timestamptz NULL,
  CONSTRAINT "export_departure_alerts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "export_departure_alerts_pending_unique" ON "export_departure_alerts" ("user_id", "country") WHERE "sent_at" IS NULL;
ALTER TABLE "export_departure_alerts" DROP CONSTRAINT IF EXISTS "export_departure_alerts_country_check";
ALTER TABLE "export_departure_alerts" ADD CONSTRAINT "export_departure_alerts_country_check" CHECK ("country" IN ('FR', 'BE'));
CREATE TABLE IF NOT EXISTS "export_checkout_drafts" (
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "departure_id" uuid NULL REFERENCES "export_departures" ("id") ON DELETE SET NULL,
  "country" varchar(2) NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  "reminded_at" timestamptz NULL,
  CONSTRAINT "export_checkout_drafts_pkey" PRIMARY KEY ("user_id")
);
ALTER TABLE "export_checkout_drafts" DROP CONSTRAINT IF EXISTS "export_checkout_drafts_country_check";
ALTER TABLE "export_checkout_drafts" ADD CONSTRAINT "export_checkout_drafts_country_check" CHECK ("country" IN ('FR', 'BE'));
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_pickup_mode_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_mode_check" CHECK ("pickup_mode" IN ('ON_SITE', 'DELIVERY', 'EXPORT'));
ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_delivery_mode_check";
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_delivery_mode_check" CHECK ("delivery_mode" IN ('ON_SITE', 'DELIVERY', 'EXPORT'));
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_export_fee_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_export_fee_check" CHECK ("pickup_mode" <> 'EXPORT' OR "delivery_fee" = 0);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "export_pack_id" uuid NULL;
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_export_pack_id_foreign";
ALTER TABLE "orders" ADD CONSTRAINT "orders_export_pack_id_foreign" FOREIGN KEY ("export_pack_id") REFERENCES "export_packs" ("id") ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS "export_shipments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "checkout_id" uuid NOT NULL REFERENCES "checkouts" ("id"),
  "buyer_id" uuid NOT NULL REFERENCES "users" ("id"),
  "departure_id" uuid NOT NULL REFERENCES "export_departures" ("id"),
  "country" varchar(2) NOT NULL,
  "reception" varchar(8) NOT NULL DEFAULT 'PICKUP',
  "pickup_point_id" uuid NULL REFERENCES "export_pickup_points" ("id"),
  "home_address" text NULL,
  "estimated_weight_g" integer NOT NULL,
  "actual_weight_g" integer NULL,
  "price_per_kg" numeric(12,2) NOT NULL,
  "min_billed_kg" numeric(6,2) NOT NULL,
  "shipping_price" numeric(12,2) NOT NULL,
  "home_delivery_fee" numeric(12,2) NOT NULL DEFAULT 0,
  "insured" boolean NOT NULL DEFAULT false,
  "insurance_price" numeric(12,2) NOT NULL DEFAULT 0,
  "declared_value" numeric(12,2) NOT NULL,
  "gift_recipient_name" varchar(120) NULL,
  "gift_recipient_email" varchar(200) NULL,
  "gift_recipient_phone" varchar(20) NULL,
  "gift_message" varchar(300) NULL,
  "status" varchar(20) NOT NULL DEFAULT 'PENDING_PAYMENT',
  "supplement_status" varchar(12) NOT NULL DEFAULT 'NONE',
  "supplement_amount" numeric(12,2) NULL,
  "supplement_requested_at" timestamptz NULL,
  "pickup_reminded_at" timestamptz NULL,
  "tracking_token" varchar(32) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "export_shipments_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_checkout_id_unique";
ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_checkout_id_unique" UNIQUE ("checkout_id");
ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_tracking_token_unique";
ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_tracking_token_unique" UNIQUE ("tracking_token");
CREATE INDEX IF NOT EXISTS "export_shipments_departure_idx" ON "export_shipments" ("departure_id", "status");
CREATE INDEX IF NOT EXISTS "export_shipments_buyer_idx" ON "export_shipments" ("buyer_id", "created_at");
ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_country_check";
ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_country_check" CHECK ("country" IN ('FR', 'BE'));
ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_status_check";
ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_status_check" CHECK ("status" IN ('PENDING_PAYMENT', 'PAID', 'COLLECTING', 'PACKED', 'DROPPED_AT_AGENCY', 'DEPARTED', 'ARRIVED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'HANDED_OVER', 'LOST', 'DAMAGED', 'CANCELLED'));
ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_supplement_status_check";
ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_supplement_status_check" CHECK ("supplement_status" IN ('NONE', 'REQUESTED', 'PAID', 'WAIVED', 'ITEM_REMOVED'));
ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_reception_check";
ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_reception_check" CHECK (
  ("reception" = 'PICKUP' AND "pickup_point_id" IS NOT NULL)
  OR ("reception" = 'HOME' AND "home_address" IS NOT NULL));
ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_amounts_check";
ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_amounts_check" CHECK (
  "estimated_weight_g" > 0
  AND ("actual_weight_g" IS NULL OR "actual_weight_g" > 0)
  AND "shipping_price" >= 0
  AND "home_delivery_fee" >= 0
  AND "insurance_price" >= 0
  AND "declared_value" >= 0);
CREATE TABLE IF NOT EXISTS "export_shipment_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "shipment_id" uuid NOT NULL REFERENCES "export_shipments" ("id") ON DELETE CASCADE,
  "step" varchar(20) NULL,
  "message" text NULL,
  "pickup_point_snapshot" text NULL,
  "author_id" uuid NULL REFERENCES "users" ("id"),
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "export_shipment_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "export_shipment_events_shipment_idx" ON "export_shipment_events" ("shipment_id", "created_at");
ALTER TABLE "export_shipment_events" DROP CONSTRAINT IF EXISTS "export_shipment_events_content_check";
ALTER TABLE "export_shipment_events" ADD CONSTRAINT "export_shipment_events_content_check" CHECK ("step" IS NOT NULL OR "message" IS NOT NULL);
ALTER TABLE "export_shipment_events" DROP CONSTRAINT IF EXISTS "export_shipment_events_step_check";
ALTER TABLE "export_shipment_events" ADD CONSTRAINT "export_shipment_events_step_check" CHECK ("step" IS NULL OR "step" IN ('PENDING_PAYMENT', 'PAID', 'COLLECTING', 'PACKED', 'DROPPED_AT_AGENCY', 'DEPARTED', 'ARRIVED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'HANDED_OVER', 'LOST', 'DAMAGED', 'CANCELLED'));
ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_platform_account_check";
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_platform_account_check" CHECK ("platform_account" IS NULL OR "platform_account" IN ('SALES_COMMISSION', 'DELIVERY_COMMISSION', 'BANNERS', 'MARKETING', 'EXPORT'));
INSERT INTO "wallets" ("id", "platform_account", "balance", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), 'EXPORT', 0, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "wallets" WHERE "platform_account" = 'EXPORT');
ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN ('TOPUP', 'ORDER_PAYMENT', 'SALE_CREDIT', 'COMMISSION_DEBIT', 'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'REFUND', 'ADJUSTMENT', 'PROMO_COMPENSATION', 'DELIVERY_EARNING', 'DELIVERY_COMMISSION', 'TIP_PAYMENT', 'TIP_EARNING', 'DELIVERY_SPONSORSHIP', 'BANNER_PAYMENT', 'BANNER_REFUND', 'REFERRAL_REWARD', 'PLATFORM_COMMISSION', 'PLATFORM_DELIVERY_SHARE', 'PLATFORM_BANNER', 'PLATFORM_MARKETING', 'FAMILY_TRANSFER_OUT', 'FAMILY_TRANSFER_IN', 'FAMILY_CLOSURE_OUT', 'FAMILY_CLOSURE_IN', 'EXPORT_SHIPPING_INCOME', 'EXPORT_INSURANCE_INCOME', 'EXPORT_LOSS', 'EXPORT_PACK_COMPENSATION'));
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN ('ORDER_PLACED', 'ORDER_ACCEPTED', 'ORDER_REJECTED', 'ORDER_READY', 'ORDER_DELIVERED', 'ORDER_CANCELLED', 'PAYMENT_RECEIVED', 'PAYMENT_RELEASED', 'DISPUTE_OPENED', 'DISPUTE_RESOLVED', 'SUPPLIER_VALIDATED', 'SUPPLIER_REJECTED', 'SUPPLIER_COMPLEMENT', 'STOCK_ALERT', 'STOCK_AVAILABLE', 'NEW_MESSAGE', 'NEW_REVIEW', 'PRODUCT_REVIEW_INVITE', 'CART_REMINDER', 'ESCROW_REMINDER', 'PROMOTIONAL', 'SYSTEM', 'DELIVERY_OFFER', 'DELIVERY_ASSIGNED', 'DELIVERY_PICKED_UP', 'DELIVERY_FAILED', 'DELIVERY_REASSIGNED', 'DELIVERY_PICKUP_REMINDER', 'DELIVERY_WINDOW_CHANGED', 'COURIER_VALIDATED', 'COURIER_REJECTED', 'COURIER_SUSPENDED', 'COURIER_EARNING', 'COURIER_PAYOUT', 'COURIER_RATED', 'COURIER_TIP', 'REFERRAL_REWARD', 'BANNER_APPROVED', 'BANNER_REJECTED', 'GIFT_DELIVERED', 'GIFT_DELIVERY_FAILED', 'FAMILY_WALLET_TOPUP', 'FAMILY_WALLET_PURCHASE', 'FAMILY_WALLET_LOW_BALANCE', 'FAMILY_WALLET_MEMBER_JOINED', 'FAMILY_WALLET_MEMBER_PENDING', 'FAMILY_WALLET_STATUS', 'EXPORT_SHIPMENT_UPDATE', 'EXPORT_DEPARTURE_OPEN', 'EXPORT_DEADLINE_REMINDER', 'EXPORT_WEIGHT_SUPPLEMENT', 'EXPORT_PRODUCT_REVIEWED', 'EXPORT_DEPARTURE_FILL'));

-- Migration20261118090000 : complément de poids payé par recharge, lignes et commandes retirées du colis.
ALTER TABLE "export_shipments" ADD COLUMN IF NOT EXISTS "supplement_topup_id" uuid NULL;
ALTER TABLE "export_shipments" ADD COLUMN IF NOT EXISTS "removed_item_ids" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "export_shipments" ADD COLUMN IF NOT EXISTS "removed_order_ids" jsonb NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS "export_shipments_supplement_topup_idx" ON "export_shipments" ("supplement_topup_id") WHERE "supplement_topup_id" IS NOT NULL;

-- Migration20261119090000 : pays de destination en base (export_countries), clés étrangères à la place des CHECK (FR, BE).
CREATE TABLE IF NOT EXISTS "export_countries" (
  "code" varchar(2) NOT NULL,
  "name" varchar(80) NOT NULL,
  "to_phrase" varchar(120) NOT NULL,
  "in_phrase" varchar(120) NOT NULL,
  "display_currency" varchar(3) NOT NULL DEFAULT 'EUR',
  "flag_emoji" varchar(16) NULL,
  "sort_order" int NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "export_countries_pkey" PRIMARY KEY ("code")
);
ALTER TABLE "export_countries" DROP CONSTRAINT IF EXISTS "export_countries_code_check";
ALTER TABLE "export_countries" ADD CONSTRAINT "export_countries_code_check" CHECK ("code" ~ '^[A-Z]{2}$');
INSERT INTO "export_countries" ("code", "name", "to_phrase", "in_phrase", "display_currency", "flag_emoji", "sort_order", "is_active")
  VALUES ('FR', 'France', 'vers la France', 'en France', 'EUR', '🇫🇷', 10, true),
         ('BE', 'Belgique', 'vers la Belgique', 'en Belgique', 'EUR', '🇧🇪', 20, true)
  ON CONFLICT ("code") DO NOTHING;
ALTER TABLE "export_pickup_points" DROP CONSTRAINT IF EXISTS "export_pickup_points_country_check";
ALTER TABLE "export_pickup_points" DROP CONSTRAINT IF EXISTS "export_pickup_points_country_foreign";
ALTER TABLE "export_pickup_points" ADD CONSTRAINT "export_pickup_points_country_foreign" FOREIGN KEY ("country") REFERENCES "export_countries" ("code") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "export_departure_rates" DROP CONSTRAINT IF EXISTS "export_departure_rates_country_check";
ALTER TABLE "export_departure_rates" DROP CONSTRAINT IF EXISTS "export_departure_rates_country_foreign";
ALTER TABLE "export_departure_rates" ADD CONSTRAINT "export_departure_rates_country_foreign" FOREIGN KEY ("country") REFERENCES "export_countries" ("code") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "export_departure_alerts" DROP CONSTRAINT IF EXISTS "export_departure_alerts_country_check";
ALTER TABLE "export_departure_alerts" DROP CONSTRAINT IF EXISTS "export_departure_alerts_country_foreign";
ALTER TABLE "export_departure_alerts" ADD CONSTRAINT "export_departure_alerts_country_foreign" FOREIGN KEY ("country") REFERENCES "export_countries" ("code") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "export_checkout_drafts" DROP CONSTRAINT IF EXISTS "export_checkout_drafts_country_check";
ALTER TABLE "export_checkout_drafts" DROP CONSTRAINT IF EXISTS "export_checkout_drafts_country_foreign";
ALTER TABLE "export_checkout_drafts" ADD CONSTRAINT "export_checkout_drafts_country_foreign" FOREIGN KEY ("country") REFERENCES "export_countries" ("code") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_country_check";
ALTER TABLE "export_shipments" DROP CONSTRAINT IF EXISTS "export_shipments_country_foreign";
ALTER TABLE "export_shipments" ADD CONSTRAINT "export_shipments_country_foreign" FOREIGN KEY ("country") REFERENCES "export_countries" ("code") ON UPDATE CASCADE ON DELETE RESTRICT;


-- Migration20261120090000 : panier d'origine du colis (packs entiers), pour « Refaire cette valise ».
ALTER TABLE "export_shipments" ADD COLUMN IF NOT EXISTS "cart_lines" jsonb NOT NULL DEFAULT '[]';

-- Migration20261121090000 : validation d'export automatique. Statuts EXPORTABLE / INCOMPLETE / WITHDRAWN
-- (APPROVED et PENDING deviennent INCOMPLETE, recalculés par l'API au démarrage ; REJECTED devient
-- WITHDRAWN avec son motif), colonnes de retrait, critères manquants, conservation, allergènes,
-- trois déclarations de la boutique.
ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_status_check";
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_profiles' AND column_name = 'rejection_reason')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_profiles' AND column_name = 'withdrawn_reason') THEN
    ALTER TABLE "export_profiles" RENAME COLUMN "rejection_reason" TO "withdrawn_reason";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_profiles' AND column_name = 'reviewed_by')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_profiles' AND column_name = 'withdrawn_by') THEN
    ALTER TABLE "export_profiles" RENAME COLUMN "reviewed_by" TO "withdrawn_by";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_profiles' AND column_name = 'reviewed_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_profiles' AND column_name = 'withdrawn_at') THEN
    ALTER TABLE "export_profiles" RENAME COLUMN "reviewed_at" TO "withdrawn_at";
  END IF;
END $$;
ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "missing_criteria" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "export_profiles" ALTER COLUMN "status" SET DEFAULT 'INCOMPLETE';
ALTER TABLE "export_packs" DROP CONSTRAINT IF EXISTS "export_packs_status_check";
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_packs' AND column_name = 'rejection_reason')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_packs' AND column_name = 'withdrawn_reason') THEN
    ALTER TABLE "export_packs" RENAME COLUMN "rejection_reason" TO "withdrawn_reason";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_packs' AND column_name = 'reviewed_by')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_packs' AND column_name = 'withdrawn_by') THEN
    ALTER TABLE "export_packs" RENAME COLUMN "reviewed_by" TO "withdrawn_by";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_packs' AND column_name = 'reviewed_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'export_packs' AND column_name = 'withdrawn_at') THEN
    ALTER TABLE "export_packs" RENAME COLUMN "reviewed_at" TO "withdrawn_at";
  END IF;
END $$;
ALTER TABLE "export_packs" ADD COLUMN IF NOT EXISTS "missing_criteria" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "export_packs" ALTER COLUMN "status" SET DEFAULT 'INCOMPLETE';
ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_label_check";
ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_sizes_check";
ALTER TABLE "export_profiles" ALTER COLUMN "packed_weight_g" DROP NOT NULL;
ALTER TABLE "export_profiles" ALTER COLUMN "shelf_life_days" DROP NOT NULL;
ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "storage" varchar(10) NULL;
ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "allergens" varchar(500) NULL;
ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "no_allergens" boolean NOT NULL DEFAULT false;
ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "declares_french_label" boolean NOT NULL DEFAULT false;
ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "declares_dates_printed" boolean NOT NULL DEFAULT false;
ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "declares_sealed_packaging" boolean NOT NULL DEFAULT false;
ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "exportable_since" timestamptz NULL;
UPDATE "export_profiles" SET
      "declares_french_label" = COALESCE(("checklist" ->> 'label_french')::boolean, false),
      "declares_dates_printed" = COALESCE(("checklist" ->> 'dates_present')::boolean, false),
      "exportable_since" = COALESCE("exportable_since", "withdrawn_at", "updated_at")
      WHERE "status" = 'APPROVED';
UPDATE "export_profiles" SET "withdrawn_by" = NULL, "withdrawn_at" = NULL, "withdrawn_reason" = NULL WHERE "status" IN ('APPROVED', 'PENDING');
UPDATE "export_profiles" SET "status" = 'INCOMPLETE' WHERE "status" IN ('APPROVED', 'PENDING');
UPDATE "export_profiles" SET "status" = 'WITHDRAWN', "withdrawn_at" = COALESCE("withdrawn_at", "updated_at") WHERE "status" = 'REJECTED';
UPDATE "export_packs" SET "withdrawn_by" = NULL, "withdrawn_at" = NULL, "withdrawn_reason" = NULL WHERE "status" IN ('APPROVED', 'PENDING');
UPDATE "export_packs" SET "status" = 'INCOMPLETE' WHERE "status" IN ('APPROVED', 'PENDING');
UPDATE "export_packs" SET "status" = 'WITHDRAWN', "withdrawn_at" = COALESCE("withdrawn_at", "updated_at") WHERE "status" = 'REJECTED';
ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_status_check" CHECK ("status" IN ('EXPORTABLE', 'INCOMPLETE', 'WITHDRAWN'));
ALTER TABLE "export_packs" ADD CONSTRAINT "export_packs_status_check" CHECK ("status" IN ('EXPORTABLE', 'INCOMPLETE', 'WITHDRAWN', 'RETIRED'));
ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_storage_check";
ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_storage_check" CHECK ("storage" IS NULL OR "storage" IN ('AMBIENT', 'COOL', 'FROZEN'));
ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_label_check" CHECK ("status" <> 'EXPORTABLE' OR "label_photo" IS NOT NULL);
ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_sizes_check" CHECK (
      ("packed_weight_g" IS NULL OR "packed_weight_g" > 0)
      AND ("shelf_life_days" IS NULL OR "shelf_life_days" > 0)
      AND ("length_cm" IS NULL OR "length_cm" > 0)
      AND ("width_cm" IS NULL OR "width_cm" > 0)
      AND ("height_cm" IS NULL OR "height_cm" > 0)
      AND jsonb_array_length("origin_photos") <= 3);

COMMIT;

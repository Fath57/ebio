-- Panier unifié multi-boutiques (006-unified-cart) — tables de regroupement.
--
-- Équivalent SQL de Migration20260921120000, à appliquer AVANT la bascule du
-- conteneur : le registre `mikro_orm_migrations` de production ne contient que
-- les migrations récentes, donc `migration:up` sans `--only` échoue sur les
-- anciennes. Une fois ce fichier joué, enregistrer le nom de la migration avec
-- `migration:up --only Migration20260921120000` (les ordres sont idempotents).
--
-- Purement additif : aucune colonne supprimée, aucun lien existant modifié.
--
--   ssh digit_immo_server "dokku postgres:connect ebio-postgres" < this-file.sql

BEGIN;

CREATE TABLE IF NOT EXISTS "checkouts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "buyer_id" uuid NOT NULL REFERENCES "users" ("id"),
      "total_amount" numeric(12,2) NOT NULL,
      "items_total" numeric(12,2) NOT NULL,
      "delivery_fee" numeric(12,2) NOT NULL DEFAULT 0,
      "discount" numeric(12,2) NOT NULL DEFAULT 0,
      "payment_method" varchar(32) NOT NULL,
      "provider_transaction_id" varchar(255) NULL,
      "status" varchar(32) NOT NULL DEFAULT 'PENDING',
      "delivery_mode" varchar(16) NOT NULL,
      "delivery_address" text NULL,
      "delivery_latitude" double precision NULL,
      "delivery_longitude" double precision NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );

ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_status_check";

ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_status_check"
      CHECK ("status" = ANY (ARRAY[${CHECKOUT_STATUSES.map(s => `'${s}'

ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_delivery_mode_check";

ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_delivery_mode_check"
      CHECK ("delivery_mode" = ANY (ARRAY['DELIVERY', 'ON_SITE']::text[]));

ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_delivery_position_check";

ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_delivery_position_check"
      CHECK ("delivery_mode" <> 'DELIVERY'
        OR ("delivery_latitude" IS NOT NULL AND "delivery_longitude" IS NOT NULL));

CREATE INDEX IF NOT EXISTS "checkouts_buyer_idx" ON "checkouts" ("buyer_id");

CREATE INDEX IF NOT EXISTS "checkouts_provider_transaction_idx"
      ON "checkouts" ("provider_transaction_id") WHERE "provider_transaction_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "delivery_runs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "checkout_id" uuid NOT NULL UNIQUE REFERENCES "checkouts" ("id"),
      "courier_id" uuid NULL REFERENCES "courier_profiles" ("id"),
      "status" varchar(32) NOT NULL DEFAULT 'AWAITING_COURIER',
      "pickup_order" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "total_distance_km" double precision NULL,
      "courier_earning" numeric(12,2) NOT NULL DEFAULT 0,
      "dispatch_phase" varchar(16) NOT NULL DEFAULT 'TARGETED',
      "offer_expires_at" timestamptz NULL,
      "escalated_at" timestamptz NULL,
      "buyer_prompted_at" timestamptz NULL,
      "shop_count" integer NOT NULL DEFAULT 0,
      "offers_sent" integer NOT NULL DEFAULT 0,
      "outcome" varchar(16) NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );

ALTER TABLE "delivery_runs" DROP CONSTRAINT IF EXISTS "delivery_runs_status_check";

ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_status_check"
      CHECK ("status" = ANY (ARRAY[${RUN_STATUSES.map(s => `'${s}'

ALTER TABLE "delivery_runs" DROP CONSTRAINT IF EXISTS "delivery_runs_dispatch_phase_check";

ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_dispatch_phase_check"
      CHECK ("dispatch_phase" = ANY (ARRAY['SCHEDULED', 'TARGETED', 'BROADCAST']::text[]));

ALTER TABLE "delivery_runs" DROP CONSTRAINT IF EXISTS "delivery_runs_outcome_check";

ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_outcome_check"
      CHECK ("outcome" IS NULL OR "outcome" = ANY (ARRAY[${RUN_OUTCOMES.map(o => `'${o}'

CREATE INDEX IF NOT EXISTS "delivery_runs_courier_idx" ON "delivery_runs" ("courier_id");

CREATE INDEX IF NOT EXISTS "delivery_runs_dispatch_idx"
      ON "delivery_runs" ("status", "dispatch_phase");

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "checkout_id" uuid NULL REFERENCES "checkouts" ("id");

CREATE INDEX IF NOT EXISTS "orders_checkout_idx" ON "orders" ("checkout_id");

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "checkout_id" uuid NULL REFERENCES "checkouts" ("id");

CREATE INDEX IF NOT EXISTS "payments_checkout_idx" ON "payments" ("checkout_id");

ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "delivery_run_id" uuid NULL REFERENCES "delivery_runs" ("id");

CREATE INDEX IF NOT EXISTS "deliveries_run_idx" ON "deliveries" ("delivery_run_id");

\echo '--- tables créées ---'
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('checkouts', 'delivery_runs') ORDER BY table_name;

\echo '--- colonnes de rattachement ---'
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'payments' AND column_name = 'checkout_id')
   OR (table_name = 'deliveries' AND column_name = 'delivery_run_id');

COMMIT;

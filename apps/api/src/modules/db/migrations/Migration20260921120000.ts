import { Migration } from '@mikro-orm/migrations'

const CHECKOUT_STATUSES = [
  'PENDING',
  'PAID',
  'DISPATCHED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED',
]

const RUN_STATUSES = [
  'AWAITING_COURIER',
  'ESCALATED',
  'BUYER_DECISION',
  'ACCEPTED',
  'COLLECTING',
  'DELIVERING',
  'DELIVERED',
  'CANCELLED',
]

const RUN_OUTCOMES = ['ACCEPTED', 'REFUSED_ALL', 'UNSERVED', 'CANCELLED']

/**
 * Le panier unifié : un passage en caisse pour plusieurs boutiques.
 *
 * Deux tables de regroupement, et rien d'autre. `payments.order_id` et
 * `deliveries.order_id` gardent leur unicité : c'est la condition pour que
 * l'escrow, les reçus, le suivi fournisseur et les écrans livreur continuent
 * de fonctionner sans retouche.
 *
 * Purement additif. Les colonnes de rattachement sont nullables et restent
 * nulles sur tout l'historique, que le code lit comme « commande d'avant le
 * panier unifié ».
 */
export class Migration20260921120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS "checkouts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "buyer_id" uuid NOT NULL REFERENCES "user" ("id"),
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
    );`)

    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_status_check"
      CHECK ("status" = ANY (ARRAY[${CHECKOUT_STATUSES.map(s => `'${s}'`).join(', ')}]::text[]));`)
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_delivery_mode_check"
      CHECK ("delivery_mode" = ANY (ARRAY['DELIVERY', 'ON_SITE']::text[]));`)
    // Une livraison sans point de chute ne peut pas être tarifée, et une
    // adresse sans coordonnées ne guide personne.
    this.addSql(`ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_delivery_position_check"
      CHECK ("delivery_mode" <> 'DELIVERY'
        OR ("delivery_latitude" IS NOT NULL AND "delivery_longitude" IS NOT NULL));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "checkouts_buyer_idx" ON "checkouts" ("buyer_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "checkouts_provider_transaction_idx"
      ON "checkouts" ("provider_transaction_id") WHERE "provider_transaction_id" IS NOT NULL;`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "delivery_runs" (
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
    );`)

    this.addSql(`ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_status_check"
      CHECK ("status" = ANY (ARRAY[${RUN_STATUSES.map(s => `'${s}'`).join(', ')}]::text[]));`)
    this.addSql(`ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_dispatch_phase_check"
      CHECK ("dispatch_phase" = ANY (ARRAY['SCHEDULED', 'TARGETED', 'BROADCAST']::text[]));`)
    this.addSql(`ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_outcome_check"
      CHECK ("outcome" IS NULL OR "outcome" = ANY (ARRAY[${RUN_OUTCOMES.map(o => `'${o}'`).join(', ')}]::text[]));`)
    // Aucune borne sur shop_count ni sur total_distance_km : le regroupement
    // est volontairement sans limite en v1, ces colonnes servent à la mesure
    // pour poser ces limites plus tard sur des faits.
    this.addSql(`CREATE INDEX IF NOT EXISTS "delivery_runs_courier_idx" ON "delivery_runs" ("courier_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "delivery_runs_dispatch_idx"
      ON "delivery_runs" ("status", "dispatch_phase");`)

    this.addSql(`ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "checkout_id" uuid NULL REFERENCES "checkouts" ("id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "payments_checkout_idx" ON "payments" ("checkout_id");`)

    this.addSql(`ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "delivery_run_id" uuid NULL REFERENCES "delivery_runs" ("id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "deliveries_run_idx" ON "deliveries" ("delivery_run_id");`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "deliveries_run_idx";`)
    this.addSql(`ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "delivery_run_id";`)
    this.addSql(`DROP INDEX IF EXISTS "payments_checkout_idx";`)
    this.addSql(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "checkout_id";`)
    this.addSql(`DROP TABLE IF EXISTS "delivery_runs";`)
    this.addSql(`DROP TABLE IF EXISTS "checkouts";`)
  }
}

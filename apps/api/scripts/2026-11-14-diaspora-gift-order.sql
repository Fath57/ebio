-- Commander pour un proche (009-diaspora-gift-order).
--
-- Équivalent SQL de Migration20261114090000, à appliquer AVANT la bascule du
-- conteneur : le registre `mikro_orm_migrations` de production est
-- désynchronisé, donc `migration:up` sans `--only` échoue sur les anciennes.
-- Une fois ce fichier joué, enregistrer le nom avec
-- `migration:up --only Migration20261114090000` puis `--only Migration20261114100000` (les ordres sont idempotents).
--
-- Purement additif : une table, des colonnes sur `checkouts`, `deliveries` et
-- `users`, deux contraintes d'énumération élargies. Rien n'est supprimé. Toute
-- contrainte est précédée de son `DROP ... IF EXISTS` : le fichier se rejoue
-- sans erreur, et le `migration:up` qui suit ne bute pas sur « already exists ».
--
--   ssh digit_immo_server "dokku postgres:connect ebio-postgres" < this-file.sql

BEGIN;

-- Le carnet de proches du payeur. Un même numéro n'y figure qu'une fois.
CREATE TABLE IF NOT EXISTS "saved_relatives" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "owner_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "nickname" varchar(40) NOT NULL,
      "name" varchar(120) NOT NULL,
      "phone" varchar(16) NOT NULL,
      "address" text NOT NULL,
      "latitude" double precision NOT NULL,
      "longitude" double precision NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS "saved_relatives_owner_idx" ON "saved_relatives" ("owner_id");

ALTER TABLE "saved_relatives" DROP CONSTRAINT IF EXISTS "saved_relatives_owner_phone_unique";
ALTER TABLE "saved_relatives" ADD CONSTRAINT "saved_relatives_owner_phone_unique" UNIQUE ("owner_id", "phone");

ALTER TABLE "saved_relatives" DROP CONSTRAINT IF EXISTS "saved_relatives_phone_check";
ALTER TABLE "saved_relatives" ADD CONSTRAINT "saved_relatives_phone_check" CHECK ("phone" ~ '^\+229[0-9]{10}$');

ALTER TABLE "saved_relatives" DROP CONSTRAINT IF EXISTS "saved_relatives_address_check";
ALTER TABLE "saved_relatives" ADD CONSTRAINT "saved_relatives_address_check" CHECK (char_length("address") >= 10);

-- Le proche et le taux de change sont figés sur le passage en caisse.
ALTER TABLE "checkouts"
      ADD COLUMN IF NOT EXISTS "recipient_name" varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS "recipient_phone" varchar(16) NULL,
      ADD COLUMN IF NOT EXISTS "saved_relative_id" uuid NULL,
      ADD COLUMN IF NOT EXISTS "tracking_token" varchar(32) NULL,
      ADD COLUMN IF NOT EXISTS "recipient_sms_resend_count" smallint NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "payer_time_zone" varchar(64) NULL,
      ADD COLUMN IF NOT EXISTS "display_currency" varchar(3) NOT NULL DEFAULT 'XOF',
      ADD COLUMN IF NOT EXISTS "fx_rate" numeric(14,6) NULL,
      ADD COLUMN IF NOT EXISTS "fx_margin_bps" smallint NULL,
      ADD COLUMN IF NOT EXISTS "display_total" numeric(12,2) NULL;

ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_saved_relative_id_foreign";
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_saved_relative_id_foreign"
      FOREIGN KEY ("saved_relative_id") REFERENCES "saved_relatives" ("id") ON DELETE SET NULL;

ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_tracking_token_unique";
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_tracking_token_unique" UNIQUE ("tracking_token");

-- « Paniers reçus » cherche par numéro du proche.
CREATE INDEX IF NOT EXISTS "checkouts_recipient_phone_idx" ON "checkouts" ("recipient_phone")
      WHERE "recipient_phone" IS NOT NULL;

ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_recipient_check";
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_recipient_check"
      CHECK (("recipient_name" IS NULL) = ("recipient_phone" IS NULL) AND ("recipient_phone" IS NULL) = ("tracking_token" IS NULL));

ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_recipient_sms_resend_count_check";
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_recipient_sms_resend_count_check"
      CHECK ("recipient_sms_resend_count" BETWEEN 0 AND 3);

ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_gift_payment_check";
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_gift_payment_check"
      CHECK ("recipient_phone" IS NULL OR "payment_method" <> 'CASH_ON_DELIVERY');

ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_display_currency_check";
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_display_currency_check"
      CHECK ("display_currency" IN ('XOF', 'EUR', 'USD', 'CAD'));

ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_display_fx_check";
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_display_fx_check"
      CHECK (("display_currency" = 'XOF') = ("fx_rate" IS NULL AND "display_total" IS NULL));

ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_fx_margin_bps_check";
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_fx_margin_bps_check"
      CHECK ("fx_margin_bps" IS NULL OR "fx_margin_bps" BETWEEN 0 AND 1000);

-- Preuve de remise : code + photo + position. La colonne d'origine est un
-- varchar(10), trop court pour CODE_AND_PHOTO.
ALTER TABLE "deliveries" ALTER COLUMN "proof_type" TYPE varchar(20);

ALTER TABLE "deliveries"
      ADD COLUMN IF NOT EXISTS "proof_latitude" double precision NULL,
      ADD COLUMN IF NOT EXISTS "proof_longitude" double precision NULL,
      ADD COLUMN IF NOT EXISTS "proof_taken_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "proof_distance_m" integer NULL,
      ADD COLUMN IF NOT EXISTS "proof_far" boolean NOT NULL DEFAULT false;

ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_proof_type_check";
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_proof_type_check"
      CHECK ("proof_type" IN ('CODE', 'PHOTO', 'CODE_AND_PHOTO'));

-- La photo n'est pas exigée ici : la purge à 90 jours remet `proof_media_id`
-- à null et garde le reste de la preuve.
ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_gift_proof_check";
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_gift_proof_check"
      CHECK ("proof_type" IS DISTINCT FROM 'CODE_AND_PHOTO'
        OR ("proof_latitude" IS NOT NULL AND "proof_longitude" IS NOT NULL AND "proof_taken_at" IS NOT NULL));

-- Téléphone vérifié et devise d'affichage.
ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "phone_verified_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "display_currency" varchar(3) NOT NULL DEFAULT 'XOF';

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_display_currency_check";
ALTER TABLE "users" ADD CONSTRAINT "users_display_currency_check"
      CHECK ("display_currency" IN ('XOF', 'EUR', 'USD', 'CAD'));

-- Les comptes créés par code SMS (e-mail de remplacement) ont prouvé leur numéro.
UPDATE "users" SET "phone_verified_at" = "createdAt"
WHERE "phone_verified_at" IS NULL AND "phone" IS NOT NULL AND "email" LIKE '%@phone.ebio.app';

-- Deux nouveaux types de notification, liste complète reconstruite.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN (
      'ORDER_PLACED', 'ORDER_ACCEPTED', 'ORDER_REJECTED', 'ORDER_READY', 'ORDER_DELIVERED', 'ORDER_CANCELLED',
      'PAYMENT_RECEIVED', 'PAYMENT_RELEASED', 'DISPUTE_OPENED', 'DISPUTE_RESOLVED',
      'SUPPLIER_VALIDATED', 'SUPPLIER_REJECTED', 'SUPPLIER_COMPLEMENT', 'STOCK_ALERT', 'STOCK_AVAILABLE',
      'NEW_MESSAGE', 'NEW_REVIEW', 'PRODUCT_REVIEW_INVITE', 'CART_REMINDER', 'ESCROW_REMINDER',
      'PROMOTIONAL', 'SYSTEM',
      'DELIVERY_OFFER', 'DELIVERY_ASSIGNED', 'DELIVERY_PICKED_UP', 'DELIVERY_FAILED', 'DELIVERY_REASSIGNED',
      'DELIVERY_PICKUP_REMINDER', 'DELIVERY_WINDOW_CHANGED',
      'COURIER_VALIDATED', 'COURIER_REJECTED', 'COURIER_SUSPENDED', 'COURIER_EARNING', 'COURIER_PAYOUT',
      'COURIER_RATED', 'COURIER_TIP', 'REFERRAL_REWARD', 'BANNER_APPROVED', 'BANNER_REJECTED',
      'GIFT_DELIVERED', 'GIFT_DELIVERY_FAILED'
    ));

-- Ce qui a déjà été envoyé au proche par SMS (Migration20261114100000) : une
-- confirmation rejouée ou une annulation répétée ne renvoie pas le même message.
ALTER TABLE "checkouts"
      ADD COLUMN IF NOT EXISTS "recipient_announced_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "recipient_code_sent" varchar(4) NULL,
      ADD COLUMN IF NOT EXISTS "recipient_cancel_sent_at" timestamptz NULL;

\echo '--- table créée ---'
SELECT to_regclass('public.saved_relatives');

\echo '--- colonnes ajoutées ---'
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'checkouts' AND column_name IN ('recipient_name', 'recipient_phone', 'saved_relative_id', 'tracking_token',
        'recipient_sms_resend_count', 'payer_time_zone', 'display_currency', 'fx_rate', 'fx_margin_bps', 'display_total',
        'recipient_announced_at', 'recipient_code_sent', 'recipient_cancel_sent_at'))
   OR (table_name = 'deliveries' AND column_name IN ('proof_latitude', 'proof_longitude', 'proof_taken_at', 'proof_distance_m', 'proof_far'))
   OR (table_name = 'users' AND column_name IN ('phone_verified_at', 'display_currency'))
ORDER BY table_name, column_name;

\echo '--- contraintes ---'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname IN ('deliveries_proof_type_check', 'deliveries_gift_proof_check', 'checkouts_recipient_check',
                  'checkouts_display_fx_check', 'checkouts_gift_payment_check', 'notifications_type_check')
ORDER BY conname;

\echo '--- comptes SMS marqués vérifiés ---'
SELECT count(*) FROM "users" WHERE "phone_verified_at" IS NOT NULL;

COMMIT;

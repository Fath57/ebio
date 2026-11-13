-- Portefeuille famille (010-family-wallet).
--
-- Équivalent SQL de Migration20261115090000, à appliquer AVANT la bascule du
-- conteneur : le registre `mikro_orm_migrations` de production est
-- désynchronisé, donc `migration:up` sans `--only` échoue sur les anciennes.
-- Une fois ce fichier joué, enregistrer le nom avec
-- `migration:up --only Migration20261115090000` (les ordres sont idempotents).
--
-- Purement additif : deux tables, des colonnes sur `wallets`,
-- `wallet_transactions` et `checkouts`, l'adresse des proches rendue
-- facultative, des contraintes d'énumération élargies. Rien n'est supprimé.
-- Toute contrainte est précédée de son `DROP ... IF EXISTS` : le fichier se
-- rejoue sans erreur.
--
--   ssh digit_immo_server "dokku postgres:connect ebio-postgres" < this-file.sql

BEGIN;

-- Le portefeuille famille d'un payeur : un seul par payeur, quel que soit son statut.
CREATE TABLE IF NOT EXISTS "family_wallets" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "payer_id" uuid NOT NULL REFERENCES "users" ("id"),
      "status" varchar(10) NOT NULL DEFAULT 'ACTIVE',
      "suspended_by_admin" boolean NOT NULL DEFAULT false,
      "low_balance_threshold" numeric(12,2) NOT NULL DEFAULT 5000,
      "low_balance_alerted" boolean NOT NULL DEFAULT false,
      "default_monthly_cap" numeric(12,2) NULL,
      "default_order_max" numeric(12,2) NULL,
      "default_category_ids" uuid[] NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      "closed_at" timestamptz NULL,
      CONSTRAINT "family_wallets_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "family_wallets" DROP CONSTRAINT IF EXISTS "family_wallets_payer_id_unique";
ALTER TABLE "family_wallets" ADD CONSTRAINT "family_wallets_payer_id_unique" UNIQUE ("payer_id");
ALTER TABLE "family_wallets" DROP CONSTRAINT IF EXISTS "family_wallets_status_check";
ALTER TABLE "family_wallets" ADD CONSTRAINT "family_wallets_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'CLOSED'));
ALTER TABLE "family_wallets" DROP CONSTRAINT IF EXISTS "family_wallets_limits_check";
ALTER TABLE "family_wallets" ADD CONSTRAINT "family_wallets_limits_check" CHECK (
      "low_balance_threshold" >= 0
      AND ("default_monthly_cap" IS NULL OR "default_monthly_cap" > 0)
      AND ("default_order_max" IS NULL OR "default_order_max" > 0)
      AND ("default_category_ids" IS NULL OR cardinality("default_category_ids") > 0));

-- Les proches membres : un numéro au plus une fois par portefeuille, sauf retiré.
CREATE TABLE IF NOT EXISTS "family_wallet_members" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "family_wallet_id" uuid NOT NULL REFERENCES "family_wallets" ("id") ON DELETE CASCADE,
      "saved_relative_id" uuid NULL REFERENCES "saved_relatives" ("id") ON DELETE SET NULL,
      "nickname" varchar(40) NOT NULL,
      "phone" varchar(16) NOT NULL,
      "user_id" uuid NULL REFERENCES "users" ("id"),
      "status" varchar(10) NOT NULL DEFAULT 'PENDING',
      "monthly_cap" numeric(12,2) NULL,
      "order_max" numeric(12,2) NULL,
      "category_ids" uuid[] NULL,
      "invited_at" timestamptz NULL,
      "pending_reminded_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "family_wallet_members_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "family_wallet_members_wallet_idx" ON "family_wallet_members" ("family_wallet_id");
CREATE INDEX IF NOT EXISTS "family_wallet_members_user_idx" ON "family_wallet_members" ("user_id") WHERE "user_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "family_wallet_members_phone_idx" ON "family_wallet_members" ("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "family_wallet_members_wallet_phone_unique" ON "family_wallet_members" ("family_wallet_id", "phone")
      WHERE "status" <> 'REMOVED';
ALTER TABLE "family_wallet_members" DROP CONSTRAINT IF EXISTS "family_wallet_members_phone_check";
ALTER TABLE "family_wallet_members" ADD CONSTRAINT "family_wallet_members_phone_check" CHECK ("phone" ~ '^\+229[0-9]{10}$');
ALTER TABLE "family_wallet_members" DROP CONSTRAINT IF EXISTS "family_wallet_members_status_check";
ALTER TABLE "family_wallet_members" ADD CONSTRAINT "family_wallet_members_status_check" CHECK (
      ("status" = 'PENDING' AND "user_id" IS NULL)
      OR ("status" IN ('ACTIVE', 'SUSPENDED') AND "user_id" IS NOT NULL)
      OR "status" = 'REMOVED');
ALTER TABLE "family_wallet_members" DROP CONSTRAINT IF EXISTS "family_wallet_members_limits_check";
ALTER TABLE "family_wallet_members" ADD CONSTRAINT "family_wallet_members_limits_check" CHECK (
      ("monthly_cap" IS NULL OR "monthly_cap" > 0)
      AND ("order_max" IS NULL OR "order_max" > 0)
      AND ("category_ids" IS NULL OR cardinality("category_ids") > 0));

-- Le solde vit dans `wallets` : cinquième propriétaire possible.
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "family_wallet_id" uuid NULL;
ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_family_wallet_id_foreign";
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_family_wallet_id_foreign"
      FOREIGN KEY ("family_wallet_id") REFERENCES "family_wallets" ("id");
ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_family_wallet_id_unique";
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_family_wallet_id_unique" UNIQUE ("family_wallet_id");
ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallet_single_owner";
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_single_owner"
      CHECK (num_nonnulls("user_id", "supplier_id", "courier_profile_id", "platform_account", "family_wallet_id") = 1);

-- Le membre derrière un achat ou un remboursement : la dépense du mois s'en déduit.
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "family_member_id" uuid NULL;
ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_family_member_id_foreign";
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_family_member_id_foreign"
      FOREIGN KEY ("family_member_id") REFERENCES "family_wallet_members" ("id");
CREATE INDEX IF NOT EXISTS "wallet_transactions_family_member_idx" ON "wallet_transactions" ("family_member_id", "createdAt")
      WHERE "family_member_id" IS NOT NULL;
ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN (
      'TOPUP', 'ORDER_PAYMENT', 'SALE_CREDIT', 'COMMISSION_DEBIT', 'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'REFUND',
      'ADJUSTMENT', 'PROMO_COMPENSATION', 'DELIVERY_EARNING', 'DELIVERY_COMMISSION', 'TIP_PAYMENT', 'TIP_EARNING',
      'DELIVERY_SPONSORSHIP', 'BANNER_PAYMENT', 'BANNER_REFUND', 'REFERRAL_REWARD', 'PLATFORM_COMMISSION',
      'PLATFORM_DELIVERY_SHARE', 'PLATFORM_BANNER', 'PLATFORM_MARKETING',
      'FAMILY_TRANSFER_OUT', 'FAMILY_TRANSFER_IN', 'FAMILY_CLOSURE_OUT', 'FAMILY_CLOSURE_IN'));

-- Le membre qui a payé un passage en caisse : c'est lui qui route un remboursement.
ALTER TABLE "checkouts" ADD COLUMN IF NOT EXISTS "family_member_id" uuid NULL;
ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_family_member_id_foreign";
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_family_member_id_foreign"
      FOREIGN KEY ("family_member_id") REFERENCES "family_wallet_members" ("id");
CREATE INDEX IF NOT EXISTS "checkouts_family_member_idx" ON "checkouts" ("family_member_id")
      WHERE "family_member_id" IS NOT NULL;
ALTER TABLE "checkouts" DROP CONSTRAINT IF EXISTS "checkouts_family_member_check";
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_family_member_check"
      CHECK (("payment_method" = 'FAMILY_WALLET') = ("family_member_id" IS NOT NULL));

-- Quatrième moyen de paiement.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_payment_method_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_check"
      CHECK ("payment_method" IN ('FEDAPAY', 'CASH_ON_DELIVERY', 'WALLET', 'FAMILY_WALLET'));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_payment_method_check') THEN
    ALTER TABLE "checkouts" DROP CONSTRAINT "checkouts_payment_method_check";
    ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_payment_method_check"
      CHECK ("payment_method" IN ('FEDAPAY', 'CASH_ON_DELIVERY', 'WALLET', 'FAMILY_WALLET'));
  END IF;
END $$;

-- Un proche du portefeuille n'a pas forcément d'adresse connue.
ALTER TABLE "saved_relatives"
      ALTER COLUMN "address" DROP NOT NULL,
      ALTER COLUMN "latitude" DROP NOT NULL,
      ALTER COLUMN "longitude" DROP NOT NULL;
ALTER TABLE "saved_relatives" DROP CONSTRAINT IF EXISTS "saved_relatives_address_check";
ALTER TABLE "saved_relatives" ADD CONSTRAINT "saved_relatives_address_check"
      CHECK ("address" IS NULL OR char_length("address") >= 10);
ALTER TABLE "saved_relatives" DROP CONSTRAINT IF EXISTS "saved_relatives_point_check";
ALTER TABLE "saved_relatives" ADD CONSTRAINT "saved_relatives_point_check"
      CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

-- Six notifications nouvelles.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN (
      'ORDER_PLACED', 'ORDER_ACCEPTED', 'ORDER_REJECTED', 'ORDER_READY', 'ORDER_DELIVERED', 'ORDER_CANCELLED',
      'PAYMENT_RECEIVED', 'PAYMENT_RELEASED', 'DISPUTE_OPENED', 'DISPUTE_RESOLVED', 'SUPPLIER_VALIDATED',
      'SUPPLIER_REJECTED', 'SUPPLIER_COMPLEMENT', 'STOCK_ALERT', 'STOCK_AVAILABLE', 'NEW_MESSAGE', 'NEW_REVIEW',
      'PRODUCT_REVIEW_INVITE', 'CART_REMINDER', 'ESCROW_REMINDER', 'PROMOTIONAL', 'SYSTEM', 'DELIVERY_OFFER',
      'DELIVERY_ASSIGNED', 'DELIVERY_PICKED_UP', 'DELIVERY_FAILED', 'DELIVERY_REASSIGNED', 'DELIVERY_PICKUP_REMINDER',
      'DELIVERY_WINDOW_CHANGED', 'COURIER_VALIDATED', 'COURIER_REJECTED', 'COURIER_SUSPENDED', 'COURIER_EARNING',
      'COURIER_PAYOUT', 'COURIER_RATED', 'COURIER_TIP', 'REFERRAL_REWARD', 'BANNER_APPROVED', 'BANNER_REJECTED',
      'GIFT_DELIVERED', 'GIFT_DELIVERY_FAILED',
      'FAMILY_WALLET_TOPUP', 'FAMILY_WALLET_PURCHASE', 'FAMILY_WALLET_LOW_BALANCE', 'FAMILY_WALLET_MEMBER_JOINED',
      'FAMILY_WALLET_MEMBER_PENDING', 'FAMILY_WALLET_STATUS'));

\echo '--- tables créées ---'
SELECT to_regclass('public.family_wallets'), to_regclass('public.family_wallet_members');

\echo '--- colonnes ajoutées ---'
SELECT table_name, column_name, is_nullable FROM information_schema.columns
WHERE (table_name IN ('wallets', 'wallet_transactions', 'checkouts') AND column_name IN ('family_wallet_id', 'family_member_id'))
   OR (table_name = 'saved_relatives' AND column_name IN ('address', 'latitude', 'longitude'))
ORDER BY table_name, column_name;

\echo '--- contraintes ---'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname IN ('wallet_single_owner', 'checkouts_family_member_check', 'orders_payment_method_check',
                  'family_wallet_members_status_check', 'saved_relatives_address_check')
ORDER BY conname;

COMMIT;

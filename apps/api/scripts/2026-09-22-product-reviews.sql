-- Avis et notes par produit (007-product-reviews).
--
-- Équivalent SQL de Migration20260922180442, à appliquer AVANT la bascule du
-- conteneur : le registre `mikro_orm_migrations` de production ne contient que
-- les migrations récentes, donc `migration:up` sans `--only` échoue sur les
-- anciennes. Une fois ce fichier joué, enregistrer le nom avec
-- `migration:up --only Migration20260922180442` — la liste attend des
-- virgules, pas des espaces.
--
-- Purement additif : une table, deux colonnes, une contrainte élargie. Rien
-- n'est supprimé. Toute contrainte est précédée de son `DROP ... IF EXISTS`,
-- pour que le `migration:up` qui suit ne bute pas sur « already exists ».
--
--   ssh digit_immo_server "dokku postgres:connect ebio-postgres" < this-file.sql

BEGIN;

-- L'avis s'accroche à la ligne de commande : c'est la seule chose qui prouve
-- qui a acheté quoi, sur quelle livraison. L'unicité fait de « un avis par
-- achat » une contrainte de base et non un contrôle que le code peut oublier.
CREATE TABLE IF NOT EXISTS "product_reviews" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "order_item_id" uuid NOT NULL REFERENCES "order_items" ("id"),
      "product_id" uuid NOT NULL REFERENCES "products" ("id"),
      "buyer_id" uuid NOT NULL REFERENCES "users" ("id"),
      "rating" smallint NOT NULL,
      "comment" text NULL,
      "is_hidden" boolean NOT NULL DEFAULT false,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    );

ALTER TABLE "product_reviews" DROP CONSTRAINT IF EXISTS "product_reviews_order_item_unique";

ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_order_item_unique"
      UNIQUE ("order_item_id");

ALTER TABLE "product_reviews" DROP CONSTRAINT IF EXISTS "product_reviews_rating_check";

ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_rating_check"
      CHECK ("rating" BETWEEN 1 AND 5);

-- Le chemin de lecture de la fiche produit, dans son ordre de tri.
CREATE INDEX IF NOT EXISTS "product_reviews_product_idx"
      ON "product_reviews" ("product_id", "is_hidden", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "product_reviews_buyer_idx"
      ON "product_reviews" ("buyer_id");

-- L'agrégat que lisent la fiche et le tri de recherche, dénormalisé comme
-- `suppliers.global_rating` / `total_reviews` le sont déjà. La moyenne reste
-- nulle sous trois avis, ce qui range ces produits en fin de tri par le
-- `NULLS LAST` déjà en place, sans code supplémentaire.
ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "rating_avg" real NULL,
      ADD COLUMN IF NOT EXISTS "rating_count" integer NOT NULL DEFAULT 0;

-- Un avis produit signalé se range sous son propre type : la modération ne
-- doit jamais le confondre avec un avis de boutique.
ALTER TABLE "content_reports" DROP CONSTRAINT IF EXISTS "content_reports_target_type_check";

ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_target_type_check"
      CHECK ("target_type" = ANY (ARRAY['PRODUCT', 'REVIEW', 'PRODUCT_REVIEW', 'PUBLICATION', 'MESSAGE']::text[]));

\echo '--- table créée ---'
SELECT table_name FROM information_schema.tables WHERE table_name = 'product_reviews';

\echo '--- colonnes d agrégat sur products ---'
SELECT column_name FROM information_schema.columns
WHERE table_name = 'products' AND column_name IN ('rating_avg', 'rating_count') ORDER BY column_name;

\echo '--- content_reports accepte PRODUCT_REVIEW ---'
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'content_reports_target_type_check';

COMMIT;

-- Fenêtre de promotion sur les produits (Migration20260922160000).
--
-- Équivalent SQL à appliquer AVANT la bascule du conteneur : le registre
-- `mikro_orm_migrations` de production ne contient que les migrations
-- récentes, donc `migration:up` sans `--only` échoue sur les anciennes. Une
-- fois ce fichier joué, enregistrer la migration avec
-- `migration:up --only Migration20260922160000` (les ordres sont idempotents).
--
-- Purement additif : une colonne nullable, un index, et une reprise des
-- promotions déjà programmées. Aucune donnée supprimée.
--
--   ssh digit_immo_server "dokku postgres:connect ebio-postgres" < this-file.sql

BEGIN;

-- `products` ne recopiait que la fin d'une promotion : un prix barré créé pour
-- la semaine prochaine s'appliquait le soir même. Le début rejoint la fin, et
-- un début nul garde l'ancien sens — s'applique tout de suite — ce qu'écrit la
-- voie historique `setPromotion` et ce que veulent dire toutes les lignes
-- existantes.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "promotion_starts_at" timestamptz NULL;

-- Promotions déjà programmées : on récupère le début depuis la ligne qui les a
-- créées, pour qu'une promotion en train de fuiter s'arrête aujourd'hui.
UPDATE "products" p
SET "promotion_starts_at" = pp."starts_at"
FROM "product_promotions" pp
WHERE pp."product_id" = p."id"
  AND pp."is_active" = true
  AND pp."type" = 'PRICE'
  AND pp."starts_at" > NOW()
  AND p."promotional_price" IS NOT NULL;

-- La section « En promotion » lit désormais les deux formes : la remise
-- recopiée sur le produit, et les lignes de promotion où vivent le 1+1 et la
-- livraison offerte.
CREATE INDEX IF NOT EXISTS "product_promotions_live_idx"
  ON "product_promotions" ("product_id", "is_active", "starts_at", "ends_at");

\echo '--- colonne ---'
SELECT column_name FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'promotion_starts_at';

\echo '--- promotions reprises (doivent avoir un début futur) ---'
SELECT count(*) AS reprises FROM "products"
WHERE "promotion_starts_at" IS NOT NULL AND "promotion_starts_at" > NOW();

COMMIT;

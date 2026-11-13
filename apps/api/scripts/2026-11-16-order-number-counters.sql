-- Compteur journalier des numéros de commande (Migration20261116090000).
-- Idempotent : se rejoue sans erreur.
BEGIN;
CREATE TABLE IF NOT EXISTS "order_number_counters" (
  "day" varchar(8) NOT NULL,
  "last" int NOT NULL,
  CONSTRAINT "order_number_counters_pkey" PRIMARY KEY ("day")
);
COMMIT;

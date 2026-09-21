import { Migration } from '@mikro-orm/migrations'

/**
 * Le grand livre apprend la tournée.
 *
 * Une tournée se règle une fois, sur son frais à elle : les commandes d'un
 * panier unifié portent 0, donc un règlement par commande ne paierait rien au
 * livreur. Il faut donc une clé pour dire « cette écriture solde cette
 * tournée », et c'est elle qui rend le règlement rejouable sans double paiement.
 *
 * Plain uuid, sans clé étrangère, exactement comme `delivery_id` : le module
 * portefeuille n'importe pas le module livraisons, et c'est délibéré.
 */
export class Migration20260922140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "delivery_run_id" uuid NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "wallet_transactions_run_idx"
      ON "wallet_transactions" ("delivery_run_id");`)

    // Le code de remise est celui de la tournée : une seule remise, un seul
    // code, quel que soit le nombre de boutiques collectées.
    this.addSql(`ALTER TABLE "delivery_runs"
      ADD COLUMN IF NOT EXISTS "confirmation_code" varchar(4) NULL,
      ADD COLUMN IF NOT EXISTS "collecting_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "delivering_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "delivery_runs"
      DROP COLUMN IF EXISTS "confirmation_code",
      DROP COLUMN IF EXISTS "collecting_at",
      DROP COLUMN IF EXISTS "delivering_at",
      DROP COLUMN IF EXISTS "delivered_at";`)
    this.addSql(`DROP INDEX IF EXISTS "wallet_transactions_run_idx";`)
    this.addSql(`ALTER TABLE "wallet_transactions" DROP COLUMN IF EXISTS "delivery_run_id";`)
  }
}

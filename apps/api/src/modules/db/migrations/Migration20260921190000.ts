import { Migration } from '@mikro-orm/migrations'

/**
 * Le regroupement en tournées est borné : deux boutiques, et pas plus de
 * 3 km entre leurs points de collecte.
 *
 * Conséquence directe sur le schéma : un panier ne produit plus une tournée
 * mais autant que son découpage en compte. `delivery_runs.checkout_id` perd
 * donc son unicité, et la tournée gagne les boutiques qu'elle collecte — c'est
 * ce qui permet à chaque livraison de rejoindre la bonne quand sa commande
 * naît, avant qu'aucune livraison n'existe.
 *
 * Purement additif pour les données : aucune tournée en base ne porte plus
 * d'une boutique, et le remplissage de `supplier_ids` se fait depuis les
 * livraisons déjà rattachées.
 */
export class Migration20260921190000 extends Migration {
  override async up(): Promise<void> {
    // Un panier, plusieurs tournées. Le nom de la contrainte dépend de la
    // façon dont la table a été créée : on couvre les deux écritures.
    this.addSql(`ALTER TABLE "delivery_runs" DROP CONSTRAINT IF EXISTS "delivery_runs_checkout_id_key";`)
    this.addSql(`ALTER TABLE "delivery_runs" DROP CONSTRAINT IF EXISTS "delivery_runs_checkout_id_unique";`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "delivery_runs_checkout_idx" ON "delivery_runs" ("checkout_id");`)

    this.addSql(`ALTER TABLE "delivery_runs" ADD COLUMN IF NOT EXISTS "supplier_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;`)
    this.addSql(`ALTER TABLE "delivery_runs" ADD COLUMN IF NOT EXISTS "delivery_fee" numeric(12,2) NOT NULL DEFAULT 0;`)
    // L'écart entre les deux collectes les plus éloignées. Mesure : les seuils
    // sont posés, ces chiffres servent à les ajuster sur des faits.
    this.addSql(`ALTER TABLE "delivery_runs" ADD COLUMN IF NOT EXISTS "pickup_spread_km" double precision NULL;`)

    // Reprise : les tournées existantes tiennent leurs boutiques de leurs
    // livraisons. Sans elle, une livraison créée après coup ne retrouverait
    // pas sa tournée.
    this.addSql(`UPDATE "delivery_runs" r
      SET "supplier_ids" = COALESCE((
        SELECT jsonb_agg(DISTINCT o."supplier_id")
        FROM "deliveries" d
        JOIN "orders" o ON o."id" = d."order_id"
        WHERE d."delivery_run_id" = r."id"
      ), '[]'::jsonb)
      WHERE r."supplier_ids" = '[]'::jsonb;`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "delivery_runs_checkout_idx";`)
    this.addSql(`ALTER TABLE "delivery_runs" DROP COLUMN IF EXISTS "pickup_spread_km";`)
    this.addSql(`ALTER TABLE "delivery_runs" DROP COLUMN IF EXISTS "delivery_fee";`)
    this.addSql(`ALTER TABLE "delivery_runs" DROP COLUMN IF EXISTS "supplier_ids";`)
    this.addSql(`ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_checkout_id_key" UNIQUE ("checkout_id");`)
  }
}

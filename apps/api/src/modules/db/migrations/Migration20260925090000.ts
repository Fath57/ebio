import { Migration } from '@mikro-orm/migrations'

/**
 * Le compte des invitations à donner son avis sur les produits.
 *
 * L'avis était demandé dans la foulée de la notation de commande, au moment
 * de la livraison — on notait donc un produit qu'on n'avait pas encore ouvert.
 * Il part maintenant des heures plus tard, et ces deux colonnes portent ce
 * qu'il faut pour ne pas relancer indéfiniment.
 */
export class Migration20260925090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "review_invites_sent" integer NOT NULL DEFAULT 0')
    this.addSql('ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "review_invite_last_sent_at" timestamptz NULL')
    this.addSql(`CREATE INDEX IF NOT EXISTS "orders_review_invite_idx"
      ON "orders" ("status", "delivered_at")
      WHERE "status" = 'DELIVERED'`)
  }

  override async down(): Promise<void> {
    this.addSql('ALTER TABLE "orders" DROP COLUMN IF EXISTS "review_invites_sent"')
    this.addSql('ALTER TABLE "orders" DROP COLUMN IF EXISTS "review_invite_last_sent_at"')
  }
}

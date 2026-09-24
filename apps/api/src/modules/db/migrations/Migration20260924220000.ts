import { Migration } from '@mikro-orm/migrations'

/**
 * `intram` parmi les prestataires acceptés par la table des paiements.
 *
 * La contrainte datait d'avant INTRAM et n'avait jamais protesté : les
 * recharges de portefeuille n'écrivent pas dans `payments`, et c'est tout ce
 * qu'on avait essayé. La première commande payée chez INTRAM aurait échoué à
 * l'insertion — après le paiement, donc avec un acheteur débité et une
 * commande jamais marquée payée.
 *
 * L'énumération du code porte aussi `stripe` et `pawerpayer` ; on les garde
 * pour ne pas invalider l'existant.
 */
export class Migration20260924220000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_provider_check"')
    this.addSql(`ALTER TABLE "payments" ADD CONSTRAINT "payments_provider_check"
      CHECK (provider = ANY (ARRAY['fedapay'::text, 'stripe'::text, 'pawerpayer'::text, 'intram'::text]))`)
  }

  override async down(): Promise<void> {
    // Revenir en arrière rejetterait des paiements déjà enregistrés.
  }
}

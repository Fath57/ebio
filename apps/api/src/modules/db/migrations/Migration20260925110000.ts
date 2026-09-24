import { Migration } from '@mikro-orm/migrations'

/**
 * La liste des types de notification, remise à jour.
 *
 * La contrainte énumère les valeurs à la main et personne ne pense à elle en
 * ajoutant un type : l'invitation à donner son avis sur les produits a été
 * refusée à l'insertion. Même famille que `payments_provider_check` la veille
 * — une énumération dupliquée entre le code et la base finit toujours par
 * diverger. La liste est ici regénérée depuis l'énumération TypeScript.
 */
export class Migration20260925110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check"')
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
      CHECK (type = ANY (ARRAY['ORDER_PLACED'::text, 'ORDER_ACCEPTED'::text, 'ORDER_REJECTED'::text, 'ORDER_READY'::text, 'ORDER_DELIVERED'::text, 'ORDER_CANCELLED'::text, 'PAYMENT_RECEIVED'::text, 'PAYMENT_RELEASED'::text, 'DISPUTE_OPENED'::text, 'DISPUTE_RESOLVED'::text, 'SUPPLIER_VALIDATED'::text, 'SUPPLIER_REJECTED'::text, 'SUPPLIER_COMPLEMENT'::text, 'STOCK_ALERT'::text, 'STOCK_AVAILABLE'::text, 'NEW_MESSAGE'::text, 'NEW_REVIEW'::text, 'PRODUCT_REVIEW_INVITE'::text, 'ESCROW_REMINDER'::text, 'PROMOTIONAL'::text, 'SYSTEM'::text, 'DELIVERY_OFFER'::text, 'DELIVERY_ASSIGNED'::text, 'DELIVERY_PICKED_UP'::text, 'DELIVERY_FAILED'::text, 'DELIVERY_REASSIGNED'::text, 'COURIER_VALIDATED'::text, 'COURIER_REJECTED'::text, 'COURIER_SUSPENDED'::text, 'COURIER_EARNING'::text, 'COURIER_PAYOUT'::text, 'COURIER_RATED'::text, 'COURIER_TIP'::text, 'BANNER_APPROVED'::text, 'BANNER_REJECTED'::text]))`)
  }

  override async down(): Promise<void> {
    // Restreindre à nouveau rejetterait des notifications déjà enregistrées.
  }
}

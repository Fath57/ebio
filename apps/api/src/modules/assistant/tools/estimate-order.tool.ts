import type { EntityManager } from '@mikro-orm/postgresql'
import type { CheckoutService } from '../../orders/checkout.service'
import type { AssistantToolContext } from './assistant-tool'
import type { AssistantCartLine } from './cart.tools'
import { z } from 'zod'
import { AssistantSession } from '../entities/assistant-session.entity'

const parameters = z.object({
  mode: z.enum(['DELIVERY', 'PICKUP']).default('DELIVERY').describe('Livraison, ou retrait en boutique si l\'acheteur le demande.'),
})

/**
 * Le prix de ce panier, calculé par le serveur.
 *
 * **Seule source d'un montant prononcé.** Promotions, frais de livraison,
 * regroupement multi-boutiques : tout cela vit dans le passage en caisse et
 * change sans prévenir. Un total que l'assistant additionnerait lui-même
 * serait juste un jour et faux le lendemain — et il engagerait eBio sur un
 * prix que personne n'a calculé.
 */
export function estimateOrderTool(em: EntityManager, checkout: CheckoutService) {
  return {
    name: 'estimer_commande',
    description: [
      'Calcule le total du panier : articles, promotions et frais de livraison.',
      'À appeler avant d\'annoncer le moindre montant global, et de nouveau après tout changement du panier.',
      'Ne jamais additionner soi-même.',
    ].join(' '),
    parameters,
    async execute(args: z.infer<typeof parameters>, context: AssistantToolContext) {
      const session = await em.findOneOrFail(AssistantSession, { id: context.sessionId })
      const cart = ((session.state as { cart?: AssistantCartLine[] }).cart ?? [])
      if (cart.length === 0) {
        return { erreur: 'Le panier est vide : rien à estimer.' }
      }

      const preview = await checkout.preview(context.buyerId, {
        items: cart.map(line => ({ productId: line.productId, quantity: line.quantity })),
        pickupMode: args.mode,
      } as never)

      return {
        total: preview.total,
        articles: preview.itemsTotal,
        livraison: preview.deliveryFee,
        remise: preview.discount,
        boutiques: [...new Set(cart.map(line => line.supplierName))],
      }
    },
  }
}

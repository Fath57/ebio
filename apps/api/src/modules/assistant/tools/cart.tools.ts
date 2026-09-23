import type { EntityManager } from '@mikro-orm/postgresql'
import type { AssistantTool, AssistantToolContext } from './assistant-tool'
import { z } from 'zod'
import { Product } from '../../products/entities/product.entity'
import { AssistantSession } from '../entities/assistant-session.entity'

/**
 * Le panier de la conversation.
 *
 * eBio n'a pas de panier côté serveur : il vit dans l'application, et le
 * passage en caisse reçoit ses lignes dans la requête. L'assistant tient donc
 * le sien dans sa session, et l'application le reprend quand la conversation
 * aboutit — plutôt que d'inventer un second panier serveur qui divergerait du
 * premier au premier bug.
 */
export interface AssistantCartLine {
  productId: string
  name: string
  supplierId: string
  supplierName: string
  quantity: number
  pricePerUnit: number
  unit: string
}

interface SessionState {
  cart?: AssistantCartLine[]
}

async function loadState(em: EntityManager, sessionId: string): Promise<{ session: AssistantSession, cart: AssistantCartLine[] }> {
  const session = await em.findOneOrFail(AssistantSession, { id: sessionId })
  const cart = ((session.state as SessionState).cart ?? [])
  return { session, cart }
}

/** Le panier tel qu'on le dit à voix haute : des lignes et un sous-total. */
function describe(cart: AssistantCartLine[]) {
  return {
    lignes: cart.map(line => ({
      produit: line.name,
      quantite: line.quantity,
      prixUnitaire: line.pricePerUnit,
      unite: line.unit,
      boutique: line.supplierName,
    })),
    sousTotal: cart.reduce((sum, line) => sum + line.pricePerUnit * line.quantity, 0),
    boutiques: [...new Set(cart.map(line => line.supplierName))],
  }
}

export function viewCartTool(em: EntityManager): AssistantTool<z.ZodObject<Record<string, never>>> {
  const parameters = z.object({})
  return {
    name: 'voir_panier',
    description: 'Montre ce qu\'il y a dans le panier en cours. À utiliser avant de récapituler, ou si l\'acheteur demande où il en est.',
    parameters,
    async execute(_args, context: AssistantToolContext) {
      const { cart } = await loadState(em, context.sessionId)
      return describe(cart)
    },
  }
}

export function addToCartTool(em: EntityManager) {
  const parameters = z.object({
    produitId: z.string().uuid().describe('L\'identifiant rendu par chercher_produits. Ne jamais l\'inventer.'),
    quantite: z.number().int().min(1).max(99).describe('Le nombre d\'unités voulu.'),
  })

  return {
    name: 'ajouter_au_panier',
    description: [
      'Ajoute un produit au panier, après accord de l\'acheteur.',
      'L\'accord peut porter sur plusieurs articles à la fois : appeler cet outil une fois par article.',
      'Si le produit y est déjà, la quantité remplace l\'ancienne.',
    ].join(' '),
    parameters,
    async execute(args: z.infer<typeof parameters>, context: AssistantToolContext) {
      const { session, cart } = await loadState(em, context.sessionId)
      const product = await em.findOne(Product, { id: args.produitId }, { populate: ['supplier'] })
      if (!product) {
        // Dire « introuvable » plutôt que de laisser le modèle conclure : il
        // s'agit probablement d'un identifiant qu'il a inventé.
        return { erreur: 'Produit introuvable. Utilisez chercher_produits et reprenez l\'identifiant rendu.' }
      }
      if (product.stock < args.quantite) {
        return { erreur: `Stock insuffisant : il reste ${product.stock} ${product.unit}.`, stockDisponible: product.stock }
      }

      const line: AssistantCartLine = {
        productId: product.id,
        name: product.name,
        supplierId: product.supplier.id,
        supplierName: product.supplier.shopName,
        quantity: args.quantite,
        pricePerUnit: Number(product.promotionalPrice ?? product.pricePerUnit),
        unit: product.unit,
      }
      const next = [...cart.filter(l => l.productId !== line.productId), line]
      session.state = { cart: next }
      await em.flush()

      return describe(next)
    },
  }
}

export function removeFromCartTool(em: EntityManager) {
  const parameters = z.object({
    produitId: z.string().uuid().describe('L\'identifiant de la ligne à retirer.'),
  })

  return {
    name: 'retirer_du_panier',
    description: 'Retire une ligne du panier. À utiliser quand l\'acheteur se ravise.',
    parameters,
    async execute(args: z.infer<typeof parameters>, context: AssistantToolContext) {
      const { session, cart } = await loadState(em, context.sessionId)
      const next = cart.filter(line => line.productId !== args.produitId)
      session.state = { cart: next }
      await em.flush()
      return describe(next)
    },
  }
}

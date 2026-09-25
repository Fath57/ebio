import type { EntityManager } from '@mikro-orm/postgresql'
import type { AssistantTool, AssistantToolContext } from './assistant-tool'
import { z } from 'zod'
import { thumbnailUrlFor } from '../../../common/media-urls'
import { Product } from '../../products/entities/product.entity'
import { AssistantSession } from '../entities/assistant-session.entity'

/**
 * The conversation's cart.
 *
 * eBio has no server-side cart: it lives in the app, and checkout receives its
 * lines in the request. So the assistant keeps its own in the session, and the
 * app picks it up when the conversation lands — rather than inventing a second
 * server cart that would drift from the first at the first bug.
 */
export interface AssistantCartLine {
  productId: string
  name: string
  supplierId: string
  supplierName: string
  quantity: number
  pricePerUnit: number
  unit: string
  /** Thumbnail when the product has one, so the screen shows what was added. */
  imageUrl: string | null
}

interface SessionState {
  cart?: AssistantCartLine[]
}

export async function loadState(em: EntityManager, sessionId: string): Promise<{ cart: AssistantCartLine[] }> {
  const session = await em.findOneOrFail(AssistantSession, { id: sessionId })
  return { cart: (session.state as SessionState).cart ?? [] }
}

/**
 * Writes one cart line **in a single statement**.
 *
 * The model calls its tools in parallel: "mets-moi de l'huile et du piment"
 * fires two additions in the same step. Read-modify-write has both read the
 * empty cart and the second overwrite the first — an item vanishes silently,
 * and the assistant announces that everything is there anyway. So Postgres
 * does the merge itself.
 *
 * `line` at `null` removes the line for `productId`.
 */
export async function writeCartLine(
  em: EntityManager,
  sessionId: string,
  line: AssistantCartLine | null,
  removeProductId?: string,
): Promise<AssistantCartLine[]> {
  const targetId = line?.productId ?? removeProductId
  const rows = await em.getConnection().execute<Array<{ state: SessionState }>>(
    `UPDATE assistant_sessions
     SET state = jsonb_set(
       COALESCE(state, '{}'::jsonb),
       '{cart}',
       COALESCE(
         (SELECT jsonb_agg(l)
          FROM jsonb_array_elements(COALESCE(state->'cart', '[]'::jsonb)) l
          WHERE l->>'productId' <> ?),
         '[]'::jsonb
       ) || ?::jsonb
     ),
     "updatedAt" = NOW()
     WHERE id = ?
     RETURNING state`,
    [targetId ?? '', line ? JSON.stringify([line]) : '[]', sessionId],
  )

  // The in-memory entity still carries the old state: the rest of the turn
  // would read a stale cart.
  em.clear()
  return (rows[0]?.state as SessionState).cart ?? []
}

/** The cart as it is said aloud: lines and a subtotal. */
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
    quantite: z.number().int().min(1).max(999).describe('Le nombre d\'unités voulu. La disponibilité réelle est vérifiée ici : proposer la quantité demandée, l\'outil dira s\'il n\'y en a pas assez.'),
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
      const product = await em.findOne(Product, { id: args.produitId }, { populate: ['supplier'] })
      if (!product) {
        // Say "not found" rather than let the model draw its own conclusion:
        // this is most likely an id it made up.
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
        // Same thumbnail the catalogue shows: recognising the picture is
        // faster than reading the name, and it catches the wrong product.
        imageUrl: thumbnailUrlFor(product.photos[0]) ?? product.photos[0] ?? null,
      }

      const next = await writeCartLine(em, context.sessionId, line)
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
      const next = await writeCartLine(em, context.sessionId, null, args.produitId)
      return describe(next)
    },
  }
}

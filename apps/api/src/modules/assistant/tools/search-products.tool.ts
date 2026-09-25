import type { SearchService } from '../../search/search.service'
import type { AssistantTool } from './assistant-tool'
import { z } from 'zod'

/** Beyond this, the answer no longer fits in one spoken sentence. */
const MAX_RESULTS = 5

const parameters = z.object({
  termes: z.string().min(1).describe('Le produit seul, dans les mots de l\'acheteur : « gari », « huile rouge », « riz parfumé ». Jamais la quantité ni l\'unité — « tomate », pas « tomate 2 kg ».'),
  prixMaximum: z.number().positive().optional().describe('Plafond en FCFA, seulement si l\'acheteur en a donné un.'),
})

/**
 * The catalogue search, exactly as the app already uses it.
 *
 * It returns only active, in-stock products: offering an unavailable item out
 * loud costs a turn of conversation, and some trust. And it returns few —
 * five references read to an ear are already four too many.
 */
export function searchProductsTool(search: SearchService): AssistantTool<typeof parameters> {
  return {
    name: 'chercher_produits',
    description: [
      'Cherche des produits dans le catalogue eBio.',
      'À utiliser dès que l\'acheteur nomme quelque chose à acheter, avant toute proposition.',
      'Ne jamais citer un produit, un prix ou une disponibilité sans être passé par ici.',
    ].join(' '),
    parameters,
    async execute(args) {
      const result = await search.searchProducts({
        q: args.termes,
        maxPrice: args.prixMaximum,
        inStockOnly: 'true',
        validatedOnly: 'false',
        promoOnly: 'false',
        page: 1,
        limit: MAX_RESULTS,
      } as never)

      // The search returns `{ results: [{ supplier, product }] }` — not a
      // flat list. Getting the shape wrong here breaks nothing visibly: the
      // assistant simply answers that it finds nothing, every time.
      const results = ((result as { results?: Array<{ supplier?: Record<string, unknown>, product?: Record<string, unknown> }> }).results ?? [])
        .slice(0, MAX_RESULTS)

      // The model gets exactly what it needs to speak: everything else is
      // noise it would pay for in tokens and might repeat badly.
      return {
        produits: results
          .filter(entry => entry.product?.inStock !== false)
          .map(({ supplier, product }) => ({
            id: product?.id,
            nom: product?.name,
            prix: product?.promotionalPrice ?? product?.pricePerUnit,
            unite: product?.unit,
            boutique: supplier?.shopName ?? null,
            boutiqueId: supplier?.id ?? null,
          })),
      }
    },
  }
}

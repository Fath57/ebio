import type { SearchService } from '../../search/search.service'
import type { AssistantTool } from './assistant-tool'
import { z } from 'zod'

/** Au-delà, la réponse ne tient plus dans une phrase dite à voix haute. */
const MAX_RESULTS = 5

const parameters = z.object({
  termes: z.string().min(1).describe('Ce que l\'acheteur demande, dans ses mots : « gari », « huile rouge », « riz parfumé ».'),
  prixMaximum: z.number().positive().optional().describe('Plafond en FCFA, seulement si l\'acheteur en a donné un.'),
})

/**
 * La recherche du catalogue, telle que l'application l'utilise déjà.
 *
 * Elle ne rend que des produits actifs et en stock : proposer à voix haute un
 * article indisponible fait perdre un tour de conversation, et de la
 * confiance. Et elle en rend peu — cinq références lues à l'oreille sont déjà
 * quatre de trop.
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

      const items = ((result as { items?: unknown[] }).items ?? []).slice(0, MAX_RESULTS)

      // Le modèle reçoit le strict nécessaire pour parler : tout le reste est
      // du bruit qu'il paierait en jetons et pourrait recracher de travers.
      return {
        produits: items.map((raw) => {
          const p = raw as Record<string, unknown>
          const supplier = p.supplier as Record<string, unknown> | undefined
          return {
            id: p.id,
            nom: p.name,
            prix: p.promotionalPrice ?? p.pricePerUnit,
            unite: p.unit,
            stock: p.stock,
            boutique: supplier?.shopName ?? null,
            boutiqueId: supplier?.id ?? null,
          }
        }),
      }
    },
  }
}

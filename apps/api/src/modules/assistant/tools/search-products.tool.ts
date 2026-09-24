import type { SearchService } from '../../search/search.service'
import type { AssistantTool } from './assistant-tool'
import { z } from 'zod'

/** Au-delà, la réponse ne tient plus dans une phrase dite à voix haute. */
const MAX_RESULTS = 5

const parameters = z.object({
  termes: z.string().min(1).describe('Le produit seul, dans les mots de l\'acheteur : « gari », « huile rouge », « riz parfumé ». Jamais la quantité ni l\'unité — « tomate », pas « tomate 2 kg ».'),
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

      // La recherche rend `{ results: [{ supplier, product }] }` — pas une
      // liste plate. Se tromper de forme ici ne casse rien visiblement :
      // l'assistant répond simplement qu'il ne trouve rien, toujours.
      const results = ((result as { results?: Array<{ supplier?: Record<string, unknown>, product?: Record<string, unknown> }> }).results ?? [])
        .slice(0, MAX_RESULTS)

      // Le modèle reçoit le strict nécessaire pour parler : tout le reste est
      // du bruit qu'il paierait en jetons et pourrait recracher de travers.
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

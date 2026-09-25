import type { DescribeProductInput, ProductDescription } from './contracts/product-copy.contract'
import { Injectable, Logger } from '@nestjs/common'
import { AiService } from '../ai/ai.service'

/** Long enough to be useful on a product page, short enough to be read. */
const MAX_CHARACTERS = 400

/**
 * Writing a product description from what the shop already declared.
 *
 * The model rewrites; it does not research. Everything it is allowed to say
 * arrives in the prompt, because a description that invents "produit bio du
 * plateau d'Abomey" for a product nobody described that way is a promise the
 * shop never made — and the buyer is the one who discovers it.
 */
@Injectable()
export class ProductCopyService {
  private readonly logger = new Logger(ProductCopyService.name)

  constructor(private readonly aiService: AiService) {}

  async describe(input: DescribeProductInput): Promise<ProductDescription> {
    const facts = [
      `Nom : ${input.name}`,
      input.categoryName ? `Catégorie : ${input.categoryName}` : null,
      input.unit ? `Vendu par : ${input.unit}` : null,
      input.origin ? `Origine déclarée : ${input.origin}` : null,
      input.ingredients ? `Composition : ${input.ingredients}` : null,
      input.conservation ? `Conservation : ${input.conservation}` : null,
      input.labels?.length ? `Labels déclarés : ${input.labels.join(', ')}` : null,
      input.current?.trim() ? `Texte actuel à retravailler : ${input.current.trim()}` : null,
    ].filter(Boolean).join('\n')

    const prompt = [
      'Tu rédiges la description d\'un produit pour une place de marché alimentaire au Bénin.',
      'Les acheteurs lisent sur un téléphone, souvent en connexion lente.',
      '',
      'Informations fournies par le vendeur :',
      facts,
      '',
      'Règles :',
      '- N\'utilise QUE les informations ci-dessus. N\'invente ni origine, ni label,',
      '  ni certification, ni mode de production, ni bienfait pour la santé.',
      '- Si une information manque, n\'en parle pas. Ne la devine pas.',
      '- Deux à trois phrases, 400 caractères au maximum.',
      '- Rédige des phrases, ne recopie pas la fiche. N\'énumère pas les champs',
      '  et ne reprends pas les étiquettes « Origine : », « Composition : ».',
      '- Ne nomme pas la catégorie : l\'acheteur la voit déjà au-dessus.',
      '- Français simple, ton concret. Pas de superlatifs, pas de « délicieux »,',
      '  pas de promesse de santé, pas de point d\'exclamation.',
      '- Une seule idée d\'usage, et seulement si elle va de soi. Sinon, n\'en mets pas.',
      '- Réponds par la description seule, sans titre ni guillemets.',
    ].join('\n')

    const generated = await this.aiService.generateText({
      prompt,
      // No model named: the registry's default applies, which is the house
      // model. One place decides, and it is `ai.config.ts`.
      options: { providerOptions: { openai: { reasoningEffort: 'low' } } },
    })

    // A description is a paragraph: the model sometimes answers in lines, and
    // the field renders them as an oddly broken block.
    const description = generated.result
      .trim()
      .replace(/\s*\n\s*/g, ' ')
      .replace(/^["'«»\s]+|["'«»\s]+$/g, '')
    if (description.length > MAX_CHARACTERS) {
      this.logger.warn(`Description trimmed from ${description.length} characters`)
    }

    return { description: description.slice(0, MAX_CHARACTERS) }
  }
}

import type { AiCoreMessage } from '../ai/contracts/ai.contract'
import type { AssistantTool, RecordedToolCall } from './tools/assistant-tool'
import type { AssistantCartLine } from './tools/cart.tools'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { tool } from 'ai'
import { config } from '../../config/env.config'
import { AiService } from '../ai/ai.service'
import { User } from '../auth/auth.entity'
import { CheckoutService } from '../orders/checkout.service'
import { SearchService } from '../search/search.service'
import { ASSISTANT_SYSTEM_PROMPT } from './assistant.prompt'
import { amountsFromTools, forSpeech, groundingBreaches } from './assistant.guardrails'
import { AssistantSession } from './entities/assistant-session.entity'
import { AssistantTurn } from './entities/assistant-turn.entity'
import { addToCartTool, loadState, removeFromCartTool, viewCartTool, writeCartLine } from './tools/cart.tools'
import { estimateOrderTool } from './tools/estimate-order.tool'
import { lastOrdersTool, ongoingOrdersTool, orderStatusTool } from './tools/orders.tools'
import { searchProductsTool } from './tools/search-products.tool'

export interface AssistantTurnResult {
  sessionId: string
  reply: string
  cart: AssistantCartLine[]
  toolCalls: RecordedToolCall[]
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly ai: AiService,
    private readonly search: SearchService,
    private readonly checkout: CheckoutService,
  ) {}

  /**
   * Tout ce que le modèle sait faire.
   *
   * Il n'y a pas d'outil de paiement, et c'est le garde-fou : ce qui n'existe
   * pas ne s'appelle pas par erreur. Une consigne d'invite, elle, se contourne.
   */
  private toolset(): AssistantTool[] {
    return [
      searchProductsTool(this.search),
      viewCartTool(this.em),
      addToCartTool(this.em),
      removeFromCartTool(this.em),
      estimateOrderTool(this.em, this.checkout),
      ongoingOrdersTool(this.em),
      orderStatusTool(this.em),
      lastOrdersTool(this.em),
    ] as AssistantTool[]
  }

  async openSession(buyerId: string): Promise<AssistantSession> {
    const buyer = await this.em.findOneOrFail(User, { id: buyerId })
    const session = this.em.create(AssistantSession, { buyer })
    await this.em.persistAndFlush(session)
    return session
  }

  /**
   * Un tour de parole, en texte.
   *
   * L'audio viendra se brancher autour, sans toucher à ceci : la conversation
   * est le vrai sujet, et elle se teste entièrement au clavier.
   */
  async handleTurn(buyerId: string, sessionId: string | null, message: string): Promise<AssistantTurnResult> {
    const session = sessionId
      ? await this.em.findOne(AssistantSession, { id: sessionId, buyer: { id: buyerId } })
      : await this.openSession(buyerId)

    if (!session) {
      throw new BadRequestException('Conversation introuvable.')
    }

    const context = { buyerId, sessionId: session.id }
    const recorded: RecordedToolCall[] = []

    const tools = Object.fromEntries(this.toolset().map(definition => [
      definition.name,
      tool({
        description: definition.description,
        inputSchema: definition.parameters,
        execute: async (args: unknown) => {
          const startedAt = Date.now()
          const result = await definition.execute(args as never, context)
          // Journalisé pour pouvoir le relire : un ancrage qu'on ne peut pas
          // vérifier après coup n'est pas un ancrage.
          recorded.push({ name: definition.name, args, result, ms: Date.now() - startedAt })
          return result
        },
      }),
    ]))

    const history = session.messages as AiCoreMessage[]
    // L'invite système ouvre le fil une seule fois : elle fait partie de la
    // conversation, elle ne se répète pas à chaque tour.
    const messages: AiCoreMessage[] = history.length > 0
      ? [...history, { role: 'user', content: message }]
      : [
          { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
          { role: 'user', content: message },
        ]

    let text: string
    let usage: { promptTokens?: number, completionTokens?: number }
    try {
      const result = await this.ai.chat({
        messages,
        tools,
        model: config.assistant.model,
        options: {
          // Une boucle bornée : un modèle qui s'entête sur un outil coûterait
          // une fortune sans que personne ne le voie avant la facture.
          stopWhen: config.assistant.maxSteps,
        },
      })
      text = forSpeech(result.result)
      usage = (result as { usage?: { promptTokens?: number, completionTokens?: number } }).usage ?? {}

      text = await this.repairIfUngrounded(session, messages, tools, text, recorded)
      session.messages = [...messages, { role: 'assistant', content: text }] as unknown[]
    }
    catch (error) {
      this.logger.error(`Tour d'assistant échoué (session ${session.id}) — ${error}`)
      throw new ServiceUnavailableException('L\'assistant est momentanément indisponible.')
    }

    this.em.create(AssistantTurn, {
      session,
      input: message,
      output: text,
      toolCalls: recorded as unknown[],
      inputTokens: usage.promptTokens ?? 0,
      outputTokens: usage.completionTokens ?? 0,
    })
    await this.em.flush()

    await this.rememberAmounts(session.id, recorded)

    const fresh = await this.em.findOneOrFail(AssistantSession, { id: session.id })
    return {
      sessionId: session.id,
      reply: text,
      cart: ((fresh.state as { cart?: AssistantCartLine[] }).cart ?? []),
      toolCalls: recorded,
    }
  }

  /**
   * Une seconde chance, quand ce qui a été dit ne tient pas face aux outils.
   *
   * Le modèle annonce parfois un total qu'il a additionné lui-même, ou dit la
   * livraison comprise alors que rien ne l'a calculée. L'invite le lui interdit
   * déjà ; une invite ne garantit rien. On le lui met sous les yeux et on lui
   * redonne la parole, une fois — avec ses outils, pour qu'il puisse aller
   * chercher le chiffre au lieu de le retirer.
   *
   * Le tour fautif ne reste pas dans l'historique : l'acheteur ne l'a jamais
   * entendu, et le laisser là apprendrait au modèle que c'était acceptable.
   */
  private async repairIfUngrounded(
    session: AssistantSession,
    messages: AiCoreMessage[],
    tools: Parameters<AiService['chat']>[0]['tools'],
    text: string,
    recorded: RecordedToolCall[],
  ): Promise<string> {
    const known = (session.state as { montants?: number[] }).montants ?? []
    const breaches = groundingBreaches(text, recorded, known)
    if (breaches.length === 0) {
      return text
    }

    this.logger.warn(`Réponse reprise (session ${session.id}) — ${breaches.map(b => b.what).join(' ; ')}`)

    const repaired = await this.ai.chat({
      messages: [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'system', content: breaches.map(breach => breach.fix).join('\n') },
      ],
      tools,
      model: config.assistant.model,
      options: { stopWhen: config.assistant.maxSteps },
    })

    const second = forSpeech(repaired.result)
    if (groundingBreaches(second, recorded, known).length > 0) {
      // Deux fois de suite : on ne laisse pas passer un prix que personne n'a
      // fixé. Mieux vaut une phrase qui n'avance rien qu'un montant inventé.
      this.logger.error(`Ancrage toujours rompu après reprise (session ${session.id})`)
      return 'Attendez, je me suis embrouillée sur les chiffres. Redites-moi ce qu\'il vous faut ?'
    }

    return second
  }

  /**
   * Les montants que les outils ont rendus, gardés pour les tours suivants.
   *
   * Redire un prix trouvé deux tours plus tôt est normal : sans mémoire, la
   * vérification le prendrait pour une invention et reprendrait le modèle à
   * chaque phrase. Écrit à part du panier, qui s'écrit ailleurs au même moment.
   */
  private async rememberAmounts(sessionId: string, recorded: RecordedToolCall[]): Promise<void> {
    const amounts = [...amountsFromTools(recorded)]
    if (amounts.length === 0) {
      return
    }

    await this.em.getConnection().execute(
      `UPDATE assistant_sessions
       SET state = jsonb_set(
             COALESCE(state, '{}'::jsonb),
             '{montants}',
             (
               SELECT COALESCE(jsonb_agg(DISTINCT m), '[]'::jsonb)
               FROM jsonb_array_elements(
                 COALESCE(state->'montants', '[]'::jsonb) || ?::jsonb
               ) m
             )
           ),
           "updatedAt" = NOW()
       WHERE id = ?`,
      [JSON.stringify(amounts), sessionId],
    )
    this.em.clear()
  }

  /**
   * Le panier corrigé à la main, sans passer par la parole.
   *
   * Retirer une ligne se dit mal et se touche bien. La correction passe par la
   * même écriture atomique que les outils : l'acheteur peut très bien appuyer
   * pendant que l'assistant ajoute autre chose.
   */
  async adjustCart(buyerId: string, sessionId: string, productId: string, quantity: number): Promise<AssistantCartLine[]> {
    const session = await this.em.findOne(AssistantSession, { id: sessionId, buyer: { id: buyerId } })
    if (!session) {
      throw new BadRequestException('Conversation introuvable.')
    }

    if (quantity === 0) {
      return await writeCartLine(this.em, sessionId, null, productId)
    }

    const { cart } = await loadState(this.em, sessionId)
    const line = cart.find(item => item.productId === productId)
    if (!line) {
      throw new BadRequestException('Cette ligne n\'est pas dans le panier.')
    }

    return await writeCartLine(this.em, sessionId, { ...line, quantity })
  }
}

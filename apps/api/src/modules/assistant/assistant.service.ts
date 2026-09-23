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
import { AssistantSession } from './entities/assistant-session.entity'
import { AssistantTurn } from './entities/assistant-turn.entity'
import { addToCartTool, removeFromCartTool, viewCartTool } from './tools/cart.tools'
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
      text = result.result
      usage = (result as { usage?: { promptTokens?: number, completionTokens?: number } }).usage ?? {}
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

    const fresh = await this.em.findOneOrFail(AssistantSession, { id: session.id })
    return {
      sessionId: session.id,
      reply: text,
      cart: ((fresh.state as { cart?: AssistantCartLine[] }).cart ?? []),
      toolCalls: recorded,
    }
  }
}

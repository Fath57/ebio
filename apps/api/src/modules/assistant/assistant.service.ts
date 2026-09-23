import type { LanguageModel, ModelMessage } from 'ai'
import type { AssistantTool, RecordedToolCall } from './tools/assistant-tool'
import type { AssistantCartLine } from './tools/cart.tools'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { generateText, stepCountIs, tool } from 'ai'
import { config } from '../../config/env.config'
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
    private readonly search: SearchService,
    private readonly checkout: CheckoutService,
  ) {}

  /**
   * Le modèle configuré.
   *
   * Sans clé, l'assistant est simplement absent : l'API démarre, et seul
   * l'appel échoue — un déploiement ne doit pas tomber parce qu'une
   * fonctionnalité facultative n'est pas branchée.
   */
  private model(): LanguageModel {
    const { apiKey, provider, model } = config.assistant
    if (!apiKey) {
      throw new ServiceUnavailableException('L\'assistant n\'est pas configuré sur ce serveur.')
    }
    switch (provider) {
      case 'openai':
        return createOpenAI({ apiKey })(model)
      case 'google':
        return createGoogleGenerativeAI({ apiKey })(model)
      case 'mistral':
        return createMistral({ apiKey })(model)
      default:
        return createAnthropic({ apiKey })(model)
    }
  }

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

    const history = session.messages as ModelMessage[]
    const messages: ModelMessage[] = [...history, { role: 'user', content: message }]

    let text: string
    let usage: { inputTokens?: number, outputTokens?: number }
    try {
      const result = await generateText({
        model: this.model(),
        system: ASSISTANT_SYSTEM_PROMPT,
        messages,
        tools,
        // Une boucle bornée : un modèle qui s'entête sur un outil coûterait
        // une fortune sans que personne ne le voie avant la facture.
        stopWhen: stepCountIs(config.assistant.maxSteps),
      })
      text = result.text
      usage = result.totalUsage
      session.messages = [...messages, ...result.response.messages] as unknown[]
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
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
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

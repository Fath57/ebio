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
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { amountsFromTools, forSpeech, groundingBreaches, takeSentences } from './assistant.guardrails'
import { ASSISTANT_SYSTEM_PROMPT } from './assistant.prompt'
import { AssistantSession } from './entities/assistant-session.entity'
import { AssistantTurn } from './entities/assistant-turn.entity'
import { addToCartTool, loadState, removeFromCartTool, viewCartTool, writeCartLine } from './tools/cart.tools'
import { estimateOrderTool } from './tools/estimate-order.tool'
import { lastOrdersTool, ongoingOrdersTool, orderStatusTool } from './tools/orders.tools'
import { searchProductsTool } from './tools/search-products.tool'

/**
 * Ce qui part vers l'écran pendant qu'il parle.
 *
 * Une phrase à la fois plutôt qu'un mot à la fois : c'est le grain auquel on
 * peut vérifier. Un montant coupé en deux ne s'ancre pas, et « 2 500 » ne doit
 * pas s'afficher au moment où le modèle a écrit « 2 ».
 */
export type AssistantStreamEvent
  = | { type: 'session', sessionId: string }
    | { type: 'phrase', text: string }
    | { type: 'cart', cart: AssistantCartLine[] }
  /** Ce qui a été dit ne tenait pas : l'écran efface et on recommence. */
    | { type: 'reset' }
    | { type: 'done', reply: string, cart: AssistantCartLine[] }
    | { type: 'error', message: string }

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
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /**
   * L'assistant peut être fermé depuis le back-office.
   *
   * Vérifié à chaque tour plutôt qu'au démarrage : couper un assistant qui
   * répond mal ne doit pas demander un déploiement, et la conversation en
   * cours s'arrête au tour suivant.
   */
  private async assertOpen(): Promise<void> {
    if (!(await this.platformSettings.getAssistantEnabled())) {
      throw new ServiceUnavailableException('L\'assistant n\'est pas disponible pour le moment.')
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
  /**
   * Ce qu'il faut pour parler : la conversation, ses outils, son historique.
   *
   * Partagé par le tour d'un bloc et le tour diffusé — c'est le même échange,
   * seule la façon de le rendre change.
   */
  private async prepareTurn(buyerId: string, sessionId: string | null, message: string) {
    await this.assertOpen()

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

    return { session, tools, messages, recorded }
  }

  /** Le panier tel qu'il est en base, relu après les écritures du tour. */
  private async currentCart(sessionId: string): Promise<AssistantCartLine[]> {
    const fresh = await this.em.findOneOrFail(AssistantSession, { id: sessionId })
    return (fresh.state as { cart?: AssistantCartLine[] }).cart ?? []
  }

  /** Clôt un tour : l'historique, la trace, les montants retenus. */
  private async closeTurn(
    session: AssistantSession,
    messages: AiCoreMessage[],
    message: string,
    text: string,
    recorded: RecordedToolCall[],
    usage: { promptTokens?: number, completionTokens?: number },
  ): Promise<void> {
    session.messages = [...messages, { role: 'assistant', content: text }] as unknown[]

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
  }

  async handleTurn(buyerId: string, sessionId: string | null, message: string): Promise<AssistantTurnResult> {
    const { session, tools, messages, recorded } = await this.prepareTurn(buyerId, sessionId, message)

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
    }
    catch (error) {
      this.logger.error(`Tour d'assistant échoué (session ${session.id}) — ${error}`)
      throw new ServiceUnavailableException('L\'assistant est momentanément indisponible.')
    }

    await this.closeTurn(session, messages, message, text, recorded, usage)

    return {
      sessionId: session.id,
      reply: text,
      cart: await this.currentCart(session.id),
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
        // Rôle « user » et non « system » : un second message système en fin de
        // conversation est refusé par Anthropic (« multiple system messages
        // separated by user/assistant »), et la reprise échouait en silence.
        { role: 'user', content: breaches.map(breach => breach.fix).join('\n') },
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
   * Le même tour, dit au fil de l'eau.
   *
   * La diffusion et la vérification se contredisent : lire un montant inventé
   * à voix haute avant de pouvoir le reprendre, c'est exactement ce que les
   * garde-fous existent pour empêcher. D'où le grain de la phrase — on ne
   * diffuse qu'une phrase achevée *et* vérifiée. L'attente tombe de tout le
   * tour à une phrase, sans rien céder sur l'ancrage.
   *
   * Si une phrase ne tient pas, rien de plus n'est diffusé : on reprend le
   * tour entier hors flux et l'écran efface ce qu'il montrait. C'est rare, et
   * mieux vaut un effacement qu'un prix que personne n'a fixé.
   */
  async* handleTurnStream(
    buyerId: string,
    sessionId: string | null,
    message: string,
  ): AsyncGenerator<AssistantStreamEvent> {
    const { session, tools, messages, recorded } = await this.prepareTurn(buyerId, sessionId, message)
    yield { type: 'session', sessionId: session.id }

    const known = (session.state as { montants?: number[] }).montants ?? []
    let spoken = ''
    let buffer = ''
    let breached = false
    let failed = false
    let usage: { promptTokens?: number, completionTokens?: number } = {}
    let cartSignature = JSON.stringify(await this.currentCart(session.id))

    try {
      for await (const event of this.ai.streamTextGenerator({
        messages,
        tools,
        model: config.assistant.model,
        options: { stopWhen: config.assistant.maxSteps },
      })) {
        if (event.type === 'chunk') {
          buffer += event.text
          const { sentences, rest } = takeSentences(buffer)
          buffer = rest

          for (const sentence of sentences) {
            const clean = forSpeech(sentence)
            if (groundingBreaches(clean, recorded, known).length > 0) {
              breached = true
              break
            }
            spoken = `${spoken}${spoken.length > 0 ? ' ' : ''}${clean}`
            yield { type: 'phrase', text: clean }
          }

          if (breached) {
            break
          }
        }

        // Le panier se remplit sous les yeux, pendant qu'il parle : c'est la
        // preuve visible que ce qu'il dit a bien eu lieu.
        if (event.type === 'tool-result') {
          const cart = await this.currentCart(session.id)
          const signature = JSON.stringify(cart)
          if (signature !== cartSignature) {
            cartSignature = signature
            yield { type: 'cart', cart }
          }
        }

        // Le flux peut se rompre en cours de phrase. Sans ce cas, la boucle
        // s'arrêtait sans bruit et le texte partiel était enregistré comme la
        // réponse : un tour s'est terminé sur « D'accord. J ».
        if (event.type === 'error') {
          this.logger.error(`Flux interrompu (session ${session.id}) — ${JSON.stringify((event as { error?: unknown }).error ?? event)}`)
          failed = true
          break
        }

        if (event.type === 'done') {
          usage = (event as { usage?: { promptTokens?: number, completionTokens?: number } }).usage ?? {}
        }
      }
    }
    catch (error) {
      this.logger.error(`Tour diffusé échoué (session ${session.id}) — ${error}`)
      yield { type: 'error', message: 'L\'assistant est momentanément indisponible.' }
      return
    }

    if (failed) {
      // Rien n'est enregistré : une réponse coupée en deux vaut moins que pas
      // de réponse, et le tour se refait.
      yield { type: 'error', message: 'La réponse s\'est interrompue. Redites-moi ?' }
      return
    }

    // La dernière phrase n'est suivie d'aucune espace : elle sort du tampon ici.
    const tail = forSpeech(buffer)
    if (!breached && tail.length > 0) {
      if (groundingBreaches(tail, recorded, known).length > 0) {
        breached = true
      }
      else {
        spoken = `${spoken}${spoken.length > 0 ? ' ' : ''}${tail}`
        yield { type: 'phrase', text: tail }
      }
    }

    let reply = spoken
    if (breached || spoken.trim().length === 0) {
      const whole = forSpeech(`${spoken} ${buffer}`)
      reply = await this.repairIfUngrounded(session, messages, tools, whole, recorded)
      yield { type: 'reset' }
      yield { type: 'phrase', text: reply }
    }

    await this.closeTurn(session, messages, message, reply, recorded, usage)
    yield { type: 'done', reply, cart: await this.currentCart(session.id) }
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

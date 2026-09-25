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
import { amountsFromTools, forSpeech, groundingBreaches, takeSentences, ungroundedAmounts } from './assistant.guardrails'
import { assistantSystemPrompt } from './assistant.prompt'
import { AssistantSession } from './entities/assistant-session.entity'
import { AssistantTurn } from './entities/assistant-turn.entity'
import { addToCartTool, loadState, removeFromCartTool, viewCartTool, writeCartLine } from './tools/cart.tools'
import { estimateOrderTool } from './tools/estimate-order.tool'
import { lastOrdersTool, ongoingOrdersTool, orderStatusTool } from './tools/orders.tools'
import { searchProductsTool } from './tools/search-products.tool'

/**
 * What reaches the screen while she is speaking.
 *
 * One sentence at a time rather than one word: that is the grain at which
 * anything can be checked. Half an amount cannot be grounded, and "2 500" must
 * not appear the moment the model has written "2".
 */
export type AssistantStreamEvent
  = | { type: 'session', sessionId: string }
    | { type: 'phrase', text: string }
    | { type: 'cart', cart: AssistantCartLine[] }
  /** What was said did not hold: the screen clears and we start over. */
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
   * The assistant can be closed from the back-office.
   *
   * Checked on every turn rather than at boot: cutting off an assistant that
   * answers badly must not require a deploy, and a conversation in progress
   * stops at its next turn.
   */
  private async assertOpen(): Promise<void> {
    if (!(await this.platformSettings.getAssistantEnabled())) {
      throw new ServiceUnavailableException('L\'assistant n\'est pas disponible pour le moment.')
    }
  }

  /**
   * Everything the model can do, and nothing more.
   *
   * There is no payment tool, and that is the guardrail: what does not exist
   * cannot be called by mistake. A prompt instruction, by contrast, can be
   * talked around.
   */
  /**
   * The tools, shared with the spoken session.
   *
   * One list for both ways of talking to her: a tool that exists in writing
   * and not in speech would be a second assistant with a second doctrine.
   */
  toolset(): AssistantTool[] {
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
   * One turn of the conversation, in text.
   *
   * Audio plugs in around this without touching it: the conversation is the
   * real subject, and it can be tested entirely from a keyboard.
   */
  /**
   * What a turn needs: the conversation, its tools, its history.
   *
   * Shared by the one-shot turn and the streamed one — it is the same
   * exchange, only the way it is delivered differs.
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
          // Recorded so it can be read back: grounding that cannot be
          // verified afterwards is not grounding.
          recorded.push({ name: definition.name, args, result, ms: Date.now() - startedAt })
          return result
        },
      }),
    ]))

    const history = session.messages as AiCoreMessage[]
    // The system prompt opens the thread once: it is part of the
    // conversation, not something repeated on every turn. Her name is read
    // here rather than at boot, so renaming her from the back-office takes
    // effect on the next conversation without a deploy.
    const messages: AiCoreMessage[] = history.length > 0
      ? [...history, { role: 'user', content: message }]
      : [
          { role: 'system', content: assistantSystemPrompt((await this.platformSettings.getAssistantIdentity()).name) },
          { role: 'user', content: message },
        ]

    return { session, tools, messages, recorded }
  }

  /** The cart as the database holds it, re-read after the turn's writes. */
  private async currentCart(sessionId: string): Promise<AssistantCartLine[]> {
    const fresh = await this.em.findOneOrFail(AssistantSession, { id: sessionId })
    return (fresh.state as { cart?: AssistantCartLine[] }).cart ?? []
  }

  /** Closes a turn: the history, the trace, the amounts kept. */
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
          // A bounded loop: a model that keeps hammering a tool would cost a
          // fortune before anyone noticed, and the bill comes later.
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
   * A second chance, when what was said does not survive the tools.
   *
   * The model sometimes announces a total it added up itself, or claims
   * delivery is included when nothing computed it. The prompt already forbids
   * both; a prompt guarantees nothing. So we put the breach in front of it and
   * hand the floor back, once — with its tools, so it can go and fetch the
   * figure rather than drop it.
   *
   * The offending turn does not stay in the history: the buyer never heard it,
   * and leaving it there would teach the model that it was acceptable.
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
        // Role "user" and not "system": a second system message at the end of
        // a conversation is refused by Anthropic ("multiple system messages
        // separated by user/assistant"), and the repair failed silently.
        { role: 'user', content: breaches.map(breach => breach.fix).join('\n') },
      ],
      tools,
      model: config.assistant.model,
      options: { stopWhen: config.assistant.maxSteps },
    })

    const second = forSpeech(repaired.result)
    if (groundingBreaches(second, recorded, known).length > 0) {
      // Twice in a row: a price nobody set does not get through. A sentence
      // that says nothing beats an invented amount.
      this.logger.error(`Ancrage toujours rompu après reprise (session ${session.id})`)
      return 'Attendez, je me suis embrouillée sur les chiffres. Redites-moi ce qu\'il vous faut ?'
    }

    return second
  }

  /**
   * The amounts the tools returned, kept for the turns that follow.
   *
   * Repeating a price found two turns ago is normal: without this memory the
   * check would read it as an invention and correct the model on every
   * sentence. Written apart from the cart, which is written elsewhere at the
   * same moment.
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
   * The same turn, delivered as it comes.
   *
   * Streaming and verification pull against each other: reading an invented
   * amount aloud before it can be taken back is exactly what the guardrails
   * exist to prevent. Hence the sentence as the unit — only a sentence that is
   * both finished *and* checked goes out. The wait drops from a whole turn to
   * one sentence, conceding nothing on grounding.
   *
   * If a sentence does not hold, nothing further is streamed: the whole turn
   * is redone off-stream and the screen clears what it was showing. It is
   * rare, and a cleared screen beats a price nobody set.
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
    /** Everything the model wrote, streamed or not: the repair needs it. */
    let collected = ''
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
            collected = `${collected}${collected.length > 0 ? ' ' : ''}${clean}`

            if (breached) {
              continue
            }

            // Only amounts can be judged sentence by sentence: a figure
            // spoken must come from a tool already called. The rest — "c'est
            // noté", "livraison comprise" — depends on tools that may follow
            // the text in the stream, and is judged at the end.
            if (ungroundedAmounts(clean, recorded).some(amount => !known.includes(amount))) {
              breached = true
              continue
            }

            spoken = `${spoken}${spoken.length > 0 ? ' ' : ''}${clean}`
            yield { type: 'phrase', text: clean }
          }
        }

        // The cart fills up in plain sight while she speaks: it is the
        // visible proof that what she says actually happened.
        if (event.type === 'tool-result') {
          const cart = await this.currentCart(session.id)
          const signature = JSON.stringify(cart)
          if (signature !== cartSignature) {
            cartSignature = signature
            yield { type: 'cart', cart }
          }
        }

        // The stream can break mid-sentence. Without this branch the loop
        // ended quietly and the partial text was stored as the answer: one
        // turn finished on "D'accord. J".
        if (event.type === 'error') {
          this.logger.error(`Flux interrompu (session ${session.id}) — ${JSON.stringify((event as { error?: unknown }).error ?? event)}`)
          failed = true
          break
        }

        if (event.type === 'done') {
          usage = (event as { usage?: { promptTokens?: number, completionTokens?: number } }).usage ?? {}

          // "stop" is the only clean ending. "length", "tool-calls" or
          // anything else means the model did not finish its sentence, and an
          // unfinished sentence must not become the answer.
          const reason = (event as { finishReason?: string }).finishReason
          if (reason !== undefined && reason !== 'stop') {
            this.logger.error(`Tour inachevé (session ${session.id}) — fin « ${reason} »`)
            failed = true
          }
        }
      }
    }
    catch (error) {
      this.logger.error(`Tour diffusé échoué (session ${session.id}) — ${error}`)
      yield { type: 'error', message: 'L\'assistant est momentanément indisponible.' }
      return
    }

    if (failed) {
      // Nothing is stored: half an answer is worth less than none, and the
      // turn can simply be taken again.
      yield { type: 'error', message: 'La réponse s\'est interrompue. Redites-moi ?' }
      return
    }

    // The last sentence has no space after it: it leaves the buffer here.
    const tail = forSpeech(buffer)
    if (tail.length > 0) {
      collected = `${collected}${collected.length > 0 ? ' ' : ''}${tail}`

      if (!breached && !ungroundedAmounts(tail, recorded).some(amount => !known.includes(amount))) {
        spoken = `${spoken}${spoken.length > 0 ? ' ' : ''}${tail}`
        yield { type: 'phrase', text: tail }
      }
    }

    // The turn is over: every tool has been called, so everything can be
    // judged. The repair works on the whole text — including the offending
    // sentence, which must not be thrown away or there would be nothing left
    // to correct.
    let reply = collected
    if (breached || groundingBreaches(collected, recorded, known).length > 0) {
      reply = await this.repairIfUngrounded(session, messages, tools, collected, recorded)
      yield { type: 'reset' }
      yield { type: 'phrase', text: reply }
    }

    await this.closeTurn(session, messages, message, reply, recorded, usage)
    yield { type: 'done', reply, cart: await this.currentCart(session.id) }
  }

  /**
   * The cart corrected by hand, without going through speech.
   *
   * Removing a line is awkward to say and easy to tap. The correction goes
   * through the same atomic write as the tools: the buyer may well press while
   * the assistant is adding something else.
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

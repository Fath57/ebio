import type { AssistantTool, AssistantToolContext, RecordedToolCall } from '../tools/assistant-tool'
import type { RealtimeOutbound } from './realtime.contract'
import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Logger } from '@nestjs/common'
import WebSocket from 'ws'
import { z } from 'zod'
import { config } from '../../../config/env.config'

const REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-realtime'

/** The token counts the provider reports at the end of each turn. */
interface RealtimeUsage {
  input_tokens?: number
  output_tokens?: number
  input_token_details?: { text_tokens?: number, audio_tokens?: number, cached_tokens?: number }
  output_token_details?: { text_tokens?: number, audio_tokens?: number }
}

/**
 * One spoken exchange, from the microphone to the loudspeaker.
 *
 * The model hears and answers in audio, with no text stage in between: that is
 * what takes the wait from three seconds to one and a half, measured. What it
 * costs is the runtime check — by the time a sentence could be verified, it
 * has already been spoken.
 *
 * So the grounding moves upstream, and becomes stronger for it: **a tool
 * returns the sentence to say**, not the numbers to say it with. The model
 * recites what the catalogue answered. It never composes a price.
 *
 * The provider's socket is opened here and never by the phone: the key lives
 * on this side, the tools live on this side, and what the model is allowed to
 * know is decided on this side.
 */
export class RealtimeSession {
  private readonly logger = new Logger(RealtimeSession.name)
  private socket: WebSocket | null = null
  private readonly pending = new Map<string, { name: string, args: string }>()
  private speaking = false

  constructor(
    /**
     * Held for the request context the tools need.
     *
     * A socket has none of its own: it outlives the handshake, and the tools
     * run minutes later, when the buyer speaks. `@EnsureRequestContext` opens
     * one around each turn, and it reads this property to know which manager
     * to fork.
     */
    private readonly em: EntityManager,
    private readonly tools: AssistantTool[],
    private readonly context: AssistantToolContext,
    private readonly instructions: string,
    private readonly voice: string,
    private readonly emit: (event: RealtimeOutbound) => void,
    private readonly onToolCall?: (call: RecordedToolCall) => void,
  ) {}

  async open(): Promise<void> {
    const key = config.ai.providers.openai.apiKey
    if (!key) {
      this.emit({ type: 'error', message: 'La voix n\'est pas configurée.' })
      return
    }

    const socket = new WebSocket(REALTIME_URL, { headers: { Authorization: `Bearer ${key}` } })
    this.socket = socket

    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve())
      socket.once('error', reject)
    })

    this.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: this.instructions,
        output_modalities: ['audio'],
        audio: {
          // The phone decides when the buyer has finished: it hears the room,
          // and a market is not a quiet room. Server-side detection on a
          // fixed threshold never fires there.
          input: {
            format: { type: 'audio/pcm', rate: 24_000 },
            // The far end decides when a sentence has ended, by meaning and not
            // by silence: « deux kilos de… euh… tomates » is one sentence, and
            // a timer would have answered in the middle of it. It also starts
            // the answer itself, and cuts her off when the buyer speaks again —
            // both of which we would otherwise be doing late, over the network.
            turn_detection: {
              type: 'semantic_vad',
              eagerness: 'auto',
              create_response: true,
              interrupt_response: true,
            },
            transcription: { model: 'whisper-1', language: 'fr' },
          },
          output: { format: { type: 'audio/pcm', rate: 24_000 }, voice: this.voice },
        },
        tools: this.tools.map(tool => ({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.parameters, { io: 'input' }),
        })),
      },
    })

    socket.on('message', raw => this.receive(raw))
    socket.on('error', error => this.logger.error(`Socket temps réel — ${error}`))
  }

  /** A slice of what the microphone heard. */
  appendAudio(base64: string): void {
    this.send({ type: 'input_audio_buffer.append', audio: base64 })
  }

  /**
   * The buyer wants her to stop talking.
   *
   * This is the button, not a word spoken over her — that case the far end
   * handles by itself. Either way, cutting her off is the whole point of
   * talking rather than typing: one does not wait politely for a market stall
   * to finish its sentence.
   */
  interrupt(): void {
    if (this.speaking) {
      this.send({ type: 'response.cancel' })
      this.speaking = false
    }
  }

  close(): void {
    this.socket?.close()
    this.socket = null
  }

  /**
   * What the provider charges, per million tokens, in US dollars.
   *
   * Spoken conversation is billed by the token like anything else, but audio
   * tokens cost several times what text costs — which is the whole reason to
   * count them. These rates are the published ones for `gpt-realtime`; if the
   * price list moves, this is the only place to change.
   */
  private static readonly RATES = {
    textIn: 4,
    audioIn: 32,
    cachedIn: 0.4,
    textOut: 16,
    audioOut: 64,
  } as const

  /**
   * Adds up what this conversation has spent, so far.
   *
   * Reported per turn and per session: a single turn looks cheap, and it is
   * the running total over a real conversation that tells whether this is
   * affordable.
   */
  private spend = { turns: 0, textIn: 0, audioIn: 0, cachedIn: 0, textOut: 0, audioOut: 0 }

  /** What the session has cost, in US dollars, and what made up the bill. */
  public cost(): { usd: number, turns: number, audioIn: number, audioOut: number } {
    const r = RealtimeSession.RATES
    const usd = (
      this.spend.textIn * r.textIn
      + this.spend.audioIn * r.audioIn
      + this.spend.cachedIn * r.cachedIn
      + this.spend.textOut * r.textOut
      + this.spend.audioOut * r.audioOut
    ) / 1_000_000
    return { usd, turns: this.spend.turns, audioIn: this.spend.audioIn, audioOut: this.spend.audioOut }
  }

  /**
   * Files one turn's token counts.
   *
   * Cached input is billed apart and is already counted inside the input
   * total, so it is subtracted rather than added — charging it twice would
   * make the estimate lie in the expensive direction.
   */
  private account(usage: RealtimeUsage | undefined): void {
    if (!usage) {
      return
    }
    const cached = usage.input_token_details?.cached_tokens ?? 0
    const audioIn = usage.input_token_details?.audio_tokens ?? 0
    const textIn = usage.input_token_details?.text_tokens ?? 0

    this.spend.turns += 1
    this.spend.cachedIn += cached
    this.spend.audioIn += Math.max(0, audioIn - cached)
    this.spend.textIn += Math.max(0, textIn - Math.max(0, cached - audioIn))
    this.spend.audioOut += usage.output_token_details?.audio_tokens ?? 0
    this.spend.textOut += usage.output_token_details?.text_tokens ?? 0

    const total = this.cost()
    this.logger.log(
      `Tour ${this.spend.turns} — entrée ${textIn} txt / ${audioIn} audio (${cached} en cache), `
      + `sortie ${usage.output_token_details?.text_tokens ?? 0} txt / ${usage.output_token_details?.audio_tokens ?? 0} audio `
      + `— cumul ${total.usd.toFixed(4)} $`,
    )
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload))
    }
  }

  private receive(raw: WebSocket.RawData): void {
    let event: { type: string, [key: string]: unknown }
    try {
      event = JSON.parse(raw.toString()) as { type: string }
    }
    catch {
      return
    }

    switch (event.type) {
      // The buyer has started talking. Said out loud so the phone can throw
      // away the sound still in its queue.
      case 'input_audio_buffer.speech_started':
        this.speaking = false
        this.emit({ type: 'speaking' })
        break

      case 'input_audio_buffer.speech_stopped':
        this.emit({ type: 'thinking' })
        break

      case 'response.output_audio.delta':
        this.speaking = true
        this.emit({ type: 'audio', chunk: event.delta as string })
        break

      case 'response.output_audio_transcript.delta':
        this.emit({ type: 'transcript', text: event.delta as string })
        break

      // What the buyer was heard to say, shown before the answer: a
      // transcription gets things wrong, and that has to be visible before it
      // becomes an order.
      case 'conversation.item.input_audio_transcription.completed':
        this.emit({ type: 'heard', text: String(event.transcript ?? '') })
        break

      case 'response.function_call_arguments.done':
        this.pending.set(event.call_id as string, {
          name: event.name as string,
          args: event.arguments as string,
        })
        break

      case 'response.done':
        this.speaking = false
        this.account((event.response as { usage?: RealtimeUsage } | undefined)?.usage)
        void this.settle()
        break

      case 'error':
        this.logger.error(`Temps réel — ${JSON.stringify(event.error).slice(0, 300)}`)
        this.emit({ type: 'error', message: 'La conversation s\'est interrompue.' })
        break

      default:
        break
    }
  }

  /**
   * Runs whatever the model asked for, then hands it back the floor.
   *
   * A turn that called no tool is simply finished. A turn that did gets its
   * answers and speaks again — that second pass is where the sentence the
   * catalogue wrote comes out of the loudspeaker.
   */
  @EnsureRequestContext()
  private async settle(): Promise<void> {
    if (this.pending.size === 0) {
      this.emit({ type: 'done' })
      return
    }

    const calls = [...this.pending.entries()]
    this.pending.clear()

    for (const [callId, call] of calls) {
      const tool = this.tools.find(candidate => candidate.name === call.name)
      const startedAt = Date.now()
      let result: unknown

      try {
        const args = tool ? tool.parameters.parse(JSON.parse(call.args)) : {}
        result = tool
          ? await tool.execute(args, this.context)
          : { erreur: 'Outil inconnu.' }
      }
      catch (error) {
        // Handed back as a result rather than thrown: the model can say it
        // could not find something, which is far better than a silence.
        this.logger.warn(`Outil ${call.name} en échec — ${error}`)
        result = { erreur: 'Je n\'ai pas pu vérifier ça.' }
      }

      this.onToolCall?.({ name: call.name, args: call.args, result, ms: Date.now() - startedAt })
      this.send({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) },
      })
    }

    this.send({ type: 'response.create' })
  }
}

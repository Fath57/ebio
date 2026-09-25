import type { JwtPayload } from '../../../common/guards/jwt-auth.guard'
import type { RealtimeInbound } from './realtime.contract'
import { Buffer } from 'node:buffer'
import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets'
import * as jwt from 'jsonwebtoken'
import { Socket } from 'socket.io'
import { config } from '../../../config/env.config'
import { PlatformSettingsService } from '../../settings/platform-settings.service'
import { ASSISTANT_SPOKEN_ADDENDUM, assistantSystemPrompt } from '../assistant.prompt'
import { AssistantService } from '../assistant.service'
import { RealtimeSession } from './realtime.session'

interface VoiceSocket extends Socket {
  data: {
    userId: string
    session?: RealtimeSession
    /**
     * What the microphone sent before the far end was listening.
     *
     * Opening the provider's socket takes a moment, and a buyer who has
     * already started talking does not know that. Dropping those first slices
     * lost the beginning of every sentence — and the beginning is where one
     * says what one wants.
     */
    waiting?: RealtimeInbound[]
  }
}

/**
 * The spoken conversation, relayed.
 *
 * The phone never talks to the model directly. It could — the provider issues
 * short-lived client tokens for exactly that — and it would save a hop. But
 * the tools are here, the catalogue is here, and what the model is allowed to
 * know is decided here. A phone that held the conversation on its own would
 * be a phone that decides what the assistant may say.
 */
@WebSocketGateway({
  namespace: '/ws/assistant',
  cors: { origin: '*', credentials: true },
  // Audio travels as base64 frames, several per second: the default cap is
  // written for chat messages.
  maxHttpBufferSize: 5e6,
})
export class AssistantRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AssistantRealtimeGateway.name)

  constructor(
    private readonly assistant: AssistantService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly em: EntityManager,
  ) {}

  @EnsureRequestContext()
  async handleConnection(client: VoiceSocket): Promise<void> {
    try {
      const token = client.handshake.auth.token as string | undefined
        ?? client.handshake.headers.authorization?.replace('Bearer ', '')
      if (!token) {
        client.disconnect()
        return
      }

      const payload = jwt.verify(token, config.jwt.secret) as JwtPayload
      client.data.userId = payload.sub

      // Checked here rather than at boot, like every other turn: closing her
      // from the back-office must cut the voice too.
      if (!await this.platformSettings.getAssistantEnabled()) {
        client.emit('event', { type: 'error', message: 'L\'assistante est fermée pour le moment.' })
        client.disconnect()
        return
      }

      client.data.waiting = []
      const identity = await this.platformSettings.getAssistantIdentity()
      const conversation = await this.assistant.openSession(payload.sub)

      const session = new RealtimeSession(
        this.em,
        this.assistant.toolset(),
        { buyerId: payload.sub, sessionId: conversation.id },
        `${assistantSystemPrompt(identity.name)}\n${ASSISTANT_SPOKEN_ADDENDUM}`,
        config.assistant.ttsVoice,
        event => client.emit('event', event),
      )

      await session.open()
      client.data.session = session

      // Whatever arrived while we were opening is played back into the
      // session, in order, before anything new.
      for (const pending of client.data.waiting ?? []) {
        this.dispatch(session, pending)
      }
      client.data.waiting = undefined

      client.emit('event', { type: 'ready' })
      // What is already in the basket, before a word is said: one comes back
      // to a conversation, and an empty panel would suggest it was lost.
      await session.publishCart()
      this.logger.log(`Voix ouverte pour ${payload.sub}`)
    }
    catch (error) {
      this.logger.warn(`Voix refusée — ${error}`)
      client.disconnect()
    }
  }

  handleDisconnect(client: VoiceSocket): void {
    // What the conversation cost, written down as it ends. A per-turn line is
    // too fine to reason about; the total for one buyer's errand is the figure
    // that decides whether speaking stays switched on.
    const spent = client.data.session?.cost()
    const heard = client.data.session?.heard() ?? 0
    if (spent) {
      this.logger.log(
        `Voix close pour ${client.data.userId} — ${heard.toFixed(1)} s entendues, `
        + `${spent.turns} tour(s), ${spent.audioOut} audio sortant, ${spent.usd.toFixed(4)} $`,
      )
    }

    // Closed on the way out, always: an open socket at the provider goes on
    // costing for a conversation nobody is having.
    client.data.session?.close()
    client.data.session = undefined
  }

  @SubscribeMessage('voice')
  handleVoice(
    @ConnectedSocket() client: VoiceSocket,
    @MessageBody() message: RealtimeInbound,
  ): void {
    const session = client.data.session
    if (!session) {
      client.data.waiting?.push(message)
      return
    }
    this.dispatch(session, message)
  }

  private dispatch(session: RealtimeSession, message: RealtimeInbound): void {
    switch (message.type) {
      case 'audio':
        session.appendAudio(
          typeof message.chunk === 'string'
            ? message.chunk
            : Buffer.from(message.chunk).toString('base64'),
        )
        break
      case 'interrupt':
        session.interrupt()
        break
      default:
        break
    }
  }
}

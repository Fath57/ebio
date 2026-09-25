import type { Response } from 'express'
import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { AssistantCartLineInput, AssistantSpeakInput, AssistantTurnInput } from './contracts/assistant.contract'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { TypedBody } from '@lonestone/nzoth/server'
import { BadRequestException, Controller, Get, NotFoundException, Param, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { AssistantService } from './assistant.service'
import { AssistantVoiceService } from './assistant.voice'
import { AssistantVoiceTickets } from './assistant.voice-tickets'
import { assistantCartLineSchema, assistantSpeakSchema, assistantTurnSchema } from './contracts/assistant.contract'

/**
 * The assistant, in text.
 *
 * Audio is added around this route rather than replacing it: the conversation
 * is the subject, and it can be tested entirely from a keyboard.
 */
@Controller('assistant')
@UseGuards(AuthGuard)
export class AssistantController {
  constructor(
    private readonly assistantService: AssistantService,
    private readonly voice: AssistantVoiceService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly tickets: AssistantVoiceTickets,
  ) {}

  @Post('turn')
  async turn(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(assistantTurnSchema) body: AssistantTurnInput,
  ) {
    const result = await this.assistantService.handleTurn(
      session.user.id,
      body.sessionId ?? null,
      body.message,
    )
    return { sessionId: result.sessionId, reply: result.reply, cart: result.cart }
  }

  /**
   * Correcting a line by hand, without leaving the conversation.
   *
   * The response carries the whole cart rather than the line that was touched:
   * the server stays the source, and nothing can drift if the assistant writes
   * at the same moment.
   */
  @Patch(':sessionId/cart')
  async adjustCart(
    @Session() session: LoggedInBetterAuthSession,
    @Param('sessionId') sessionId: string,
    @TypedBody(assistantCartLineSchema) body: AssistantCartLineInput,
  ) {
    const cart = await this.assistantService.adjustCart(
      session.user.id,
      sessionId,
      body.produitId,
      body.quantite,
    )
    return { cart }
  }

  /**
   * The same turn, delivered as it comes.
   *
   * Written onto the response by hand rather than through `@Sse`: the route is
   * a POST — it carries a message — and `@Sse` targets GETs. The stream stops
   * if the phone hangs up, otherwise an abandoned turn would keep costing.
   */
  @Post('turn/stream')
  async turnStream(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(assistantTurnSchema) body: AssistantTurnInput,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    let closed = false
    res.on('close', () => {
      closed = true
    })

    try {
      for await (const event of this.assistantService.handleTurnStream(
        session.user.id,
        body.sessionId ?? null,
        body.message,
      )) {
        if (closed) {
          break
        }
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'L\'assistant est indisponible.'
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
    }
    finally {
      res.end()
    }
  }

  /**
   * What was said, written down.
   *
   * Shown on screen before being sent: transcription will get things wrong,
   * and "deux kilos" heard as "douze" must be visible at once. The audio is
   * not kept — it exists only for the length of the call.
   */
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async transcribe(@UploadedFile() file?: { buffer: Buffer, originalname: string, mimetype: string }) {
    if (!file) {
      throw new BadRequestException('Aucun enregistrement reçu.')
    }
    const text = await this.voice.transcribe(file.buffer, file.originalname || 'parole.m4a', file.mimetype || 'audio/m4a')
    return { text }
  }

  /**
   * Claims the right to hear an answer.
   *
   * Two steps because the phone plays straight from the network — the sound
   * starts before the file is whole — and an audio player reads a URL, it
   * cannot send a body. The sentence stays here; the URL carries a random
   * identifier and nothing else.
   */
  @Post('voice')
  async prepareVoice(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(assistantSpeakSchema) body: AssistantSpeakInput,
  ) {
    return { id: this.tickets.issue(body.texte, session.user.id) }
  }

  /**
   * The answer, spoken, streamed as it is made.
   *
   * One synthesis for the whole answer rather than one per sentence. The
   * sentences were being split to start sooner, but they arrive within a tenth
   * of a second of each other — measured: first sentence at 1 156 ms, end of
   * turn at 1 242 ms — so the split bought almost nothing and cost the voice
   * its continuity: a gap between each file, and prosody starting over.
   */
  @Get('voice/:id')
  async streamVoice(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const texte = this.tickets.redeem(id, session.user.id)
    if (texte === null) {
      throw new NotFoundException('Cette voix n\'est plus disponible.')
    }
    const { voiceSpeed } = await this.platformSettings.getAssistantIdentity()
    const audio = await this.voice.speak(texte, voiceSpeed)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    await pipeline(Readable.fromWeb(audio as never), res)
  }
}

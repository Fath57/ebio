import type { Response } from 'express'
import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { AssistantCartLineInput, AssistantSpeakInput, AssistantTurnInput } from './contracts/assistant.contract'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { TypedBody } from '@lonestone/nzoth/server'
import { BadRequestException, Controller, Param, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { AssistantService } from './assistant.service'
import { AssistantVoiceService } from './assistant.voice'
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
   * The answer, spoken aloud.
   *
   * Separate from the turn: the text appears as soon as it is verified, the
   * voice follows. Waiting for the audio before showing the sentence would
   * leave the screen blank for a full second.
   */
  @Post('speak')
  async speak(
    @TypedBody(assistantSpeakSchema) body: AssistantSpeakInput,
    @Res() res: Response,
  ): Promise<void> {
    const { voiceSpeed } = await this.platformSettings.getAssistantIdentity()
    const audio = await this.voice.speak(body.texte, voiceSpeed)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    // Piped rather than collected: holding the whole file here before sending
    // it doubled the wait before the first sound came out of the phone.
    await pipeline(Readable.fromWeb(audio as never), res)
  }
}

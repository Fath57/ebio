import type { Response } from 'express'
import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { AssistantCartLineInput, AssistantSpeakInput, AssistantTurnInput } from './contracts/assistant.contract'
import { Buffer } from 'node:buffer'
import { TypedBody } from '@lonestone/nzoth/server'
import { BadRequestException, Controller, Param, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { AssistantService } from './assistant.service'
import { AssistantVoiceService } from './assistant.voice'
import { assistantCartLineSchema, assistantSpeakSchema, assistantTurnSchema } from './contracts/assistant.contract'

/**
 * L'assistant, en texte.
 *
 * L'audio viendra s'ajouter autour de cette route sans la remplacer : la
 * conversation est le sujet, et elle se teste entièrement au clavier.
 */
@Controller('assistant')
@UseGuards(AuthGuard)
export class AssistantController {
  constructor(
    private readonly assistantService: AssistantService,
    private readonly voice: AssistantVoiceService,
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
   * Corriger une ligne à la main, sans quitter la conversation.
   *
   * L'écran rend le panier entier et non la ligne touchée : le serveur reste
   * la source, et rien ne peut diverger si l'assistant écrit au même moment.
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
   * Le même tour, dit au fil de l'eau.
   *
   * Écrit à la main sur la réponse plutôt que par `@Sse` : la route est un
   * POST — elle porte un message — et `@Sse` vise les GET. Le flux s'arrête
   * si le téléphone raccroche, sinon un tour abandonné continuerait de coûter.
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
   * Ce qui a été dit, mis par écrit.
   *
   * Rendu à l'écran avant d'être envoyé : la transcription se trompera, et
   * « deux kilos » entendu « douze » doit se voir tout de suite. L'audio n'est
   * pas conservé — il n'existe que le temps de l'appel.
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
   * La réponse, dite à voix haute.
   *
   * Séparée du tour : le texte s'affiche dès qu'il est vérifié, la voix arrive
   * derrière. Attendre l'audio pour montrer la phrase rendrait l'écran muet
   * pendant une seconde entière.
   */
  @Post('speak')
  async speak(
    @TypedBody(assistantSpeakSchema) body: AssistantSpeakInput,
    @Res() res: Response,
  ): Promise<void> {
    const audio = await this.voice.speak(body.texte)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.send(audio)
  }
}

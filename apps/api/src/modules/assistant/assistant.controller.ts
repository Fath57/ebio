import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { AssistantTurnInput } from './contracts/assistant.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Post, UseGuards } from '@nestjs/common'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { AssistantService } from './assistant.service'
import { assistantTurnSchema } from './contracts/assistant.contract'

/**
 * L'assistant, en texte.
 *
 * L'audio viendra s'ajouter autour de cette route sans la remplacer : la
 * conversation est le sujet, et elle se teste entièrement au clavier.
 */
@Controller('assistant')
@UseGuards(AuthGuard)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

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
}

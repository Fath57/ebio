import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { Roles } from '../../common/decorators/roles.decorator'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { ChatGateway } from './chat.gateway'
import { ChatService } from './chat.service'
import { ConversationKind } from './entities/conversation.entity'
import { MessageType } from './entities/message.entity'

const replySchema = z.object({
  content: z.string().min(1).max(4000),
}).meta({ title: 'SupportReply', description: 'A back-office answer in a support thread' })

/** What a thread row shows when the last message carries no text. */
function previewOf(message: { type: MessageType, content?: string } | null): string | null {
  if (!message) {
    return null
  }
  if (message.type === MessageType.PHOTO) {
    return '📷 Photo'
  }
  if (message.type === MessageType.VOICE) {
    return '🎤 Note vocale'
  }
  if (message.type === MessageType.LOCATION) {
    return '📍 Position'
  }
  return message.content ?? null
}

/**
 * The back-office side of support, on its own controller for one reason: the
 * chat controller is guarded by `JwtAuthGuard`, which the apps satisfy with a
 * token the back-office does not hold. Putting these routes behind the
 * session guard is cheaper and safer than loosening the chat guard for
 * everyone.
 *
 * The service is shared, so both sides read and write the same threads.
 */
@Controller('admin/support')
@Roles('ADMIN', 'SUPER_ADMIN')
@UseGuards(AuthGuard, RolesGuard)
export class SupportController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  /** Every buyer's support thread. A staff seat participates in all of them. */
  @Get('conversations')
  async listThreads(@Session() session: LoggedInBetterAuthSession) {
    const entries = await this.chatService.getConversations(session.user.id)
    return entries
      .filter(entry => entry.conversation.kind === ConversationKind.SUPPORT)
      .map(entry => ({
        id: entry.conversation.id,
        buyerId: entry.conversation.buyer.id,
        buyerName: entry.conversation.buyer.name,
        lastMessage: previewOf(entry.lastMessage),
        lastMessageAt: entry.conversation.lastMessageAt?.toISOString() ?? null,
        unreadCount: entry.unreadCount,
      }))
  }

  /**
   * The badge in the back-office header. Kept apart from the thread list so
   * it can be polled often without paying for the list itself.
   */
  @Get('unread')
  async unread() {
    return this.chatService.countUnreadSupport()
  }

  @Get('conversations/:id/messages')
  async listMessages(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') conversationId: string,
  ) {
    const messages = await this.chatService.getMessages(conversationId, session.user.id)
    // Opening a thread is reading it: the badge must go down for the whole
    // team, not just for the seat that opened it.
    await this.chatService.markAsRead(conversationId, session.user.id)
    return messages.map(message => ({
      id: message.id,
      // A buyer writes from a phone: photos and voice notes are ordinary
      // support traffic, and the back-office has to show them, not an empty
      // bubble. `mediaUrl` is a media id, resolved to a signed URL at display.
      type: message.type,
      content: message.content ?? '',
      mediaUrl: message.mediaUrl ?? null,
      durationMs: message.durationMs ?? null,
      senderId: message.sender.id,
      senderName: message.sender.name,
      createdAt: message.createdAt.toISOString(),
    }))
  }

  /**
   * Answering over REST rather than the socket: a back-office page may have
   * been open for an hour, and a request that either succeeds or fails beats
   * a connection it has to keep alive.
   */
  @Post('conversations/:id/messages')
  async reply(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') conversationId: string,
    @TypedBody(replySchema) body: z.infer<typeof replySchema>,
  ) {
    const message = await this.chatService.sendMessage(conversationId, session.user.id, {
      type: MessageType.TEXT,
      content: body.content,
    })
    // Written over REST, delivered over the socket: the buyer's phone shows
    // the answer at once, and gets a push if the thread is not open.
    await this.chatGateway.broadcastMessage(conversationId, message)

    return { id: message.id, createdAt: message.createdAt.toISOString() }
  }
}

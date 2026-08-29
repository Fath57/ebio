import type { JwtPayload } from '../../common/guards/jwt-auth.guard'
import { EntityManager } from '@mikro-orm/postgresql'
import { Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import * as jwt from 'jsonwebtoken'
import { Server, Socket } from 'socket.io'
import { config } from '../../config/env.config'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { ChatService } from './chat.service'
import { wsSendMessageSchema } from './contracts/chat.contract'
import { Conversation } from './entities/conversation.entity'
import { MessageType } from './entities/message.entity'

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string
    role: string
  }
}

@WebSocketGateway({
  namespace: '/ws/chat',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server

  private readonly logger = new Logger(ChatGateway.name)

  constructor(
    private readonly chatService: ChatService,
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = client.handshake.auth.token as string | undefined
        ?? client.handshake.headers.authorization?.replace('Bearer ', '')

      if (!token) {
        this.logger.warn(`Client ${client.id} disconnected: no token`)
        client.disconnect()
        return
      }

      const payload = jwt.verify(token, config.jwt.secret) as JwtPayload

      client.data.userId = payload.sub
      client.data.role = payload.role

      await this.joinUserRooms(client)

      this.logger.log(`Client ${client.id} connected as user ${payload.sub}`)
    }
    catch (error) {
      this.logger.warn(`Client ${client.id} disconnected: invalid token — ${error}`)
      client.disconnect()
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.log(`Client ${client.id} disconnected`)
  }

  @SubscribeMessage('chat:send')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: unknown,
  ): Promise<{ success: boolean, message?: Record<string, unknown>, error?: string }> {
    try {
      const { userId } = client.data

      // The WS path bypasses nzoth, so the contract is applied by hand —
      // unbounded content used to go straight to the database.
      const parsed = wsSendMessageSchema.safeParse(raw)
      if (!parsed.success) {
        return { success: false, error: 'Message invalide' }
      }
      const data = parsed.data

      const message = await this.chatService.sendMessage(
        data.conversationId,
        userId,
        {
          type: data.type as MessageType,
          content: data.content,
          mediaUrl: data.mediaUrl,
          durationMs: data.durationMs,
          latitude: data.latitude,
          longitude: data.longitude,
        },
      )

      const messagePayload = {
        id: message.id,
        conversationId: data.conversationId,
        senderId: userId,
        senderName: message.sender.name,
        type: message.type,
        content: message.content ?? null,
        mediaUrl: message.mediaUrl ?? null,
        durationMs: message.durationMs ?? null,
        latitude: message.latitude ?? null,
        longitude: message.longitude ?? null,
        readAt: null,
        createdAt: message.createdAt.toISOString(),
      }

      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('chat:message', messagePayload)

      await this.pushToOfflineRecipient(data.conversationId, userId, message.sender.name, message.type, message.content)

      // The ack carries the persisted message so the sender can reconcile its
      // optimistic bubble (real id, server timestamp).
      return { success: true, message: messagePayload }
    }
    catch (error) {
      this.logger.error(`chat:send error — ${error}`)
      return { success: false, error: 'Failed to send message' }
    }
  }

  /**
   * Push NEW_MESSAGE unless the recipient has a live socket in the room —
   * being connected means the message just arrived over the socket.
   */
  private async pushToOfflineRecipient(
    conversationId: string,
    senderId: string,
    senderName: string,
    type: MessageType,
    content?: string,
  ): Promise<void> {
    try {
      const recipient = await this.chatService.getRecipientInfo(conversationId, senderId)
      if (!recipient) {
        return
      }

      const sockets = await this.server.in(`conversation:${conversationId}`).fetchSockets()
      const recipientOnline = sockets.some(s => (s.data as { userId?: string }).userId === recipient.user.id)
      if (recipientOnline) {
        return
      }

      const preview = type === MessageType.PHOTO
        ? '📷 Photo'
        : type === MessageType.VOICE
          ? '🎤 Note vocale'
          : content ?? ''

      await this.notificationsService.send({
        user: recipient.user,
        type: NotificationType.NEW_MESSAGE,
        title: senderName,
        body: preview.slice(0, 120),
        // peerName lets the tap land directly on the thread with its header;
        // kind + deliveryId let the courier/client apps open the right screen
        data: {
          conversationId,
          peerName: senderName,
          kind: recipient.kind,
          deliveryId: recipient.deliveryId ?? '',
        },
        channels: [NotificationChannel.PUSH],
        // Only the app matching the recipient's seat in this thread
        apps: recipient.apps,
      })
    }
    catch (error) {
      // A failed push must never fail the message send
      this.logger.warn(`NEW_MESSAGE push failed for conversation ${conversationId} — ${error}`)
    }
  }

  /**
   * Joins a conversation created after the socket connected (rooms are
   * otherwise only joined at handshake). Membership is verified server-side.
   */
  @SubscribeMessage('chat:join')
  async handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId?: string },
  ): Promise<{ success: boolean, error?: string }> {
    try {
      if (!data?.conversationId) {
        return { success: false, error: 'conversationId manquant' }
      }
      await this.chatService.assertParticipant(data.conversationId, client.data.userId)
      await client.join(`conversation:${data.conversationId}`)
      return { success: true }
    }
    catch {
      return { success: false, error: 'Accès refusé' }
    }
  }

  @SubscribeMessage('chat:read')
  async handleReadMessages(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ): Promise<{ success: boolean, error?: string }> {
    try {
      const { userId } = client.data

      const count = await this.chatService.markAsRead(data.conversationId, userId)

      // client.to() excludes the reader: echoing to the whole room made the
      // reader's own outbound bubbles flip to « lu » the moment THEY read.
      client
        .to(`conversation:${data.conversationId}`)
        .emit('chat:read', {
          conversationId: data.conversationId,
          readBy: userId,
          count,
          readAt: new Date().toISOString(),
        })

      return { success: true }
    }
    catch (error) {
      this.logger.error(`chat:read error — user ${client.data.userId} conversation ${data?.conversationId} — ${error}`)
      return { success: false, error: 'Failed to mark as read' }
    }
  }

  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string, isTyping: boolean },
  ): void {
    // Room membership is granted server-side only (handshake or chat:join),
    // so it doubles as the participant check — no DB hit per keystroke.
    if (!client.rooms.has(`conversation:${data.conversationId}`)) {
      return
    }
    client.to(`conversation:${data.conversationId}`).emit('chat:typing', {
      conversationId: data.conversationId,
      userId: client.data.userId,
      isTyping: data.isTyping,
    })
  }

  private async joinUserRooms(client: AuthenticatedSocket): Promise<void> {
    const em = this.em.fork()
    const userId = client.data.userId

    const conversations = await em.find(Conversation, {
      $or: this.chatService.participantFilter(userId),
      archivedAt: null,
    })

    const rooms = conversations.map(c => `conversation:${c.id}`)
    if (rooms.length > 0) {
      await client.join(rooms)
    }

    this.logger.log(`User ${userId} joined ${rooms.length} conversation rooms`)
  }
}

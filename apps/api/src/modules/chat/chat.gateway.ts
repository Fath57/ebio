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
import { ChatService } from './chat.service'
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
    @MessageBody() data: {
      conversationId: string
      type: string
      content?: string
      mediaUrl?: string
      latitude?: number
      longitude?: number
    },
  ): Promise<{ success: boolean, error?: string }> {
    try {
      const { userId } = client.data

      const validTypes = Object.values(MessageType)
      if (!validTypes.includes(data.type as MessageType)) {
        return { success: false, error: 'Invalid message type' }
      }

      const message = await this.chatService.sendMessage(
        data.conversationId,
        userId,
        data.type as MessageType,
        data.content,
        data.mediaUrl,
        data.latitude,
        data.longitude,
      )

      const messagePayload = {
        id: message.id,
        conversationId: data.conversationId,
        senderId: userId,
        senderName: message.sender.name,
        type: message.type,
        content: message.content ?? null,
        mediaUrl: message.mediaUrl ?? null,
        latitude: message.latitude ?? null,
        longitude: message.longitude ?? null,
        readAt: null,
        createdAt: message.createdAt.toISOString(),
      }

      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('chat:message', messagePayload)

      return { success: true }
    }
    catch (error) {
      this.logger.error(`chat:send error — ${error}`)
      return { success: false, error: 'Failed to send message' }
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

      this.server
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
      this.logger.error(`chat:read error — ${error}`)
      return { success: false, error: 'Failed to mark as read' }
    }
  }

  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string, isTyping: boolean },
  ): void {
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
      $or: [
        { buyer: userId },
        { supplier: { user: userId } },
      ],
      archivedAt: null,
    })

    const rooms = conversations.map(c => `conversation:${c.id}`)
    if (rooms.length > 0) {
      await client.join(rooms)
    }

    this.logger.log(`User ${userId} joined ${rooms.length} conversation rooms`)
  }
}

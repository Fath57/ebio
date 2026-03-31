import type { JwtAuthenticatedRequest } from '../../common/guards/jwt-auth.guard'
import type { ConversationResponse, MessageResponse } from './contracts/chat.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { CanCreate, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ChatService } from './chat.service'
import {

  createConversationSchema,

} from './contracts/chat.contract'

@Controller('chat')
@UseGuards(JwtAuthGuard, CaslGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations')
  @CanCreate('Conversation')
  async createConversation(
    @Req() req: JwtAuthenticatedRequest,
    @TypedBody(createConversationSchema) body: z.infer<typeof createConversationSchema>,
  ): Promise<ConversationResponse> {
    const conversation = await this.chatService.createConversation(
      req.user.sub,
      body.supplierId,
      body.productId,
    )

    const conversations = await this.chatService.getConversations(req.user.sub)
    const found = conversations.find(c => c.conversation.id === conversation.id)

    return this.mapConversation(found!)
  }

  @Get('conversations')
  @CanRead('Conversation')
  async getConversations(
    @Req() req: JwtAuthenticatedRequest,
  ): Promise<ConversationResponse[]> {
    const conversations = await this.chatService.getConversations(req.user.sub)
    return conversations.map(c => this.mapConversation(c))
  }

  @Get('conversations/:id/messages')
  @CanRead('Message')
  async getMessages(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') conversationId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ): Promise<MessageResponse[]> {
    const messages = await this.chatService.getMessages(
      conversationId,
      req.user.sub,
      before,
      limit ? Number.parseInt(limit, 10) : undefined,
    )

    return messages.map(m => ({
      id: m.id,
      conversationId,
      senderId: m.sender.id,
      senderName: m.sender.name,
      type: m.type,
      content: m.content ?? null,
      mediaUrl: m.mediaUrl ?? null,
      latitude: m.latitude ?? null,
      longitude: m.longitude ?? null,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    }))
  }

  @Post('conversations/:id/share-whatsapp')
  @CanRead('Conversation')
  async shareWhatsApp(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') conversationId: string,
    @Query('message') message?: string,
  ): Promise<{ url: string }> {
    const conversations = await this.chatService.getConversations(req.user.sub)
    const found = conversations.find(c => c.conversation.id === conversationId)

    if (!found) {
      throw new Error('Conversation not found')
    }

    const url = await this.chatService.generateWhatsAppUrl(
      found.conversation.supplier.id,
      message,
    )

    return { url }
  }

  @Public()
  @Get('suppliers/:id/quick-replies')
  getQuickReplies(
    @Param('id') _supplierId: string,
  ): Array<{ id: string, label: string, text: string }> {
    return [
      { id: '1', label: 'Disponibilite', text: 'Bonjour, est-ce que ce produit est disponible ?' },
      { id: '2', label: 'Prix', text: 'Bonjour, quel est votre meilleur prix ?' },
      { id: '3', label: 'Livraison', text: 'Bonjour, faites-vous la livraison ?' },
      { id: '4', label: 'Horaires', text: 'Bonjour, quels sont vos horaires ?' },
    ]
  }

  private mapConversation(entry: {
    conversation: { id: string, buyer: { id: string, name: string, image?: string }, supplier: { id: string, shopName: string, profilePhoto?: string }, orderId?: string, lastMessageAt?: Date, createdAt: Date }
    lastMessage: { id: string, sender: { id: string, name: string }, type: string, content?: string, mediaUrl?: string, latitude?: number, longitude?: number, readAt?: Date, createdAt: Date } | null
    unreadCount: number
  }): ConversationResponse {
    const { conversation, lastMessage, unreadCount } = entry

    return {
      id: conversation.id,
      buyerId: conversation.buyer.id,
      buyerName: conversation.buyer.name,
      buyerImage: conversation.buyer.image ?? null,
      supplierId: conversation.supplier.id,
      supplierShopName: conversation.supplier.shopName,
      supplierProfilePhoto: conversation.supplier.profilePhoto ?? null,
      orderId: conversation.orderId ?? null,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            conversationId: conversation.id,
            senderId: lastMessage.sender.id,
            senderName: lastMessage.sender.name,
            type: lastMessage.type as 'TEXT' | 'PHOTO' | 'VOICE' | 'LOCATION',
            content: lastMessage.content ?? null,
            mediaUrl: lastMessage.mediaUrl ?? null,
            latitude: lastMessage.latitude ?? null,
            longitude: lastMessage.longitude ?? null,
            readAt: lastMessage.readAt?.toISOString() ?? null,
            createdAt: lastMessage.createdAt.toISOString(),
          }
        : null,
      unreadCount,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      createdAt: conversation.createdAt.toISOString(),
    }
  }
}

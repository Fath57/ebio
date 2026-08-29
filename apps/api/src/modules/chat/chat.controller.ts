import type { JwtAuthenticatedRequest } from '../../common/guards/jwt-auth.guard'
import type { ConversationListEntry } from './chat.service'
import type { ConversationResponse, MessageResponse } from './contracts/chat.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
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
import { ConversationKind } from './entities/conversation.entity'

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
      body.orderId,
    )

    return this.findMapped(req.user.sub, conversation.id)
  }

  /** Buyer ↔ courier thread of a delivery, created on first access. */
  @Post('conversations/delivery/:deliveryId')
  @CanCreate('Conversation')
  async createDeliveryConversation(
    @Req() req: JwtAuthenticatedRequest,
    @Param('deliveryId') deliveryId: string,
  ): Promise<ConversationResponse> {
    const conversation = await this.chatService.getOrCreateDeliveryConversation(deliveryId, req.user.sub)

    return this.findMapped(req.user.sub, conversation.id)
  }

  @Get('conversations')
  @CanRead('Conversation')
  async getConversations(
    @Req() req: JwtAuthenticatedRequest,
  ): Promise<ConversationResponse[]> {
    const conversations = await this.chatService.getConversations(req.user.sub)
    return conversations.map(c => this.mapConversation(c, req.user.sub))
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
      durationMs: m.durationMs ?? null,
      latitude: m.latitude ?? null,
      longitude: m.longitude ?? null,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    }))
  }

  /** Global unread count, for the Chat tab badge. */
  @Get('unread-count')
  @CanRead('Message')
  async getUnreadCount(
    @Req() req: JwtAuthenticatedRequest,
  ): Promise<{ count: number }> {
    const count = await this.chatService.getUnreadCount(req.user.sub)
    return { count }
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
      throw new NotFoundException('Conversation introuvable')
    }

    const supplier = found.conversation.supplier
    if (found.conversation.kind !== ConversationKind.SUPPLIER || !supplier) {
      throw new BadRequestException('Disponible uniquement pour une conversation avec une boutique')
    }

    const url = await this.chatService.generateWhatsAppUrl(supplier.id, message)

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

  /** Re-reads the list so the response carries last message + unread count. */
  private async findMapped(userId: string, conversationId: string): Promise<ConversationResponse> {
    const conversations = await this.chatService.getConversations(userId)
    const found = conversations.find(c => c.conversation.id === conversationId)
    if (!found) {
      throw new NotFoundException('Conversation introuvable')
    }
    return this.mapConversation(found, userId)
  }

  private mapConversation(entry: ConversationListEntry, userId: string): ConversationResponse {
    const { conversation, lastMessage, unreadCount, orderNumber } = entry
    const { buyer, supplier, courier } = conversation
    const peer = this.peerOf(entry, userId)

    return {
      id: conversation.id,
      kind: conversation.kind,
      buyerId: buyer.id,
      buyerName: buyer.name,
      buyerImage: buyer.image ?? null,
      supplierId: supplier?.id ?? null,
      supplierShopName: supplier?.shopName ?? null,
      supplierProfilePhoto: supplier?.profilePhoto ?? null,
      courierId: courier?.id ?? null,
      courierName: courier?.fullName ?? null,
      deliveryId: conversation.deliveryId ?? null,
      orderId: conversation.orderId ?? null,
      orderNumber,
      peerName: peer.name,
      peerImage: peer.image,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            conversationId: conversation.id,
            senderId: lastMessage.sender.id,
            senderName: lastMessage.sender.name,
            type: lastMessage.type,
            content: lastMessage.content ?? null,
            mediaUrl: lastMessage.mediaUrl ?? null,
            durationMs: lastMessage.durationMs ?? null,
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

  /** The other side of the thread, as the requesting user sees it. */
  private peerOf(entry: ConversationListEntry, userId: string): { name: string, image: string | null } {
    const { buyer, supplier, courier, kind } = entry.conversation

    if (buyer.id !== userId) {
      // Supplier or courier seat: the peer is always the buyer
      return { name: buyer.name, image: buyer.image ?? null }
    }

    if (kind === ConversationKind.COURIER) {
      return { name: courier?.fullName ?? 'Livreur', image: courier?.user?.image ?? null }
    }

    return { name: supplier?.shopName ?? 'Boutique', image: supplier?.profilePhoto ?? null }
  }
}

import { QueryOrder } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { Supplier } from '../suppliers/supplier.entity'
import { Conversation } from './entities/conversation.entity'
import { Message, MessageType } from './entities/message.entity'

const DEFAULT_PAGE_SIZE = 30

@Injectable()
export class ChatService {
  constructor(private readonly em: EntityManager) {}

  async createConversation(
    buyerId: string,
    supplierId: string,
    productId?: string,
    orderId?: string,
  ): Promise<Conversation> {
    const em = this.em.fork()

    const existing = await em.findOne(Conversation, {
      buyer: buyerId,
      supplier: supplierId,
      archivedAt: null,
    }, { populate: ['buyer', 'supplier'] })

    if (existing) {
      // Un seul fil par paire : on rattache la dernière commande discutée
      if (orderId && existing.orderId !== orderId) {
        existing.orderId = orderId
        await em.persistAndFlush(existing)
      }
      return existing
    }

    const buyer = await em.findOneOrFail(User, { id: buyerId })
    const supplier = await em.findOneOrFail(Supplier, { id: supplierId }, { populate: ['user'] })

    const conversation = em.create(Conversation, {
      buyer,
      supplier,
      orderId: orderId ?? undefined,
    })

    await em.persistAndFlush(conversation)

    if (productId) {
      const promptContent = this.generatePromptMessage(productId)
      await this.sendMessage(conversation.id, buyerId, MessageType.TEXT, promptContent)
    }

    return conversation
  }

  async getConversations(userId: string): Promise<Array<{
    conversation: Conversation
    lastMessage: Message | null
    unreadCount: number
  }>> {
    const em = this.em.fork()

    const conversations = await em.find(
      Conversation,
      {
        $or: [
          { buyer: userId },
          { supplier: { user: userId } },
        ],
        archivedAt: null,
      },
      {
        populate: ['buyer', 'supplier'],
        orderBy: { lastMessageAt: QueryOrder.DESC_NULLS_LAST },
      },
    )

    const results = await Promise.all(
      conversations.map(async (conversation) => {
        const lastMessage = await em.findOne(
          Message,
          { conversation: conversation.id },
          { orderBy: { createdAt: QueryOrder.DESC }, populate: ['sender'] },
        )

        const unreadCount = await em.count(Message, {
          conversation: conversation.id,
          sender: { $ne: userId },
          readAt: null,
        })

        return { conversation, lastMessage, unreadCount }
      }),
    )

    return results
  }

  async getMessages(
    conversationId: string,
    userId: string,
    before?: string,
    limit: number = DEFAULT_PAGE_SIZE,
  ): Promise<Message[]> {
    const em = this.em.fork()

    await this.verifyParticipant(em, conversationId, userId)

    const where: Record<string, unknown> = { conversation: conversationId }

    if (before) {
      where.createdAt = { $lt: new Date(before) }
    }

    return em.find(Message, where, {
      orderBy: { createdAt: QueryOrder.DESC },
      limit,
      populate: ['sender'],
    })
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    type: MessageType,
    content?: string,
    mediaUrl?: string,
    latitude?: number,
    longitude?: number,
  ): Promise<Message> {
    const em = this.em.fork()

    await this.verifyParticipant(em, conversationId, senderId)

    const conversation = await em.findOneOrFail(Conversation, { id: conversationId })
    const sender = await em.findOneOrFail(User, { id: senderId })

    const message = em.create(Message, {
      conversation,
      sender,
      type,
      content,
      mediaUrl,
      latitude,
      longitude,
    })

    conversation.lastMessageAt = new Date()

    await em.persistAndFlush(message)

    return message
  }

  async markAsRead(conversationId: string, userId: string): Promise<number> {
    const em = this.em.fork()

    await this.verifyParticipant(em, conversationId, userId)

    const count = await em.nativeUpdate(
      Message,
      {
        conversation: conversationId,
        sender: { $ne: userId },
        readAt: null,
      },
      { readAt: new Date() },
    )

    return count
  }

  async getUnreadCount(userId: string): Promise<number> {
    const em = this.em.fork()

    const conversations = await em.find(Conversation, {
      $or: [
        { buyer: userId },
        { supplier: { user: userId } },
      ],
      archivedAt: null,
    })

    if (conversations.length === 0)
      return 0

    const conversationIds = conversations.map(c => c.id)

    return em.count(Message, {
      conversation: { $in: conversationIds },
      sender: { $ne: userId },
      readAt: null,
    })
  }

  generatePromptMessage(productName: string, distance?: string): string {
    const distancePart = distance ? ` Je suis à ${distance} de chez vous.` : ''
    return `Bonjour, est-ce que votre ${productName} est disponible ?${distancePart}`
  }

  async generateWhatsAppUrl(supplierId: string, message?: string): Promise<string> {
    const em = this.em.fork()

    const supplier = await em.findOne(Supplier, { id: supplierId }, { populate: ['user'] })
    if (!supplier)
      throw new NotFoundException('Supplier not found')

    const phone = supplier.user.phone
    if (!phone)
      throw new NotFoundException('Supplier has no phone number')

    const cleanPhone = phone.replace(/\D/g, '')
    const encodedMessage = message ? encodeURIComponent(message) : ''

    return `https://wa.me/${cleanPhone}${encodedMessage ? `?text=${encodedMessage}` : ''}`
  }

  private async verifyParticipant(
    em: EntityManager,
    conversationId: string,
    userId: string,
  ): Promise<Conversation> {
    const conversation = await em.findOne(
      Conversation,
      { id: conversationId },
      { populate: ['buyer', 'supplier.user'] },
    )

    if (!conversation) {
      throw new NotFoundException('Conversation not found')
    }

    const isBuyer = conversation.buyer.id === userId
    const isSupplierUser = conversation.supplier.user.id === userId

    if (!isBuyer && !isSupplierUser) {
      throw new ForbiddenException('You are not a participant of this conversation')
    }

    return conversation
  }
}

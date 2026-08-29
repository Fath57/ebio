import { QueryOrder } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { Delivery } from '../deliveries/entities/delivery.entity'
import { Order } from '../orders/entities/order.entity'
import { Product } from '../products/entities/product.entity'
import { Supplier } from '../suppliers/supplier.entity'
import { Conversation, ConversationKind } from './entities/conversation.entity'
import { Message, MessageType } from './entities/message.entity'

export interface SendMessageInput {
  type: MessageType
  content?: string
  mediaUrl?: string
  durationMs?: number
  latitude?: number
  longitude?: number
}

export interface ConversationListEntry {
  conversation: Conversation
  lastMessage: Message | null
  unreadCount: number
  /** Human-readable number of the order attached to the thread, if any. */
  orderNumber: string | null
}

/** What the gateway needs to route the NEW_MESSAGE push to the other side. */
export interface RecipientInfo {
  user: User
  /** Apps that must receive the push (one account can run all three). */
  apps: string[]
  kind: ConversationKind
  deliveryId: string | null
}

const DEFAULT_PAGE_SIZE = 30

/** Populate paths shared by every read that needs both sides of a thread. */
const PARTICIPANT_POPULATE = ['buyer', 'supplier.user', 'courier.user'] as const

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
      kind: ConversationKind.SUPPLIER,
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
      kind: ConversationKind.SUPPLIER,
      buyer,
      supplier,
      orderId: orderId ?? undefined,
    })

    await em.persistAndFlush(conversation)

    if (productId) {
      // The prompt needs the product NAME — sending the raw UUID produced
      // « est-ce que votre a3f1c2e0-… est disponible ? »
      const product = await em.findOne(Product, { id: productId })
      const promptContent = this.generatePromptMessage(product?.name ?? 'produit')
      await this.sendMessage(conversation.id, buyerId, { type: MessageType.TEXT, content: promptContent })
    }

    return conversation
  }

  /**
   * The buyer ↔ courier thread of a delivery, created on first access by
   * either side. One thread per delivery, whatever its archive state.
   */
  async getOrCreateDeliveryConversation(deliveryId: string, userId: string): Promise<Conversation> {
    const em = this.em.fork()

    const delivery = await em.findOne(
      Delivery,
      { id: deliveryId },
      { populate: ['order.buyer', 'courier.user'] },
    )
    if (!delivery) {
      throw new NotFoundException('Course introuvable')
    }
    if (!delivery.courier) {
      throw new BadRequestException('Aucun livreur n’est encore affecté à cette course')
    }

    const buyer = delivery.order.buyer
    const isBuyer = buyer.id === userId
    const isCourier = delivery.courier.user.id === userId
    if (!isBuyer && !isCourier) {
      throw new ForbiddenException('Vous ne participez pas à cette course')
    }

    const existing = await em.findOne(
      Conversation,
      { kind: ConversationKind.COURIER, deliveryId },
      { populate: [...PARTICIPANT_POPULATE] },
    )
    if (existing) {
      return existing
    }

    const conversation = em.create(Conversation, {
      kind: ConversationKind.COURIER,
      buyer,
      courier: delivery.courier,
      deliveryId,
      orderId: delivery.order.id,
    })
    await em.persistAndFlush(conversation)

    return conversation
  }

  async getConversations(userId: string): Promise<ConversationListEntry[]> {
    const em = this.em.fork()

    const conversations = await em.find(
      Conversation,
      {
        $or: this.participantFilter(userId),
        archivedAt: null,
      },
      {
        populate: ['buyer', 'supplier', 'courier', 'courier.user'],
        orderBy: { lastMessageAt: QueryOrder.DESC_NULLS_LAST },
      },
    )

    const orderNumbers = await this.loadOrderNumbers(em, conversations)

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

        const orderNumber = conversation.orderId
          ? orderNumbers.get(conversation.orderId) ?? null
          : null

        return { conversation, lastMessage, unreadCount, orderNumber }
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
    input: SendMessageInput,
  ): Promise<Message> {
    const em = this.em.fork()

    const conversation = await this.verifyParticipant(em, conversationId, senderId)
    const sender = await em.findOneOrFail(User, { id: senderId })

    const message = em.create(Message, {
      conversation,
      sender,
      type: input.type,
      content: input.content,
      mediaUrl: input.mediaUrl,
      durationMs: input.durationMs,
      latitude: input.latitude,
      longitude: input.longitude,
    })

    conversation.lastMessageAt = new Date()

    await em.persistAndFlush(message)

    return message
  }

  /** Throws unless the user is a participant — used by the WS gateway. */
  async assertParticipant(conversationId: string, userId: string): Promise<void> {
    await this.verifyParticipant(this.em.fork(), conversationId, userId)
  }

  /** The other side of a 1:1 conversation, for the new-message push. */
  async getRecipient(conversationId: string, senderId: string): Promise<User | null> {
    const info = await this.getRecipientInfo(conversationId, senderId)
    return info?.user ?? null
  }

  /**
   * The other side of a 1:1 conversation plus the app(s) that must receive
   * the push: the buyer reads in the client app, the shop in the supplier
   * app, the courier in the courier app.
   */
  async getRecipientInfo(conversationId: string, senderId: string): Promise<RecipientInfo | null> {
    const em = this.em.fork()
    const conversation = await em.findOne(
      Conversation,
      { id: conversationId },
      { populate: [...PARTICIPANT_POPULATE] },
    )
    if (!conversation) {
      return null
    }

    const base = { kind: conversation.kind, deliveryId: conversation.deliveryId ?? null }

    if (conversation.buyer.id !== senderId) {
      return { ...base, user: conversation.buyer, apps: ['client'] }
    }

    if (conversation.kind === ConversationKind.COURIER) {
      return conversation.courier
        ? { ...base, user: conversation.courier.user, apps: ['courier'] }
        : null
    }

    return conversation.supplier
      ? { ...base, user: conversation.supplier.user, apps: ['supplier'] }
      : null
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
      $or: this.participantFilter(userId),
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

  /** Every conversation the user takes part in, whichever seat they hold. */
  participantFilter(userId: string): Array<Record<string, unknown>> {
    return [
      { buyer: userId },
      { supplier: { user: userId } },
      { courier: { user: userId } },
    ]
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

  /** One query for every order number shown in the list, keyed by order id. */
  private async loadOrderNumbers(
    em: EntityManager,
    conversations: Conversation[],
  ): Promise<Map<string, string>> {
    const orderIds = [...new Set(conversations.flatMap(c => (c.orderId ? [c.orderId] : [])))]
    if (orderIds.length === 0) {
      return new Map()
    }
    const orders = await em.find(Order, { id: { $in: orderIds } }, { fields: ['id', 'orderNumber'] })
    return new Map(orders.map(o => [o.id, o.orderNumber]))
  }

  private async verifyParticipant(
    em: EntityManager,
    conversationId: string,
    userId: string,
  ): Promise<Conversation> {
    const conversation = await em.findOne(
      Conversation,
      { id: conversationId },
      { populate: [...PARTICIPANT_POPULATE] },
    )

    if (!conversation) {
      throw new NotFoundException('Conversation not found')
    }

    const isBuyer = conversation.buyer.id === userId
    const isSupplierUser = conversation.supplier?.user.id === userId
    const isCourierUser = conversation.courier?.user.id === userId

    if (!isBuyer && !isSupplierUser && !isCourierUser) {
      throw new ForbiddenException('You are not a participant of this conversation')
    }

    return conversation
  }
}

import { z } from 'zod'

export const messageTypeEnum = z.enum(['TEXT', 'PHOTO', 'VOICE', 'LOCATION']).meta({
  title: 'MessageType',
  description: 'Type of chat message',
})

export const createConversationSchema = z.object({
  supplierId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
}).meta({
  title: 'CreateConversation',
  description: 'Create or retrieve an existing conversation with a supplier',
})

export const sendMessageSchema = z.object({
  type: messageTypeEnum,
  content: z.string().max(5000).optional(),
  mediaUrl: z.string().url().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).meta({
  title: 'SendMessage',
  description: 'Send a message in a conversation',
})

export const messageResponseSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderName: z.string(),
  type: messageTypeEnum,
  content: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'MessageResponse',
  description: 'A single chat message',
})

export const conversationResponseSchema = z.object({
  id: z.string().uuid(),
  buyerId: z.string().uuid(),
  buyerName: z.string(),
  buyerImage: z.string().nullable(),
  supplierId: z.string().uuid(),
  supplierShopName: z.string(),
  supplierProfilePhoto: z.string().nullable(),
  orderId: z.string().uuid().nullable(),
  lastMessage: messageResponseSchema.nullable(),
  unreadCount: z.number().int(),
  lastMessageAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'ConversationResponse',
  description: 'Conversation with last message and unread count',
})

export const quickReplySchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  text: z.string(),
}).meta({
  title: 'QuickReply',
  description: 'Pre-defined quick reply for a supplier',
})

export const createQuickReplySchema = z.object({
  label: z.string().min(1).max(50),
  text: z.string().min(1).max(500),
}).meta({
  title: 'CreateQuickReply',
  description: 'Create a new quick reply',
})

export const whatsappLinkSchema = z.object({
  url: z.string().url(),
}).meta({
  title: 'WhatsAppLink',
  description: 'WhatsApp deep link for contacting a supplier',
})

export type CreateConversation = z.infer<typeof createConversationSchema>
export type SendMessage = z.infer<typeof sendMessageSchema>
export type MessageResponse = z.infer<typeof messageResponseSchema>
export type ConversationResponse = z.infer<typeof conversationResponseSchema>
export type QuickReply = z.infer<typeof quickReplySchema>
export type CreateQuickReply = z.infer<typeof createQuickReplySchema>

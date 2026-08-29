import { z } from 'zod'

export const messageTypeEnum = z.enum(['TEXT', 'PHOTO', 'VOICE', 'LOCATION']).meta({
  title: 'MessageType',
  description: 'Type of chat message',
})

export const conversationKindEnum = z.enum(['SUPPLIER', 'COURIER']).meta({
  title: 'ConversationKind',
  description: 'SUPPLIER: buyer ↔ shop thread; COURIER: buyer ↔ courier thread about one delivery',
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
  // Mobile sends a media id (resolved to a signed URL at display time), so
  // this cannot be .url()
  mediaUrl: z.string().max(500).optional(),
  durationMs: z.number().int().min(0).max(10 * 60 * 1000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).meta({
  title: 'SendMessage',
  description: 'Send a message in a conversation',
})

/** WebSocket payload of chat:send — the REST shape plus the target room. */
export const wsSendMessageSchema = sendMessageSchema.extend({
  conversationId: z.string().uuid(),
})

export const messageResponseSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderName: z.string(),
  type: messageTypeEnum,
  content: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  durationMs: z.number().nullable(),
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
  kind: conversationKindEnum,
  buyerId: z.string().uuid(),
  buyerName: z.string(),
  buyerImage: z.string().nullable(),
  // Set on SUPPLIER threads only
  supplierId: z.string().uuid().nullable(),
  supplierShopName: z.string().nullable(),
  supplierProfilePhoto: z.string().nullable(),
  // Set on COURIER threads only
  courierId: z.string().uuid().nullable(),
  courierName: z.string().nullable(),
  deliveryId: z.string().uuid().nullable(),
  orderId: z.string().uuid().nullable(),
  orderNumber: z.string().nullable(),
  // The other side, as seen by the requesting user (shop, courier or buyer)
  peerName: z.string(),
  peerImage: z.string().nullable(),
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

export type ConversationKindValue = z.infer<typeof conversationKindEnum>
export type CreateConversation = z.infer<typeof createConversationSchema>
export type SendMessage = z.infer<typeof sendMessageSchema>
export type MessageResponse = z.infer<typeof messageResponseSchema>
export type ConversationResponse = z.infer<typeof conversationResponseSchema>
export type QuickReply = z.infer<typeof quickReplySchema>
export type CreateQuickReply = z.infer<typeof createQuickReplySchema>

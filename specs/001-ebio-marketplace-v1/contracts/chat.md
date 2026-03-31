# API Contract: Chat Module

## WebSocket Gateway: /ws/chat
Real-time chat via Socket.IO.

**Authentication**: JWT token in handshake `auth.token`.

### Client → Server Events

**`chat:send`** — Send a message
```typescript
z.object({
  conversationId: z.string().uuid(),
  type: z.enum(['TEXT', 'PHOTO', 'VOICE', 'LOCATION']),
  content: z.string().optional(), // for TEXT
  mediaUrl: z.string().url().optional(), // for PHOTO/VOICE (pre-uploaded)
  latitude: z.number().optional(), // for LOCATION
  longitude: z.number().optional(),
})
```

**`chat:read`** — Mark messages as read
```typescript
z.object({
  conversationId: z.string().uuid(),
  lastReadMessageId: z.string().uuid(),
})
```

**`chat:typing`** — Typing indicator
```typescript
z.object({
  conversationId: z.string().uuid(),
})
```

### Server → Client Events

**`chat:message`** — New message received
```typescript
messageResponseSchema
```

**`chat:read-receipt`** — Messages marked as read
```typescript
z.object({
  conversationId: z.string().uuid(),
  readBy: z.string().uuid(),
  lastReadMessageId: z.string().uuid(),
  readAt: z.string().datetime(),
})
```

**`chat:typing`** — Other user typing
```typescript
z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
})
```

---

## REST Endpoints

### POST /conversations
Create or get existing conversation.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
z.object({
  supplierId: z.string().uuid(),
  productId: z.string().uuid().optional(), // for auto-generated prompt message
})
```

**Response 200/201**:
```typescript
conversationResponseSchema
```

**Side effect**: If new conversation with `productId`, auto-generate prompt message: "Bonjour, est-ce que votre [product.name] est disponible ? Je suis à [distance] de chez vous."

---

### GET /conversations
List user conversations.

**Query**: `page`, `limit`

**Response 200**:
```typescript
z.object({
  conversations: z.array(z.object({
    id: z.string().uuid(),
    otherUser: userSummarySchema,
    lastMessage: messageSummarySchema.nullable(),
    unreadCount: z.number(),
    updatedAt: z.string().datetime(),
  })),
})
```

---

### GET /conversations/:id/messages
Get conversation messages (paginated, newest first).

**Query**: `before: z.string().uuid().optional()`, `limit: z.number().default(50)`

**Response 200**:
```typescript
z.object({
  messages: z.array(messageResponseSchema),
  hasMore: z.boolean(),
})
```

```typescript
const messageResponseSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  sender: userSummarySchema,
  type: z.enum(['TEXT', 'PHOTO', 'VOICE', 'LOCATION']),
  content: z.string().nullable(),
  mediaUrl: z.string().url().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
```

---

### GET /suppliers/:id/quick-replies
Get supplier's quick reply templates.

**Response 200**:
```typescript
z.object({
  quickReplies: z.array(z.object({
    id: z.string().uuid(),
    text: z.string(),
  })),
})
```

### POST /suppliers/me/quick-replies
Create quick reply template.

```typescript
z.object({ text: z.string().max(200) })
```

---

### POST /conversations/:id/share-whatsapp
Generate WhatsApp deep link for conversation continuation.

**Response 200**:
```typescript
z.object({
  whatsappUrl: z.string().url(), // wa.me/<phone>?text=<encoded message>
})
```

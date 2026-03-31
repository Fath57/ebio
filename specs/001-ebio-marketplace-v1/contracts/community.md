# API Contract: Community Module

## GET /groups
List community groups.

**Query**:
```typescript
z.object({
  type: z.enum(['SECTOR', 'GEOGRAPHIC']).optional(),
  sector: z.string().optional(),
  region: z.string().optional(),
  page: z.number().default(1),
  limit: z.number().default(20),
})
```

**Response 200**:
```typescript
z.object({
  groups: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.enum(['SECTOR', 'GEOGRAPHIC']),
    memberCount: z.number(),
    isMember: z.boolean(),
    lastActivityAt: z.string().datetime().nullable(),
  })),
})
```

---

## POST /groups/:id/join
Join a group.

**Response 200**: `{ joined: true }`

## DELETE /groups/:id/leave
Leave a group.

**Response 200**: `{ left: true }`

---

## GET /groups/:id/publications
List publications in a group.

**Query**: `type` (optional filter), `page`, `limit`

**Response 200**:
```typescript
z.object({
  publications: z.array(z.object({
    id: z.string().uuid(),
    author: userSummarySchema,
    type: z.enum(['PRODUCT_ANNOUNCEMENT', 'TECHNICAL_QUESTION', 'MARKET_ALERT', 'TRAINING_SHARE']),
    content: z.string(),
    mediaUrls: z.array(z.string().url()),
    createdAt: z.string().datetime(),
    replyCount: z.number(),
  })),
})
```

---

## POST /groups/:id/publications
Create a publication.

**Request Body** (multipart/form-data):
```typescript
z.object({
  type: z.enum(['PRODUCT_ANNOUNCEMENT', 'TECHNICAL_QUESTION', 'MARKET_ALERT', 'TRAINING_SHARE']),
  content: z.string().min(10).max(2000),
  media: z.array(z.instanceof(File)).max(4).optional(),
})
```

---

## POST /publications/:id/report
Report a publication.

**Request Body**: `{ reason: z.string() }`

---

## GET /publications/:id/share-url
Generate shareable link for social sharing (Facebook, WhatsApp, TikTok).

**Response 200**:
```typescript
z.object({
  url: z.string().url(),
  whatsappUrl: z.string().url(),
  facebookUrl: z.string().url(),
})
```

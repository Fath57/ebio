# API Contract: Training Module

## GET /training/modules
List training modules.

**Query**:
```typescript
z.object({
  theme: z.string().optional(),
  format: z.enum(['VIDEO', 'AUDIO', 'ILLUSTRATED']).optional(),
  page: z.number().default(1),
  limit: z.number().default(20),
})
```

**Response 200**:
```typescript
z.object({
  modules: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    theme: z.string(),
    format: z.enum(['VIDEO', 'AUDIO', 'ILLUSTRATED']),
    durationSeconds: z.number(),
    thumbnailUrl: z.string().url(),
    downloadable: z.boolean(),
    isCompleted: z.boolean(), // for authenticated user
  })),
})
```

---

## GET /training/modules/:id
Get module details with content URL.

**Response 200**:
```typescript
z.object({
  id: z.string().uuid(),
  title: z.string(),
  theme: z.string(),
  format: z.enum(['VIDEO', 'AUDIO', 'ILLUSTRATED']),
  durationSeconds: z.number(),
  contentUrl: z.string().url(), // signed URL, 1h expiry
  thumbnailUrl: z.string().url(),
  downloadable: z.boolean(),
  quiz: z.object({
    questions: z.array(z.object({
      id: z.string(),
      pictogram: z.string().url(), // image-based question
      options: z.array(z.object({
        id: z.string(),
        pictogram: z.string().url(),
        text: z.string(),
      })),
    })),
  }).nullable(),
})
```

---

## GET /training/modules/:id/download
Get offline download URL (signed, long-lived).

**Response 200**:
```typescript
z.object({
  downloadUrl: z.string().url(), // signed URL, 24h expiry
  fileSize: z.number(), // bytes
})
```

---

## POST /training/modules/:id/complete
Submit quiz answers and mark module as completed.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    selectedOptionId: z.string(),
  })),
})
```

**Response 200**:
```typescript
z.object({
  score: z.number(), // percentage
  passed: z.boolean(), // >= 60%
  badgeAwarded: z.boolean(),
})
```

---

## GET /training/my-progress
User's training progress.

**Response 200**:
```typescript
z.object({
  completedModules: z.number(),
  totalModules: z.number(),
  badges: z.array(z.object({
    moduleId: z.string().uuid(),
    moduleTitle: z.string(),
    completedAt: z.string().datetime(),
  })),
})
```

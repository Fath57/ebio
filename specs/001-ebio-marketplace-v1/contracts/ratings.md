# API Contract: Ratings Module

## POST /reviews
Create a review for a supplier.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
z.object({
  supplierId: z.string().uuid(),
  orderId: z.string().uuid().optional(), // for ORDER type
  transactionType: z.enum(['ORDER', 'CONTACT']),
  qualityRating: z.number().int().min(1).max(5),
  delayRating: z.number().int().min(1).max(5),
  communicationRating: z.number().int().min(1).max(5),
  conformityRating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
})
```

**Validations**:
- ORDER type: order must be in DELIVERED status.
- CONTACT type: buyer must have an existing conversation with the supplier.
- One review per buyer per order (unique constraint).

**Response 201**: `reviewResponseSchema`

**Side effects**:
- Recalculate supplier's global rating (weighted: last 90 days count more).
- Check Top Vendeur badge eligibility (≥ 4.5 rating + ≥ 20 transactions in 90 days).

---

## GET /suppliers/:id/reviews
List reviews for a supplier.

**Query**: `page`, `limit`, `sortBy: 'recent' | 'rating'`

**Response 200**:
```typescript
z.object({
  reviews: z.array(reviewResponseSchema),
  summary: z.object({
    averageRating: z.number(),
    totalReviews: z.number(),
    qualityAvg: z.number(),
    delayAvg: z.number(),
    communicationAvg: z.number(),
    conformityAvg: z.number(),
    distribution: z.object({
      1: z.number(),
      2: z.number(),
      3: z.number(),
      4: z.number(),
      5: z.number(),
    }),
  }),
  total: z.number(),
  hasMore: z.boolean(),
})
```

---

## POST /reviews/:id/report
Report a suspicious review.

**Request Body**: `{ reason: z.string().max(500) }`

**Response 201**: Content report created for admin moderation.

---

## GET /suppliers/:id/badges
Get supplier badges.

**Response 200**:
```typescript
z.object({
  badges: z.array(z.object({
    type: z.enum(['VALIDATED', 'TOP_SELLER', 'CERTIFIED_BIO']),
    grantedAt: z.string().datetime(),
  })),
})
```

---

## Rating calculation formula:
- Global rating = weighted average of all 4 criteria across all reviews.
- Weighting: reviews from last 90 days count 2x, older reviews count 1x.
- Minimum 3 reviews required before displaying a rating.
